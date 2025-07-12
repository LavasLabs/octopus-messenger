const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requirePermission, auditLog } = require('../middleware/auth');
const logger = require('../utils/logger');

// 训练模型
router.post('/train', 
  requirePermission('ai:train'),
  auditLog('train_model'),
  asyncHandler(async (req, res) => {
    const { modelType, examples, options = {} } = req.body;
    const { classificationManager } = req.app.locals;
    
    if (!modelType) {
      return res.status(400).json({
        success: false,
        error: 'Model type is required'
      });
    }

    if (!Array.isArray(examples) || examples.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Training examples are required'
      });
    }

    if (examples.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'At least 10 training examples are required'
      });
    }

    logger.train('started', modelType, examples, { 
      tenantId: req.tenantId,
      userId: req.user.id,
      options
    });

    const startTime = Date.now();
    const result = await classificationManager.trainModel(modelType, examples, {
      ...options,
      tenantId: req.tenantId,
      userId: req.user.id
    });

    const trainingTime = Date.now() - startTime;
    logger.train('completed', modelType, examples, {
      ...result,
      trainingTime,
      tenantId: req.tenantId
    });

    res.json({
      success: true,
      training: result,
      trainingTime,
      timestamp: new Date().toISOString()
    });
  })
);

// 评估模型
router.post('/evaluate', 
  requirePermission('ai:train'),
  auditLog('evaluate_model'),
  asyncHandler(async (req, res) => {
    const { modelType, testData, options = {} } = req.body;
    const { classificationManager } = req.app.locals;
    
    if (!modelType) {
      return res.status(400).json({
        success: false,
        error: 'Model type is required'
      });
    }

    if (!Array.isArray(testData) || testData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Test data is required'
      });
    }

    logger.info('Model evaluation started', {
      tenantId: req.tenantId,
      userId: req.user.id,
      modelType,
      testDataSize: testData.length
    });

    const startTime = Date.now();
    const evaluation = await classificationManager.evaluateModel(modelType, testData, {
      ...options,
      tenantId: req.tenantId,
      userId: req.user.id
    });

    const evaluationTime = Date.now() - startTime;
    logger.info('Model evaluation completed', {
      tenantId: req.tenantId,
      modelType,
      accuracy: evaluation.accuracy,
      evaluationTime
    });

    res.json({
      success: true,
      evaluation,
      evaluationTime,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取模型信息
router.get('/:modelType', 
  requirePermission('ai:train'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { classificationManager, dbManager } = req.app.locals;
    
    // 获取模型基本信息
    const modelInfo = await classificationManager.getModelInfo(modelType, req.tenantId);
    
    // 获取最新的模型指标
    const metricsResult = await dbManager.getLatestModelMetrics(req.tenantId, modelType);
    const metrics = metricsResult.rows[0] || null;
    
    res.json({
      success: true,
      model: {
        type: modelType,
        info: modelInfo,
        metrics,
        tenantId: req.tenantId
      },
      timestamp: new Date().toISOString()
    });
  })
);

// 获取所有模型列表
router.get('/', 
  requirePermission('ai:train'),
  asyncHandler(async (req, res) => {
    const { classificationManager } = req.app.locals;
    
    const models = await classificationManager.getAvailableModels(req.tenantId);
    
    res.json({
      success: true,
      models,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取模型性能历史
router.get('/:modelType/metrics', 
  requirePermission('ai:train'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { dbManager } = req.app.locals;
    const { limit = 10, offset = 0 } = req.query;
    
    const parsedLimit = Math.min(parseInt(limit) || 10, 50);
    const parsedOffset = parseInt(offset) || 0;

    const query = `
      SELECT *
      FROM ai_model_metrics
      WHERE tenant_id = $1 AND model_type = $2
      ORDER BY evaluation_date DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await dbManager.query(query, [
      req.tenantId,
      modelType,
      parsedLimit,
      parsedOffset
    ]);

    res.json({
      success: true,
      metrics: result.rows,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: result.rowCount
      },
      timestamp: new Date().toISOString()
    });
  })
);

// 保存训练数据
router.post('/training-data', 
  requirePermission('ai:train'),
  auditLog('save_training_data'),
  asyncHandler(async (req, res) => {
    const { modelType, examples } = req.body;
    const { dbManager } = req.app.locals;
    
    if (!modelType) {
      return res.status(400).json({
        success: false,
        error: 'Model type is required'
      });
    }

    if (!Array.isArray(examples) || examples.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Training examples are required'
      });
    }

    const result = await dbManager.saveTrainingData(req.tenantId, examples, modelType);
    
    logger.info('Training data saved', {
      tenantId: req.tenantId,
      userId: req.user.id,
      modelType,
      exampleCount: examples.length
    });

    res.json({
      success: true,
      trainingData: result.rows[0],
      timestamp: new Date().toISOString()
    });
  })
);

// 获取训练数据
router.get('/:modelType/training-data', 
  requirePermission('ai:train'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { dbManager } = req.app.locals;
    const { limit = 1000 } = req.query;
    
    const parsedLimit = Math.min(parseInt(limit) || 1000, 5000);
    
    const examples = await dbManager.getTrainingData(req.tenantId, modelType, parsedLimit);
    
    res.json({
      success: true,
      trainingData: examples,
      count: examples.length,
      timestamp: new Date().toISOString()
    });
  })
);

// 重置模型
router.post('/:modelType/reset', 
  requirePermission('ai:train'),
  auditLog('reset_model'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { classificationManager } = req.app.locals;
    
    logger.info('Model reset started', {
      tenantId: req.tenantId,
      userId: req.user.id,
      modelType
    });

    const result = await classificationManager.resetModel(modelType, req.tenantId);
    
    logger.info('Model reset completed', {
      tenantId: req.tenantId,
      userId: req.user.id,
      modelType,
      success: result.success
    });

    res.json({
      success: true,
      reset: result,
      timestamp: new Date().toISOString()
    });
  })
);

// 导出模型
router.get('/:modelType/export', 
  requirePermission('ai:train'),
  auditLog('export_model'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { classificationManager } = req.app.locals;
    const { format = 'json' } = req.query;
    
    const modelData = await classificationManager.exportModel(modelType, req.tenantId, format);
    
    logger.info('Model exported', {
      tenantId: req.tenantId,
      userId: req.user.id,
      modelType,
      format
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${modelType}-${req.tenantId}.json"`);
    
    res.json({
      success: true,
      model: modelData,
      exportedAt: new Date().toISOString()
    });
  })
);

// 导入模型
router.post('/:modelType/import', 
  requirePermission('ai:train'),
  auditLog('import_model'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { modelData, options = {} } = req.body;
    const { classificationManager } = req.app.locals;
    
    if (!modelData) {
      return res.status(400).json({
        success: false,
        error: 'Model data is required'
      });
    }

    logger.info('Model import started', {
      tenantId: req.tenantId,
      userId: req.user.id,
      modelType
    });

    const result = await classificationManager.importModel(modelType, modelData, {
      ...options,
      tenantId: req.tenantId,
      userId: req.user.id
    });

    logger.info('Model import completed', {
      tenantId: req.tenantId,
      userId: req.user.id,
      modelType,
      success: result.success
    });

    res.json({
      success: true,
      import: result,
      timestamp: new Date().toISOString()
    });
  })
);

// 模型预测测试
router.post('/:modelType/predict', 
  requirePermission('ai:classify'),
  auditLog('test_model_prediction'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { message, options = {} } = req.body;
    const { classificationManager } = req.app.locals;
    
    if (!message || !message.content) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
    }

    const startTime = Date.now();
    const prediction = await classificationManager.predict(modelType, message, {
      ...options,
      tenantId: req.tenantId,
      userId: req.user.id
    });

    const predictionTime = Date.now() - startTime;
    
    res.json({
      success: true,
      prediction,
      predictionTime,
      timestamp: new Date().toISOString()
    });
  })
);

// 批量预测
router.post('/:modelType/predict/batch', 
  requirePermission('ai:classify'),
  auditLog('batch_model_prediction'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { messages, options = {} } = req.body;
    const { classificationManager } = req.app.locals;
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required'
      });
    }

    if (messages.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 messages allowed per batch'
      });
    }

    const startTime = Date.now();
    const predictions = await classificationManager.predictBatch(modelType, messages, {
      ...options,
      tenantId: req.tenantId,
      userId: req.user.id
    });

    const predictionTime = Date.now() - startTime;
    
    res.json({
      success: true,
      predictions,
      predictionTime,
      averageTimePerMessage: predictionTime / messages.length,
      timestamp: new Date().toISOString()
    });
  })
);

module.exports = router; 