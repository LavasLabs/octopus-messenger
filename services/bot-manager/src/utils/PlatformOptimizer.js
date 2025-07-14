const logger = require('./logger');

class PlatformOptimizer {
    constructor(options = {}) {
        this.platforms = new Map();
        this.config = {
            maxConcurrentConnections: 10000,
            defaultRateLimit: 30, // messages per second
            healthCheckInterval: 30000, // 30 seconds
            ...options
        };
        
        // 平台配置
        this.platformConfigs = {
            telegram: { maxConcurrent: 1000, rateLimit: 30, priority: 1 },
            discord: { maxConcurrent: 2500, rateLimit: 50, priority: 2 },
            whatsapp: { maxConcurrent: 500, rateLimit: 20, priority: 3 },
            slack: { maxConcurrent: 1500, rateLimit: 30, priority: 4 },
            line: { maxConcurrent: 800, rateLimit: 25, priority: 5 },
            wework: { maxConcurrent: 600, rateLimit: 20, priority: 6 },
            intercom: { maxConcurrent: 400, rateLimit: 15, priority: 7 },
            messenger: { maxConcurrent: 300, rateLimit: 10, priority: 8 }
        };

        this.stats = {
            totalMessages: 0,
            platformStats: new Map(),
            errors: new Map(),
            performance: new Map()
        };

        this.isHealthy = true;
        this.healthCheckTimer = null;
    }

    async initialize() {
        try {
            // 初始化所有平台配置
            for (const [platform, config] of Object.entries(this.platformConfigs)) {
                this.platforms.set(platform, {
                    ...config,
                    activeConnections: 0,
                    messageCount: 0,
                    errorCount: 0,
                    lastHealthCheck: new Date(),
                    status: 'initialized'
                });
                
                this.stats.platformStats.set(platform, {
                    messagesSent: 0,
                    messagesReceived: 0,
                    errors: 0,
                    avgResponseTime: 0,
                    uptime: 100
                });
            }

            // 启动健康检查
            this.startHealthCheck();
            
            logger.info('PlatformOptimizer initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize PlatformOptimizer:', error);
            throw error;
        }
    }

    // 注册平台实例
    registerPlatform(platformName, botInstance) {
        if (!this.platforms.has(platformName)) {
            logger.warn(`Unknown platform: ${platformName}`);
            return false;
        }

        const platform = this.platforms.get(platformName);
        platform.instance = botInstance;
        platform.status = 'registered';
        
        logger.info(`Platform ${platformName} registered successfully`);
        return true;
    }

    // 选择最佳平台发送消息
    async selectOptimalPlatform(criteria = {}) {
        const { 
            preferredPlatform, 
            messageType = 'text', 
            priority = 'normal',
            targetUser 
        } = criteria;

        try {
            // 如果指定了首选平台且可用，优先使用
            if (preferredPlatform && this.isPlatformAvailable(preferredPlatform)) {
                return preferredPlatform;
            }

            // 根据消息类型和优先级选择平台
            const availablePlatforms = Array.from(this.platforms.entries())
                .filter(([name, config]) => this.isPlatformAvailable(name))
                .sort((a, b) => {
                    const [nameA, configA] = a;
                    const [nameB, configB] = b;
                    
                    // 优先级排序
                    if (priority === 'high') {
                        return configA.priority - configB.priority;
                    }
                    
                    // 负载均衡
                    const loadA = configA.activeConnections / configA.maxConcurrent;
                    const loadB = configB.activeConnections / configB.maxConcurrent;
                    
                    return loadA - loadB;
                });

            if (availablePlatforms.length === 0) {
                throw new Error('No available platforms');
            }

            const selectedPlatform = availablePlatforms[0][0];
            logger.debug(`Selected platform: ${selectedPlatform} for message type: ${messageType}`);
            
            return selectedPlatform;

        } catch (error) {
            logger.error('Failed to select optimal platform:', error);
            throw error;
        }
    }

    // 检查平台是否可用
    isPlatformAvailable(platformName) {
        const platform = this.platforms.get(platformName);
        if (!platform) return false;

        return platform.status === 'registered' && 
               platform.activeConnections < platform.maxConcurrent &&
               platform.instance;
    }

    // 发送消息
    async sendMessage(platformName, messageData) {
        const startTime = Date.now();
        
        try {
            const platform = this.platforms.get(platformName);
            if (!platform || !platform.instance) {
                throw new Error(`Platform ${platformName} not available`);
            }

            // 检查速率限制
            if (!this.checkRateLimit(platformName)) {
                throw new Error(`Rate limit exceeded for ${platformName}`);
            }

            // 标准化消息数据
            const standardizedMessage = this.standardizeMessage(messageData, platformName);
            
            // 增加活跃连接数
            platform.activeConnections++;

            // 发送消息
            const result = await platform.instance.sendMessage(standardizedMessage);
            
            // 更新统计
            this.updateStats(platformName, 'sent', Date.now() - startTime);
            
            logger.info(`Message sent via ${platformName}:`, result.messageId);
            return result;

        } catch (error) {
            this.updateStats(platformName, 'error', Date.now() - startTime);
            logger.error(`Failed to send message via ${platformName}:`, error);
            throw error;
        } finally {
            // 减少活跃连接数
            const platform = this.platforms.get(platformName);
            if (platform) {
                platform.activeConnections = Math.max(0, platform.activeConnections - 1);
            }
        }
    }

