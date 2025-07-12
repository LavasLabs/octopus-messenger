const logger = require('../utils/logger');

// 错误处理中间件
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // 记录错误日志
  logger.error('Error Handler', {
    error: error.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query
  });

  // 默认错误
  let statusCode = 500;
  let message = '服务器内部错误';

  // Mongoose 错误处理
  if (err.name === 'CastError') {
    statusCode = 400;
    message = '资源未找到';
  }

  // Mongoose 重复字段错误
  if (err.code === 11000) {
    statusCode = 400;
    message = '资源已存在';
  }

  // Mongoose 验证错误
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const errors = Object.values(err.errors).map(val => val.message);
    message = errors.join(', ');
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = '无效的认证令牌';
  }

  // JWT 过期错误
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = '认证令牌已过期';
  }

  // 数据库连接错误
  if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = '数据库连接失败';
  }

  // Redis 连接错误
  if (err.code === 'ENOTFOUND' && err.hostname) {
    statusCode = 503;
    message = '缓存服务连接失败';
  }

  // 权限错误
  if (err.name === 'UnauthorizedError') {
    statusCode = 403;
    message = '权限不足';
  }

  // 业务逻辑错误
  if (err.name === 'BusinessError') {
    statusCode = 400;
    message = err.message;
  }

  // 外部API错误
  if (err.name === 'ExternalAPIError') {
    statusCode = 502;
    message = '外部服务暂时不可用';
  }

  // CRM集成错误
  if (err.name === 'CRMIntegrationError') {
    statusCode = 502;
    message = `CRM集成错误: ${err.message}`;
  }

  // 任务处理错误
  if (err.name === 'TaskProcessingError') {
    statusCode = 422;
    message = `任务处理失败: ${err.message}`;
  }

  // 开发环境返回详细错误信息
  const response = {
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.details = err;
  }

  res.status(statusCode).json(response);
};

// 404 处理中间件
const notFoundHandler = (req, res, next) => {
  const message = `路由 ${req.originalUrl} 未找到`;
  
  logger.warn('Route Not Found', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  });
};

// 异步错误处理包装器
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 业务错误类
class BusinessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BusinessError';
  }
}

// 外部API错误类
class ExternalAPIError extends Error {
  constructor(message, service) {
    super(message);
    this.name = 'ExternalAPIError';
    this.service = service;
  }
}

// CRM集成错误类
class CRMIntegrationError extends Error {
  constructor(message, integrationId, crmType) {
    super(message);
    this.name = 'CRMIntegrationError';
    this.integrationId = integrationId;
    this.crmType = crmType;
  }
}

// 任务处理错误类
class TaskProcessingError extends Error {
  constructor(message, taskId, step) {
    super(message);
    this.name = 'TaskProcessingError';
    this.taskId = taskId;
    this.step = step;
  }
}

// 权限错误类
class UnauthorizedError extends Error {
  constructor(message = '权限不足') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  BusinessError,
  ExternalAPIError,
  CRMIntegrationError,
  TaskProcessingError,
  UnauthorizedError
}; 