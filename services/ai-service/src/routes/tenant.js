const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requirePermission, auditLog, requireTenant } = require('../middleware/auth');
const logger = require('../utils/logger');

// 训练租户专用模型
router.post('/models/train', 
  requirePermission('ai:train'),
  requireTenant,
  auditLog('train_tenant_model'),
  asyncHandler(async (req, res) => {
    const { modelType, examples, options = {} } = req.body;
    const { tenantModelManager } = req.app.locals;
    
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

    logger.info('Starting tenant model training', {
      tenantId: req.tenantId,
      userId: req.user.id,
      modelType,
      exampleCount: examples.length
    });

    const startTime = Date.now();
    const result = await tenantModelManager.trainTenantModel(
      req.tenantId, 
      modelType, 
      examples, 
      {
        ...options,
        userId: req.user.id
      }
    );

    const trainingTime = Date.now() - startTime;

    res.json({
      success: true,
      training: result,
      trainingTime,
      timestamp: new Date().toISOString()
    });
  })
);

// 使用租户模型进行预测
router.post('/models/:modelType/predict', 
  requirePermission('ai:classify'),
  requireTenant,
  auditLog('predict_with_tenant_model'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { text, message } = req.body;
    const { tenantModelManager } = req.app.locals;
    
    const inputText = text || message?.content;
    if (!inputText) {
      return res.status(400).json({
        success: false,
        error: 'Text or message content is required'
      });
    }

    const startTime = Date.now();
    const prediction = await tenantModelManager.predictWithTenantModel(
      req.tenantId,
      modelType,
      inputText
    );

    const predictionTime = Date.now() - startTime;
    
    res.json({
      success: true,
      prediction,
      predictionTime,
      modelType,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取租户模型列表
router.get('/models', 
  requirePermission('ai:train'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { tenantModelManager } = req.app.locals;
    
    const models = await tenantModelManager.listTenantModels(req.tenantId);
    
    res.json({
      success: true,
      models,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取特定租户模型信息
router.get('/models/:modelType', 
  requirePermission('ai:train'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { tenantModelManager } = req.app.locals;
    
    const model = await tenantModelManager.getTenantModel(req.tenantId, modelType);
    
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Tenant model not found'
      });
    }
    
    res.json({
      success: true,
      model,
      timestamp: new Date().toISOString()
    });
  })
);

// 导出租户模型
router.get('/models/:modelType/export', 
  requirePermission('ai:train'),
  requireTenant,
  auditLog('export_tenant_model'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { format = 'json' } = req.query;
    const { tenantModelManager } = req.app.locals;
    
    const exportData = await tenantModelManager.exportTenantModel(
      req.tenantId,
      modelType,
      format
    );
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 
      `attachment; filename="${modelType}-${req.tenantId}-v${exportData.version}.json"`);
    
    res.json({
      success: true,
      export: exportData,
      timestamp: new Date().toISOString()
    });
  })
);

// 导入租户模型
router.post('/models/:modelType/import', 
  requirePermission('ai:train'),
  requireTenant,
  auditLog('import_tenant_model'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { modelData } = req.body;
    const { tenantModelManager } = req.app.locals;
    
    if (!modelData) {
      return res.status(400).json({
        success: false,
        error: 'Model data is required'
      });
    }

    const result = await tenantModelManager.importTenantModel(
      req.tenantId,
      modelType,
      modelData
    );
    
    logger.info('Tenant model imported', {
      tenantId: req.tenantId,
      userId: req.user.id,
      modelType
    });
    
    res.json({
      success: true,
      import: result,
      timestamp: new Date().toISOString()
    });
  })
);

// 删除租户模型
router.delete('/models/:modelType', 
  requirePermission('ai:train'),
  requireTenant,
  auditLog('delete_tenant_model'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { version } = req.query;
    const { tenantModelManager } = req.app.locals;
    
    await tenantModelManager.deleteTenantModel(req.tenantId, modelType, version);
    
    logger.info('Tenant model deleted', {
      tenantId: req.tenantId,
      userId: req.user.id,
      modelType,
      version
    });
    
    res.json({
      success: true,
      message: 'Model deleted successfully',
      timestamp: new Date().toISOString()
    });
  })
);

