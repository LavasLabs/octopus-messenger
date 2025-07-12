const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { AppError } = require('./errorHandler');

// JWT认证中间件
const authenticateJWT = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new AppError('Access token is required', 401);
    }

    const token = authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      throw new AppError('Access token is required', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.user = {
      id: decoded.id,
      tenantId: decoded.tenantId,
      role: decoded.role,
      permissions: decoded.permissions || []
    };

    logger.debug('JWT authentication successful', {
      userId: req.user.id,
      tenantId: req.user.tenantId,
      role: req.user.role
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired', 401));
    }
    next(error);
  }
};

// API Key认证中间件
const authenticateApiKey = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey) {
      throw new AppError('API key is required', 401);
    }

    // 验证API Key（这里应该从数据库查询）
    const validApiKey = process.env.SERVICE_API_KEY || 'octopus-ai-service-key';
    
    if (apiKey !== validApiKey) {
      throw new AppError('Invalid API key', 401);
    }

    // 设置默认用户信息（用于API Key访问）
    req.user = {
      id: 'api-service',
      tenantId: req.headers['x-tenant-id'] || 'default',
      role: 'service',
      permissions: ['ai:classify', 'ai:analyze', 'ai:train']
    };

    logger.debug('API Key authentication successful', {
      tenantId: req.user.tenantId,
      source: 'api-key'
    });

    next();
  } catch (error) {
    next(error);
  }
};

// 多重认证中间件（JWT或API Key）
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  } else if (apiKey) {
    return authenticateApiKey(req, res, next);
  } else {
    return next(new AppError('Authentication required. Provide JWT token or API key', 401));
  }
};

// 权限检查中间件
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!req.user.permissions.includes(permission)) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        requiredPermission: permission,
        userPermissions: req.user.permissions
      });
      
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

// 租户隔离中间件
const requireTenant = (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return next(new AppError('Tenant information required', 400));
  }

  // 添加租户ID到查询中
  req.tenantId = req.user.tenantId;
  
  next();
};

// 角色检查中间件
const requireRole = (roles) => {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!roleArray.includes(req.user.role)) {
      logger.warn('Role access denied', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roleArray
      });
      
      return next(new AppError('Access denied', 403));
    }

    next();
  };
};

// 速率限制中间件（基于用户）
const rateLimitByUser = (maxRequests = 100, windowMs = 900000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // 清理过期记录
    if (requests.has(userId)) {
      const userRequests = requests.get(userId).filter(timestamp => timestamp > windowStart);
      requests.set(userId, userRequests);
    } else {
      requests.set(userId, []);
    }
    
    const userRequests = requests.get(userId);
    
    if (userRequests.length >= maxRequests) {
      logger.warn('Rate limit exceeded', {
        userId,
        requestCount: userRequests.length,
        maxRequests,
        windowMs
      });
      
      return next(new AppError('Rate limit exceeded', 429));
    }
    
    userRequests.push(now);
    next();
  };
};

// AI使用配额检查
const checkAIQuota = async (req, res, next) => {
  try {
    if (!req.user || !req.user.tenantId) {
      return next(new AppError('Tenant information required', 400));
    }

    // 这里应该从数据库检查用户的AI使用配额
    // 简化实现，实际应该连接数据库
    const tenantQuota = {
      daily: 1000,
      monthly: 10000,
      used: {
        daily: 0,
        monthly: 0
      }
    };

    if (tenantQuota.used.daily >= tenantQuota.daily) {
      logger.warn('Daily AI quota exceeded', {
        tenantId: req.user.tenantId,
        dailyUsed: tenantQuota.used.daily,
        dailyLimit: tenantQuota.daily
      });
      
      return next(new AppError('Daily AI quota exceeded', 429));
    }

    if (tenantQuota.used.monthly >= tenantQuota.monthly) {
      logger.warn('Monthly AI quota exceeded', {
        tenantId: req.user.tenantId,
        monthlyUsed: tenantQuota.used.monthly,
        monthlyLimit: tenantQuota.monthly
      });
      
      return next(new AppError('Monthly AI quota exceeded', 429));
    }

    req.quota = tenantQuota;
    next();
  } catch (error) {
    next(error);
  }
};

// 请求ID生成中间件
const generateRequestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || 
           `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  res.set('X-Request-ID', req.id);
  next();
};

// 审计日志中间件
const auditLog = (action) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // 记录请求开始
    logger.info('Request started', {
      requestId: req.id,
      action,
      userId: req.user?.id,
      tenantId: req.user?.tenantId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      method: req.method,
      url: req.url
    });

    // 拦截响应以记录完成
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      logger.info('Request completed', {
        requestId: req.id,
        action,
        userId: req.user?.id,
        tenantId: req.user?.tenantId,
        statusCode: res.statusCode,
        duration,
        success: res.statusCode < 400
      });

      originalSend.call(this, data);
    };

    next();
  };
};

module.exports = {
  authenticate,
  authenticateJWT,
  authenticateApiKey,
  requirePermission,
  requireTenant,
  requireRole,
  rateLimitByUser,
  checkAIQuota,
  generateRequestId,
  auditLog
}; 