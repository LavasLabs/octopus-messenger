const logger = require('../utils/logger');

// 自定义错误类
class AppError extends Error {
  constructor(message, statusCode, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// AI相关错误类
class AIServiceError extends AppError {
  constructor(message, provider = 'unknown', statusCode = 500) {
    super(`AI Service Error (${provider}): ${message}`, statusCode);
    this.provider = provider;
    this.errorType = 'ai_service_error';
  }
}

class ClassificationError extends AppError {
  constructor(message, classifier = 'unknown', statusCode = 500) {
    super(`Classification Error (${classifier}): ${message}`, statusCode);
    this.classifier = classifier;
    this.errorType = 'classification_error';
  }
}

class NLPProcessingError extends AppError {
  constructor(message, feature = 'unknown', statusCode = 500) {
    super(`NLP Processing Error (${feature}): ${message}`, statusCode);
    this.feature = feature;
    this.errorType = 'nlp_processing_error';
  }
}

class ModelTrainingError extends AppError {
  constructor(message, modelType = 'unknown', statusCode = 500) {
    super(`Model Training Error (${modelType}): ${message}`, statusCode);
    this.modelType = modelType;
    this.errorType = 'model_training_error';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', statusCode = 429) {
    super(message, statusCode);
    this.errorType = 'rate_limit_error';
  }
}

class ValidationError extends AppError {
  constructor(message, field = null, statusCode = 400) {
    super(`Validation Error: ${message}`, statusCode);
    this.field = field;
    this.errorType = 'validation_error';
  }
}

// 错误处理中间件
const errorHandler = (error, req, res, next) => {
  let err = { ...error };
  err.message = error.message;

  // 记录错误日志
  logger.error('Error caught by middleware', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    errorType: err.errorType || 'unknown',
    statusCode: err.statusCode || 500
  });

  // 默认错误响应
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // 处理特定类型的错误
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    
    // 处理mongoose验证错误
    if (error.errors) {
      const errors = Object.values(error.errors).map(val => val.message);
      message = errors.join(', ');
    }
  }

  // 处理重复字段错误
  if (error.code === 11000) {
    statusCode = 400;
    const field = Object.keys(error.keyValue)[0];
    message = `Duplicate field value for ${field}`;
  }

  // 处理JWT错误
  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // 处理AI服务错误
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = 'AI service unavailable';
  }

  // 处理OpenAI API错误
  if (error.response && error.response.status) {
    statusCode = error.response.status;
    if (error.response.data && error.response.data.error) {
      message = error.response.data.error.message || message;
    }
  }

  // 构建错误响应
  const errorResponse = {
    success: false,
    error: {
      message,
      type: err.errorType || 'general_error',
      timestamp: new Date().toISOString(),
      requestId: req.id || req.headers['x-request-id'] || 'unknown'
    }
  };

  // 在开发环境下添加堆栈信息
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err;
  }

  // 添加特定错误类型的额外信息
  if (err.provider) {
    errorResponse.error.provider = err.provider;
  }
  
  if (err.classifier) {
    errorResponse.error.classifier = err.classifier;
  }
  
  if (err.feature) {
    errorResponse.error.feature = err.feature;
  }
  
  if (err.modelType) {
    errorResponse.error.modelType = err.modelType;
  }
  
  if (err.field) {
    errorResponse.error.field = err.field;
  }

  res.status(statusCode).json(errorResponse);
};

// 404处理中间件
const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

// 异步错误包装器
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 验证中间件生成器
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return next(new ValidationError(errorMessage));
    }
    next();
  };
};

// AI服务健康检查
const healthCheck = asyncHandler(async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    // 检查基本功能
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    };

    const responseTime = Date.now() - startTime;
    health.responseTime = responseTime;

    // 记录健康检查
    logger.debug('Health check completed', {
      responseTime,
      memoryUsage: health.memory.heapUsed,
      uptime: health.uptime
    });

    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    next(new AppError('Health check failed', 503));
  }
});

module.exports = {
  AppError,
  AIServiceError,
  ClassificationError,
  NLPProcessingError,
  ModelTrainingError,
  RateLimitError,
  ValidationError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validateRequest,
  healthCheck
}; 