const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requirePermission, auditLog, requireTenant } = require('../middleware/auth');
const logger = require('../utils/logger');

// 智能消息分类（主要接口）
router.post('/message', 
  requirePermission('ai:classify'),
  requireTenant,
  auditLog('smart_classify_message'),
  asyncHandler(async (req, res) => {
    const { message, options = {} } = req.body;
    const { smartClassificationManager } = req.app.locals;
    
    if (!message || !message.content) {
      return res.status(400).json({
        success: false,
        error: 'Message with content is required',
        example: {
          message: {
            content: "需要技术支持",
            platform: "discord",
            userId: "user123",
            id: "msg456"
          }
        }
      });
    }

    logger.info('Smart classification request', {
      tenantId: req.tenantId,
      userId: req.user.id,
      messageLength: message.content.length,
      platform: message.platform
    });

    const startTime = Date.now();
    const result = await smartClassificationManager.classifyMessage(
      req.tenantId, 
      message, 
      {
        ...options,
        userId: req.user.id
      }
    );

    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      classification: result,
      processingTime,
      explanation: {
        mode: result.mode,
        usedCustomModel: result.usedCustomModel,
        strategy: result.usedCustomModel ? 
          '使用您的专属AI模型进行分类' : 
          '使用通用AI模型进行分类'
      },
      timestamp: new Date().toISOString()
    });
  })
);

// 批量智能分类
router.post('/batch', 
  requirePermission('ai:classify'),
  requireTenant,
  auditLog('smart_classify_batch'),
  asyncHandler(async (req, res) => {
    const { messages, options = {} } = req.body;
    const { smartClassificationManager } = req.app.locals;
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required and cannot be empty'
      });
    }

    if (messages.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 messages allowed per batch'
      });
    }

    // 验证消息格式
    const invalidMessages = messages.filter(msg => !msg.content);
    if (invalidMessages.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'All messages must have content',
        invalidCount: invalidMessages.length
      });
    }

    logger.info('Smart batch classification request', {
      tenantId: req.tenantId,
      userId: req.user.id,
      messageCount: messages.length
    });

    const startTime = Date.now();
    const results = await smartClassificationManager.batchClassify(
      req.tenantId, 
      messages, 
      {
        ...options,
        userId: req.user.id
      }
    );

    const processingTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      results,
      summary: {
        total: messages.length,
        successful: successCount,
        failed: messages.length - successCount,
        processingTime,
        averageTimePerMessage: processingTime / messages.length
      },
      timestamp: new Date().toISOString()
    });
  })
);

// 获取分类统计
router.get('/stats', 
  requirePermission('ai:analyze'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { timeRange = '24h' } = req.query;
    const { smartClassificationManager } = req.app.locals;
    
    const validTimeRanges = ['1h', '24h', '7d', '30d'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        error: `Invalid time range. Valid options: ${validTimeRanges.join(', ')}`
      });
    }

    const stats = await smartClassificationManager.getClassificationStats(
      req.tenantId, 
      timeRange
    );

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取建议操作
router.get('/suggestions', 
  requirePermission('ai:analyze'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { smartClassificationManager } = req.app.locals;
    
    const suggestions = await smartClassificationManager.getSuggestedActions(req.tenantId);

    res.json({
      success: true,
      suggestions: suggestions.suggestions,
      mode: suggestions.mode,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取当前分类策略信息
router.get('/strategy', 
  requirePermission('ai:classify'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { tenantModeManager, tenantModelManager } = req.app.locals;
    
    const tenantMode = await tenantModeManager.getTenantMode(req.tenantId);
    const isTrainingMode = tenantMode.mode === 'training';
    
    let availableModels = [];
    if (isTrainingMode) {
      availableModels = await tenantModelManager.listTenantModels(req.tenantId);
    }

    const strategy = {
      mode: tenantMode.mode,
      description: isTrainingMode ? 
        '训练模式：优先使用您的专属AI模型，提供个性化服务' :
        '普通模式：使用通用AI模型，保护您的隐私',
      features: {
        dataStorage: tenantMode.config.dataRetention || false,
        customModels: isTrainingMode,
        personalizedResponses: isTrainingMode,
        privacyProtection: !isTrainingMode,
        autoTraining: tenantMode.config.autoTraining || false
      },
      availableModels: isTrainingMode ? availableModels.map(model => ({
        type: model.modelType,
        version: model.version,
        accuracy: model.metrics.accuracy,
        lastTrained: model.updatedAt
      })) : [],
      fallbackStrategy: isTrainingMode ? 
        '自定义模型失败时将自动使用通用模型' :
        '仅使用通用模型'
    };

    res.json({
      success: true,
      strategy,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  })
);

// 模拟分类（不存储数据）
router.post('/preview', 
  requirePermission('ai:classify'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { message, mode = null } = req.body;
    const { smartClassificationManager, tenantModeManager, classificationManager, tenantModelManager } = req.app.locals;
    
    if (!message || !message.content) {
      return res.status(400).json({
        success: false,
        error: 'Message with content is required'
      });
    }

    const currentMode = await tenantModeManager.getTenantMode(req.tenantId);
    const testMode = mode || currentMode.mode;

    let result;
    if (testMode === 'training') {
      // 测试自定义模型
      const customResult = await smartClassificationManager.classifyWithCustomModel(
        req.tenantId, 
        message
      );
      
      const generalResult = await smartClassificationManager.classifyWithGeneralModel(
        message
      );

      result = {
        mode: 'training',
        customModel: customResult ? {
          available: true,
          classification: customResult,
          confidence: customResult.confidence
        } : {
          available: false,
          reason: '没有可用的自定义模型'
        },
        generalModel: {
          classification: generalResult,
          confidence: generalResult.confidence
        },
        recommended: customResult && customResult.confidence > 0.5 ? 'custom' : 'general'
      };
    } else {
      // 测试通用模型
      const generalResult = await smartClassificationManager.classifyWithGeneralModel(
        message
      );

      result = {
        mode: 'normal',
        generalModel: {
          classification: generalResult,
          confidence: generalResult.confidence
        },
        privacyNote: '普通模式下，此消息不会被存储'
      };
    }

    res.json({
      success: true,
      preview: result,
      message: '这是预览结果，不会存储任何数据',
      timestamp: new Date().toISOString()
    });
  })
);

// 健康检查
router.get('/health', 
  requirePermission('ai:classify'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { smartClassificationManager } = req.app.locals;
    
    const health = await smartClassificationManager.healthCheck();
    
    res.json({
      success: true,
      health,
      timestamp: new Date().toISOString()
    });
  })
);

module.exports = router; 