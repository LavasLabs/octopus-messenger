const redis = require('redis');
const logger = require('./logger');

class CacheManager {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isConnected = false;
  }

  async initialize() {
    try {
      // 创建Redis客户端
      this.client = redis.createClient({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest,
        retryDelayOnFailover: this.config.retryDelayOnFailover,
        enableOfflineQueue: this.config.enableOfflineQueue,
        lazyConnect: true,
        connectionName: 'message-processor'
      });

      // 设置事件监听
      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        logger.info('Redis client disconnected');
        this.isConnected = false;
      });

      // 连接Redis
      await this.client.connect();
      
      // 测试连接
      await this.client.ping();
      logger.info('Redis connection established successfully');

    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  // 基础操作方法
  async set(key, value, ttl = null) {
    try {
      const fullKey = this.getFullKey(key);
      const serializedValue = JSON.stringify(value);
      
      if (ttl) {
        await this.client.setEx(fullKey, ttl, serializedValue);
      } else {
        await this.client.set(fullKey, serializedValue);
      }
      
      logger.logCache('set', fullKey, { ttl });
      return true;
    } catch (error) {
      logger.error('Cache set error:', { key, error: error.message });
      return false;
    }
  }

  async get(key) {
    try {
      const fullKey = this.getFullKey(key);
      const value = await this.client.get(fullKey);
      
      if (value === null) {
        logger.logCache('get', fullKey, { hit: false });
        return null;
      }
      
      const parsedValue = JSON.parse(value);
      logger.logCache('get', fullKey, { hit: true });
      return parsedValue;
    } catch (error) {
      logger.error('Cache get error:', { key, error: error.message });
      return null;
    }
  }

  async del(key) {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.client.del(fullKey);
      
      logger.logCache('del', fullKey, { deleted: result });
      return result > 0;
    } catch (error) {
      logger.error('Cache del error:', { key, error: error.message });
      return false;
    }
  }

  async exists(key) {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.client.exists(fullKey);
      
      logger.logCache('exists', fullKey, { exists: result === 1 });
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', { key, error: error.message });
      return false;
    }
  }

  async expire(key, ttl) {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.client.expire(fullKey, ttl);
      
      logger.logCache('expire', fullKey, { ttl, success: result === 1 });
      return result === 1;
    } catch (error) {
      logger.error('Cache expire error:', { key, error: error.message });
      return false;
    }
  }

  async ttl(key) {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.client.ttl(fullKey);
      
      logger.logCache('ttl', fullKey, { ttl: result });
      return result;
    } catch (error) {
      logger.error('Cache ttl error:', { key, error: error.message });
      return -1;
    }
  }

  // 哈希操作方法
  async hset(key, field, value) {
    try {
      const fullKey = this.getFullKey(key);
      const serializedValue = JSON.stringify(value);
      
      await this.client.hSet(fullKey, field, serializedValue);
      logger.logCache('hset', fullKey, { field });
      return true;
    } catch (error) {
      logger.error('Cache hset error:', { key, field, error: error.message });
      return false;
    }
  }

  async hget(key, field) {
    try {
      const fullKey = this.getFullKey(key);
      const value = await this.client.hGet(fullKey, field);
      
      if (value === null) {
        logger.logCache('hget', fullKey, { field, hit: false });
        return null;
      }
      
      const parsedValue = JSON.parse(value);
      logger.logCache('hget', fullKey, { field, hit: true });
      return parsedValue;
    } catch (error) {
      logger.error('Cache hget error:', { key, field, error: error.message });
      return null;
    }
  }

  async hdel(key, field) {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.client.hDel(fullKey, field);
      
      logger.logCache('hdel', fullKey, { field, deleted: result });
      return result > 0;
    } catch (error) {
      logger.error('Cache hdel error:', { key, field, error: error.message });
      return false;
    }
  }

  async hgetall(key) {
    try {
      const fullKey = this.getFullKey(key);
      const hash = await this.client.hGetAll(fullKey);
      
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      
      logger.logCache('hgetall', fullKey, { fields: Object.keys(result).length });
      return result;
    } catch (error) {
      logger.error('Cache hgetall error:', { key, error: error.message });
      return {};
    }
  }

  // 列表操作方法
  async lpush(key, ...values) {
    try {
      const fullKey = this.getFullKey(key);
      const serializedValues = values.map(v => JSON.stringify(v));
      
      const result = await this.client.lPush(fullKey, serializedValues);
      logger.logCache('lpush', fullKey, { count: values.length, length: result });
      return result;
    } catch (error) {
      logger.error('Cache lpush error:', { key, error: error.message });
      return 0;
    }
  }

  async rpush(key, ...values) {
    try {
      const fullKey = this.getFullKey(key);
      const serializedValues = values.map(v => JSON.stringify(v));
      
      const result = await this.client.rPush(fullKey, serializedValues);
      logger.logCache('rpush', fullKey, { count: values.length, length: result });
      return result;
    } catch (error) {
      logger.error('Cache rpush error:', { key, error: error.message });
      return 0;
    }
  }

  async lpop(key) {
    try {
      const fullKey = this.getFullKey(key);
      const value = await this.client.lPop(fullKey);
      
      if (value === null) {
        logger.logCache('lpop', fullKey, { hit: false });
        return null;
      }
      
      const parsedValue = JSON.parse(value);
      logger.logCache('lpop', fullKey, { hit: true });
      return parsedValue;
    } catch (error) {
      logger.error('Cache lpop error:', { key, error: error.message });
      return null;
    }
  }

  async rpop(key) {
    try {
      const fullKey = this.getFullKey(key);
      const value = await this.client.rPop(fullKey);
      
      if (value === null) {
        logger.logCache('rpop', fullKey, { hit: false });
        return null;
      }
      
      const parsedValue = JSON.parse(value);
      logger.logCache('rpop', fullKey, { hit: true });
      return parsedValue;
    } catch (error) {
      logger.error('Cache rpop error:', { key, error: error.message });
      return null;
    }
  }

  async llen(key) {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.client.lLen(fullKey);
      
      logger.logCache('llen', fullKey, { length: result });
      return result;
    } catch (error) {
      logger.error('Cache llen error:', { key, error: error.message });
      return 0;
    }
  }

  // 集合操作方法
  async sadd(key, ...members) {
    try {
      const fullKey = this.getFullKey(key);
      const serializedMembers = members.map(m => JSON.stringify(m));
      
      const result = await this.client.sAdd(fullKey, serializedMembers);
      logger.logCache('sadd', fullKey, { count: members.length, added: result });
      return result;
    } catch (error) {
      logger.error('Cache sadd error:', { key, error: error.message });
      return 0;
    }
  }

  async srem(key, ...members) {
    try {
      const fullKey = this.getFullKey(key);
      const serializedMembers = members.map(m => JSON.stringify(m));
      
      const result = await this.client.sRem(fullKey, serializedMembers);
      logger.logCache('srem', fullKey, { count: members.length, removed: result });
      return result;
    } catch (error) {
      logger.error('Cache srem error:', { key, error: error.message });
      return 0;
    }
  }

  async smembers(key) {
    try {
      const fullKey = this.getFullKey(key);
      const members = await this.client.sMembers(fullKey);
      
      const result = members.map(m => JSON.parse(m));
      logger.logCache('smembers', fullKey, { count: result.length });
      return result;
    } catch (error) {
      logger.error('Cache smembers error:', { key, error: error.message });
      return [];
    }
  }

  // 业务方法
  async cacheMessage(message, ttl = 3600) {
    const key = `message:${message.id}`;
    return await this.set(key, message, ttl);
  }

  async getCachedMessage(messageId) {
    const key = `message:${messageId}`;
    return await this.get(key);
  }

  async cacheClassification(messageId, classification, ttl = 3600) {
    const key = `classification:${messageId}`;
    return await this.set(key, classification, ttl);
  }

  async getCachedClassification(messageId) {
    const key = `classification:${messageId}`;
    return await this.get(key);
  }

  async cacheUserSession(userId, platformId, sessionData, ttl = 1800) {
    const key = `session:${userId}:${platformId}`;
    return await this.set(key, sessionData, ttl);
  }

  async getUserSession(userId, platformId) {
    const key = `session:${userId}:${platformId}`;
    return await this.get(key);
  }

  async addToProcessingQueue(messageId, priority = 0) {
    const key = 'processing_queue';
    return await this.lpush(key, { messageId, priority, timestamp: Date.now() });
  }

  async getFromProcessingQueue() {
    const key = 'processing_queue';
    return await this.rpop(key);
  }

  async getProcessingQueueLength() {
    const key = 'processing_queue';
    return await this.llen(key);
  }

  // 工具方法
  getFullKey(key) {
    return `${this.config.keyPrefix}${key}`;
  }

  async flushPattern(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.logCache('flush', pattern, { deleted: keys.length });
      }
      return keys.length;
    } catch (error) {
      logger.error('Cache flush error:', { pattern, error: error.message });
      return 0;
    }
  }

  async info() {
    try {
      const info = await this.client.info();
      return {
        connected: this.isConnected,
        info: info
      };
    } catch (error) {
      return {
        connected: this.isConnected,
        error: error.message
      };
    }
  }

  async healthCheck() {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      const info = await this.client.info('memory');
      const memoryUsage = info.match(/used_memory:(\d+)/)?.[1] || 0;
      
      return {
        status: 'healthy',
        connected: this.isConnected,
        latency: `${latency}ms`,
        memoryUsage: `${Math.round(memoryUsage / 1024 / 1024)}MB`
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: this.isConnected,
        error: error.message
      };
    }
  }

  async close() {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis connection closed');
    }
  }
}

module.exports = CacheManager; 