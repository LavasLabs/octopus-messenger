const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// 导入配置和工具
const config = require('../../../config/config');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

// 导入AI分类器
const OpenAIClassifier = require('./classifiers/OpenAIClassifier');
const ClaudeClassifier = require('./classifiers/ClaudeClassifier');
const RuleEngineClassifier = require('./classifiers/RuleEngineClassifier');
const ClassificationManager = require('./managers/ClassificationManager');

// 导入工具
const DatabaseManager = require('./utils/DatabaseManager');
const CacheManager = require('./utils/CacheManager');
const NLPProcessor = require('./processors/NLPProcessor');
const TenantModelManager = require('./managers/TenantModelManager');
const TenantModeManager = require('./managers/TenantModeManager');
const SmartClassificationManager = require('./managers/SmartClassificationManager');

// 创建Express应用
const app = express();

// 基础中间件
app.use(helmet());
app.use(cors({
  origin: config.security.corsOrigins,
  credentials: true
}));
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// 限流中间件
const limiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// 解析JSON和URL编码
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'ai-service',
    version: '1.0.0'
  });
});

// 服务状态端点
app.get('/status', authMiddleware, async (req, res) => {
  try {
    const stats = await classificationManager.getStats();
    
    res.json({
      service: 'ai-service',
      status: 'running',
      stats: stats,
      classifiers: {
        openai: {
          enabled: config.ai.enabled.openai,
          status: config.ai.enabled.openai ? 'active' : 'disabled'
        },
        claude: {
          enabled: config.ai.enabled.claude,
          status: config.ai.enabled.claude ? 'active' : 'disabled'
        },
        ruleEngine: {
          enabled: true,
          status: 'active'
        }
      },
      memory: process.memoryUsage(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get service status',
      message: error.message
    });
  }
});

// AI分类端点
app.post('/classify', authMiddleware, async (req, res) => {
  try {
    const { message, options = {} } = req.body;
    
    if (!message || !message.content) {
      return res.status(400).json({
        error: 'Message content is required'
      });
    }

    const result = await classificationManager.classify(message, options);
    
    res.json({
      success: true,
      classification: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Classification error:', error);
    res.status(500).json({
      error: 'Classification failed',
      message: error.message
    });
  }
});

// 批量分类端点
app.post('/classify/batch', authMiddleware, async (req, res) => {
  try {
    const { messages, options = {} } = req.body;
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'Messages array is required'
      });
    }

    const results = await classificationManager.classifyBatch(messages, options);
    
    res.json({
      success: true,
      classifications: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Batch classification error:', error);
    res.status(500).json({
      error: 'Batch classification failed',
      message: error.message
    });
  }
});

// 训练数据端点
app.post('/train', authMiddleware, async (req, res) => {
  try {
    const { examples, modelType = 'rule-engine' } = req.body;
    
    if (!Array.isArray(examples) || examples.length === 0) {
      return res.status(400).json({
        error: 'Training examples are required'
      });
    }

    const result = await classificationManager.trainModel(modelType, examples);
    
    res.json({
      success: true,
      training: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Training error:', error);
    res.status(500).json({
      error: 'Training failed',
      message: error.message
    });
  }
});

// NLP分析端点
app.post('/analyze', authMiddleware, async (req, res) => {
  try {
    const { text, features = ['sentiment', 'entities', 'keywords'] } = req.body;
    
    if (!text) {
      return res.status(400).json({
        error: 'Text is required'
      });
    }

    const analysis = await nlpProcessor.analyze(text, features);
    
    res.json({
      success: true,
      analysis: analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('NLP analysis error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

// API路由
app.use('/api/classify', authMiddleware, require('./routes/classify'));
app.use('/api/models', authMiddleware, require('./routes/models'));
app.use('/api/analytics', authMiddleware, require('./routes/analytics'));
app.use('/api/tenant', authMiddleware, require('./routes/tenant'));
app.use('/api/mode', authMiddleware, require('./routes/mode'));
app.use('/api/smart-classify', authMiddleware, require('./routes/smart-classify'));

// 全局变量
let classificationManager;
let nlpProcessor;
let dbManager;
let cacheManager;
let tenantModelManager;
let tenantModeManager;
let smartClassificationManager;

// 初始化服务
async function initializeService() {
  try {
    logger.info('Initializing AI Service...');
    
    // 初始化数据库管理器
    dbManager = new DatabaseManager(config.database);
    await dbManager.initialize();
    logger.info('Database manager initialized');

    // 初始化缓存管理器
    cacheManager = new CacheManager(config.database.redis);
    await cacheManager.initialize();
    logger.info('Cache manager initialized');

    // 初始化NLP处理器
    nlpProcessor = new NLPProcessor();
    await nlpProcessor.initialize();
    logger.info('NLP processor initialized');

    // 初始化租户模型管理器
    tenantModelManager = new TenantModelManager({
      dbManager,
      cacheManager,
      config,
      modelsPath: config.ai?.modelsPath || './models'
    });
    await tenantModelManager.initialize();
    logger.info('Tenant model manager initialized');

    // 初始化租户模式管理器
    tenantModeManager = new TenantModeManager({
      dbManager,
      cacheManager,
      config
    });
    await tenantModeManager.initialize();
    logger.info('Tenant mode manager initialized');

    // 初始化分类器
    const classifiers = {};
    
    // OpenAI分类器
    if (config.ai.enabled.openai && config.ai.openai.apiKey) {
      classifiers.openai = new OpenAIClassifier(config.ai.openai);
      await classifiers.openai.initialize();
      logger.info('OpenAI classifier initialized');
    }
    
    // Claude分类器
    if (config.ai.enabled.claude && config.ai.claude.apiKey) {
      classifiers.claude = new ClaudeClassifier(config.ai.claude);
      await classifiers.claude.initialize();
      logger.info('Claude classifier initialized');
    }
    
    // 规则引擎分类器
    classifiers.ruleEngine = new RuleEngineClassifier();
    await classifiers.ruleEngine.initialize();
    logger.info('Rule engine classifier initialized');

    // 初始化分类管理器
    classificationManager = new ClassificationManager({
      classifiers,
      dbManager,
      cacheManager,
      nlpProcessor,
      config
    });
    await classificationManager.initialize();
    logger.info('Classification manager initialized');

    // 初始化智能分类管理器
    smartClassificationManager = new SmartClassificationManager({
      classificationManager,
      tenantModelManager,
      tenantModeManager,
      dbManager,
      config
    });
    await smartClassificationManager.initialize();
    logger.info('Smart classification manager initialized');

    // 设置全局变量供路由使用
    app.locals.classificationManager = classificationManager;
    app.locals.nlpProcessor = nlpProcessor;
    app.locals.dbManager = dbManager;
    app.locals.cacheManager = cacheManager;
    app.locals.tenantModelManager = tenantModelManager;
    app.locals.tenantModeManager = tenantModeManager;
    app.locals.smartClassificationManager = smartClassificationManager;

    logger.info('AI Service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize AI Service:', error);
    process.exit(1);
  }
}

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const PORT = config.services.aiService.port || 3002;
const HOST = config.services.aiService.host || '0.0.0.0';

async function startServer() {
  try {
    await initializeService();
    
    const server = app.listen(PORT, HOST, () => {
      logger.info(`AI Service started on ${HOST}:${PORT}`);
      logger.info(`Health check available at http://${HOST}:${PORT}/health`);
    });

    // 优雅关闭
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      server.close(async () => {
        try {
          // 关闭分类管理器
          if (classificationManager) {
            await classificationManager.shutdown();
            logger.info('Classification manager shut down');
          }

          // 关闭租户模型管理器
          if (tenantModelManager) {
            await tenantModelManager.shutdown();
            logger.info('Tenant model manager shut down');
          }

          // 关闭租户模式管理器
          if (tenantModeManager) {
            await tenantModeManager.shutdown();
            logger.info('Tenant mode manager shut down');
          }

          // 关闭智能分类管理器
          if (smartClassificationManager) {
            await smartClassificationManager.shutdown();
            logger.info('Smart classification manager shut down');
          }

          // 关闭数据库连接
          if (dbManager) {
            await dbManager.close();
            logger.info('Database connections closed');
          }

          // 关闭缓存连接
          if (cacheManager) {
            await cacheManager.close();
            logger.info('Cache connections closed');
          }

          logger.info('AI Service shut down successfully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    // 未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start AI Service:', error);
    process.exit(1);
  }
}

// 启动服务
startServer();

module.exports = app; 