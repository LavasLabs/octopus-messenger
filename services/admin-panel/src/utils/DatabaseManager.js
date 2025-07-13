const { Pool } = require('pg');
const logger = require('./logger');

class DatabaseManager {
    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'octopus_messenger',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'Abc123123!',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.pool.on('error', (err) => {
            logger.error('Unexpected error on idle client', err);
        });
    }

    async query(text, params) {
        const start = Date.now();
        try {
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            logger.debug('Executed query', { text, duration, rows: res.rowCount });
            return res;
        } catch (error) {
            logger.error('Database query error', { text, error: error.message });
            throw error;
        }
    }

    async getClient() {
        return await this.pool.connect();
    }

    async transaction(callback) {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async close() {
        await this.pool.end();
    }

    async healthCheck() {
        try {
            const result = await this.query('SELECT 1');
            return result.rows.length > 0;
        } catch (error) {
            logger.error('Database health check failed', error);
            return false;
        }
    }
}

module.exports = DatabaseManager; 