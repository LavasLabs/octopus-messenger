const { logger, logError } = require('../utils/logger');

// 自定义错误类
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// 处理Joi验证错误
const handleJoiError = (error) => {
  const errors = error.details.map(detail => ({
    field: detail.context.key,
    message: detail.message
  }));
  
  return new AppError('Validation error', 400, true, errors);
};

// 处理数据库错误
const handleDatabaseError = (error) => {
  // PostgreSQL错误码处理
  if (error.code === '23505') {
    return new AppError('Duplicate field value', 409);
  }
  
  if (error.code === '23503') {
    return new AppError('Foreign key constraint violation', 400);
  }
  
  if (error.code === '23514') {
    return new AppError('Check constraint violation', 400);
  }
  
  return new AppError('Database operation failed', 500);
};

// 处理JWT错误
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new AppError('Invalid token', 401);
  }
  
  if (error.name === 'TokenExpiredError') {
    return new AppError('Token expired', 401);
  }
  
  return new AppError('Authentication failed', 401);
};

// 发送错误响应
const sendErrorResponse = (error, req, res) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // 操作性错误：发送详细信息给客户端
  if (error.isOperational) {
    const response = {
      status: error.status,
      message: error.message,
      ...(error.errors && { errors: error.errors }),
      ...(isDevelopment && { stack: error.stack })
    };
    
    return res.status(error.statusCode).json(response);
  }
  
  // 编程错误：不泄露详细信息
  const response = {
    status: 'error',
    message: 'Something went wrong!',
    ...(isDevelopment && { 
      message: error.message,
      stack: error.stack 
    })
  };
  
  return res.status(500).json(response);
};

// 全局错误处理中间件
const errorHandler = (error, req, res, next) => {
  let err = { ...error };
  err.message = error.message;

  // 记录错误日志
  logError(error, {
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
    userId: req.user ? req.user.id : null,
    tenantId: req.user ? req.user.tenantId : null,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // 处理特定类型的错误
  if (error.name === 'ValidationError') {
    err = handleJoiError(error);
  } else if (error.code && error.code.startsWith('23')) {
    err = handleDatabaseError(error);
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    err = handleJWTError(error);
  } else if (error.name === 'CastError') {
    err = new AppError('Invalid ID format', 400);
  } else if (error.code === 'ECONNREFUSED') {
    err = new AppError('Service unavailable', 503);
  } else if (error.code === 'ENOTFOUND') {
    err = new AppError('External service not found', 502);
  } else if (error.code === 'ETIMEDOUT') {
    err = new AppError('Request timeout', 408);
  } else if (!(error instanceof AppError)) {
    err = new AppError('Internal server error', 500);
  }

  sendErrorResponse(err, req, res);
};

// 404错误处理
const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

// 异步错误捕获包装器
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 验证错误创建器
const createValidationError = (field, message) => {
  const error = new AppError('Validation error', 400);
  error.errors = [{ field, message }];
  return error;
};

// 权限错误创建器
const createAuthorizationError = (message = 'Insufficient permissions') => {
  return new AppError(message, 403);
};

// 资源未找到错误创建器
const createNotFoundError = (resource = 'Resource') => {
  return new AppError(`${resource} not found`, 404);
};

// 冲突错误创建器
const createConflictError = (message = 'Resource already exists') => {
  return new AppError(message, 409);
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  createValidationError,
  createAuthorizationError,
  createNotFoundError,
  createConflictError
}; 