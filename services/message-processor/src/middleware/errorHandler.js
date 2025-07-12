const logger = require('../utils/logger');

// 自定义错误类
class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// 业务错误类
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

class DuplicateError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'DUPLICATE_ERROR');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ProcessingError extends AppError {
  constructor(message = 'Processing failed') {
    super(message, 422, 'PROCESSING_ERROR');
  }
}

class ExternalServiceError extends AppError {
  constructor(message = 'External service error') {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR');
  }
}

// 404处理中间件
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

// 错误处理中间件
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // 记录错误日志
  logger.logError(err, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    tenantId: req.user?.tenantId,
    userId: req.user?.id
  });

  // PostgreSQL错误处理
  if (err.code === '23505') {
    const message = 'Duplicate field value entered';
    error = new DuplicateError(message);
  }

  if (err.code === '23503') {
    const message = 'Foreign key constraint violation';
    error = new ValidationError(message);
  }

  if (err.code === '23502') {
    const message = 'Required field is missing';
    error = new ValidationError(message);
  }

  // Validation错误
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ValidationError(message);
  }

  // JWT错误
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new UnauthorizedError(message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new UnauthorizedError(message);
  }

  // 语法错误
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    const message = 'Invalid JSON';
    error = new ValidationError(message);
  }

  // 类型错误
  if (err.name === 'TypeError') {
    const message = 'Invalid data type';
    error = new ValidationError(message);
  }

  // 默认错误
  if (!error.isOperational) {
    error = new AppError('Something went wrong', 500, 'INTERNAL_SERVER_ERROR');
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
      timestamp: new Date().toISOString(),
      requestId: req.id || req.headers['x-request-id']
    }
  });
};

// 异步错误处理包装器
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  DuplicateError,
  UnauthorizedError,
  ForbiddenError,
  ProcessingError,
  ExternalServiceError,
  notFoundHandler,
  errorHandler,
  asyncHandler
}; 