const { Pool } = require('pg');
const logger = require('../utils/logger');

class SystemManager {
    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'octopus_messenger',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'Abc123123!'
        });
    }

    async getSystemInfo() {
        try {
            const info = {
                version: '1.0.0',
                nodeVersion: process.version,
                platform: process.platform,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date()
            };
            
            return info;
        } catch (error) {
            logger.error('Error getting system info:', error);
            throw error;
        }
    }

    async getSystemLogs() {
        try {
            const result = await this.pool.query(
                'SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 100'
            );
            return result.rows;
        } catch (error) {
            logger.error('Error getting system logs:', error);
            throw error;
        }
    }

    async getSystemConfig() {
        try {
            const config = {
                database: {
                    host: process.env.DB_HOST || 'localhost',
                    port: process.env.DB_PORT || 5432,
                    name: process.env.DB_NAME || 'octopus_messenger'
                },
                services: {
                    gateway: process.env.GATEWAY_PORT || 3000,
                    aiService: process.env.AI_SERVICE_PORT || 3002,
                    adminPanel: process.env.ADMIN_PANEL_PORT || 3005
                },
                features: {
                    telegram: process.env.TELEGRAM_ENABLED || false,
                    discord: process.env.DISCORD_ENABLED || false,
                    slack: process.env.SLACK_ENABLED || false
                }
            };
            
            return config;
        } catch (error) {
            logger.error('Error getting system config:', error);
            throw error;
        }
    }

    async updateSystemConfig(configData) {
        try {
            // 这里可以实现配置更新逻辑
            logger.info('System config updated:', configData);
            return { success: true };
        } catch (error) {
            logger.error('Error updating system config:', error);
            throw error;
        }
    }
}

module.exports = SystemManager; 