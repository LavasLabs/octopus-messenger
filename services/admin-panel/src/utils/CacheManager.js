const redis = require('redis');
const logger = require('./logger');

class CacheManager {
    constructor() {
        this.client = redis.createClient({
            url: `redis://:${process.env.REDIS_PASSWORD || 'redis123'}@${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || 6379}`,
            retry_strategy: (options) => {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    logger.error('Redis server refused connection');
                    return new Error('Redis server refused connection');
                }
                if (options.total_retry_time > 1000 * 60 * 60) {
                    logger.error('Redis retry time exhausted');
                    return new Error('Retry time exhausted');
                }
                if (options.attempt > 10) {
                    logger.error('Redis connection attempts exhausted');
                    return undefined;
                }
                return Math.min(options.attempt * 100, 3000);
            }
        });

        this.client.on('error', (err) => {
            logger.error('Redis client error', err);
        });

        this.client.on('connect', () => {
            logger.info('Redis client connected');
        });

        this.client.on('ready', () => {
            logger.info('Redis client ready');
        });
    }

    async connect() {
        if (!this.client.isOpen) {
            await this.client.connect();
        }
    }

    async set(key, value, ttl = 3600) {
        try {
            await this.connect();
            const serialized = JSON.stringify(value);
            if (ttl) {
                await this.client.setEx(key, ttl, serialized);
            } else {
                await this.client.set(key, serialized);
            }
            logger.debug('Cache set', { key, ttl });
        } catch (error) {
            logger.error('Cache set error', { key, error: error.message });
            throw error;
        }
    }

    async get(key) {
        try {
            await this.connect();
            const value = await this.client.get(key);
            if (value) {
                logger.debug('Cache hit', { key });
                return JSON.parse(value);
            }
            logger.debug('Cache miss', { key });
            return null;
        } catch (error) {
            logger.error('Cache get error', { key, error: error.message });
            return null;
        }
    }

    async del(key) {
        try {
            await this.connect();
            await this.client.del(key);
            logger.debug('Cache deleted', { key });
        } catch (error) {
            logger.error('Cache delete error', { key, error: error.message });
        }
    }

    async exists(key) {
        try {
            await this.connect();
            return await this.client.exists(key);
        } catch (error) {
            logger.error('Cache exists error', { key, error: error.message });
            return false;
        }
    }

    async flush() {
        try {
            await this.connect();
            await this.client.flushAll();
            logger.info('Cache flushed');
        } catch (error) {
            logger.error('Cache flush error', error);
        }
    }

    async close() {
        if (this.client.isOpen) {
            await this.client.quit();
        }
    }

    async healthCheck() {
        try {
            await this.connect();
            const result = await this.client.ping();
            return result === 'PONG';
        } catch (error) {
            logger.error('Redis health check failed', error);
            return false;
        }
    }
}

module.exports = CacheManager; 