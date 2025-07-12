const winston = require('winston');
const path = require('path');

// 创建日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service = 'ai-service', ...meta }) => {
    return JSON.stringify({
      timestamp,
      service,
      level,
      message,
      ...meta
    });
  })
);

// 创建 Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'ai-service' },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
        })
      )
    }),
    
    // 文件输出
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'ai-service-error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'ai-service-combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ],
  
  // 处理未捕获的异常
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'ai-service-exceptions.log')
    })
  ],
  
  // 处理未处理的 Promise 拒绝
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'ai-service-rejections.log')
    })
  ]
});

// AI分类专用日志方法
logger.classify = (action, message, metadata = {}) => {
  logger.info(`Classification ${action}`, {
    action,
    messageId: message.id,
    platform: message.platform,
    contentLength: message.content?.length || 0,
    ...metadata
  });
};

// AI模型调用日志
logger.aiCall = (model, request, response, metadata = {}) => {
  logger.info(`AI model called`, {
    model,
    requestTokens: request.tokens || 0,
    responseTokens: response.tokens || 0,
    success: response.success,
    latency: response.latency,
    ...metadata
  });
};

// NLP处理日志
logger.nlp = (feature, text, result, metadata = {}) => {
  logger.info(`NLP processing`, {
    feature,
    textLength: text?.length || 0,
    success: !!result,
    processingTime: result?.processingTime || 0,
    ...metadata
  });
};

// 训练日志
logger.train = (modelType, examples, result, metadata = {}) => {
  logger.info(`Model training`, {
    modelType,
    exampleCount: examples?.length || 0,
    success: result?.success || false,
    accuracy: result?.accuracy || 0,
    trainingTime: result?.trainingTime || 0,
    ...metadata
  });
};

// 性能监控日志
logger.performance = (operation, duration, metadata = {}) => {
  const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
  logger.log(level, `Performance: ${operation}`, {
    operation,
    duration,
    performance: true,
    ...metadata
  });
};

// 创建子logger的方法
logger.child = (childMeta) => {
  return winston.createLogger({
    level: logger.level,
    format: logFormat,
    defaultMeta: { 
      ...logger.defaultMeta, 
      ...childMeta 
    },
    transports: logger.transports
  });
};

// 确保日志目录存在
const fs = require('fs');
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

module.exports = logger; 