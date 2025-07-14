const logger = require('./logger');
const DatabaseManager = require('./DatabaseManager');
const CacheManager = require('./CacheManager');

class StorageOptimizer {
    constructor() {
        this.dbManager = new DatabaseManager();
        this.cacheManager = new CacheManager();
        this.config = {
            hotDataDays: 7,      // 热数据：7天
            warmDataDays: 30,    // 温数据：30天  
            coldDataYears: 1,    // 冷数据：1年
            compressionRatio: 0.6, // 压缩比例
            batchSize: 1000      // 批处理大小
        };
        this.isOptimizing = false;
    }

    async initialize() {
        try {
            await this.dbManager.initialize();
            await this.cacheManager.initialize();
            logger.info('StorageOptimizer initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize StorageOptimizer:', error);
            throw error;
        }
    }

    // 根据消息年龄确定存储层级
    determineStorageLevel(messageDate) {
        const now = new Date();
        const daysDiff = Math.floor((now - new Date(messageDate)) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= this.config.hotDataDays) {
            return 'hot';
        } else if (daysDiff <= this.config.warmDataDays) {
            return 'warm';
        } else {
            return 'cold';
        }
    }

    // 存储消息到适当的层级
    async storeMessage(messageData) {
        try {
            const storageLevel = this.determineStorageLevel(messageData.created_at);
            const compressionEnabled = storageLevel !== 'hot';
            
            // 压缩内容（如果需要）
            let content = messageData.content;
            if (compressionEnabled && content) {
                content = await this.compressContent(content);
            }

            // 构建存储数据
            const storeData = {
                ...messageData,
                storage_level: storageLevel,
                compression_enabled: compressionEnabled,
                content: content
            };

            // 存储到数据库
            const result = await this.dbManager.query(
                `INSERT INTO messages (
                    id, user_id, chat_id, platform, content, message_type, 
                    storage_level, compression_enabled, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
                RETURNING id`,
                [
                    storeData.id, storeData.user_id, storeData.chat_id, 
                    storeData.platform, storeData.content, storeData.message_type,
                    storeData.storage_level, storeData.compression_enabled,
                    storeData.created_at, storeData.updated_at
                ]
            );

            // 如果是热数据，同时存储到缓存
            if (storageLevel === 'hot') {
                await this.cacheManager.set(`message:${messageData.id}`, messageData, 3600);
            }

            // 更新统计
            await this.updateStorageStats(storageLevel, 'stored');

            logger.info(`Message ${messageData.id} stored in ${storageLevel} storage`);
            return result.rows[0];

        } catch (error) {
            logger.error('Failed to store message:', error);
            throw error;
        }
    }

    // 检索消息
    async retrieveMessage(messageId) {
        try {
            // 先尝试从缓存获取
            const cached = await this.cacheManager.get(`message:${messageId}`);
            if (cached) {
                logger.debug(`Message ${messageId} retrieved from cache`);
                return cached;
            }

            // 从数据库获取
            const result = await this.dbManager.query(
                'SELECT * FROM messages WHERE id = $1',
                [messageId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const message = result.rows[0];

            // 解压缩内容（如果需要）
            if (message.compression_enabled && message.content) {
                message.content = await this.decompressContent(message.content);
            }

            // 如果是热数据，缓存结果
            if (message.storage_level === 'hot') {
                await this.cacheManager.set(`message:${messageId}`, message, 3600);
            }

            logger.debug(`Message ${messageId} retrieved from ${message.storage_level} storage`);
            return message;

        } catch (error) {
            logger.error('Failed to retrieve message:', error);
            throw error;
        }
    }

    // 数据生命周期优化
    async optimizeDataLifecycle() {
        if (this.isOptimizing) {
            logger.warn('Storage optimization already in progress');
            return;
        }

        this.isOptimizing = true;
        logger.info('Starting data lifecycle optimization');

        try {
            await this.moveHotToWarm();
            await this.moveWarmToCold();
            await this.archiveOldData();
            await this.cleanupExpiredCache();
            
            logger.info('Data lifecycle optimization completed');
        } catch (error) {
            logger.error('Data lifecycle optimization failed:', error);
        } finally {
            this.isOptimizing = false;
        }
    }

    // 将热数据移动到温存储
    async moveHotToWarm() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.hotDataDays);

        const result = await this.dbManager.query(`
            UPDATE messages 
            SET storage_level = 'warm', 
                compression_enabled = true,
                content = $1,
                updated_at = NOW()
            WHERE storage_level = 'hot' 
            AND created_at < $2
            RETURNING id
        `, [null, cutoffDate]);

        logger.info(`Moved ${result.rows.length} messages from hot to warm storage`);
        
        // 更新统计
        await this.updateStorageStats('warm', 'moved_from_hot', result.rows.length);
    }

