const winston = require('winston');
const path = require('path');

const config = require('../../../../config/config');

// 定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 创建日志记录器
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'gateway' },
  transports: [
    // 文件传输
    new winston.transports.File({
      filename: path.join(__dirname, '../../../../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../../../logs/combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// 如果不在生产环境，同时输出到控制台
if (config.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// 包装器方法，添加额外的上下文信息
const createContextLogger = (context = {}) => {
  return {
    info: (message, meta = {}) => logger.info(message, { ...context, ...meta }),
    error: (message, meta = {}) => logger.error(message, { ...context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { ...context, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { ...context, ...meta })
  };
};

// 请求日志中间件
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // 记录请求开始
  logger.info('Request started', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user ? req.user.id : null,
    tenantId: req.user ? req.user.tenantId : null
  });

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user ? req.user.id : null,
      tenantId: req.user ? req.user.tenantId : null
    });
  });

  next();
};

// 错误日志方法
const logError = (error, context = {}) => {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    ...context
  });
};

// 数据库操作日志
const logDatabaseOperation = (operation, table, data = {}) => {
  logger.debug('Database operation', {
    operation,
    table,
    data: typeof data === 'object' ? JSON.stringify(data) : data
  });
};

// API调用日志
const logApiCall = (service, endpoint, method, data = {}) => {
  logger.info('API call', {
    service,
    endpoint,
    method,
    data: typeof data === 'object' ? JSON.stringify(data) : data
  });
};

module.exports = {
  logger,
  createContextLogger,
  requestLogger,
  logError,
  logDatabaseOperation,
  logApiCall
}; 