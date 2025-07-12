const jwt = require('jsonwebtoken');
const { UnauthorizedError, ForbiddenError } = require('./errorHandler');
const logger = require('../utils/logger');
const config = require('../../../../config/config');

// JWT认证中间件
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // 检查是否有服务间通信Token
      const serviceToken = req.headers['x-service-token'];
      if (serviceToken && serviceToken === process.env.SERVICE_TOKEN) {
        req.user = { 
          id: 'system', 
          role: 'system', 
          tenantId: req.headers['x-tenant-id'] || 'default' 
        };
        return next();
      }
      
      throw new UnauthorizedError('No token provided');
    }
    
    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
    
    // 验证JWT token
    const decoded = jwt.verify(token, config.auth.jwt.secret);
    
    // 检查token是否过期
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      throw new UnauthorizedError('Token expired');
    }
    
    // 设置用户信息到请求对象
    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role,
      tenantId: decoded.tenantId || 'default',
      permissions: decoded.permissions || []
    };
    
    // 记录认证日志
    logger.debug('User authenticated', {
      userId: req.user.id,
      tenantId: req.user.tenantId,
      role: req.user.role
    });
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(new UnauthorizedError('Invalid token'));
    } else if (error.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
};

// 权限检查中间件
const authorize = (requiredPermissions = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    
    // 系统用户跳过权限检查
    if (req.user.role === 'system') {
      return next();
    }
    
    // 管理员用户拥有所有权限
    if (req.user.role === 'admin') {
      return next();
    }
    
    // 检查是否有必要的权限
    if (requiredPermissions.length > 0) {
      const userPermissions = req.user.permissions || [];
      const hasPermission = requiredPermissions.some(permission => 
        userPermissions.includes(permission)
      );
      
      if (!hasPermission) {
        logger.warn('Access denied', {
          userId: req.user.id,
          requiredPermissions,
          userPermissions,
          url: req.originalUrl
        });
        return next(new ForbiddenError('Insufficient permissions'));
      }
    }
    
    next();
  };
};

// 角色检查中间件
const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    
    // 系统用户跳过角色检查
    if (req.user.role === 'system') {
      return next();
    }
    
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      logger.warn('Role access denied', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        url: req.originalUrl
      });
      return next(new ForbiddenError('Insufficient role'));
    }
    
    next();
  };
};

// 租户检查中间件
const requireTenant = (req, res, next) => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }
  
  if (!req.user.tenantId) {
    return next(new ForbiddenError('Tenant access required'));
  }
  
  // 设置租户ID到请求头，供后续服务使用
  req.headers['x-tenant-id'] = req.user.tenantId;
  
  next();
};

// 可选认证中间件（允许匿名访问）
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  
  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.auth.jwt.secret);
    
    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role,
      tenantId: decoded.tenantId || 'default',
      permissions: decoded.permissions || []
    };
  } catch (error) {
    // 可选认证失败不抛出错误
    logger.debug('Optional auth failed', { error: error.message });
  }
  
  next();
};

// API Key认证中间件
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return next(new UnauthorizedError('API key required'));
    }
    
    // 提取API Key前缀
    const keyPrefix = apiKey.substring(0, apiKey.indexOf('_') + 1);
    
    // 这里应该从数据库验证API Key
    // 暂时使用简单的验证逻辑
    if (apiKey === process.env.SERVICE_API_KEY) {
      req.user = { 
        id: 'api-key', 
        role: 'api', 
        tenantId: req.headers['x-tenant-id'] || 'default' 
      };
      return next();
    }
    
    throw new UnauthorizedError('Invalid API key');
  } catch (error) {
    next(error);
  }
};

// 多重认证中间件（JWT或API Key）
const authenticateMultiple = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  } else if (apiKey) {
    return authenticateApiKey(req, res, next);
  } else {
    return next(new UnauthorizedError('Authentication required'));
  }
};

module.exports = {
  authenticate,
  authorize,
  requireRole,
  requireTenant,
  optionalAuth,
  authenticateApiKey,
  authenticateMultiple
};

// 默认导出认证中间件
module.exports.default = authenticate; 