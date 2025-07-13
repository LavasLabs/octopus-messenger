const { Pool } = require('pg');
const logger = require('../utils/logger');

class DashboardManager {
    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'postgres',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'octopus_messenger',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'Abc123123!'
        });
    }

    async getSystemStats() {
        try {
            const stats = {};
            
            // 获取用户统计
            const userResult = await this.pool.query('SELECT COUNT(*) as count FROM users');
            stats.users = parseInt(userResult.rows[0].count);
            
            // 获取消息统计
            const messageResult = await this.pool.query('SELECT COUNT(*) as count FROM messages');
            stats.messages = parseInt(messageResult.rows[0].count);
            
            // 获取任务统计
            const taskResult = await this.pool.query('SELECT COUNT(*) as count FROM tasks');
            stats.tasks = parseInt(taskResult.rows[0].count);
            
            // 获取Bot统计
            const botResult = await this.pool.query('SELECT COUNT(*) as count FROM bot_configs');
            stats.bots = parseInt(botResult.rows[0].count);
            
            return stats;
        } catch (error) {
            logger.error('Error getting system stats:', error);
            throw error;
        }
    }

    async getRecentActivity() {
        try {
            const activities = [];
            
            // 获取最近消息
            const messageResult = await this.pool.query(
                'SELECT platform, content, created_at FROM messages ORDER BY created_at DESC LIMIT 10'
            );
            
            messageResult.rows.forEach(row => {
                activities.push({
                    type: 'message',
                    platform: row.platform,
                    content: row.content.substring(0, 100),
                    timestamp: row.created_at
                });
            });
            
            // 获取最近任务
            const taskResult = await this.pool.query(
                'SELECT title, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 10'
            );
            
            taskResult.rows.forEach(row => {
                activities.push({
                    type: 'task',
                    title: row.title,
                    status: row.status,
                    timestamp: row.created_at
                });
            });
            
            // 按时间排序
            activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            return activities.slice(0, 20);
        } catch (error) {
            logger.error('Error getting recent activity:', error);
            throw error;
        }
    }

    async getSystemHealth() {
        try {
            const health = {
                database: 'healthy',
                services: {},
                timestamp: new Date()
            };
            
            // 检查数据库连接
            try {
                await this.pool.query('SELECT 1');
                health.database = 'healthy';
            } catch (error) {
                health.database = 'unhealthy';
            }
            
            return health;
        } catch (error) {
            logger.error('Error getting system health:', error);
            throw error;
        }
    }
}

module.exports = DashboardManager; 