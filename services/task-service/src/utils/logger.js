const winston = require('winston');
const path = require('path');

// 创建日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]`;
    
    if (typeof message === 'object') {
      log += ` ${JSON.stringify(message)}`;
    } else {
      log += ` ${message}`;
    }
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// 创建Winston logger实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'task-service',
    version: '1.0.0'
  },
  transports: [
    // 错误日志文件
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'task-service-error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // 所有日志文件
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'task-service-combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    })
  ],
  
  // 处理未捕获的异常
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'task-service-exceptions.log')
    })
  ],
  
  // 处理未捕获的Promise拒绝
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'task-service-rejections.log')
    })
  ]
});

// 在开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// 创建日志目录
const fs = require('fs');
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 扩展方法
logger.request = (req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    });
    
    originalSend.call(this, data);
  };
  
  if (next) next();
};

logger.task = (action, taskId, details = {}) => {
  logger.info('Task Action', {
    action,
    taskId,
    ...details
  });
};

logger.crm = (action, integrationId, details = {}) => {
  logger.info('CRM Action', {
    action,
    integrationId,
    ...details
  });
};

logger.sync = (taskId, integrationId, result, details = {}) => {
  logger.info('Task Sync', {
    taskId,
    integrationId,
    result,
    ...details
  });
};

module.exports = logger; 