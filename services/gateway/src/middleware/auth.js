const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const redis = require('redis');

const config = require('../../../../config/config');
const { AppError, createAuthorizationError } = require('./errorHandler');
const { logger } = require('../utils/logger');

// 创建数据库连接池
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl
});

// 创建Redis客户端
const redisClient = redis.createClient({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password
});

// JWT验证中间件
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(new AppError('Access token required', 401));
    }

    // 检查token是否在黑名单中
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return next(new AppError('Token has been revoked', 401));
    }

    // 验证JWT
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // 从数据库获取用户信息
    const userQuery = `
      SELECT u.*, t.name as tenant_name, t.slug as tenant_slug,
             t.subscription_status, t.subscription_plan
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = $1 AND u.is_active = true AND t.deleted_at IS NULL
    `;
    
    const result = await pool.query(userQuery, [decoded.userId]);
    
    if (result.rows.length === 0) {
      return next(new AppError('User not found or inactive', 401));
    }

    const user = result.rows[0];
    
    // 检查租户状态
    if (user.subscription_status !== 'active') {
      return next(new AppError('Account suspended', 403));
    }

    // 将用户信息添加到请求对象
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      permissions: user.permissions,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      tenantSlug: user.tenant_slug,
      subscriptionStatus: user.subscription_status,
      subscriptionPlan: user.subscription_plan
    };

    // 更新最后登录时间
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    logger.info('User authenticated successfully', {
      userId: user.id,
      tenantId: user.tenant_id,
      method: req.method,
      url: req.url
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401));
    }
    
    logger.error('Authentication error:', error);
    return next(new AppError('Authentication failed', 401));
  }
};

// 角色权限检查中间件
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return next(createAuthorizationError(
        `Access denied. Required role: ${allowedRoles.join(' or ')}`
      ));
    }

    next();
  };
};

// 权限检查中间件
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const userPermissions = req.user.permissions || {};
    
    if (!userPermissions[permission]) {
      return next(createAuthorizationError(
        `Access denied. Required permission: ${permission}`
      ));
    }

    next();
  };
};

// 租户隔离中间件
const enforceTenantIsolation = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  // 将租户ID添加到查询参数中
  req.tenantId = req.user.tenantId;

  next();
};

// 管理员权限检查
const requireAdmin = requireRole(['admin']);

// 管理员或管理者权限检查
const requireManager = requireRole(['admin', 'manager']);

// 可选的认证中间件（用于可选认证的端点）
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(); // 没有token，继续处理
    }

    // 如果有token，进行验证
    const decoded = jwt.verify(token, config.jwt.secret);
    
    const userQuery = `
      SELECT u.*, t.name as tenant_name, t.slug as tenant_slug
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = $1 AND u.is_active = true AND t.deleted_at IS NULL
    `;
    
    const result = await pool.query(userQuery, [decoded.userId]);
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        permissions: user.permissions,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        tenantSlug: user.tenant_slug
      };
    }

    next();
  } catch (error) {
    // 认证失败，但不阻止请求
    next();
  }
};

// API密钥验证中间件（用于webhook和外部API）
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return next(new AppError('API key required', 401));
    }

    // 从数据库验证API密钥
    const keyQuery = `
      SELECT bc.*, t.name as tenant_name
      FROM bot_configs bc
      JOIN tenants t ON bc.tenant_id = t.id
      WHERE bc.webhook_secret = $1 AND bc.is_active = true AND t.deleted_at IS NULL
    `;
    
    const result = await pool.query(keyQuery, [apiKey]);
    
    if (result.rows.length === 0) {
      return next(new AppError('Invalid API key', 401));
    }

    const botConfig = result.rows[0];
    req.botConfig = botConfig;
    req.tenantId = botConfig.tenant_id;

    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    return next(new AppError('Authentication failed', 401));
  }
};

// 限制租户资源访问
const limitTenantResources = (resourceLimit) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    try {
      // 检查租户的资源使用情况
      const tenant = await pool.query(
        'SELECT subscription_plan, max_bots, max_messages_per_month FROM tenants WHERE id = $1',
        [req.user.tenantId]
      );

      if (tenant.rows.length === 0) {
        return next(new AppError('Tenant not found', 404));
      }

      const tenantData = tenant.rows[0];
      
      // 根据订阅计划检查资源限制
      if (resourceLimit === 'bots') {
        const botCount = await pool.query(
          'SELECT COUNT(*) as count FROM bot_configs WHERE tenant_id = $1 AND deleted_at IS NULL',
          [req.user.tenantId]
        );

        if (parseInt(botCount.rows[0].count) >= tenantData.max_bots) {
          return next(new AppError('Bot limit exceeded for your subscription plan', 403));
        }
      }

      if (resourceLimit === 'messages') {
        const messageCount = await pool.query(
          `SELECT COUNT(*) as count FROM messages 
           WHERE tenant_id = $1 AND received_at >= date_trunc('month', CURRENT_DATE)`,
          [req.user.tenantId]
        );

        if (parseInt(messageCount.rows[0].count) >= tenantData.max_messages_per_month) {
          return next(new AppError('Monthly message limit exceeded', 403));
        }
      }

      next();
    } catch (error) {
      logger.error('Resource limit check error:', error);
      return next(new AppError('Resource limit check failed', 500));
    }
  };
};

module.exports = {
  authenticateToken,
  requireRole,
  requirePermission,
  enforceTenantIsolation,
  requireAdmin,
  requireManager,
  optionalAuth,
  authenticateApiKey,
  limitTenantResources
}; 