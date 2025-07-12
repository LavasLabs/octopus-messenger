const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requirePermission, auditLog } = require('../middleware/auth');
const logger = require('../utils/logger');

// NLP文本分析
router.post('/nlp', 
  requirePermission('ai:analyze'),
  auditLog('nlp_analysis'),
  asyncHandler(async (req, res) => {
    const { text, features = ['sentiment', 'entities', 'keywords'] } = req.body;
    const { nlpProcessor } = req.app.locals;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    if (text.length > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Text too long (maximum 10,000 characters)'
      });
    }

    logger.nlp('analysis_started', text, null, { 
      tenantId: req.tenantId,
      userId: req.user.id,
      features
    });

    const startTime = Date.now();
    const analysis = await nlpProcessor.analyze(text, features);
    const processingTime = Date.now() - startTime;

    logger.nlp('analysis_completed', text, analysis, {
      tenantId: req.tenantId,
      processingTime
    });

    res.json({
      success: true,
      analysis,
      processingTime,
      timestamp: new Date().toISOString()
    });
  })
);

// 批量NLP分析
router.post('/nlp/batch', 
  requirePermission('ai:analyze'),
  auditLog('batch_nlp_analysis'),
  asyncHandler(async (req, res) => {
    const { texts, features = ['sentiment', 'entities', 'keywords'] } = req.body;
    const { nlpProcessor } = req.app.locals;
    
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Texts array is required'
      });
    }

    if (texts.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 20 texts allowed per batch'
      });
    }

    logger.info('Batch NLP analysis started', {
      tenantId: req.tenantId,
      userId: req.user.id,
      textCount: texts.length,
      features
    });

    const startTime = Date.now();
    const analyses = await nlpProcessor.analyzeBatch(texts, features);
    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      analyses,
      processingTime,
      averageTimePerText: processingTime / texts.length,
      timestamp: new Date().toISOString()
    });
  })
);

// 分类趋势分析
router.get('/trends/classification', 
  requirePermission('ai:analyze'),
  asyncHandler(async (req, res) => {
    const { dbManager, cacheManager } = req.app.locals;
    const { period = '7d', granularity = 'day' } = req.query;
    
    // 检查缓存
    let trends = await cacheManager.getCachedStats('trends_classification', req.tenantId);
    
    if (!trends) {
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
        case '90d':
          startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const query = `
        SELECT 
          DATE_TRUNC('${granularity}', created_at) as period,
          category,
          COUNT(*) as count,
          AVG(confidence) as avg_confidence,
          classifier_used
        FROM ai_classifications
        WHERE tenant_id = $1 
          AND created_at >= $2 
          AND created_at <= $3
        GROUP BY DATE_TRUNC('${granularity}', created_at), category, classifier_used
        ORDER BY period DESC, count DESC
      `;

      const result = await dbManager.query(query, [req.tenantId, startDate, endDate]);
      
      trends = {
        period,
        granularity,
        startDate,
        endDate,
        data: result.rows
      };

      // 缓存结果
      await cacheManager.cacheStats('trends_classification', req.tenantId, trends, 1800);
    }

    res.json({
      success: true,
      trends,
      timestamp: new Date().toISOString()
    });
  })
);

// 情感分析趋势
router.get('/trends/sentiment', 
  requirePermission('ai:analyze'),
  asyncHandler(async (req, res) => {
    const { dbManager, cacheManager } = req.app.locals;
    const { period = '7d', granularity = 'day' } = req.query;
    
    let trends = await cacheManager.getCachedStats('trends_sentiment', req.tenantId);
    
    if (!trends) {
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

      const query = `
        SELECT 
          DATE_TRUNC('${granularity}', created_at) as period,
          sentiment,
          COUNT(*) as count,
          AVG(confidence) as avg_confidence
        FROM ai_classifications
        WHERE tenant_id = $1 
          AND created_at >= $2 
          AND created_at <= $3
          AND sentiment IS NOT NULL
        GROUP BY DATE_TRUNC('${granularity}', created_at), sentiment
        ORDER BY period DESC, count DESC
      `;

      const result = await dbManager.query(query, [req.tenantId, startDate, endDate]);
      
      trends = {
        period,
        granularity,
        startDate,
        endDate,
        data: result.rows
      };

      await cacheManager.cacheStats('trends_sentiment', req.tenantId, trends, 1800);
    }

    res.json({
      success: true,
      trends,
      timestamp: new Date().toISOString()
    });
  })
);

// 分类器性能分析
router.get('/performance/classifiers', 
  requirePermission('ai:analyze'),
  asyncHandler(async (req, res) => {
    const { dbManager } = req.app.locals;
    const { period = '7d' } = req.query;
    
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

    const query = `
      SELECT 
        classifier_used,
        COUNT(*) as total_classifications,
        AVG(confidence) as avg_confidence,
        STDDEV(confidence) as std_confidence,
        MIN(confidence) as min_confidence,
        MAX(confidence) as max_confidence,
        COUNT(CASE WHEN confidence >= 0.8 THEN 1 END) as high_confidence_count,
        COUNT(CASE WHEN confidence >= 0.6 AND confidence < 0.8 THEN 1 END) as medium_confidence_count,
        COUNT(CASE WHEN confidence < 0.6 THEN 1 END) as low_confidence_count
      FROM ai_classifications
      WHERE tenant_id = $1 
        AND created_at >= $2 
        AND created_at <= $3
      GROUP BY classifier_used
      ORDER BY total_classifications DESC
    `;

    const result = await dbManager.query(query, [req.tenantId, startDate, endDate]);
    
    res.json({
      success: true,
      performance: {
        period,
        startDate,
        endDate,
        classifiers: result.rows
      },
      timestamp: new Date().toISOString()
    });
  })
);