    // 将温数据移动到冷存储
    async moveWarmToCold() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.warmDataDays);

        const result = await this.dbManager.query(`
            UPDATE messages 
            SET storage_level = 'cold',
                updated_at = NOW()
            WHERE storage_level = 'warm' 
            AND created_at < $1
            RETURNING id
        `, [cutoffDate]);

        logger.info(`Moved ${result.rows.length} messages from warm to cold storage`);
        
        // 更新统计
        await this.updateStorageStats('cold', 'moved_from_warm', result.rows.length);
    }

    // 归档旧数据
    async archiveOldData() {
        const cutoffDate = new Date();
        cutoffDate.setFullYear(cutoffDate.getFullYear() - this.config.coldDataYears);

        const result = await this.dbManager.query(`
            DELETE FROM messages 
            WHERE storage_level = 'cold' 
            AND created_at < $1
            RETURNING id
        `, [cutoffDate]);

        logger.info(`Archived ${result.rows.length} old messages`);
        
        // 更新统计
        await this.updateStorageStats('archived', 'deleted', result.rows.length);
    }

    // 清理过期缓存
    async cleanupExpiredCache() {
        try {
            const keys = await this.cacheManager.getKeys('message:*');
            let cleaned = 0;

            for (const key of keys) {
                const ttl = await this.cacheManager.getTTL(key);
                if (ttl === -1 || ttl === 0) {
                    await this.cacheManager.del(key);
                    cleaned++;
                }
            }

            logger.info(`Cleaned up ${cleaned} expired cache entries`);
        } catch (error) {
            logger.error('Failed to cleanup expired cache:', error);
        }
    }

    // 压缩内容
    async compressContent(content) {
        try {
            // 简单的压缩模拟（实际应用中应使用真实的压缩算法）
            if (typeof content === 'string' && content.length > 100) {
                return content.substring(0, Math.floor(content.length * this.config.compressionRatio));
            }
            return content;
        } catch (error) {
            logger.error('Failed to compress content:', error);
            return content;
        }
    }

    // 解压缩内容
    async decompressContent(content) {
        try {
            // 简单的解压缩模拟
            return content;
        } catch (error) {
            logger.error('Failed to decompress content:', error);
            return content;
        }
    }

    // 更新存储统计
    async updateStorageStats(level, operation, count = 1) {
        try {
            await this.dbManager.query(`
                INSERT INTO storage_optimization_stats 
                (storage_level, operation_type, message_count, recorded_at)
                VALUES ($1, $2, $3, NOW())
            `, [level, operation, count]);
        } catch (error) {
            logger.error('Failed to update storage stats:', error);
        }
    }

    // 获取存储统计
    async getStorageStats() {
        try {
            const result = await this.dbManager.query(`
                SELECT 
                    storage_level,
                    COUNT(*) as message_count,
                    AVG(CASE WHEN compression_enabled THEN 1 ELSE 0 END) as compression_ratio
                FROM messages 
                GROUP BY storage_level
            `);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get storage stats:', error);
            return [];
        }
    }

    // 获取存储健康状态
    async getHealthStatus() {
        try {
            const stats = await this.getStorageStats();
            const totalMessages = stats.reduce((sum, stat) => sum + parseInt(stat.message_count), 0);
            
            return {
                status: 'healthy',
                total_messages: totalMessages,
                storage_distribution: stats,
                optimization_running: this.isOptimizing,
                last_optimization: new Date()
            };
        } catch (error) {
            logger.error('Failed to get health status:', error);
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    async cleanup() {
        try {
            await this.cacheManager.cleanup();
            await this.dbManager.cleanup();
            logger.info('StorageOptimizer cleanup completed');
        } catch (error) {
            logger.error('StorageOptimizer cleanup failed:', error);
        }
    }
}

module.exports = StorageOptimizer; 