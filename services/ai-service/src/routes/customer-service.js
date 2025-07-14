const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requirePermission, auditLog, requireTenant } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * @swagger
 * tags:
 *   name: Customer Service
 *   description: AI客服相关功能
 */

/**
 * @swagger
 * /api/customer-service/chat:
 *   post:
 *     summary: 处理客服对话
 *     tags: [Customer Service]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - conversationId
 *               - userId
 *             properties:
 *               message:
 *                 type: string
 *                 description: 用户消息内容
 *               conversationId:
 *                 type: string
 *                 description: 对话ID
 *               userId:
 *                 type: string
 *                 description: 用户ID
 *               platform:
 *                 type: string
 *                 description: 平台名称
 *               channel:
 *                 type: string
 *                 description: 频道ID
 *               language:
 *                 type: string
 *                 description: 用户语言
 *     responses:
 *       200:
 *         description: 对话处理成功
 */
router.post('/chat', 
  requirePermission('ai:chat'),
  requireTenant,
  auditLog('customer_service_chat'),
  asyncHandler(async (req, res) => {
    const { 
      message, 
      conversationId, 
      userId, 
      platform = 'unknown',
      channel = 'default',
      language 
    } = req.body;
    
    const { 
      conversationManager, 
      smartClassificationManager,
      translationService 
    } = req.app.locals;

    if (!message || !conversationId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Message, conversationId, and userId are required'
      });
    }

    logger.info('Processing customer service chat', {
      tenantId: req.tenantId,
      conversationId,
      userId,
      platform,
      messageLength: message.length
    });

    try {
      // 1. 检测语言
      let detectedLanguage = language;
      if (!detectedLanguage) {
        detectedLanguage = await translationService.detectLanguage(message);
      }

      // 2. 保存用户消息
      const messageResult = await conversationManager.saveUserMessage({
        tenantId: req.tenantId,
        userId: userId,
        conversationId: conversationId,
        message: message,
        originalMessage: message,
        language: detectedLanguage,
        platform: platform,
        channel: channel,
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: new Date()
        }
      });

      // 3. 构建提示上下文
      const contextData = await conversationManager.buildPromptContext(
        conversationId, 
        req.tenantId, 
        message
      );

      // 4. 进行AI分类
      const classificationResult = await smartClassificationManager.classifyMessage(
        req.tenantId,
        {
          id: messageResult.messageId,
          content: message,
          platform: platform,
          userId: userId,
          context: contextData.contextText
        },
        {
          userId: req.user.id,
          conversationId: conversationId,
          includeContext: true
        }
      );

      // 5. 检查是否需要人工介入
      const handoffCheck = await conversationManager.checkForHumanHandoff(
        conversationId,
        req.tenantId,
        message,
        classificationResult
      );

      let response = {
        success: true,
        conversationId: conversationId,
        messageId: messageResult.messageId,
        language: detectedLanguage,
        classification: classificationResult,
        needsHumanHandoff: handoffCheck.needsHandoff,
        context: {
          messageCount: contextData.messageCount,
          hasSummary: !!contextData.summary
        }
      };

      // 6. 如果需要人工介入
      if (handoffCheck.needsHandoff && !handoffCheck.existing) {
        const handoffId = await conversationManager.startHumanHandoff(
          conversationId,
          req.tenantId,
          handoffCheck.reason,
          handoffCheck.escalationType
        );

        response.humanHandoff = {
          id: handoffId,
          reason: handoffCheck.reason,
          type: handoffCheck.escalationType,
          message: '您的问题已转接至人工客服，请稍候...'
        };

        // 如果需要翻译回复
        if (detectedLanguage !== 'zh') {
          const translatedMessage = await translationService.translateText(
            response.humanHandoff.message,
            detectedLanguage,
            'zh'
          );
          response.humanHandoff.translatedMessage = translatedMessage;
        }
      } else if (handoffCheck.existing) {
        response.humanHandoff = {
          existing: true,
          message: '您的对话正在由人工客服处理中...'
        };
      } else {
        // 7. 生成AI回复（这里可以集成具体的AI回复生成逻辑）
        response.aiResponse = await generateAIResponse(
          message,
          contextData,
          classificationResult,
          detectedLanguage,
          translationService
        );
      }

      res.json(response);

    } catch (error) {
      logger.error('Customer service chat processing failed', {
        tenantId: req.tenantId,
        conversationId,
        userId,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: 'Failed to process chat message',
        conversationId: conversationId
      });
    }
  })
);

/**
 * @swagger
 * /api/customer-service/conversation/{conversationId}/history:
 *   get:
 *     summary: 获取对话历史
 *     tags: [Customer Service]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: 对话ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 消息数量限制
 *     responses:
 *       200:
 *         description: 对话历史获取成功
 */
router.get('/conversation/:conversationId/history',
  requirePermission('ai:chat'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { limit = 50 } = req.query;
    const { conversationManager } = req.app.locals;

    try {
      const context = await conversationManager.getConversationContext(
        conversationId,
        req.tenantId,
        {
          includeHistory: true,
          includeSummary: true,
          maxMessages: parseInt(limit)
        }
      );

      res.json({
        success: true,
        conversationId: conversationId,
        messages: context.messages,
        summary: context.summary,
        totalMessages: context.totalMessages
      });

    } catch (error) {
      logger.error('Failed to get conversation history', {
        tenantId: req.tenantId,
        conversationId,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get conversation history'
      });
    }
  })
);

