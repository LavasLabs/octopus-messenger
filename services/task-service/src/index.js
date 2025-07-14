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
const TaskManager = require('./managers/TaskManager');
const CRMManager = require('./integrations/CRMManager');
const DatabaseManager = require('./utils/DatabaseManager');
const CacheManager = require('./utils/CacheManager');
const CRMOptimizer = require('./utils/CRMOptimizer');

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
    service: 'task-service',
    version: '1.0.0'
  });
});

// 服务状态端点
app.get('/status', authMiddleware, async (req, res) => {
  try {
    const taskStats = await taskManager.getStats();
    const crmStats = await crmManager.getIntegrationStats();
    
    res.json({
      service: 'task-service',
      status: 'running',
      stats: {
        tasks: taskStats,
        crm: crmStats
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

// 创建任务端点
app.post('/tasks', authMiddleware, async (req, res) => {
  try {
    const { messageId, classificationId, title, description, category, priority } = req.body;
    
    if (!title) {
      return res.status(400).json({
        error: 'Task title is required'
      });
    }

    const taskData = {
      tenantId: req.user.tenantId,
      messageId,
      classificationId,
      title,
      description,
      category,
      priority: priority || 'medium'
    };

    const task = await taskManager.createTask(taskData);
    
    res.status(201).json({
      success: true,
      task: task,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Task creation error:', error);
    res.status(500).json({
      error: 'Task creation failed',
      message: error.message
    });
  }
});

// 获取任务列表端点
app.get('/tasks', authMiddleware, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      priority, 
      category,
      assignedTo,
      search 
    } = req.query;

    const filters = {
      tenantId: req.user.tenantId,
      status,
      priority,
      category,
      assignedTo,
      search
    };

    const result = await taskManager.getTasks(filters, {
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      tasks: result.tasks,
      pagination: result.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Get tasks error:', error);
    res.status(500).json({
      error: 'Failed to get tasks',
      message: error.message
    });
  }
});

// 获取单个任务端点
app.get('/tasks/:taskId', authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await taskManager.getTaskById(taskId, req.user.tenantId);
    
    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      task: task,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Get task error:', error);
    res.status(500).json({
      error: 'Failed to get task',
      message: error.message
    });
  }
});

// 更新任务端点
app.put('/tasks/:taskId', authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.params;
    const updates = req.body;
    
    const task = await taskManager.updateTask(taskId, updates, req.user.tenantId);
    
    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      task: task,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Update task error:', error);
    res.status(500).json({
      error: 'Failed to update task',
      message: error.message
    });
  }
});

// 同步任务到CRM端点
app.post('/tasks/:taskId/sync', authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { integrationIds, strategy } = req.body;
    
    const result = await taskManager.syncTaskToCRM(taskId, {
      integrationIds,
      strategy,
      tenantId: req.user.tenantId
    });
    
    res.json({
      success: true,
      syncResult: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Task sync error:', error);
    res.status(500).json({
      error: 'Task sync failed',
      message: error.message
    });
  }
});

// CRM集成管理端点
app.get('/integrations', authMiddleware, async (req, res) => {
  try {
    const integrations = await crmManager.getAvailableIntegrations();
    
    res.json({
      success: true,
      integrations: integrations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Get integrations error:', error);
    res.status(500).json({
      error: 'Failed to get integrations',
      message: error.message
    });
  }
});

// API路由
app.use('/api/tasks', authMiddleware, require('./routes/tasks'));
app.use('/api/integrations', authMiddleware, require('./routes/integrations'));
app.use('/api/sync', authMiddleware, require('./routes/sync'));

// 全局变量
let taskManager;
let crmManager;
let dbManager;
let cacheManager;
let crmOptimizer;

// 初始化服务
async function initializeService() {
  try {
    logger.info('Initializing Task Service...');
    
    // 初始化数据库管理器
    dbManager = new DatabaseManager(config.database);
    await dbManager.initialize();
    logger.info('Database manager initialized');

    // 初始化缓存管理器
    cacheManager = new CacheManager(config.database.redis);
    await cacheManager.initialize();
    logger.info('Cache manager initialized');

    // 初始化CRM优化器
    crmOptimizer = new CRMOptimizer();
    await crmOptimizer.initialize();
    logger.info('CRM optimizer initialized');

    // 初始化CRM管理器
    crmManager = new CRMManager();
    
    // 加载CRM集成配置
    const crmConfigs = await loadCRMConfigurations();
    await crmManager.initialize(crmConfigs);
    logger.info('CRM manager initialized');

    // 初始化任务管理器
    taskManager = new TaskManager({
      dbManager,
      cacheManager,
      crmManager,
      config
    });
    await taskManager.initialize();
    logger.info('Task manager initialized');

    // 设置全局变量供路由使用
    app.locals.taskManager = taskManager;
    app.locals.crmManager = crmManager;
    app.locals.dbManager = dbManager;
    app.locals.cacheManager = cacheManager;

    logger.info('Task Service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Task Service:', error);
    process.exit(1);
  }
}

// 加载CRM配置
async function loadCRMConfigurations() {
  const crmConfigs = [];
  
  // Salesforce配置
  if (config.crm.salesforce.enabled) {
    crmConfigs.push({
      id: 'salesforce-default',
      type: 'salesforce',
      enabled: true,
      config: config.crm.salesforce
    });
  }
  
  // HubSpot配置
  if (config.crm.hubspot.enabled) {
    crmConfigs.push({
      id: 'hubspot-default',
      type: 'hubspot',
      enabled: true,
      config: config.crm.hubspot
    });
  }
  
  // 飞书配置
  if (config.crm.lark.enabled) {
    crmConfigs.push({
      id: 'lark-default',
      type: 'lark',
      enabled: true,
      config: config.crm.lark
    });
  }
  
  // 钉钉配置
  if (config.crm.dingtalk.enabled) {
    crmConfigs.push({
      id: 'dingtalk-default',
      type: 'dingtalk',
      enabled: true,
      config: config.crm.dingtalk
    });
  }
  
  // Notion配置
  if (config.crm.notion.enabled) {
    crmConfigs.push({
      id: 'notion-default',
      type: 'notion',
      enabled: true,
      config: config.crm.notion
    });
  }
  
  // Jira配置
  if (config.crm.jira.enabled) {
    crmConfigs.push({
      id: 'jira-default',
      type: 'jira',
      enabled: true,
      config: config.crm.jira
    });
  }
  
  return crmConfigs;
}

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const PORT = config.services.taskService.port || 3003;
const HOST = config.services.taskService.host || '0.0.0.0';

async function startServer() {
  try {
    await initializeService();
    
    const server = app.listen(PORT, HOST, () => {
      logger.info(`Task Service started on ${HOST}:${PORT}`);
      logger.info(`Health check available at http://${HOST}:${PORT}/health`);
    });

    // 优雅关闭
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      server.close(async () => {
        try {
          // 关闭任务管理器
          if (taskManager) {
            await taskManager.shutdown();
            logger.info('Task manager shut down');
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

          logger.info('Task Service shut down successfully');
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
    logger.error('Failed to start Task Service:', error);
    process.exit(1);
  }
}

// 启动服务
startServer();

module.exports = app; 