// API使用情况分析
router.get('/usage/api', 
  requirePermission('ai:analyze'),
  asyncHandler(async (req, res) => {
    const { dbManager } = req.app.locals;
    const { period = '7d' } = req.query;
    
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

    const usage = await dbManager.getAPIUsageStats(req.tenantId, startDate, endDate);
    
    res.json({
      success: true,
      usage: {
        period,
        startDate,
        endDate,
        data: usage.rows
      },
      timestamp: new Date().toISOString()
    });
  })
);

// 文本复杂度分析
router.post('/complexity', 
  requirePermission('ai:analyze'),
  auditLog('complexity_analysis'),
  asyncHandler(async (req, res) => {
    const { text } = req.body;
    const { nlpProcessor } = req.app.locals;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    const complexity = await nlpProcessor.analyzeComplexity(text);
    
    res.json({
      success: true,
      complexity,
      timestamp: new Date().toISOString()
    });
  })
);

// 关键词提取和分析
router.post('/keywords', 
  requirePermission('ai:analyze'),
  auditLog('keyword_extraction'),
  asyncHandler(async (req, res) => {
    const { text, maxKeywords = 10 } = req.body;
    const { nlpProcessor } = req.app.locals;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    const keywords = await nlpProcessor.extractKeywords(text, maxKeywords);
    
    res.json({
      success: true,
      keywords,
      timestamp: new Date().toISOString()
    });
  })
);

// 实体识别分析
router.post('/entities', 
  requirePermission('ai:analyze'),
  auditLog('entity_recognition'),
  asyncHandler(async (req, res) => {
    const { text } = req.body;
    const { nlpProcessor } = req.app.locals;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    const entities = await nlpProcessor.extractEntities(text);
    
    res.json({
      success: true,
      entities,
      timestamp: new Date().toISOString()
    });
  })
);

// 文本相似度分析
router.post('/similarity', 
  requirePermission('ai:analyze'),
  auditLog('similarity_analysis'),
  asyncHandler(async (req, res) => {
    const { text1, text2 } = req.body;
    const { nlpProcessor } = req.app.locals;
    
    if (!text1 || !text2) {
      return res.status(400).json({
        success: false,
        error: 'Both text1 and text2 are required'
      });
    }

    const similarity = await nlpProcessor.calculateSimilarity(text1, text2);
    
    res.json({
      success: true,
      similarity,
      timestamp: new Date().toISOString()
    });
  })
);

// 分类准确性分析
router.get('/accuracy', 
  requirePermission('ai:analyze'),
  asyncHandler(async (req, res) => {
    const { dbManager } = req.app.locals;
    const { period = '7d', classifier } = req.query;
    
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

    let whereClause = 'WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3';
    const params = [req.tenantId, startDate, endDate];
    
    if (classifier) {
      whereClause += ' AND classifier_used = $4';
      params.push(classifier);
    }

    const query = `
      SELECT 
        classifier_used,
        category,
        COUNT(*) as total,
        AVG(confidence) as avg_confidence,
        COUNT(CASE WHEN confidence >= 0.8 THEN 1 END) as high_confidence,
        COUNT(CASE WHEN confidence >= 0.6 AND confidence < 0.8 THEN 1 END) as medium_confidence,
        COUNT(CASE WHEN confidence < 0.6 THEN 1 END) as low_confidence
      FROM ai_classifications
      ${whereClause}
      GROUP BY classifier_used, category
      ORDER BY total DESC
    `;

    const result = await dbManager.query(query, params);
    
    res.json({
      success: true,
      accuracy: {
        period,
        startDate,
        endDate,
        classifier,
        data: result.rows
      },
      timestamp: new Date().toISOString()
    });
  })
);

// 导出分析报告
router.get('/report', 
  requirePermission('ai:analyze'),
  auditLog('export_analysis_report'),
  asyncHandler(async (req, res) => {
    const { dbManager } = req.app.locals;
    const { period = '7d', format = 'json' } = req.query;
    
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

    // 获取综合分析数据
    const [stats, usage, performance] = await Promise.all([
      dbManager.getClassificationStats(req.tenantId, startDate, endDate),
      dbManager.getAPIUsageStats(req.tenantId, startDate, endDate),
      dbManager.query(`
        SELECT 
          classifier_used,
          COUNT(*) as total_classifications,
          AVG(confidence) as avg_confidence
        FROM ai_classifications
        WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
        GROUP BY classifier_used
      `, [req.tenantId, startDate, endDate])
    ]);

    const report = {
      period,
      startDate,
      endDate,
      tenantId: req.tenantId,
      statistics: stats.rows,
      usage: usage.rows,
      performance: performance.rows,
      generatedAt: new Date().toISOString()
    };

    if (format === 'json') {
      res.json({
        success: true,
        report,
        timestamp: new Date().toISOString()
      });
    } else {
      // 可以扩展支持其他格式如CSV, PDF等
      res.json({
        success: false,
        error: 'Only JSON format is currently supported'
      });
    }
  })
);

module.exports = router; 