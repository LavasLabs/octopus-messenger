const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { UnauthorizedError } = require('./errorHandler');

// JWT令牌验证中间件
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new UnauthorizedError('访问令牌缺失');
    }

    // 验证JWT令牌
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'octopus-secret');
    
    // 检查令牌是否包含必要信息
    if (!decoded.userId || !decoded.tenantId) {
      throw new UnauthorizedError('无效的令牌格式');
    }

    // 将用户信息添加到请求对象
    req.user = {
      id: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role || 'user',
      email: decoded.email,
      username: decoded.username
    };

    logger.debug('User authenticated', {
      userId: req.user.id,
      tenantId: req.user.tenantId,
      role: req.user.role
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      error: error.message,
      token: req.headers.authorization ? 'present' : 'missing',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (error.name === 'JsonWebTokenError') {
      return next(new UnauthorizedError('无效的访问令牌'));
    }
    
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('访问令牌已过期'));
    }

    next(error);
  }
};

// API密钥验证中间件（用于服务间通信）
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      throw new UnauthorizedError('API密钥缺失');
    }

    // 验证API密钥
    const validApiKey = process.env.SERVICE_API_KEY || 'octopus-service-key';
    if (apiKey !== validApiKey) {
      throw new UnauthorizedError('无效的API密钥');
    }

    // 为服务间通信设置默认租户信息
    req.user = {
      id: 'system',
      tenantId: req.headers['x-tenant-id'] || 'default',
      role: 'system',
      isService: true
    };

    logger.debug('Service authenticated', {
      tenantId: req.user.tenantId,
      service: req.headers['x-service-name'] || 'unknown'
    });

    next();
  } catch (error) {
    logger.warn('Service authentication failed', {
      error: error.message,
      apiKey: req.headers['x-api-key'] ? 'present' : 'missing',
      ip: req.ip
    });

    next(error);
  }
};

// 角色权限验证中间件
const requireRole = (requiredRoles = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('用户未认证');
      }

      // 系统服务跳过角色检查
      if (req.user.isService) {
        return next();
      }

      // 检查用户角色
      if (requiredRoles.length > 0 && !requiredRoles.includes(req.user.role)) {
        throw new UnauthorizedError(`需要以下角色之一: ${requiredRoles.join(', ')}`);
      }

      next();
    } catch (error) {
      logger.warn('Role check failed', {
        userId: req.user?.id,
        userRole: req.user?.role,
        requiredRoles,
        ip: req.ip
      });

      next(error);
    }
  };
};

// 租户隔离中间件
const enforceTenantIsolation = (req, res, next) => {
  try {
    if (!req.user || !req.user.tenantId) {
      throw new UnauthorizedError('租户信息缺失');
    }

    // 为查询添加租户过滤
    req.tenantFilter = { tenant_id: req.user.tenantId };
    
    // 为创建操作添加租户ID
    if (req.body && typeof req.body === 'object') {
      req.body.tenantId = req.user.tenantId;
    }

    next();
  } catch (error) {
    next(error);
  }
};

// 资源所有权验证中间件
const verifyResourceOwnership = (resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      // 这里应该根据实际的数据模型来验证资源所有权
      // 现在只是基础实现
      const resourceId = req.params[resourceIdParam];
      
      if (!resourceId) {
        throw new UnauthorizedError('资源ID缺失');
      }

      // 系统服务跳过所有权检查
      if (req.user.isService) {
        return next();
      }

      // 管理员跳过所有权检查
      if (req.user.role === 'admin') {
        return next();
      }

      // TODO: 在这里添加实际的数据库查询来验证资源所有权
      // 例如: 检查任务是否属于当前租户
      
      next();
    } catch (error) {
      logger.warn('Resource ownership check failed', {
        userId: req.user?.id,
        tenantId: req.user?.tenantId,
        resourceId: req.params[resourceIdParam],
        ip: req.ip
      });

      next(error);
    }
  };
};

// 限流中间件包装器
const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100) => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: '请求过于频繁，请稍后再试',
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // 基于用户ID和租户ID生成限流键
      if (req.user) {
        return `${req.user.tenantId}:${req.user.id}`;
      }
      return req.ip;
    },
    skip: (req) => {
      // 系统服务跳过限流
      return req.user?.isService === true;
    },
    onLimitReached: (req, res, options) => {
      logger.warn('Rate limit exceeded', {
        userId: req.user?.id,
        tenantId: req.user?.tenantId,
        ip: req.ip,
        url: req.url,
        method: req.method
      });
    }
  });
};

module.exports = {
  authenticateToken,
  authenticateApiKey,
  requireRole,
  enforceTenantIsolation,
  verifyResourceOwnership,
  createRateLimiter
}; 