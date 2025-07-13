const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

class UserManager {
    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'octopus_messenger',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'Abc123123!'
        });
    }

    async getAllUsers() {
        try {
            const result = await this.pool.query(
                'SELECT id, username, email, role, status, created_at FROM users ORDER BY created_at DESC'
            );
            return result.rows;
        } catch (error) {
            logger.error('Error getting users:', error);
            throw error;
        }
    }

    async getUserById(id) {
        try {
            const result = await this.pool.query(
                'SELECT id, username, email, role, status, created_at FROM users WHERE id = $1',
                [id]
            );
            return result.rows[0];
        } catch (error) {
            logger.error('Error getting user by id:', error);
            throw error;
        }
    }

    async createUser(userData) {
        try {
            const { username, email, password, role = 'user' } = userData;
            const hashedPassword = await bcrypt.hash(password, 10);
            
            const result = await this.pool.query(
                'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
                [username, email, hashedPassword, role]
            );
            
            return result.rows[0];
        } catch (error) {
            logger.error('Error creating user:', error);
            throw error;
        }
    }

    async updateUser(id, userData) {
        try {
            const { username, email, role, status } = userData;
            const result = await this.pool.query(
                'UPDATE users SET username = $1, email = $2, role = $3, status = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING id, username, email, role, status',
                [username, email, role, status, id]
            );
            
            return result.rows[0];
        } catch (error) {
            logger.error('Error updating user:', error);
            throw error;
        }
    }

    async deleteUser(id) {
        try {
            await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
            return true;
        } catch (error) {
            logger.error('Error deleting user:', error);
            throw error;
        }
    }
}

module.exports = UserManager; 