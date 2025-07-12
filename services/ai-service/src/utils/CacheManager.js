const Redis = require('redis');
const logger = require('./logger');

class CacheManager {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isInitialized = false;
    this.keyPrefix = config.keyPrefix || 'ai:';
  }

  async initialize() {
    try {
      logger.info('Initializing Redis cache connection...');
      
      this.client = Redis.createClient({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db || 0,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest || 3,
        retryDelayOnFailover: this.config.retryDelayOnFailover || 100,
        enableOfflineQueue: this.config.enableOfflineQueue || false,
        lazyConnect: true
      });

      // 错误处理
      this.client.on('error', (error) => {
        logger.error('Redis client error', { error: error.message });
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.client.on('end', () => {
        logger.warn('Redis client disconnected');
      });

      // 连接到Redis
      await this.client.connect();
      
      // 测试连接
      await this.client.ping();
      
      this.isInitialized = true;
      logger.info('Redis cache connection established successfully');
    } catch (error) {
      logger.error('Failed to initialize Redis cache connection', { error: error.message });
      throw error;
    }
  }

  // 构建缓存键
  buildKey(type, ...parts) {
    return `${this.keyPrefix}${type}:${parts.join(':')}`;
  }

  // 通用缓存操作
  async get(key, defaultValue = null) {
    try {
      const value = await this.client.get(key);
      if (value === null) {
        return defaultValue;
      }
      return JSON.parse(value);
    } catch (error) {
      logger.error('Failed to get cache value', { key, error: error.message });
      return defaultValue;
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        await this.client.setEx(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error('Failed to set cache value', { key, error: error.message });
      return false;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Failed to delete cache value', { key, error: error.message });
      return false;
    }
  }

  async exists(key) {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Failed to check cache existence', { key, error: error.message });
      return false;
    }
  }

  // AI分类结果缓存
  async cacheClassificationResult(messageId, tenantId, classification, ttl = 86400) {
    const key = this.buildKey('classification', tenantId, messageId);
    return await this.set(key, {
      ...classification,
      cachedAt: new Date().toISOString()
    }, ttl);
  }

  async getCachedClassificationResult(messageId, tenantId) {
    const key = this.buildKey('classification', tenantId, messageId);
    return await this.get(key);
  }

  // 分类器模型缓存
  async cacheModel(modelType, tenantId, modelData, ttl = 7200) {
    const key = this.buildKey('model', modelType, tenantId);
    return await this.set(key, {
      ...modelData,
      cachedAt: new Date().toISOString()
    }, ttl);
  }

  async getCachedModel(modelType, tenantId) {
    const key = this.buildKey('model', modelType, tenantId);
    return await this.get(key);
  }

  // 分类规则缓存
  async cacheClassificationRules(tenantId, rules, ttl = 3600) {
    const key = this.buildKey('rules', tenantId);
    return await this.set(key, {
      rules,
      cachedAt: new Date().toISOString(),
      count: rules.length
    }, ttl);
  }

  async getCachedClassificationRules(tenantId) {
    const key = this.buildKey('rules', tenantId);
    const cached = await this.get(key);
    return cached ? cached.rules : null;
  }

  // AI API响应缓存（用于相同请求）
  async cacheAIResponse(requestHash, provider, response, ttl = 1800) {
    const key = this.buildKey('ai_response', provider, requestHash);
    return await this.set(key, {
      ...response,
      cachedAt: new Date().toISOString()
    }, ttl);
  }

  async getCachedAIResponse(requestHash, provider) {
    const key = this.buildKey('ai_response', provider, requestHash);
    return await this.get(key);
  }

  // 用户配额缓存
  async cacheUserQuota(tenantId, quota, ttl = 3600) {
    const key = this.buildKey('quota', tenantId);
    return await this.set(key, quota, ttl);
  }

  async getCachedUserQuota(tenantId) {
    const key = this.buildKey('quota', tenantId);
    return await this.get(key);
  }

  async incrementQuotaUsage(tenantId, field, increment = 1) {
    const key = this.buildKey('quota', tenantId, field);
    try {
      return await this.client.incrBy(key, increment);
    } catch (error) {
      logger.error('Failed to increment quota usage', { 
        tenantId, 
        field, 
        increment, 
        error: error.message 
      });
      return null;
    }
  }

  // 统计数据缓存
  async cacheStats(type, tenantId, stats, ttl = 1800) {
    const key = this.buildKey('stats', type, tenantId);
    return await this.set(key, {
      ...stats,
      generatedAt: new Date().toISOString()
    }, ttl);
  }

  async getCachedStats(type, tenantId) {
    const key = this.buildKey('stats', type, tenantId);
    return await this.get(key);
  }

  // NLP处理结果缓存
  async cacheNLPResult(textHash, feature, result, ttl = 7200) {
    const key = this.buildKey('nlp', feature, textHash);
    return await this.set(key, {
      ...result,
      cachedAt: new Date().toISOString()
    }, ttl);
  }

  async getCachedNLPResult(textHash, feature) {
    const key = this.buildKey('nlp', feature, textHash);
    return await this.get(key);
  }

  // 会话级缓存（用于上下文相关的分类）
  async cacheSessionContext(sessionId, context, ttl = 1800) {
    const key = this.buildKey('session', sessionId);
    return await this.set(key, context, ttl);
  }

  async getSessionContext(sessionId) {
    const key = this.buildKey('session', sessionId);
    return await this.get(key);
  }

  async updateSessionContext(sessionId, updates, ttl = 1800) {
    const key = this.buildKey('session', sessionId);
    const existing = await this.get(key) || {};
    const updated = { ...existing, ...updates };
    return await this.set(key, updated, ttl);
  }

  // 批量操作
  async mget(keys) {
    try {
      const values = await this.client.mGet(keys);
      return values.map(value => {
        try {
          return value ? JSON.parse(value) : null;
        } catch (error) {
          return null;
        }
      });
    } catch (error) {
      logger.error('Failed to execute mget', { keys, error: error.message });
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs, ttl = 3600) {
    try {
      const pipeline = this.client.multi();
      
      for (const [key, value] of keyValuePairs) {
        const serialized = JSON.stringify(value);
        if (ttl > 0) {
          pipeline.setEx(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Failed to execute mset', { error: error.message });
      return false;
    }
  }

  // 过期和清理
  async expire(key, ttl) {
    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('Failed to set expiration', { key, ttl, error: error.message });
      return false;
    }
  }

  async clearNamespace(namespace) {
    try {
      const pattern = this.buildKey(namespace, '*');
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.info('Cache namespace cleared', { namespace, keyCount: keys.length });
      }
      
      return keys.length;
    } catch (error) {
      logger.error('Failed to clear namespace', { namespace, error: error.message });
      return 0;
    }
  }

  // 性能监控
  async getMemoryUsage() {
    try {
      const info = await this.client.info('memory');
      const lines = info.split('\r\n');
      const memoryInfo = {};
      
      lines.forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          if (key.startsWith('used_memory')) {
            memoryInfo[key] = value;
          }
        }
      });
      
      return memoryInfo;
    } catch (error) {
      logger.error('Failed to get memory usage', { error: error.message });
      return {};
    }
  }

  async getConnectionInfo() {
    try {
      const info = await this.client.info('clients');
      return info;
    } catch (error) {
      logger.error('Failed to get connection info', { error: error.message });
      return '';
    }
  }

  // 健康检查
  async healthCheck() {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      const memoryUsage = await this.getMemoryUsage();
      
      return {
        status: 'healthy',
        latency,
        memoryUsage,
        connected: this.client.isReady
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false
      };
    }
  }

  async close() {
    if (this.client) {
      await this.client.quit();
      this.isInitialized = false;
      logger.info('Redis cache connection closed');
    }
  }
}

module.exports = CacheManager; 