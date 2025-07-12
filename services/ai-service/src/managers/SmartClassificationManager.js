const logger = require('../utils/logger');
const { ClassificationError } = require('../middleware/errorHandler');

class SmartClassificationManager {
  constructor(options = {}) {
    this.classificationManager = options.classificationManager;
    this.tenantModelManager = options.tenantModelManager;
    this.tenantModeManager = options.tenantModeManager;
    this.dbManager = options.dbManager;
    this.config = options.config || {};
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing smart classification manager...');
      
      if (!this.classificationManager || !this.tenantModelManager || !this.tenantModeManager) {
        throw new Error('Required managers not provided');
      }

      this.isInitialized = true;
      logger.info('Smart classification manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize smart classification manager', { error: error.message });
      throw error;
    }
  }

  async classifyMessage(tenantId, message, options = {}) {
    try {
      if (!this.isInitialized) {
        throw new ClassificationError('Smart classification manager not initialized', 'smart-manager', 500);
      }

      logger.info('Processing message classification', {
        tenantId,
        messageLength: message.content?.length || 0,
        platform: message.platform
      });

      // 获取租户模式
      const tenantMode = await this.tenantModeManager.getTenantMode(tenantId);
      const isTrainingMode = tenantMode.mode === 'training';

      let classificationResult;
      let usedCustomModel = false;

      // 根据模式选择分类策略
      if (isTrainingMode) {
        // 训练模式：优先使用自定义模型
        classificationResult = await this.classifyWithCustomModel(tenantId, message, options);
        usedCustomModel = true;
        
        // 如果自定义模型失败，回退到通用模型
        if (!classificationResult || classificationResult.confidence < 0.3) {
          logger.warn('Custom model classification failed or low confidence, falling back to general model', {
            tenantId,
            customResult: classificationResult
          });
          
          const generalResult = await this.classifyWithGeneralModel(message, options);
          
          // 选择置信度更高的结果
          if (!classificationResult || generalResult.confidence > classificationResult.confidence) {
            classificationResult = generalResult;
            usedCustomModel = false;
          }
        }

        // 存储消息用于训练（如果启用数据保留）
        if (tenantMode.config.dataRetention) {
          await this.storeMessageForTraining(tenantId, message, classificationResult);
        }
      } else {
        // 普通模式：仅使用通用模型
        classificationResult = await this.classifyWithGeneralModel(message, options);
        usedCustomModel = false;
      }

      // 记录分类结果
      await this.recordClassification(tenantId, message, classificationResult, {
        usedCustomModel,
        mode: tenantMode.mode,
        ...options
      });

      return {
        ...classificationResult,
        mode: tenantMode.mode,
        usedCustomModel,
        tenantId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Message classification failed', {
        tenantId,
        error: error.message,
        stack: error.stack
      });
      throw new ClassificationError(`Classification failed: ${error.message}`, 'smart-manager', 500);
    }
  }

  async classifyWithCustomModel(tenantId, message, options = {}) {
    try {
      // 检查是否有可用的自定义模型
      const availableModels = await this.tenantModelManager.listTenantModels(tenantId);
      
      if (availableModels.length === 0) {
        logger.info('No custom models available for tenant', { tenantId });
        return null;
      }

      // 按优先级选择模型类型
      const modelPriority = ['rule-engine', 'local-classifier', 'embedding-model'];
      let selectedModelType = null;
      
      for (const modelType of modelPriority) {
        if (availableModels.some(model => model.modelType === modelType)) {
          selectedModelType = modelType;
          break;
        }
      }

      if (!selectedModelType) {
        logger.warn('No suitable custom model found', { tenantId, availableModels });
        return null;
      }

      // 使用自定义模型进行分类
      const result = await this.tenantModelManager.predictWithTenantModel(
        tenantId,
        selectedModelType,
        message.content
      );

      logger.info('Custom model classification completed', {
        tenantId,
        modelType: selectedModelType,
        category: result.category,
        confidence: result.confidence
      });

      return {
        ...result,
        classifier: `tenant-${selectedModelType}`,
        customModel: true
      };

    } catch (error) {
      logger.error('Custom model classification failed', {
        tenantId,
        error: error.message
      });
      return null;
    }
  }

  async classifyWithGeneralModel(message, options = {}) {
    try {
      // 使用通用分类管理器
      const result = await this.classificationManager.classify(message, {
        ...options,
        preferredClassifiers: ['openai', 'claude', 'ruleEngine']
      });

      logger.info('General model classification completed', {
        classifier: result.classifier,
        category: result.category,
        confidence: result.confidence
      });

      return {
        ...result,
        customModel: false
      };

    } catch (error) {
      logger.error('General model classification failed', { error: error.message });
      throw error;
    }
  }

  async storeMessageForTraining(tenantId, message, classification) {
    try {
      const query = `
        INSERT INTO tenant_messages (
          tenant_id, message_id, platform, user_id, content, 
          message_type, metadata, classification, is_training_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `;

      const params = [
        tenantId,
        message.id || message.messageId,
        message.platform || 'unknown',
        message.userId || message.from,
        message.content,
        message.type || 'text',
        JSON.stringify(message.metadata || {}),
        JSON.stringify(classification),
        true  // is_training_data
      ];

      await this.dbManager.query(query, params);

      logger.debug('Message stored for training', {
        tenantId,
        messageId: message.id || message.messageId,
        category: classification.category
      });

      // 检查是否达到自动训练阈值
      await this.checkAutoTrainingTrigger(tenantId);

    } catch (error) {
      logger.error('Failed to store message for training', {
        tenantId,
        error: error.message
      });
      // 不抛出错误，因为存储失败不应该影响分类结果
    }
  }

  async checkAutoTrainingTrigger(tenantId) {
    try {
      const tenantMode = await this.tenantModeManager.getTenantMode(tenantId);
      
      if (!tenantMode.config.autoTraining) {
        return;
      }

      const minExamples = tenantMode.config.minTrainingExamples || 50;
      const trainingInterval = tenantMode.config.trainingInterval || 24 * 60 * 60 * 1000; // 24小时

      // 检查新消息数量
      const query = `
        SELECT COUNT(*) as new_messages
        FROM tenant_messages 
        WHERE tenant_id = $1 
        AND is_training_data = true
        AND created_at > (
          SELECT COALESCE(MAX(updated_at), '1970-01-01'::timestamp)
          FROM tenant_models 
          WHERE tenant_id = $1
        )
      `;

      const result = await this.dbManager.query(query, [tenantId]);
      const newMessages = parseInt(result.rows[0]?.new_messages || 0);

      // 检查时间间隔
      const lastTrainingQuery = `
        SELECT MAX(updated_at) as last_training
        FROM tenant_models 
        WHERE tenant_id = $1
      `;

      const lastTrainingResult = await this.dbManager.query(lastTrainingQuery, [tenantId]);
      const lastTraining = lastTrainingResult.rows[0]?.last_training;
      const timeSinceLastTraining = lastTraining ? 
        Date.now() - new Date(lastTraining).getTime() : 
        Infinity;

      // 触发自动训练条件
      if (newMessages >= minExamples || timeSinceLastTraining >= trainingInterval) {
        logger.info('Auto training triggered', {
          tenantId,
          newMessages,
          timeSinceLastTraining,
          threshold: { minExamples, trainingInterval }
        });

        // 异步触发训练（不等待结果）
        this.triggerAutoTraining(tenantId).catch(error => {
          logger.error('Auto training failed', { tenantId, error: error.message });
        });
      }

    } catch (error) {
      logger.error('Failed to check auto training trigger', {
        tenantId,
        error: error.message
      });
    }
  }

  async triggerAutoTraining(tenantId) {
    try {
      // 获取训练数据
      const trainingDataQuery = `
        SELECT content, classification->>'category' as category
        FROM tenant_messages 
        WHERE tenant_id = $1 
        AND is_training_data = true
        AND classification IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1000
      `;

      const result = await this.dbManager.query(trainingDataQuery, [tenantId]);
      
      if (result.rows.length < 10) {
        logger.warn('Insufficient training data for auto training', {
          tenantId,
          dataCount: result.rows.length
        });
        return;
      }

      const examples = result.rows.map(row => ({
        text: row.content,
        category: row.category
      }));

      // 开始训练规则引擎模型
      await this.tenantModelManager.trainTenantModel(
        tenantId,
        'rule-engine',
        examples,
        {
          autoTrained: true,
          triggeredAt: new Date().toISOString()
        }
      );

      logger.info('Auto training completed', {
        tenantId,
        examplesCount: examples.length
      });

    } catch (error) {
      logger.error('Auto training failed', {
        tenantId,
        error: error.message
      });
    }
  }

  async recordClassification(tenantId, message, classification, metadata = {}) {
    try {
      const query = `
        INSERT INTO ai_classifications (
          tenant_id, message_id, content, category, confidence, 
          classifier_used, metadata, tenant_model_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `;

      const params = [
        tenantId,
        message.id || message.messageId,
        message.content,
        classification.category,
        classification.confidence,
        classification.classifier,
        JSON.stringify({
          platform: message.platform,
          mode: metadata.mode,
          usedCustomModel: metadata.usedCustomModel,
          ...metadata
        }),
        classification.customModel ? classification.modelId : null
      ];

      await this.dbManager.query(query, params);

    } catch (error) {
      logger.error('Failed to record classification', {
        tenantId,
        error: error.message
      });
      // 不抛出错误，记录失败不应该影响分类结果
    }
  }

  async batchClassify(tenantId, messages, options = {}) {
    try {
      const results = [];
      
      for (const message of messages) {
        try {
          const result = await this.classifyMessage(tenantId, message, options);
          results.push({
            messageId: message.id || message.messageId,
            success: true,
            classification: result
          });
        } catch (error) {
          results.push({
            messageId: message.id || message.messageId,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      logger.info('Batch classification completed', {
        tenantId,
        total: messages.length,
        success: successCount,
        failed: messages.length - successCount
      });

      return results;

    } catch (error) {
      logger.error('Batch classification failed', {
        tenantId,
        error: error.message
      });
      throw new ClassificationError(`Batch classification failed: ${error.message}`, 'smart-manager', 500);
    }
  }

  async getClassificationStats(tenantId, timeRange = '24h') {
    try {
      const timeCondition = this.getTimeCondition(timeRange);
      
      const query = `
        SELECT 
          COUNT(*) as total_classifications,
          COUNT(CASE WHEN metadata->>'usedCustomModel' = 'true' THEN 1 END) as custom_model_usage,
          COUNT(CASE WHEN metadata->>'usedCustomModel' = 'false' THEN 1 END) as general_model_usage,
          AVG(confidence) as avg_confidence,
          COUNT(DISTINCT category) as unique_categories,
          metadata->>'mode' as mode
        FROM ai_classifications 
        WHERE tenant_id = $1 ${timeCondition}
        GROUP BY metadata->>'mode'
      `;

      const result = await this.dbManager.query(query, [tenantId]);
      
      const stats = {
        timeRange,
        tenantId,
        summary: result.rows.reduce((acc, row) => {
          acc[row.mode || 'unknown'] = {
            totalClassifications: parseInt(row.total_classifications),
            customModelUsage: parseInt(row.custom_model_usage),
            generalModelUsage: parseInt(row.general_model_usage),
            avgConfidence: parseFloat(row.avg_confidence || 0),
            uniqueCategories: parseInt(row.unique_categories)
          };
          return acc;
        }, {}),
        timestamp: new Date().toISOString()
      };

      return stats;

    } catch (error) {
      logger.error('Failed to get classification stats', {
        tenantId,
        error: error.message
      });
      throw error;
    }
  }

  getTimeCondition(timeRange) {
    switch (timeRange) {
      case '1h':
        return "AND created_at >= NOW() - INTERVAL '1 hour'";
      case '24h':
        return "AND created_at >= NOW() - INTERVAL '24 hours'";
      case '7d':
        return "AND created_at >= NOW() - INTERVAL '7 days'";
      case '30d':
        return "AND created_at >= NOW() - INTERVAL '30 days'";
      default:
        return "AND created_at >= NOW() - INTERVAL '24 hours'";
    }
  }

  async getSuggestedActions(tenantId) {
    try {
      const tenantMode = await this.tenantModeManager.getTenantMode(tenantId);
      const stats = await this.getClassificationStats(tenantId, '7d');
      const suggestions = [];

      if (tenantMode.mode === 'normal') {
        // 普通模式建议
        const totalClassifications = stats.summary.normal?.totalClassifications || 0;
        
        if (totalClassifications > 100) {
          suggestions.push({
            type: 'mode_upgrade',
            priority: 'medium',
            title: '考虑启用训练模式',
            description: '您的使用频率较高，训练模式可以提供更个性化的AI回复',
            action: 'switch_to_training'
          });
        }
      } else {
        // 训练模式建议
        const modeStats = stats.summary.training || {};
        const customModelUsage = modeStats.customModelUsage || 0;
        const totalClassifications = modeStats.totalClassifications || 0;
        
        if (totalClassifications > 0 && customModelUsage / totalClassifications < 0.3) {
          suggestions.push({
            type: 'model_training',
            priority: 'high',
            title: '需要更多训练数据',
            description: '自定义模型使用率较低，建议增加训练数据以提高模型效果',
            action: 'increase_training_data'
          });
        }

        if (modeStats.avgConfidence < 0.7) {
          suggestions.push({
            type: 'model_improvement',
            priority: 'medium',
            title: '模型准确率有待提升',
            description: '当前模型置信度较低，建议优化训练数据质量',
            action: 'improve_training_quality'
          });
        }
      }

      return {
        tenantId,
        mode: tenantMode.mode,
        suggestions,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get suggested actions', {
        tenantId,
        error: error.message
      });
      return { tenantId, suggestions: [], error: error.message };
    }
  }

  async healthCheck() {
    return {
      status: 'healthy',
      initialized: this.isInitialized,
      dependencies: {
        classificationManager: !!this.classificationManager,
        tenantModelManager: !!this.tenantModelManager,
        tenantModeManager: !!this.tenantModeManager,
        dbManager: !!this.dbManager
      }
    };
  }

  async shutdown() {
    this.isInitialized = false;
    logger.info('Smart classification manager shut down');
  }
}

module.exports = SmartClassificationManager; 