    // 标准化消息格式
    standardizeMessage(messageData, platformName) {
        const standardized = {
            id: messageData.id || this.generateMessageId(),
            chatId: messageData.chatId || messageData.chat_id,
            userId: messageData.userId || messageData.user_id,
            content: messageData.content || messageData.text,
            type: messageData.type || 'text',
            timestamp: messageData.timestamp || new Date(),
            platform: platformName
        };

        // 平台特定处理
        switch (platformName) {
            case 'telegram':
                standardized.chat_id = standardized.chatId;
                standardized.text = standardized.content;
                break;
            case 'discord':
                standardized.channel = standardized.chatId;
                standardized.content = standardized.content;
                break;
            case 'whatsapp':
                standardized.to = standardized.chatId;
                standardized.body = standardized.content;
                break;
            case 'slack':
                standardized.channel = standardized.chatId;
                standardized.text = standardized.content;
                break;
        }

        return standardized;
    }

    // 检查速率限制
    checkRateLimit(platformName) {
        const platform = this.platforms.get(platformName);
        if (!platform) return false;

        const now = Date.now();
        const windowStart = now - 1000; // 1秒窗口

        // 简单的速率限制实现
        if (!platform.rateWindow) {
            platform.rateWindow = { start: now, count: 0 };
        }

        if (now - platform.rateWindow.start > 1000) {
            platform.rateWindow = { start: now, count: 0 };
        }

        if (platform.rateWindow.count >= platform.rateLimit) {
            return false;
        }

        platform.rateWindow.count++;
        return true;
    }

    // 更新统计数据
    updateStats(platformName, operation, responseTime) {
        const stats = this.stats.platformStats.get(platformName);
        if (!stats) return;

        switch (operation) {
            case 'sent':
                stats.messagesSent++;
                stats.avgResponseTime = (stats.avgResponseTime + responseTime) / 2;
                break;
            case 'received':
                stats.messagesReceived++;
                break;
            case 'error':
                stats.errors++;
                break;
        }

        this.stats.totalMessages++;
    }

    // 开始健康检查
    startHealthCheck() {
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, this.config.healthCheckInterval);
    }

    // 执行健康检查
    async performHealthCheck() {
        try {
            let allHealthy = true;

            for (const [platformName, platform] of this.platforms) {
                if (platform.instance && typeof platform.instance.healthCheck === 'function') {
                    try {
                        const isHealthy = await platform.instance.healthCheck();
                        platform.status = isHealthy ? 'healthy' : 'unhealthy';
                        
                        if (!isHealthy) {
                            allHealthy = false;
                            logger.warn(`Platform ${platformName} health check failed`);
                        }
                    } catch (error) {
                        platform.status = 'error';
                        allHealthy = false;
                        logger.error(`Health check error for ${platformName}:`, error);
                    }
                }
                
                platform.lastHealthCheck = new Date();
            }

            this.isHealthy = allHealthy;
            
            if (allHealthy) {
                logger.debug('All platforms healthy');
            } else {
                logger.warn('Some platforms are unhealthy');
            }

        } catch (error) {
            logger.error('Health check failed:', error);
            this.isHealthy = false;
        }
    }

    // 获取平台统计
    getPlatformStats() {
        const stats = {};
        
        for (const [platformName, platform] of this.platforms) {
            const platformStats = this.stats.platformStats.get(platformName);
            stats[platformName] = {
                ...platformStats,
                status: platform.status,
                activeConnections: platform.activeConnections,
                maxConcurrent: platform.maxConcurrent,
                lastHealthCheck: platform.lastHealthCheck
            };
        }

        return {
            overall: {
                totalMessages: this.stats.totalMessages,
                totalPlatforms: this.platforms.size,
                healthyPlatforms: Array.from(this.platforms.values())
                    .filter(p => p.status === 'healthy').length,
                isHealthy: this.isHealthy
            },
            platforms: stats
        };
    }

    // 生成消息ID
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // 清理资源
    async cleanup() {
        try {
            if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
                this.healthCheckTimer = null;
            }

            for (const [platformName, platform] of this.platforms) {
                if (platform.instance && typeof platform.instance.cleanup === 'function') {
                    await platform.instance.cleanup();
                }
            }

            logger.info('PlatformOptimizer cleanup completed');
        } catch (error) {
            logger.error('PlatformOptimizer cleanup failed:', error);
        }
    }
}

module.exports = PlatformOptimizer; 