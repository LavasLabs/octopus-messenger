const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { createProxyMiddleware } = require('http-proxy-middleware');

// 导入配置和工具
const config = require('../../../config/config');
const { logger } = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

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

// Swagger文档配置
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Octopus Messenger API',
      version: '1.0.0',
      description: '多平台消息处理和任务管理系统API文档',
      contact: {
        name: 'Octopus Team',
        email: 'support@octopus-messenger.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: '开发环境'
      },
      {
        url: 'https://api.octopus-messenger.com',
        description: '生产环境'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.js', './src/docs/*.yaml']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'gateway'
  });
});

// API路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', authenticateToken, require('./routes/users'));
app.use('/api/tenants', authenticateToken, require('./routes/tenants'));
app.use('/api/bots', authenticateToken, require('./routes/bots'));
app.use('/api/merchants', authenticateToken, require('./routes/merchants')); // 新增：商户管理路由
app.use('/api/messages', authenticateToken, require('./routes/messages'));
app.use('/api/tasks', authenticateToken, require('./routes/tasks'));
app.use('/api/classifications', authenticateToken, require('./routes/classifications'));
app.use('/api/ai', authenticateToken, require('./routes/ai'));
app.use('/api/user-analytics', authenticateToken, require('./routes/userAnalytics'));
app.use('/api/groups', authenticateToken, require('./routes/groupManagement'));
app.use('/api/webhooks', require('./routes/webhooks'));

// 微服务代理配置
const serviceProxies = {
  '/api/message-processor': {
    target: `http://localhost:${config.services.messageProcessor.port}`,
    changeOrigin: true,
    pathRewrite: {
      '^/api/message-processor': ''
    }
  },
  '/api/ai-service': {
    target: `http://localhost:${config.services.aiService.port}`,
    changeOrigin: true,
    pathRewrite: {
      '^/api/ai-service': ''
    }
  },
  '/api/task-service': {
    target: `http://localhost:${config.services.taskService.port}`,
    changeOrigin: true,
    pathRewrite: {
      '^/api/task-service': ''
    }
  },
  '/api/bot-manager': {
    target: `http://localhost:${config.services.botManager.port}`,
    changeOrigin: true,
    pathRewrite: {
      '^/api/bot-manager': ''
    }
  }
};

// 设置代理中间件
Object.keys(serviceProxies).forEach(path => {
  const proxyOptions = {
    ...serviceProxies[path],
    onError: (err, req, res) => {
      logger.error(`Proxy error for ${path}:`, err);
      res.status(502).json({
        error: 'Service temporarily unavailable',
        message: 'The requested service is currently unavailable. Please try again later.'
      });
    },
    onProxyReq: (proxyReq, req, res) => {
      logger.info(`Proxying request to ${path}: ${req.method} ${req.url}`);
      
      // 转发认证头
      if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
      }
      
      // 转发租户信息
      if (req.user && req.user.tenantId) {
        proxyReq.setHeader('X-Tenant-ID', req.user.tenantId);
      }
    }
  };

  app.use(path, authenticateToken, createProxyMiddleware(proxyOptions));
});

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const PORT = config.services.gateway.port || 3000;
const HOST = config.services.gateway.host || '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info(`Gateway service started on ${HOST}:${PORT}`);
  logger.info(`API documentation available at http://${HOST}:${PORT}/api/docs`);
  logger.info(`Health check available at http://${HOST}:${PORT}/health`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app; 