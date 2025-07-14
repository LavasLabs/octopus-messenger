const express = require('express');
const logger = require('./logger');

class RouteManager {
  constructor(serviceDiscovery) {
    this.serviceDiscovery = serviceDiscovery;
    this.router = express.Router();
    this.routes = new Map();
    
    // 路由规则配置
    this.routeConfig = {
      // AI Service 路由
      '/api/ai/*': {
        service: 'ai-service',
        stripPrefix: '/api/ai',
        timeout: 30000,
        retries: 2
      },
      '/api/classify': {
        service: 'ai-service',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      '/api/classify/*': {
        service: 'ai-service',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      '/api/smart-classify/*': {
        service: 'ai-service',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      '/api/models/*': {
        service: 'ai-service',
        stripPrefix: '',
        timeout: 45000,
        retries: 1
      },
      '/api/analytics/*': {
        service: 'ai-service',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      '/api/customer-service/*': {
        service: 'ai-service',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      
      // Message Processor 路由
      '/api/messages/*': {
        service: 'message-processor',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      '/api/process/*': {
        service: 'message-processor',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      
      // Task Service 路由
      '/api/tasks/*': {
        service: 'task-service',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      '/api/crm/*': {
        service: 'task-service',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      
      // Bot Manager 路由
      '/api/bots/*': {
        service: 'bot-manager',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      '/api/webhooks/*': {
        service: 'bot-manager',
        stripPrefix: '',
        timeout: 15000,
        retries: 1
      },
      
      // Admin Panel 路由
      '/api/admin/*': {
        service: 'admin-panel',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      },
      '/api/dashboard/*': {
        service: 'admin-panel',
        stripPrefix: '',
        timeout: 30000,
        retries: 2
      }
    };
    
    this.setupRoutes();
  }

  setupRoutes() {
    // 为每个路由配置创建代理处理器
    for (const [routePattern, config] of Object.entries(this.routeConfig)) {
      this.setupRoute(routePattern, config);
    }
    
    // 健康检查路由
    this.router.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'gateway',
        version: '1.0.0'
      });
    });
    
    // 服务发现状态路由
    this.router.get('/api/services/status', (req, res) => {
      const healthSummary = this.serviceDiscovery.getHealthSummary();
      const serviceStats = this.serviceDiscovery.getServiceStats();
      
      res.json({
        success: true,
        data: {
          health: healthSummary,
          stats: serviceStats,
          timestamp: new Date().toISOString()
        }
      });
    });
    
    // 路由信息
    this.router.get('/api/routes', (req, res) => {
      const routes = Object.keys(this.routeConfig).map(pattern => ({
        pattern,
        service: this.routeConfig[pattern].service,
        timeout: this.routeConfig[pattern].timeout,
        retries: this.routeConfig[pattern].retries
      }));
      
      res.json({
        success: true,
        data: {
          routes,
          total: routes.length
        }
      });
    });
  }

  setupRoute(routePattern, config) {
    // 转换路由模式为Express路由
    const expressPattern = routePattern.replace('/*', '/*');
    
    this.router.all(expressPattern, async (req, res, next) => {
      try {
        await this.proxyRequest(req, res, config);
      } catch (error) {
        next(error);
      }
    });
    
    logger.debug('Route configured', {
      pattern: routePattern,
      service: config.service,
      expressPattern
    });
  }

  async proxyRequest(req, res, config) {
    const startTime = Date.now();
    
    try {
      // 构建目标路径
      let targetPath = req.originalUrl;
      if (config.stripPrefix) {
        targetPath = targetPath.replace(config.stripPrefix, '');
      }
      
      // 准备请求选项
      const requestOptions = {
        method: req.method,
        headers: this.prepareHeaders(req),
        data: req.body,
        params: req.query,
        timeout: config.timeout,
        retries: config.retries,
        strategy: config.loadBalanceStrategy || 'round-robin'
      };

      // 代理请求到目标服务
      const response = await this.serviceDiscovery.proxyRequest(
        config.service,
        targetPath,
        requestOptions
      );

      const processingTime = Date.now() - startTime;

      // 设置响应头
      this.setResponseHeaders(res, response.headers);
      
      // 记录请求日志
      logger.info('Request proxied', {
        method: req.method,
        originalUrl: req.originalUrl,
        targetPath,
        service: config.service,
        status: response.status,
        processingTime,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        tenantId: req.user?.tenantId
      });

      // 返回响应
      res.status(response.status).json(response.data);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Proxy request failed', {
        method: req.method,
        originalUrl: req.originalUrl,
        service: config.service,
        error: error.message,
        processingTime,
        tenantId: req.user?.tenantId
      });

      // 返回错误响应
      if (error.message.includes('unavailable')) {
        res.status(503).json({
          success: false,
          error: 'Service temporarily unavailable',
          message: 'The requested service is currently unavailable. Please try again later.',
          service: config.service,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: 'An error occurred while processing your request.',
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  prepareHeaders(req) {
    const headers = { ...req.headers };
    
    // 移除 host 头，避免冲突
    delete headers.host;
    delete headers['content-length'];
    
    // 添加代理相关头
    headers['X-Forwarded-For'] = req.ip;
    headers['X-Forwarded-Proto'] = req.protocol;
    headers['X-Forwarded-Host'] = req.get('host');
    headers['X-Gateway-Request-Id'] = req.id || `gw_${Date.now()}_${Math.random()}`;
    
    // 传递认证信息
    if (req.user) {
      headers['X-User-Id'] = req.user.id;
      headers['X-User-Role'] = req.user.role;
      headers['X-Tenant-Id'] = req.user.tenantId;
    }
    
    // 传递服务间通信token
    if (process.env.SERVICE_TOKEN) {
      headers['X-Service-Token'] = process.env.SERVICE_TOKEN;
    }
    
    return headers;
  }

  setResponseHeaders(res, responseHeaders) {
    // 复制安全的响应头
    const safeCopyHeaders = [
      'content-type',
      'cache-control',
      'expires',
      'etag',
      'last-modified',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset'
    ];
    
    safeCopyHeaders.forEach(header => {
      if (responseHeaders[header]) {
        res.set(header, responseHeaders[header]);
      }
    });
    
    // 添加Gateway相关头
    res.set('X-Gateway', 'octopus-gateway');
    res.set('X-Response-Time', Date.now());
  }

  // 添加新路由
  addRoute(pattern, config) {
    this.routeConfig[pattern] = config;
    this.setupRoute(pattern, config);
    
    logger.info('Route added', { pattern, service: config.service });
  }

  // 移除路由
  removeRoute(pattern) {
    delete this.routeConfig[pattern];
    logger.info('Route removed', { pattern });
  }

  // 更新路由配置
  updateRoute(pattern, config) {
    this.routeConfig[pattern] = { ...this.routeConfig[pattern], ...config };
    logger.info('Route updated', { pattern, config });
  }

  // 获取路由统计
  getRouteStats() {
    return {
      totalRoutes: Object.keys(this.routeConfig).length,
      services: [...new Set(Object.values(this.routeConfig).map(r => r.service))],
      routeConfig: this.routeConfig
    };
  }

  // 路由健康检查
  async checkRoutesHealth() {
    const results = {};
    
    for (const [pattern, config] of Object.entries(this.routeConfig)) {
      try {
        const instance = this.serviceDiscovery.getServiceInstance(config.service);
        results[pattern] = {
          service: config.service,
          healthy: instance.healthy,
          lastCheck: new Date().toISOString()
        };
      } catch (error) {
        results[pattern] = {
          service: config.service,
          healthy: false,
          error: error.message,
          lastCheck: new Date().toISOString()
        };
      }
    }
    
    return results;
  }

  getRouter() {
    return this.router;
  }
}

module.exports = RouteManager; 