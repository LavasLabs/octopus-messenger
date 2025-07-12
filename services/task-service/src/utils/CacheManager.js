const redis = require('redis');
const logger = require('./logger');

class CacheManager {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isConnected = false;
    this.defaultTTL = config.defaultTTL || 3600; // 1小时默认过期时间
  }

  // 初始化Redis连接
  async initialize() {
    try {
      this.client = redis.createClient({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.database || 0,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
        lazyConnect: true
      });

      // 设置事件监听器
      this.setupEventListeners();

      // 连接到Redis
      await this.client.connect();
      
      this.isConnected = true;
      logger.info('Redis connection established', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database || 0
      });

    } catch (error) {
      logger.error('Failed to initialize Redis connection', {
        error: error.message,
        host: this.config.host,
        port: this.config.port
      });
      throw error;
    }
  }

  // 设置事件监听器
  setupEventListeners() {
    this.client.on('connect', () => {
      logger.debug('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.debug('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error', { error: error.message });
      this.isConnected = false;
    });

    this.client.on('end', () => {
      logger.debug('Redis client disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  // 检查连接状态
  isHealthy() {
    return this.isConnected && this.client && this.client.isReady;
  }

  // 生成缓存键
  generateKey(prefix, ...parts) {
    return `task-service:${prefix}:${parts.join(':')}`;
  }

  // 设置缓存
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.isHealthy()) {
      logger.warn('Redis not available, skipping cache set', { key });
      return false;
    }

    try {
      const serializedValue = JSON.stringify(value);
      await this.client.setEx(key, ttl, serializedValue);
      
      logger.debug('Cache set successfully', {
        key,
        ttl,
        size: serializedValue.length
      });

      return true;
    } catch (error) {
      logger.error('Failed to set cache', {
        error: error.message,
        key,
        ttl
      });
      return false;
    }
  }

  // 获取缓存
  async get(key) {
    if (!this.isHealthy()) {
      logger.warn('Redis not available, cache miss', { key });
      return null;
    }

    try {
      const value = await this.client.get(key);
      
      if (value === null) {
        logger.debug('Cache miss', { key });
        return null;
      }

      const parsedValue = JSON.parse(value);
      logger.debug('Cache hit', { key });
      return parsedValue;
    } catch (error) {
      logger.error('Failed to get cache', {
        error: error.message,
        key
      });
      return null;
    }
  }

  // 删除缓存
  async del(key) {
    if (!this.isHealthy()) {
      logger.warn('Redis not available, skipping cache delete', { key });
      return false;
    }

    try {
      const result = await this.client.del(key);
      logger.debug('Cache deleted', { key, deleted: result > 0 });
      return result > 0;
    } catch (error) {
      logger.error('Failed to delete cache', {
        error: error.message,
        key
      });
      return false;
    }
  }

  // 批量删除缓存（支持模式匹配）
  async delPattern(pattern) {
    if (!this.isHealthy()) {
      logger.warn('Redis not available, skipping pattern delete', { pattern });
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.client.del(keys);
      logger.debug('Cache pattern deleted', { pattern, keysDeleted: result });
      return result;
    } catch (error) {
      logger.error('Failed to delete cache pattern', {
        error: error.message,
        pattern
      });
      return 0;
    }
  }

  // 检查缓存是否存在
  async exists(key) {
    if (!this.isHealthy()) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Failed to check cache existence', {
        error: error.message,
        key
      });
      return false;
    }
  }

  // 设置缓存过期时间
  async expire(key, ttl) {
    if (!this.isHealthy()) {
      return false;
    }

    try {
      const result = await this.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Failed to set cache expiration', {
        error: error.message,
        key,
        ttl
      });
      return false;
    }
  }

  // 获取缓存剩余生存时间
  async ttl(key) {
    if (!this.isHealthy()) {
      return -1;
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error('Failed to get cache TTL', {
        error: error.message,
        key
      });
      return -1;
    }
  }

  // 任务相关缓存方法
  async cacheTask(taskId, taskData, ttl = 1800) { // 30分钟
    const key = this.generateKey('task', taskId);
    return await this.set(key, taskData, ttl);
  }

  async getCachedTask(taskId) {
    const key = this.generateKey('task', taskId);
    return await this.get(key);
  }

  async deleteCachedTask(taskId) {
    const key = this.generateKey('task', taskId);
    return await this.del(key);
  }

  // 任务列表缓存
  async cacheTaskList(tenantId, filters, data, ttl = 600) { // 10分钟
    const filterKey = JSON.stringify(filters);
    const key = this.generateKey('tasks', tenantId, Buffer.from(filterKey).toString('base64'));
    return await this.set(key, data, ttl);
  }

  async getCachedTaskList(tenantId, filters) {
    const filterKey = JSON.stringify(filters);
    const key = this.generateKey('tasks', tenantId, Buffer.from(filterKey).toString('base64'));
    return await this.get(key);
  }

  // 用户会话缓存
  async cacheUserSession(userId, sessionData, ttl = 3600) { // 1小时
    const key = this.generateKey('session', userId);
    return await this.set(key, sessionData, ttl);
  }

  async getCachedUserSession(userId) {
    const key = this.generateKey('session', userId);
    return await this.get(key);
  }

  // CRM集成状态缓存
  async cacheCRMStatus(integrationId, status, ttl = 300) { // 5分钟
    const key = this.generateKey('crm-status', integrationId);
    return await this.set(key, status, ttl);
  }

  async getCachedCRMStatus(integrationId) {
    const key = this.generateKey('crm-status', integrationId);
    return await this.get(key);
  }

  // 统计数据缓存
  async cacheStats(tenantId, statsType, data, ttl = 600) { // 10分钟
    const key = this.generateKey('stats', tenantId, statsType);
    return await this.set(key, data, ttl);
  }

  async getCachedStats(tenantId, statsType) {
    const key = this.generateKey('stats', tenantId, statsType);
    return await this.get(key);
  }

  // 清除租户相关的所有缓存
  async clearTenantCache(tenantId) {
    const patterns = [
      this.generateKey('task', tenantId, '*'),
      this.generateKey('tasks', tenantId, '*'),
      this.generateKey('stats', tenantId, '*')
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      const deleted = await this.delPattern(pattern);
      totalDeleted += deleted;
    }

    logger.info('Tenant cache cleared', {
      tenantId,
      keysDeleted: totalDeleted
    });

    return totalDeleted;
  }

  // 获取缓存统计信息
  async getStats() {
    if (!this.isHealthy()) {
      return null;
    }

    try {
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');
      
      return {
        connected: this.isConnected,
        memory: this.parseMemoryInfo(info),
        keyspace: this.parseKeyspaceInfo(keyspace)
      };
    } catch (error) {
      logger.error('Failed to get cache stats', {
        error: error.message
      });
      return null;
    }
  }

  // 解析内存信息
  parseMemoryInfo(info) {
    const lines = info.split('\r\n');
    const memory = {};
    
    lines.forEach(line => {
      if (line.includes('used_memory:')) {
        memory.used = parseInt(line.split(':')[1]);
      }
      if (line.includes('used_memory_human:')) {
        memory.usedHuman = line.split(':')[1];
      }
      if (line.includes('used_memory_peak:')) {
        memory.peak = parseInt(line.split(':')[1]);
      }
    });
    
    return memory;
  }

  // 解析键空间信息
  parseKeyspaceInfo(info) {
    const lines = info.split('\r\n');
    const keyspace = {};
    
    lines.forEach(line => {
      if (line.startsWith('db')) {
        const [db, stats] = line.split(':');
        const matches = stats.match(/keys=(\d+),expires=(\d+)/);
        if (matches) {
          keyspace[db] = {
            keys: parseInt(matches[1]),
            expires: parseInt(matches[2])
          };
        }
      }
    });
    
    return keyspace;
  }

  // 关闭Redis连接
  async close() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis connection closed');
    }
  }
}

module.exports = CacheManager; 