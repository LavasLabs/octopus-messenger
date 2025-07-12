const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requirePermission, auditLog } = require('../middleware/auth');
const logger = require('../utils/logger');

// 单个消息分类
router.post('/', 
  requirePermission('ai:classify'),
  auditLog('classify_message'),
  asyncHandler(async (req, res) => {
    const { message, options = {} } = req.body;
    const { classificationManager } = req.app.locals;
    
    if (!message || !message.content) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
    }

    logger.classify('started', message, { 
      tenantId: req.tenantId,
      userId: req.user.id,
      options
    });

    const startTime = Date.now();
    const result = await classificationManager.classify(message, {
      ...options,
      tenantId: req.tenantId,
      userId: req.user.id
    });

    const processingTime = Date.now() - startTime;
    logger.performance('message_classification', processingTime, {
      tenantId: req.tenantId,
      classifier: result.classifier,
      confidence: result.confidence
    });

    res.json({
      success: true,
      classification: result,
      processingTime,
      timestamp: new Date().toISOString()
    });
  })
);

// 批量消息分类
router.post('/batch', 
  requirePermission('ai:classify'),
  auditLog('classify_batch'),
  asyncHandler(async (req, res) => {
    const { messages, options = {} } = req.body;
    const { classificationManager } = req.app.locals;
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required'
      });
    }

    if (messages.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 messages allowed per batch'
      });
    }

    logger.info('Batch classification started', {
      tenantId: req.tenantId,
      userId: req.user.id,
      messageCount: messages.length
    });

    const startTime = Date.now();
    const results = await classificationManager.classifyBatch(messages, {
      ...options,
      tenantId: req.tenantId,
      userId: req.user.id
    });

    const processingTime = Date.now() - startTime;
    logger.performance('batch_classification', processingTime, {
      tenantId: req.tenantId,
      messageCount: messages.length,
      avgTimePerMessage: processingTime / messages.length
    });

    res.json({
      success: true,
      classifications: results,
      processingTime,
      averageTimePerMessage: processingTime / messages.length,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取分类历史
router.get('/history', 
  requirePermission('ai:classify'),
  asyncHandler(async (req, res) => {
    const { dbManager } = req.app.locals;
    const { limit = 50, offset = 0, category, dateFrom, dateTo } = req.query;
    
    const parsedLimit = Math.min(parseInt(limit) || 50, 100);
    const parsedOffset = parseInt(offset) || 0;

    let startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let endDate = dateTo ? new Date(dateTo) : new Date();

    const history = await dbManager.getClassificationHistory(
      req.tenantId,
      parsedLimit,
      parsedOffset
    );

    res.json({
      success: true,
      history: history.rows,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: history.rowCount
      },
      timestamp: new Date().toISOString()
    });
  })
);

// 获取分类统计
router.get('/stats', 
  requirePermission('ai:classify'),
  asyncHandler(async (req, res) => {
    const { dbManager, cacheManager } = req.app.locals;
    const { period = '7d', groupBy = 'day' } = req.query;
    
    // 检查缓存
    const cacheKey = `classification_stats_${req.tenantId}_${period}_${groupBy}`;
    let stats = await cacheManager.getCachedStats('classification', req.tenantId);
    
    if (!stats) {
      const endDate = new Date();
      let startDate;
      
      switch (period) {
        case '1d':
          startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const rawStats = await dbManager.getClassificationStats(
        req.tenantId,
        startDate,
        endDate
      );

      stats = {
        period,
        groupBy,
        startDate,
        endDate,
        data: rawStats.rows
      };

      // 缓存统计结果
      await cacheManager.cacheStats('classification', req.tenantId, stats, 1800);
    }

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  })
);

// 重新分类消息
router.post('/reclassify', 
  requirePermission('ai:classify'),
  auditLog('reclassify_message'),
  asyncHandler(async (req, res) => {
    const { messageId, options = {} } = req.body;
    const { classificationManager, dbManager } = req.app.locals;
    
    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: 'Message ID is required'
      });
    }

    // 获取原始消息
    const messageQuery = await dbManager.query(
      'SELECT * FROM messages WHERE id = $1 AND tenant_id = $2',
      [messageId, req.tenantId]
    );

    if (messageQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    const message = messageQuery.rows[0];
    
    logger.classify('reclassify_started', message, { 
      tenantId: req.tenantId,
      userId: req.user.id,
      options
    });

    const startTime = Date.now();
    const result = await classificationManager.classify(message, {
      ...options,
      tenantId: req.tenantId,
      userId: req.user.id,
      forceRefresh: true
    });

    const processingTime = Date.now() - startTime;
    logger.performance('message_reclassification', processingTime, {
      tenantId: req.tenantId,
      messageId,
      classifier: result.classifier
    });

    res.json({
      success: true,
      classification: result,
      processingTime,
      timestamp: new Date().toISOString()
    });
  })
);

// 比较不同分类器结果
router.post('/compare', 
  requirePermission('ai:classify'),
  auditLog('compare_classifiers'),
  asyncHandler(async (req, res) => {
    const { message, classifiers = ['openai', 'claude', 'rule-engine'] } = req.body;
    const { classificationManager } = req.app.locals;
    
    if (!message || !message.content) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
    }

    logger.info('Classifier comparison started', {
      tenantId: req.tenantId,
      userId: req.user.id,
      classifiers
    });

    const startTime = Date.now();
    const results = {};

    for (const classifier of classifiers) {
      try {
        const result = await classificationManager.classify(message, {
          classifier,
          tenantId: req.tenantId,
          userId: req.user.id
        });
        results[classifier] = result;
      } catch (error) {
        results[classifier] = {
          error: error.message,
          success: false
        };
      }
    }

    const processingTime = Date.now() - startTime;
    logger.performance('classifier_comparison', processingTime, {
      tenantId: req.tenantId,
      classifiers,
      resultsCount: Object.keys(results).length
    });

    res.json({
      success: true,
      comparisons: results,
      processingTime,
      timestamp: new Date().toISOString()
    });
  })
);

// 设置分类阈值
router.post('/thresholds', 
  requirePermission('ai:classify'),
  auditLog('set_classification_thresholds'),
  asyncHandler(async (req, res) => {
    const { thresholds } = req.body;
    const { classificationManager } = req.app.locals;
    
    if (!thresholds || typeof thresholds !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Thresholds configuration is required'
      });
    }

    const result = await classificationManager.setThresholds(req.tenantId, thresholds);
    
    logger.info('Classification thresholds updated', {
      tenantId: req.tenantId,
      userId: req.user.id,
      thresholds
    });

    res.json({
      success: true,
      thresholds: result,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取分类阈值
router.get('/thresholds', 
  requirePermission('ai:classify'),
  asyncHandler(async (req, res) => {
    const { classificationManager } = req.app.locals;
    
    const thresholds = await classificationManager.getThresholds(req.tenantId);
    
    res.json({
      success: true,
      thresholds,
      timestamp: new Date().toISOString()
    });
  })
);

module.exports = router; 