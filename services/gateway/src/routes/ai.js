const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const AIServiceClient = require('../utils/AIServiceClient');

/**
 * @swagger
 * tags:
 *   name: AI
 *   description: AI智能分类和模式管理
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ClassificationResult:
 *       type: object
 *       properties:
 *         category:
 *           type: string
 *           description: 分类结果
 *         confidence:
 *           type: number
 *           description: 置信度
 *         mode:
 *           type: string
 *           description: 使用的模式
 *         usedCustomModel:
 *           type: boolean
 *           description: 是否使用了自定义模型
 *     ModeInfo:
 *       type: object
 *       properties:
 *         mode:
 *           type: string
 *           enum: [training, normal]
 *           description: 当前模式
 *         config:
 *           type: object
 *           description: 模式配置
 */

/**
 * @swagger
 * /api/ai/classify:
 *   post:
 *     summary: 智能消息分类
 *     tags: [AI]
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
 *             properties:
 *               message:
 *                 type: object
 *                 required:
 *                   - content
 *                 properties:
 *                   content:
 *                     type: string
 *                     description: 消息内容
 *                   platform:
 *                     type: string
 *                     description: 平台名称
 *                   userId:
 *                     type: string
 *                     description: 用户ID
 *     responses:
 *       200:
 *         description: 分类成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 classification:
 *                   $ref: '#/components/schemas/ClassificationResult'
 */
