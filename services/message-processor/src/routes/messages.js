const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();
const logger = require('../utils/logger');
const { ValidationError } = require('../middleware/errorHandler');

// 验证中间件
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }
  next();
};

// 处理单个消息
router.post('/process', [
  body('tenantId').notEmpty().withMessage('Tenant ID is required'),
  body('platform').notEmpty().withMessage('Platform is required'),
  body('senderId').notEmpty().withMessage('Sender ID is required'),
  body('content').optional().isString().withMessage('Content must be a string'),
  body('messageId').optional().isString().withMessage('Message ID must be a string'),
  body('channelId').optional().isString().withMessage('Channel ID must be a string'),
  body('language').optional().isString().isLength({ min: 2, max: 5 }).withMessage('Language must be 2-5 characters'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageProcessor = req.app.locals.messageProcessor;
    
    if (!messageProcessor) {
      return res.status(503).json({
        success: false,
        error: 'Message processor not available'
      });
    }

    const messageData = {
      tenantId: req.body.tenantId,
      platform: req.body.platform,
      platformId: req.body.platformId,
      senderId: req.body.senderId,
      senderName: req.body.senderName,
      senderUsername: req.body.senderUsername,
      senderAvatarUrl: req.body.senderAvatarUrl,
      channelId: req.body.channelId,
      channelName: req.body.channelName,
      content: req.body.content,
      messageId: req.body.messageId,
      messageType: req.body.messageType || 'text',
      language: req.body.language,
      attachments: req.body.attachments || [],
      metadata: req.body.metadata || {},
      timestamp: req.body.timestamp || new Date(),
      conversationId: req.body.conversationId,
      threadId: req.body.threadId,
      replyToId: req.body.replyToId
    };

    const result = await messageProcessor.processMessage(messageData, {
      token: req.headers.authorization?.replace('Bearer ', ''),
      enableAI: req.body.enableAI !== false,
      enableTranslation: req.body.enableTranslation || false,
      targetLanguage: req.body.targetLanguage
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 批量处理消息
router.post('/process/batch', [
  body('messages').isArray({ min: 1, max: 100 }).withMessage('Messages must be an array with 1-100 items'),
  body('messages.*.tenantId').notEmpty().withMessage('Each message must have a tenant ID'),
  body('messages.*.platform').notEmpty().withMessage('Each message must have a platform'),
  body('messages.*.senderId').notEmpty().withMessage('Each message must have a sender ID'),
  body('messages.*.content').optional().isString().withMessage('Message content must be a string'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageProcessor = req.app.locals.messageProcessor;
    
    if (!messageProcessor) {
      return res.status(503).json({
        success: false,
        error: 'Message processor not available'
      });
    }

    const messages = req.body.messages.map(msg => ({
      tenantId: msg.tenantId,
      platform: msg.platform,
      platformId: msg.platformId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderUsername: msg.senderUsername,
      channelId: msg.channelId,
      channelName: msg.channelName,
      content: msg.content,
      messageId: msg.messageId,
      messageType: msg.messageType || 'text',
      language: msg.language,
      attachments: msg.attachments || [],
      metadata: msg.metadata || {},
      timestamp: msg.timestamp || new Date()
    }));

    const result = await messageProcessor.processMessageBatch(messages, {
      token: req.headers.authorization?.replace('Bearer ', ''),
      enableAI: req.body.enableAI !== false,
      enableTranslation: req.body.enableTranslation || false
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 获取消息处理状态
router.get('/:messageId/status', [
  param('messageId').notEmpty().withMessage('Message ID is required'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const dbManager = req.app.locals.dbManager;
    const messageId = req.params.messageId;

    // 获取消息信息
    const messageQuery = `
      SELECT m.*, mc.category, mc.confidence, mc.sentiment, mc.language as detected_language,
             mc.needs_human_handoff, mc.handoff_reason
      FROM messages m
      LEFT JOIN message_classifications mc ON m.id = mc.message_id
      WHERE m.id = $1 OR m.platform_message_id = $1
    `;
    
    const result = await dbManager.query(messageQuery, [messageId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    const message = result.rows[0];
    
    res.json({
      success: true,
      data: {
        id: message.id,
        platformMessageId: message.platform_message_id,
        status: message.status,
        content: message.content,
        platform: message.platform_name,
        senderId: message.sender_id,
        senderName: message.sender_name,
        channelId: message.channel_id,
        conversationId: message.conversation_id,
        createdAt: message.created_at,
        updatedAt: message.updated_at,
        classification: message.category ? {
          category: message.category,
          confidence: message.confidence,
          sentiment: message.sentiment,
          detectedLanguage: message.detected_language,
          needsHumanHandoff: message.needs_human_handoff,
          handoffReason: message.handoff_reason
        } : null,
        metadata: message.metadata
      },
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 获取未处理的消息
router.get('/unprocessed', [
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('platform').optional().isString().withMessage('Platform must be a string'),
  query('tenantId').optional().isString().withMessage('Tenant ID must be a string'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const dbManager = req.app.locals.dbManager;
    const limit = parseInt(req.query.limit) || 100;
    const platform = req.query.platform;
    const tenantId = req.query.tenantId || req.user?.tenantId;

    let query = `
      SELECT m.*, p.name as platform_name, p.slug as platform_slug
      FROM messages m
      JOIN platforms p ON m.platform_id = p.id
      WHERE m.status = 'received' AND m.direction = 'inbound'
    `;
    
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      query += ` AND m.tenant_id = $${paramIndex}`;
      params.push(tenantId);
      paramIndex++;
    }

    if (platform) {
      query += ` AND p.slug = $${paramIndex}`;
      params.push(platform);
      paramIndex++;
    }

    query += ` ORDER BY m.created_at ASC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await dbManager.query(query, params);

    res.json({
      success: true,
      data: {
        messages: result.rows,
        count: result.rows.length,
        limit: limit
      },
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 重新处理失败的消息
router.post('/:messageId/reprocess', [
  param('messageId').notEmpty().withMessage('Message ID is required'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageProcessor = req.app.locals.messageProcessor;
    const dbManager = req.app.locals.dbManager;
    const messageId = req.params.messageId;

    // 获取消息信息
    const messageQuery = `
      SELECT m.*, p.name as platform_name, p.slug as platform_slug
      FROM messages m
      JOIN platforms p ON m.platform_id = p.id
      WHERE m.id = $1 AND m.status IN ('failed', 'error')
    `;
    
    const result = await dbManager.query(messageQuery, [messageId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Failed message not found'
      });
    }

    const message = result.rows[0];
    
    // 构建消息数据
    const messageData = {
      messageId: message.id,
      tenantId: message.tenant_id,
      platform: message.platform_slug,
      platformId: message.platform_id,
      senderId: message.sender_id,
      senderName: message.sender_name,
      senderUsername: message.sender_username,
      channelId: message.channel_id,
      channelName: message.channel_name,
      content: message.content,
      messageType: message.content_type,
      attachments: message.attachments,
      metadata: message.metadata,
      timestamp: message.created_at
    };

    // 重置消息状态
    await dbManager.updateMessageStatus(messageId, 'received', {
      reprocessed_at: new Date(),
      reprocessed_by: req.user?.id
    });

    // 重新处理
    const processResult = await messageProcessor.processMessage(messageData, {
      token: req.headers.authorization?.replace('Bearer ', ''),
      enableAI: req.body.enableAI !== false,
      enableTranslation: req.body.enableTranslation || false
    });

    res.json({
      success: true,
      data: processResult,
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 获取消息统计
router.get('/stats', async (req, res, next) => {
  try {
    const dbManager = req.app.locals.dbManager;
    const tenantId = req.query.tenantId || req.user?.tenantId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let statsQuery = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'received' THEN 1 END) as pending,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound,
        COUNT(CASE WHEN is_bot_message = true THEN 1 END) as bot_messages,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000) as avg_processing_time_ms
      FROM messages
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      statsQuery += ` AND tenant_id = $${paramIndex}`;
      params.push(tenantId);
      paramIndex++;
    }

    if (startDate) {
      statsQuery += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      statsQuery += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const result = await dbManager.query(statsQuery, params);
    const stats = result.rows[0];

    // 获取分类统计
    let classificationQuery = `
      SELECT 
        category,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence,
        COUNT(CASE WHEN needs_human_handoff = true THEN 1 END) as handoff_count
      FROM message_classifications mc
      JOIN messages m ON mc.message_id = m.id
      WHERE 1=1
    `;

    if (tenantId) {
      classificationQuery += ` AND m.tenant_id = $1`;
    }

    classificationQuery += ` GROUP BY category ORDER BY count DESC`;

    const classificationResult = await dbManager.query(
      classificationQuery, 
      tenantId ? [tenantId] : []
    );

    res.json({
      success: true,
      data: {
        overview: {
          totalMessages: parseInt(stats.total_messages),
          processed: parseInt(stats.processed),
          failed: parseInt(stats.failed),
          pending: parseInt(stats.pending),
          inbound: parseInt(stats.inbound),
          outbound: parseInt(stats.outbound),
          botMessages: parseInt(stats.bot_messages),
          avgProcessingTime: parseFloat(stats.avg_processing_time_ms) || 0
        },
        classifications: classificationResult.rows.map(row => ({
          category: row.category,
          count: parseInt(row.count),
          avgConfidence: parseFloat(row.avg_confidence),
          handoffCount: parseInt(row.handoff_count)
        }))
      },
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 获取处理器状态
router.get('/processor/status', async (req, res, next) => {
  try {
    const messageProcessor = req.app.locals.messageProcessor;
    const messageQueue = req.app.locals.messageQueue;

    if (!messageProcessor) {
      return res.status(503).json({
        success: false,
        error: 'Message processor not available'
      });
    }

    const [processorStats, queueStats] = await Promise.all([
      messageProcessor.getStats(),
      messageQueue ? messageQueue.getStats() : {}
    ]);

    res.json({
      success: true,
      data: {
        processor: processorStats,
        queues: queueStats,
        timestamp: new Date()
      }
    });

  } catch (error) {
    next(error);
  }
});

// 处理积压消息
router.post('/process/backlog', async (req, res, next) => {
  try {
    const messageProcessor = req.app.locals.messageProcessor;
    
    if (!messageProcessor) {
      return res.status(503).json({
        success: false,
        error: 'Message processor not available'
      });
    }

    const result = await messageProcessor.processBacklog();

    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router; 