// 批量预测
router.post('/models/:modelType/predict/batch', 
  requirePermission('ai:classify'),
  requireTenant,
  auditLog('batch_predict_tenant_model'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { texts, messages } = req.body;
    const { tenantModelManager } = req.app.locals;
    
    const inputTexts = texts || (messages || []).map(msg => msg.content);
    
    if (!Array.isArray(inputTexts) || inputTexts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Texts array or messages array is required'
      });
    }

    if (inputTexts.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 texts allowed per batch'
      });
    }

    const startTime = Date.now();
    const predictions = [];
    
    for (const text of inputTexts) {
      try {
        const prediction = await tenantModelManager.predictWithTenantModel(
          req.tenantId,
          modelType,
          text
        );
        predictions.push({ text, prediction, success: true });
      } catch (error) {
        predictions.push({ text, error: error.message, success: false });
      }
    }

    const predictionTime = Date.now() - startTime;
    
    res.json({
      success: true,
      predictions,
      predictionTime,
      averageTimePerText: predictionTime / inputTexts.length,
      modelType,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取租户训练数据
router.get('/training-data/:modelType', 
  requirePermission('ai:train'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    const { tenantModelManager } = req.app.locals;
    
    const trainingData = await tenantModelManager.getTenantTrainingData(
      req.tenantId,
      modelType
    );
    
    const parsedLimit = Math.min(parseInt(limit) || 100, 500);
    const parsedOffset = parseInt(offset) || 0;
    
    const paginatedData = trainingData.slice(parsedOffset, parsedOffset + parsedLimit);
    
    res.json({
      success: true,
      trainingData: paginatedData,
      pagination: {
        total: trainingData.length,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + parsedLimit < trainingData.length
      },
      timestamp: new Date().toISOString()
    });
  })
);

// 增量训练（追加训练数据）
router.post('/models/:modelType/incremental-train', 
  requirePermission('ai:train'),
  requireTenant,
  auditLog('incremental_train_tenant_model'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { examples, retrain = false } = req.body;
    const { tenantModelManager } = req.app.locals;
    
    if (!Array.isArray(examples) || examples.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Training examples are required'
      });
    }

    // 保存新的训练数据
    await tenantModelManager.saveTrainingData(req.tenantId, modelType, examples);
    
    let result = {
      success: true,
      message: 'Training data added successfully',
      examplesAdded: examples.length
    };

    // 如果需要重新训练模型
    if (retrain) {
      const startTime = Date.now();
      const trainingResult = await tenantModelManager.trainTenantModel(
        req.tenantId,
        modelType,
        [], // 空数组，因为会自动获取所有训练数据
        { userId: req.user.id }
      );
      
      const trainingTime = Date.now() - startTime;
      result.training = trainingResult;
      result.trainingTime = trainingTime;
    }
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  })
);