router.post('/classify', async (req, res) => {
  try {
    const { message, options = {} } = req.body;
    
    if (!message || !message.content) {
      return res.status(400).json({
        success: false,
        error: 'Message with content is required'
      });
    }

    logger.info('AI classification request', {
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
      messageLength: message.content.length,
      platform: message.platform
    });

    // 调用AI服务进行智能分类
    const aiClient = new AIServiceClient(req.user?.tenantId);
    const result = await aiClient.classifyMessage(message, {
      ...options,
      userId: req.user?.id,
      authorization: req.headers.authorization
    });

    res.json({
      success: true,
      classification: result.classification,
      processingTime: result.processingTime,
      explanation: result.explanation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('AI classification failed', {
      tenantId: req.user?.tenantId,
      error: error.message,
      stack: error.stack
    });

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'AI classification failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/ai/classify/batch:
 *   post:
 *     summary: 批量消息分类
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     content:
 *                       type: string
 *                     platform:
 *                       type: string
 *                     userId:
 *                       type: string
 *     responses:
 *       200:
 *         description: 批量分类成功
 */
router.post('/classify/batch', async (req, res) => {
  try {
    const { messages, options = {} } = req.body;
    
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

    logger.info('AI batch classification request', {
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
      messageCount: messages.length
    });

    const aiClient = new AIServiceClient(req.user?.tenantId);
    const results = await aiClient.classifyBatch(messages, {
      ...options,
      userId: req.user?.id,
      authorization: req.headers.authorization
    });

    const successCount = results.results.filter(r => r.success).length;

    res.json({
      success: true,
      results: results.results,
      summary: {
        total: messages.length,
        successful: successCount,
        failed: messages.length - successCount,
        processingTime: results.summary?.processingTime,
        averageTimePerMessage: results.summary?.averageTimePerMessage
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('AI batch classification failed', {
      tenantId: req.user?.tenantId,
      error: error.message
    });

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Batch classification failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/ai/mode:
 *   get:
 *     summary: 获取当前AI模式
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取模式信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mode:
 *                   $ref: '#/components/schemas/ModeInfo'
 */
router.get('/mode', async (req, res) => {
  try {
    const aiClient = new AIServiceClient(req.user?.tenantId);
    const modeInfo = await aiClient.getCurrentMode({
      authorization: req.headers.authorization
    });

    res.json({
      success: true,
      mode: modeInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get AI mode', {
      tenantId: req.user?.tenantId,
      error: error.message
    });

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to get AI mode',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/ai/mode:
 *   post:
 *     summary: 切换AI模式
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mode
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [training, normal]
 *                 description: 目标模式
 *               reason:
 *                 type: string
 *                 description: 切换原因
 *     responses:
 *       200:
 *         description: 模式切换成功
 */
router.post('/mode', async (req, res) => {
  try {
    const { mode, reason } = req.body;
    
    if (!mode || !['training', 'normal'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Valid mode (training or normal) is required'
      });
    }

    logger.info('AI mode switch request', {
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
      requestedMode: mode,
      reason
    });

    const aiClient = new AIServiceClient(req.user?.tenantId);
    const result = await aiClient.switchMode(mode, reason, {
      authorization: req.headers.authorization
    });

    res.json({
      success: true,
      message: result.message,
      previousMode: result.previousMode,
      currentMode: result.currentMode,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('AI mode switch failed', {
      tenantId: req.user?.tenantId,
      error: error.message
    });

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Mode switch failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/ai/mode/info:
 *   get:
 *     summary: 获取详细模式信息
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取详细模式信息
 */
router.get('/mode/info', async (req, res) => {
  try {
    const aiClient = new AIServiceClient(req.user?.tenantId);
    const modeInfo = await aiClient.getModeInfo({
      authorization: req.headers.authorization
    });

    res.json({
      success: true,
      ...modeInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get detailed mode info', {
      tenantId: req.user?.tenantId,
      error: error.message
    });

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to get mode information',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/ai/mode/recommend:
 *   get:
 *     summary: 获取模式推荐
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取模式推荐
 */
router.get('/mode/recommend', async (req, res) => {
  try {
    const aiClient = new AIServiceClient(req.user?.tenantId);
    const recommendation = await aiClient.getModeRecommendation({
      authorization: req.headers.authorization
    });

    res.json({
      success: true,
      recommendation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get mode recommendation', {
      tenantId: req.user?.tenantId,
      error: error.message
    });

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to get recommendation',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/ai/stats:
 *   get:
 *     summary: 获取AI分类统计
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *         description: 时间范围
 *     responses:
 *       200:
 *         description: 成功获取统计信息
 */
router.get('/stats', async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    const aiClient = new AIServiceClient(req.user?.tenantId);
    const stats = await aiClient.getClassificationStats(timeRange, {
      authorization: req.headers.authorization
    });

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get AI stats', {
      tenantId: req.user?.tenantId,
      error: error.message
    });

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to get statistics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/ai/models:
 *   get:
 *     summary: 获取租户模型列表
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取模型列表
 */
router.get('/models', async (req, res) => {
  try {
    const aiClient = new AIServiceClient(req.user?.tenantId);
    const models = await aiClient.getTenantModels({
      authorization: req.headers.authorization
    });

    res.json({
      success: true,
      models,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get tenant models', {
      tenantId: req.user?.tenantId,
      error: error.message
    });

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to get models',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/ai/models/train:
 *   post:
 *     summary: 训练租户专属模型
 *     tags: [AI]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modelType
 *               - examples
 *             properties:
 *               modelType:
 *                 type: string
 *                 enum: [rule-engine, local-classifier, embedding-model]
 *               examples:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     text:
 *                       type: string
 *                     category:
 *                       type: string
 *     responses:
 *       200:
 *         description: 模型训练成功
 */
router.post('/models/train', async (req, res) => {
  try {
    const { modelType, examples, options = {} } = req.body;
    
    if (!modelType || !examples) {
      return res.status(400).json({
        success: false,
        error: 'Model type and examples are required'
      });
    }

    if (!Array.isArray(examples) || examples.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Examples must be a non-empty array'
      });
    }

    logger.info('AI model training request', {
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
      modelType,
      exampleCount: examples.length
    });

    const aiClient = new AIServiceClient(req.user?.tenantId);
    const result = await aiClient.trainModel(modelType, examples, {
      ...options,
      userId: req.user?.id,
      authorization: req.headers.authorization
    });

    res.json({
      success: true,
      training: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('AI model training failed', {
      tenantId: req.user?.tenantId,
      error: error.message
    });

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Model training failed',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router; 