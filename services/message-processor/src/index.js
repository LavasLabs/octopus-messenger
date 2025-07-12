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

// 导入业务模块
const MessageProcessor = require('./processors/MessageProcessor');
const MessageQueue = require('./queues/MessageQueue');
const DatabaseManager = require('./utils/DatabaseManager');
const CacheManager = require('./utils/CacheManager');

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
    service: 'message-processor',
    version: '1.0.0'
  });
});

// 服务状态端点
app.get('/status', authMiddleware, async (req, res) => {
  try {
    const stats = await messageProcessor.getStats();
    const queueStats = await messageQueue.getStats();
    
    res.json({
      service: 'message-processor',
      status: 'running',
      stats: stats,
      queue: queueStats,
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

// API路由
app.use('/api/messages', authMiddleware, require('./routes/messages'));
app.use('/api/process', authMiddleware, require('./routes/process'));
app.use('/api/queue', authMiddleware, require('./routes/queue'));

// 全局变量
let messageProcessor;
let messageQueue;
let dbManager;
let cacheManager;

// 初始化服务
async function initializeService() {
  try {
    logger.info('Initializing Message Processor Service...');
    
    // 初始化数据库管理器
    dbManager = new DatabaseManager(config.database);
    await dbManager.initialize();
    logger.info('Database manager initialized');

    // 初始化缓存管理器
    cacheManager = new CacheManager(config.database.redis);
    await cacheManager.initialize();
    logger.info('Cache manager initialized');

    // 初始化消息队列
    messageQueue = new MessageQueue(config.queue);
    await messageQueue.initialize();
    logger.info('Message queue initialized');

    // 初始化消息处理器
    messageProcessor = new MessageProcessor({
      dbManager,
      cacheManager,
      messageQueue,
      config
    });
    await messageProcessor.initialize();
    logger.info('Message processor initialized');

    // 启动队列工作器
    await messageQueue.startWorkers();
    logger.info('Queue workers started');

    // 设置全局变量供路由使用
    app.locals.messageProcessor = messageProcessor;
    app.locals.messageQueue = messageQueue;
    app.locals.dbManager = dbManager;
    app.locals.cacheManager = cacheManager;

    logger.info('Message Processor Service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Message Processor Service:', error);
    process.exit(1);
  }
}

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const PORT = config.services.messageProcessor.port || 3001;
const HOST = config.services.messageProcessor.host || '0.0.0.0';

async function startServer() {
  try {
    await initializeService();
    
    const server = app.listen(PORT, HOST, () => {
      logger.info(`Message Processor Service started on ${HOST}:${PORT}`);
      logger.info(`Health check available at http://${HOST}:${PORT}/health`);
    });

    // 优雅关闭
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      server.close(async () => {
        try {
          // 停止队列工作器
          if (messageQueue) {
            await messageQueue.stopWorkers();
            logger.info('Queue workers stopped');
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

          logger.info('Message Processor Service shut down successfully');
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
    logger.error('Failed to start Message Processor Service:', error);
    process.exit(1);
  }
}

// 启动服务
startServer();

module.exports = app; 