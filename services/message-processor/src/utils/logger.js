const winston = require('winston');
const path = require('path');
const config = require('../../../../config/config');

// 定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, stack, service = 'message-processor', ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
    const logMessage = `[${timestamp}] [${service}] ${level}: ${message}`;
    return stack ? `${logMessage}\n${stack}` : `${logMessage} ${metaString}`;
  })
);

// 创建日志传输器
const transports = [];

// 控制台日志
if (config.logging.console.enabled) {
  transports.push(new winston.transports.Console({
    level: config.logging.level,
    format: logFormat
  }));
}

// 文件日志
if (config.logging.file.enabled) {
  const logDir = path.dirname(config.logging.file.filename);
  
  // 确保日志目录存在
  const fs = require('fs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // 通用日志文件
  transports.push(new winston.transports.File({
    level: config.logging.level,
    filename: config.logging.file.filename,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    maxsize: config.logging.file.maxSize,
    maxFiles: config.logging.file.maxFiles,
    tailable: true
  }));

  // 错误日志文件
  transports.push(new winston.transports.File({
    level: 'error',
    filename: config.logging.file.filename.replace('.log', '.error.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    maxsize: config.logging.file.maxSize,
    maxFiles: config.logging.file.maxFiles,
    tailable: true
  }));
}

// 创建Logger实例
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'message-processor' },
  transports: transports
});

// 添加便捷方法
logger.logRequest = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      tenantId: req.user?.tenantId
    };
    
    if (res.statusCode >= 400) {
      logger.warn('HTTP Request', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  });
  
  next();
};

logger.logError = (error, context = {}) => {
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    ...context
  });
};

logger.logProcessing = (messageId, action, data = {}) => {
  logger.info('Message processing', {
    messageId,
    action,
    ...data
  });
};

logger.logQueue = (queueName, action, data = {}) => {
  logger.info('Queue operation', {
    queue: queueName,
    action,
    ...data
  });
};

logger.logDatabase = (operation, table, data = {}) => {
  logger.debug('Database operation', {
    operation,
    table,
    ...data
  });
};

logger.logCache = (operation, key, data = {}) => {
  logger.debug('Cache operation', {
    operation,
    key,
    ...data
  });
};

module.exports = logger; 