// 模型性能评估
router.post('/models/:modelType/evaluate', 
  requirePermission('ai:train'),
  requireTenant,
  auditLog('evaluate_tenant_model'),
  asyncHandler(async (req, res) => {
    const { modelType } = req.params;
    const { testData } = req.body;
    const { tenantModelManager } = req.app.locals;
    
    if (!Array.isArray(testData) || testData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Test data is required'
      });
    }

    const startTime = Date.now();
    let correct = 0;
    const results = [];
    
    for (const example of testData) {
      try {
        const prediction = await tenantModelManager.predictWithTenantModel(
          req.tenantId,
          modelType,
          example.text || example.content
        );
        
        const expectedCategory = example.category || example.label;
        const isCorrect = prediction.category === expectedCategory;
        
        if (isCorrect) correct++;
        
        results.push({
          text: example.text || example.content,
          expected: expectedCategory,
          predicted: prediction.category,
          confidence: prediction.confidence,
          correct: isCorrect
        });
      } catch (error) {
        results.push({
          text: example.text || example.content,
          expected: example.category || example.label,
          error: error.message,
          correct: false
        });
      }
    }
    
    const evaluationTime = Date.now() - startTime;
    const accuracy = correct / testData.length;
    
    const evaluation = {
      accuracy,
      correct,
      total: testData.length,
      evaluationTime,
      results: results.slice(0, 20), // 只返回前20个结果
      summary: {
        byCategory: {}
      }
    };
    
    // 按类别统计准确率
    const categoryStats = {};
    results.forEach(result => {
      if (!categoryStats[result.expected]) {
        categoryStats[result.expected] = { correct: 0, total: 0 };
      }
      categoryStats[result.expected].total++;
      if (result.correct) {
        categoryStats[result.expected].correct++;
      }
    });
    
    Object.entries(categoryStats).forEach(([category, stats]) => {
      evaluation.summary.byCategory[category] = {
        accuracy: stats.correct / stats.total,
        correct: stats.correct,
        total: stats.total
      };
    });
    
    res.json({
      success: true,
      evaluation,
      timestamp: new Date().toISOString()
    });
  })
);

// 模型比较
router.post('/models/compare', 
  requirePermission('ai:classify'),
  requireTenant,
  auditLog('compare_tenant_models'),
  asyncHandler(async (req, res) => {
    const { modelTypes, text, message } = req.body;
    const { tenantModelManager } = req.app.locals;
    
    if (!Array.isArray(modelTypes) || modelTypes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Model types array is required'
      });
    }

    const inputText = text || message?.content;
    if (!inputText) {
      return res.status(400).json({
        success: false,
        error: 'Text or message content is required'
      });
    }

    const startTime = Date.now();
    const comparisons = {};
    
    for (const modelType of modelTypes) {
      try {
        const prediction = await tenantModelManager.predictWithTenantModel(
          req.tenantId,
          modelType,
          inputText
        );
        comparisons[modelType] = prediction;
      } catch (error) {
        comparisons[modelType] = {
          error: error.message,
          success: false
        };
      }
    }
    
    const comparisonTime = Date.now() - startTime;
    
    res.json({
      success: true,
      text: inputText,
      comparisons,
      comparisonTime,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  })
);

// 租户模型统计
router.get('/stats', 
  requirePermission('ai:analyze'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { tenantModelManager, dbManager } = req.app.locals;
    
    try {
      // 获取模型列表
      const models = await tenantModelManager.listTenantModels(req.tenantId);
      
      // 获取训练数据统计
      const trainingDataQuery = `
        SELECT 
          model_type,
          SUM(examples_count) as total_examples,
          COUNT(*) as training_sessions,
          MAX(created_at) as last_training
        FROM tenant_training_data 
        WHERE tenant_id = $1
        GROUP BY model_type
      `;
      
      const trainingStats = await dbManager.query(trainingDataQuery, [req.tenantId]);
      
      // 获取预测统计（如果有的话）
      const predictionQuery = `
        SELECT 
          COUNT(*) as total_predictions,
          COUNT(CASE WHEN confidence >= 0.8 THEN 1 END) as high_confidence,
          AVG(confidence) as avg_confidence
        FROM ai_classifications 
        WHERE tenant_id = $1 AND classifier_used LIKE '%tenant%'
      `;
      
      const predictionStats = await dbManager.query(predictionQuery, [req.tenantId]);
      
      const stats = {
        models: {
          total: models.length,
          byType: models.reduce((acc, model) => {
            acc[model.modelType] = (acc[model.modelType] || 0) + 1;
            return acc;
          }, {})
        },
        training: {
          sessions: trainingStats.rows,
          totalExamples: trainingStats.rows.reduce((sum, row) => 
            sum + parseInt(row.total_examples || 0), 0)
        },
        predictions: predictionStats.rows[0] || {}
      };
      
      res.json({
        success: true,
        stats,
        tenantId: req.tenantId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get tenant stats', { 
        tenantId: req.tenantId, 
        error: error.message 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get tenant statistics'
      });
    }
  })
);

module.exports = router; 