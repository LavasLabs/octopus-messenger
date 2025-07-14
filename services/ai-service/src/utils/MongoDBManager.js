const { MongoClient, ObjectId } = require('mongodb');
const logger = require('./logger');

class MongoDBManager {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.db = null;
    this.isInitialized = false;
    this.collections = {
      conversations: 'ai_conversations',        // 对话记录
      contextSummaries: 'context_summaries',    // 上下文摘要
      humanHandoffs: 'human_handoffs',          // 人工介入记录
      trainingData: 'training_data',            // 训练数据（用于模型微调）
      apiCalls: 'ai_api_calls'                 // AI API调用记录
    };
  }

  async initialize() {
    try {
      logger.info('Initializing MongoDB connection...');
      
      this.client = new MongoClient(this.config.uri, this.config.options);
      await this.client.connect();
      
      // 获取数据库实例
      const dbName = this.config.uri.split('/').pop().split('?')[0];
      this.db = this.client.db(dbName);
      
      // 测试连接
      await this.db.admin().ping();
      
      // 创建索引
      await this.createIndexes();
      
      this.isInitialized = true;
      logger.info('MongoDB connection established successfully');
    } catch (error) {
      logger.error('Failed to initialize MongoDB connection', { error: error.message });
      throw error;
    }
  }

  async createIndexes() {
    try {
      // 对话记录索引
      await this.db.collection(this.collections.conversations).createIndexes([
        { key: { conversation_id: 1 } },
        { key: { tenant_id: 1, user_id: 1 } },
        { key: { tenant_id: 1, timestamp: -1 } },
        { key: { conversation_id: 1, timestamp: 1 } },
        { key: { tenant_id: 1, language: 1 } }
      ]);

      // 上下文摘要索引
      await this.db.collection(this.collections.contextSummaries).createIndexes([
        { key: { conversation_id: 1 }, unique: true },
        { key: { tenant_id: 1, updated_at: -1 } }
      ]);

      // 人工介入记录索引
      await this.db.collection(this.collections.humanHandoffs).createIndexes([
        { key: { conversation_id: 1 } },
        { key: { tenant_id: 1, is_human_intervened: 1 } },
        { key: { tenant_id: 1, started_at: -1 } },
        { key: { assigned_agent: 1, started_at: -1 } }
      ]);

      // 训练数据索引
      await this.db.collection(this.collections.trainingData).createIndexes([
        { key: { tenant_id: 1, data_type: 1 } },
        { key: { tenant_id: 1, created_at: -1 } },
        { key: { conversation_id: 1 } }
      ]);

      // API调用记录索引
      await this.db.collection(this.collections.apiCalls).createIndexes([
        { key: { tenant_id: 1, timestamp: -1 } },
        { key: { tenant_id: 1, model: 1, timestamp: -1 } },
        { key: { conversation_id: 1, timestamp: 1 } }
      ]);

      logger.info('MongoDB indexes created successfully');
    } catch (error) {
      logger.error('Failed to create MongoDB indexes', { error: error.message });
      throw error;
    }
  }

  // 保存对话记录
  async saveConversationMessage(messageData) {
    try {
      const document = {
        conversation_id: messageData.conversation_id,
        tenant_id: messageData.tenant_id,
        user_id: messageData.user_id,
        role: messageData.role, // 'user', 'assistant', 'system'
        message: messageData.message,
        original_message: messageData.original_message, // 原文（翻译前）
        language: messageData.language,
        platform: messageData.platform,
        channel: messageData.channel,
        timestamp: new Date(messageData.timestamp),
        metadata: messageData.metadata || {},
        created_at: new Date()
      };

      const result = await this.db.collection(this.collections.conversations).insertOne(document);
      
      logger.debug('Conversation message saved', {
        conversation_id: messageData.conversation_id,
        tenant_id: messageData.tenant_id,
        role: messageData.role,
        messageId: result.insertedId
      });

      return result.insertedId;
    } catch (error) {
      logger.error('Failed to save conversation message', {
        conversation_id: messageData.conversation_id,
        error: error.message
      });
      throw error;
    }
  }

  // 获取对话历史
  async getConversationHistory(conversationId, tenantId, limit = 50) {
    try {
      const messages = await this.db.collection(this.collections.conversations)
        .find({ 
          conversation_id: conversationId,
          tenant_id: tenantId
        })
        .sort({ timestamp: 1 })
        .limit(limit)
        .toArray();

      return messages;
    } catch (error) {
      logger.error('Failed to get conversation history', {
        conversation_id: conversationId,
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 保存/更新上下文摘要
  async saveContextSummary(summaryData) {
    try {
      const document = {
        conversation_id: summaryData.conversation_id,
        tenant_id: summaryData.tenant_id,
        summary: summaryData.summary,
        key_points: summaryData.key_points || [],
        sentiment_trend: summaryData.sentiment_trend,
        message_count: summaryData.message_count,
        updated_at: new Date(),
        created_at: summaryData.created_at || new Date()
      };

      const result = await this.db.collection(this.collections.contextSummaries).replaceOne(
        { 
          conversation_id: summaryData.conversation_id,
          tenant_id: summaryData.tenant_id
        },
        document,
        { upsert: true }
      );

      logger.debug('Context summary saved', {
        conversation_id: summaryData.conversation_id,
        tenant_id: summaryData.tenant_id,
        upserted: result.upsertedCount > 0
      });

      return result.upsertedId || result.modifiedCount;
    } catch (error) {
      logger.error('Failed to save context summary', {
        conversation_id: summaryData.conversation_id,
        error: error.message
      });
      throw error;
    }
  }

  // 获取上下文摘要
  async getContextSummary(conversationId, tenantId) {
    try {
      const summary = await this.db.collection(this.collections.contextSummaries).findOne({
        conversation_id: conversationId,
        tenant_id: tenantId
      });

      return summary;
    } catch (error) {
      logger.error('Failed to get context summary', {
        conversation_id: conversationId,
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 保存人工介入记录
  async saveHumanHandoff(handoffData) {
    try {
      const document = {
        conversation_id: handoffData.conversation_id,
        tenant_id: handoffData.tenant_id,
        is_human_intervened: handoffData.is_human_intervened,
        assigned_agent: handoffData.assigned_agent,
        reason: handoffData.reason,
        started_at: new Date(handoffData.started_at),
        ended_at: handoffData.ended_at ? new Date(handoffData.ended_at) : null,
        escalation_type: handoffData.escalation_type, // 'permission', 'complex', 'complaint'
        metadata: handoffData.metadata || {},
        created_at: new Date()
      };

      const result = await this.db.collection(this.collections.humanHandoffs).insertOne(document);
      
      logger.info('Human handoff record saved', {
        conversation_id: handoffData.conversation_id,
        tenant_id: handoffData.tenant_id,
        assigned_agent: handoffData.assigned_agent,
        handoffId: result.insertedId
      });

      return result.insertedId;
    } catch (error) {
      logger.error('Failed to save human handoff record', {
        conversation_id: handoffData.conversation_id,
        error: error.message
      });
      throw error;
    }
  }

  // 检查是否有人工介入
  async checkHumanHandoff(conversationId, tenantId) {
    try {
      const handoff = await this.db.collection(this.collections.humanHandoffs).findOne({
        conversation_id: conversationId,
        tenant_id: tenantId,
        is_human_intervened: true,
        ended_at: null
      });

      return handoff;
    } catch (error) {
      logger.error('Failed to check human handoff', {
        conversation_id: conversationId,
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 保存训练数据（用于微调）
  async saveTrainingData(trainingData) {
    try {
      const document = {
        tenant_id: trainingData.tenant_id,
        conversation_id: trainingData.conversation_id,
        data_type: trainingData.data_type, // 'conversation', 'classification', 'escalation'
        prompt: trainingData.prompt,
        completion: trainingData.completion,
        metadata: trainingData.metadata || {},
        quality_score: trainingData.quality_score,
        created_at: new Date()
      };

      const result = await this.db.collection(this.collections.trainingData).insertOne(document);
      
      logger.debug('Training data saved', {
        tenant_id: trainingData.tenant_id,
        data_type: trainingData.data_type,
        trainingDataId: result.insertedId
      });

      return result.insertedId;
    } catch (error) {
      logger.error('Failed to save training data', {
        tenant_id: trainingData.tenant_id,
        error: error.message
      });
      throw error;
    }
  }

  // 获取训练数据（用于导出微调数据）
  async getTrainingData(tenantId, options = {}) {
    try {
      const {
        data_type,
        limit = 1000,
        skip = 0,
        quality_threshold = 0.7,
        start_date,
        end_date
      } = options;

      const query = { tenant_id: tenantId };
      
      if (data_type) {
        query.data_type = data_type;
      }
      
      if (quality_threshold) {
        query.quality_score = { $gte: quality_threshold };
      }
      
      if (start_date || end_date) {
        query.created_at = {};
        if (start_date) query.created_at.$gte = new Date(start_date);
        if (end_date) query.created_at.$lte = new Date(end_date);
      }

      const trainingData = await this.db.collection(this.collections.trainingData)
        .find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      return trainingData;
    } catch (error) {
      logger.error('Failed to get training data', {
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 导出JSONL格式的微调数据
  async exportFineTuneData(tenantId, options = {}) {
    try {
      const trainingData = await this.getTrainingData(tenantId, options);
      
      const jsonlData = trainingData.map(item => ({
        prompt: item.prompt,
        completion: item.completion
      }));

      return jsonlData;
    } catch (error) {
      logger.error('Failed to export fine-tune data', {
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 记录AI API调用
  async logAPICall(callData) {
    try {
      const document = {
        tenant_id: callData.tenant_id,
        conversation_id: callData.conversation_id,
        model: callData.model,
        provider: callData.provider, // 'openai', 'claude'
        prompt_tokens: callData.prompt_tokens,
        completion_tokens: callData.completion_tokens,
        total_tokens: callData.total_tokens,
        cost: callData.cost,
        latency_ms: callData.latency_ms,
        success: callData.success,
        error_message: callData.error_message,
        timestamp: new Date(),
        metadata: callData.metadata || {}
      };

      const result = await this.db.collection(this.collections.apiCalls).insertOne(document);
      
      return result.insertedId;
    } catch (error) {
      logger.error('Failed to log API call', {
        tenant_id: callData.tenant_id,
        model: callData.model,
        error: error.message
      });
      // 不抛出错误，避免影响主流程
    }
  }

  // 获取API使用统计
  async getAPIUsageStats(tenantId, startDate, endDate) {
    try {
      const pipeline = [
        {
          $match: {
            tenant_id: tenantId,
            timestamp: {
              $gte: new Date(startDate),
              $lte: new Date(endDate)
            }
          }
        },
        {
          $group: {
            _id: {
              model: '$model',
              provider: '$provider',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
            },
            total_calls: { $sum: 1 },
            successful_calls: { $sum: { $cond: ['$success', 1, 0] } },
            total_tokens: { $sum: '$total_tokens' },
            total_cost: { $sum: '$cost' },
            avg_latency: { $avg: '$latency_ms' }
          }
        },
        {
          $sort: { '_id.date': -1, '_id.model': 1 }
        }
      ];

      const stats = await this.db.collection(this.collections.apiCalls)
        .aggregate(pipeline)
        .toArray();

      return stats;
    } catch (error) {
      logger.error('Failed to get API usage stats', {
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 健康检查
  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return { status: 'error', message: 'MongoDB not initialized' };
      }

      await this.db.admin().ping();
      
      return { status: 'healthy', message: 'MongoDB connection is healthy' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  // 关闭连接
  async close() {
    try {
      if (this.client) {
        await this.client.close();
        this.isInitialized = false;
        logger.info('MongoDB connection closed');
      }
    } catch (error) {
      logger.error('Error closing MongoDB connection', { error: error.message });
    }
  }

  // 清理过期数据
  async cleanupExpiredData(tenantId, retentionDays = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const collections = [
        this.collections.conversations,
        this.collections.apiCalls
      ];

      let totalDeleted = 0;

      for (const collection of collections) {
        const result = await this.db.collection(collection).deleteMany({
          tenant_id: tenantId,
          created_at: { $lt: cutoffDate }
        });
        
        totalDeleted += result.deletedCount;
        
        logger.info(`Cleaned up expired data from ${collection}`, {
          tenant_id: tenantId,
          deleted_count: result.deletedCount,
          cutoff_date: cutoffDate
        });
      }

      return { deleted_count: totalDeleted };
    } catch (error) {
      logger.error('Failed to cleanup expired data', {
        tenant_id: tenantId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = MongoDBManager; 