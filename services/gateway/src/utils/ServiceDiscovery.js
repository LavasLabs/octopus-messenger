const axios = require('axios');
const logger = require('./logger');

class ServiceDiscovery {
  constructor(config) {
    this.config = config || {};
    this.services = new Map();
    this.healthCheckInterval = this.config.healthCheckInterval || 30000; // 30秒
    this.healthCheckTimeout = this.config.healthCheckTimeout || 5000; // 5秒
    this.maxRetries = this.config.maxRetries || 3;
    this.retryDelay = this.config.retryDelay || 1000;
    
    // 服务注册表
    this.serviceRegistry = {
      'ai-service': {
        instances: [
          { url: process.env.AI_SERVICE_URL || 'http://localhost:3001', weight: 1, healthy: true }
        ],
        healthPath: '/health',
        currentIndex: 0
      },
      'message-processor': {
        instances: [
          { url: process.env.MESSAGE_PROCESSOR_URL || 'http://localhost:3002', weight: 1, healthy: true }
        ],
        healthPath: '/health',
        currentIndex: 0
      },
      'task-service': {
        instances: [
          { url: process.env.TASK_SERVICE_URL || 'http://localhost:3003', weight: 1, healthy: true }
        ],
        healthPath: '/health',
        currentIndex: 0
      },
      'bot-manager': {
        instances: [
          { url: process.env.BOT_MANAGER_URL || 'http://localhost:3004', weight: 1, healthy: true }
        ],
        healthPath: '/health',
        currentIndex: 0
      },
      'admin-panel': {
        instances: [
          { url: process.env.ADMIN_PANEL_URL || 'http://localhost:3005', weight: 1, healthy: true }
        ],
        healthPath: '/health',
        currentIndex: 0
      }
    };
    
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing Service Discovery...');
      
      // 初始健康检查
      await this.checkAllServicesHealth();
      
      // 启动定期健康检查
      this.startHealthChecks();
      
      this.isInitialized = true;
      logger.info('Service Discovery initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Service Discovery', { error: error.message });
      throw error;
    }
  }

  // 获取服务实例（负载均衡）
  getServiceInstance(serviceName, strategy = 'round-robin') {
    const service = this.serviceRegistry[serviceName];
    if (!service) {
      throw new Error(`Service ${serviceName} not found in registry`);
    }

    const healthyInstances = service.instances.filter(instance => instance.healthy);
    if (healthyInstances.length === 0) {
      throw new Error(`No healthy instances available for service ${serviceName}`);
    }

    let selectedInstance;

    switch (strategy) {
      case 'round-robin':
        selectedInstance = this.roundRobinSelection(service, healthyInstances);
        break;
      case 'weighted':
        selectedInstance = this.weightedSelection(healthyInstances);
        break;
      case 'least-connections':
        selectedInstance = this.leastConnectionsSelection(healthyInstances);
        break;
      default:
        selectedInstance = healthyInstances[0];
    }

    logger.debug('Selected service instance', {
      serviceName,
      instanceUrl: selectedInstance.url,
      strategy
    });

    return selectedInstance;
  }

  // 轮询选择
  roundRobinSelection(service, healthyInstances) {
    const instance = healthyInstances[service.currentIndex % healthyInstances.length];
    service.currentIndex = (service.currentIndex + 1) % healthyInstances.length;
    return instance;
  }

  // 权重选择
  weightedSelection(healthyInstances) {
    const totalWeight = healthyInstances.reduce((sum, instance) => sum + instance.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const instance of healthyInstances) {
      random -= instance.weight;
      if (random <= 0) {
        return instance;
      }
    }
    
    return healthyInstances[0];
  }

  // 最少连接选择
  leastConnectionsSelection(healthyInstances) {
    return healthyInstances.reduce((min, instance) => 
      (instance.connections || 0) < (min.connections || 0) ? instance : min
    );
  }

  // 服务代理请求
  async proxyRequest(serviceName, path, options = {}) {
    const maxRetries = options.retries || this.maxRetries;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const instance = this.getServiceInstance(serviceName, options.strategy);
        
        // 增加连接计数
        instance.connections = (instance.connections || 0) + 1;

        const requestConfig = {
          method: options.method || 'GET',
          url: `${instance.url}${path}`,
          headers: options.headers || {},
          data: options.data,
          params: options.params,
          timeout: options.timeout || 30000,
          validateStatus: () => true // 不抛出HTTP错误
        };

        const startTime = Date.now();
        const response = await axios(requestConfig);
        const duration = Date.now() - startTime;

        // 减少连接计数
        instance.connections = Math.max(0, (instance.connections || 1) - 1);

        // 记录成功请求
        logger.debug('Proxy request successful', {
          serviceName,
          path,
          status: response.status,
          duration,
          attempt,
          instanceUrl: instance.url
        });

        // 更新实例健康状态
        if (response.status < 500) {
          instance.healthy = true;
          instance.lastSuccess = new Date();
        }

        return response;

      } catch (error) {
        lastError = error;
        
        logger.warn('Proxy request failed', {
          serviceName,
          path,
          attempt,
          maxRetries,
          error: error.message
        });

        // 标记实例为不健康
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          const instance = this.serviceRegistry[serviceName]?.instances?.find(i => 
            error.config?.url?.startsWith(i.url)
          );
          if (instance) {
            instance.healthy = false;
            instance.lastError = new Date();
          }
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    throw new Error(`Service ${serviceName} unavailable after ${maxRetries} attempts: ${lastError.message}`);
  }

  // 健康检查
  async checkServiceHealth(serviceName) {
    const service = this.serviceRegistry[serviceName];
    if (!service) return;

    const healthCheckPromises = service.instances.map(async (instance) => {
      try {
        const response = await axios.get(`${instance.url}${service.healthPath}`, {
          timeout: this.healthCheckTimeout
        });

        const isHealthy = response.status === 200;
        instance.healthy = isHealthy;
        instance.lastHealthCheck = new Date();
        
        if (isHealthy) {
          instance.lastSuccess = new Date();
        }

        logger.debug('Health check completed', {
          serviceName,
          instanceUrl: instance.url,
          healthy: isHealthy,
          status: response.status
        });

      } catch (error) {
        instance.healthy = false;
        instance.lastError = new Date();
        instance.lastHealthCheck = new Date();

        logger.debug('Health check failed', {
          serviceName,
          instanceUrl: instance.url,
          error: error.message
        });
      }
    });

    await Promise.all(healthCheckPromises);
  }

  // 检查所有服务健康状态
  async checkAllServicesHealth() {
    const healthCheckPromises = Object.keys(this.serviceRegistry).map(serviceName =>
      this.checkServiceHealth(serviceName)
    );

    await Promise.allSettled(healthCheckPromises);

    // 记录健康状态摘要
    const summary = this.getHealthSummary();
    logger.info('Health check summary', summary);
  }

  // 启动定期健康检查
  startHealthChecks() {
    setInterval(async () => {
      try {
        await this.checkAllServicesHealth();
      } catch (error) {
        logger.error('Health check error', { error: error.message });
      }
    }, this.healthCheckInterval);

    logger.info('Health check scheduler started', {
      interval: this.healthCheckInterval
    });
  }

  // 获取健康状态摘要
  getHealthSummary() {
    const summary = {};
    
    for (const [serviceName, service] of Object.entries(this.serviceRegistry)) {
      const total = service.instances.length;
      const healthy = service.instances.filter(i => i.healthy).length;
      
      summary[serviceName] = {
        total,
        healthy,
        unhealthy: total - healthy,
        status: healthy > 0 ? (healthy === total ? 'healthy' : 'degraded') : 'unhealthy'
      };
    }
    
    return summary;
  }

  // 注册新服务实例
  registerService(serviceName, instance) {
    if (!this.serviceRegistry[serviceName]) {
      this.serviceRegistry[serviceName] = {
        instances: [],
        healthPath: '/health',
        currentIndex: 0
      };
    }

    this.serviceRegistry[serviceName].instances.push({
      url: instance.url,
      weight: instance.weight || 1,
      healthy: true,
      connections: 0,
      ...instance
    });

    logger.info('Service instance registered', {
      serviceName,
      instanceUrl: instance.url
    });
  }

  // 注销服务实例
  unregisterService(serviceName, instanceUrl) {
    const service = this.serviceRegistry[serviceName];
    if (!service) return;

    const index = service.instances.findIndex(i => i.url === instanceUrl);
    if (index !== -1) {
      service.instances.splice(index, 1);
      logger.info('Service instance unregistered', {
        serviceName,
        instanceUrl
      });
    }
  }

  // 获取服务统计
  getServiceStats() {
    const stats = {};
    
    for (const [serviceName, service] of Object.entries(this.serviceRegistry)) {
      stats[serviceName] = {
        instances: service.instances.map(instance => ({
          url: instance.url,
          healthy: instance.healthy,
          connections: instance.connections || 0,
          weight: instance.weight,
          lastHealthCheck: instance.lastHealthCheck,
          lastSuccess: instance.lastSuccess,
          lastError: instance.lastError
        }))
      };
    }
    
    return stats;
  }

  // 优雅关闭
  async shutdown() {
    logger.info('Shutting down Service Discovery...');
    this.isInitialized = false;
  }
}

module.exports = ServiceDiscovery; 