/**
 * @swagger
 * /api/customer-service/translate:
 *   post:
 *     summary: 翻译文本
 *     tags: [Customer Service]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - targetLanguage
 *             properties:
 *               text:
 *                 type: string
 *                 description: 待翻译文本
 *               targetLanguage:
 *                 type: string
 *                 description: 目标语言
 *               sourceLanguage:
 *                 type: string
 *                 description: 源语言（可选）
 *               provider:
 *                 type: string
 *                 description: 翻译服务提供商
 *     responses:
 *       200:
 *         description: 翻译成功
 */
router.post('/translate',
  requirePermission('ai:translate'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { text, targetLanguage, sourceLanguage, provider } = req.body;
    const { translationService } = req.app.locals;

    if (!text || !targetLanguage) {
      return res.status(400).json({
        success: false,
        error: 'Text and targetLanguage are required'
      });
    }

    try {
      const result = await translationService.smartTranslate(
        {
          content: text,
          isCustomerService: true
        },
        targetLanguage,
        {
          sourceLanguage,
          provider,
          tenantId: req.tenantId
        }
      );

      res.json({
        success: true,
        translation: result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Translation failed', {
        tenantId: req.tenantId,
        targetLanguage,
        textLength: text.length,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Translation failed'
      });
    }
  })
);

/**
 * @swagger
 * /api/customer-service/handoff/{conversationId}:
 *   post:
 *     summary: 手动触发人工介入
 *     tags: [Customer Service]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: 对话ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: 人工介入原因
 *               escalationType:
 *                 type: string
 *                 description: 升级类型
 *               assignedAgent:
 *                 type: string
 *                 description: 指定客服
 *     responses:
 *       200:
 *         description: 人工介入触发成功
 */
router.post('/handoff/:conversationId',
  requirePermission('ai:handoff'),
  requireTenant,
  auditLog('manual_handoff'),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { reason, escalationType = 'manual', assignedAgent } = req.body;
    const { conversationManager } = req.app.locals;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required'
      });
    }

    try {
      // 检查是否已存在人工介入
      const existingHandoff = await conversationManager.checkForHumanHandoff(
        conversationId,
        req.tenantId
      );

      if (existingHandoff.needsHandoff && existingHandoff.existing) {
        return res.json({
          success: true,
          message: 'Human handoff already exists',
          handoff: existingHandoff.handoff
        });
      }

      // 创建人工介入
      const handoffId = await conversationManager.startHumanHandoff(
        conversationId,
        req.tenantId,
        reason,
        escalationType,
        assignedAgent
      );

      res.json({
        success: true,
        handoffId: handoffId,
        conversationId: conversationId,
        reason: reason,
        escalationType: escalationType,
        assignedAgent: assignedAgent,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Manual handoff failed', {
        tenantId: req.tenantId,
        conversationId,
        reason,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to create human handoff'
      });
    }
  })
);

/**
 * @swagger
 * /api/customer-service/training-data/export:
 *   get:
 *     summary: 导出训练数据
 *     tags: [Customer Service]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, jsonl]
 *           default: jsonl
 *         description: 导出格式
 *       - in: query
 *         name: dataType
 *         schema:
 *           type: string
 *         description: 数据类型过滤
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 1000
 *         description: 数据条数限制
 *     responses:
 *       200:
 *         description: 训练数据导出成功
 */
router.get('/training-data/export',
  requirePermission('ai:train'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { format = 'jsonl', dataType, limit = 1000 } = req.query;
    const { mongoManager } = req.app.locals;

    try {
      if (format === 'jsonl') {
        // 导出JSONL格式用于微调
        const trainingData = await mongoManager.exportFineTuneData(req.tenantId, {
          data_type: dataType,
          limit: parseInt(limit)
        });

        res.setHeader('Content-Type', 'application/x-jsonlines');
        res.setHeader('Content-Disposition', `attachment; filename="training-data-${req.tenantId}-${Date.now()}.jsonl"`);
        
        // 输出JSONL格式
        const jsonlContent = trainingData.map(item => JSON.stringify(item)).join('\n');
        res.send(jsonlContent);

      } else {
        // 导出JSON格式
        const trainingData = await mongoManager.getTrainingData(req.tenantId, {
          data_type: dataType,
          limit: parseInt(limit)
        });

        res.json({
          success: true,
          data: trainingData,
          count: trainingData.length,
          exportedAt: new Date().toISOString()
        });
      }

    } catch (error) {
      logger.error('Training data export failed', {
        tenantId: req.tenantId,
        format,
        dataType,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to export training data'
      });
    }
  })
);

// 生成AI回复的辅助函数
async function generateAIResponse(message, context, classification, language, translationService) {
  try {
    // 这里可以集成实际的AI回复生成逻辑
    // 暂时返回基于分类的模板回复
    
    let response = '';
    
    switch (classification.category) {
      case 'billing':
        response = '关于账单问题，我来为您查询。请稍等片刻...';
        break;
      case 'technical':
        response = '我理解您遇到了技术问题。让我为您提供解决方案...';
        break;
      case 'support':
        response = '我很乐意为您提供支持。请详细描述您的问题...';
        break;
      case 'complaint':
        response = '我对您遇到的问题深表歉意。我会立即为您处理...';
        break;
      default:
        response = '感谢您的咨询，我正在为您处理...';
    }

    // 如果用户使用非中文，翻译回复
    if (language !== 'zh') {
      const translatedResponse = await translationService.translateText(
        response,
        language,
        'zh'
      );
      return {
        originalResponse: response,
        translatedResponse: translatedResponse,
        language: language
      };
    }

    return {
      response: response,
      language: language
    };

  } catch (error) {
    logger.error('AI response generation failed', { error: error.message });
    return {
      response: '抱歉，我现在无法为您提供回复，请稍后再试。',
      language: language,
      error: true
    };
  }
}

module.exports = router; 