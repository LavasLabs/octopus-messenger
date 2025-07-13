const axios = require('axios');
const logger = require('./logger');

class APIClient {
    constructor() {
        this.baseURL = process.env.GATEWAY_URL || 'http://gateway:3000';
        this.timeout = 10000;
        
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Octopus-Admin-Panel/1.0.0'
            }
        });

        // 请求拦截器
        this.client.interceptors.request.use(
            (config) => {
                logger.debug('API Request', {
                    method: config.method,
                    url: config.url,
                    data: config.data
                });
                return config;
            },
            (error) => {
                logger.error('API Request Error', error);
                return Promise.reject(error);
            }
        );

        // 响应拦截器
        this.client.interceptors.response.use(
            (response) => {
                logger.debug('API Response', {
                    status: response.status,
                    url: response.config.url,
                    data: response.data
                });
                return response;
            },
            (error) => {
                logger.error('API Response Error', {
                    status: error.response?.status,
                    url: error.config?.url,
                    message: error.message,
                    data: error.response?.data
                });
                return Promise.reject(error);
            }
        );
    }

    // 设置认证token
    setAuthToken(token) {
        if (token) {
            this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
            delete this.client.defaults.headers.common['Authorization'];
        }
    }

    // 用户相关API
    async getUsers() {
        try {
            const response = await this.client.get('/api/users');
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async createUser(userData) {
        try {
            const response = await this.client.post('/api/users', userData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async updateUser(userId, userData) {
        try {
            const response = await this.client.put(`/api/users/${userId}`, userData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async deleteUser(userId) {
        try {
            const response = await this.client.delete(`/api/users/${userId}`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // Bot相关API
    async getBots() {
        try {
            const response = await this.client.get('/api/bots');
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async createBot(botData) {
        try {
            const response = await this.client.post('/api/bots', botData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async updateBot(botId, botData) {
        try {
            const response = await this.client.put(`/api/bots/${botId}`, botData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async deleteBot(botId) {
        try {
            const response = await this.client.delete(`/api/bots/${botId}`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // 消息相关API
    async getMessages(params = {}) {
        try {
            const response = await this.client.get('/api/messages', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // 任务相关API
    async getTasks(params = {}) {
        try {
            const response = await this.client.get('/api/tasks', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async createTask(taskData) {
        try {
            const response = await this.client.post('/api/tasks', taskData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async updateTask(taskId, taskData) {
        try {
            const response = await this.client.put(`/api/tasks/${taskId}`, taskData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // 商户相关API
    async getMerchants() {
        try {
            const response = await this.client.get('/api/merchants');
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async createMerchant(merchantData) {
        try {
            const response = await this.client.post('/api/merchants', merchantData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // 认证相关API
    async login(credentials) {
        try {
            const response = await this.client.post('/api/auth/login', credentials);
            return response.data;
        } catch (error) {
            // 如果API调用失败，尝试直接数据库验证（临时方案）
            if (error.status === 404 || error.status === 500) {
                return await this.fallbackLogin(credentials);
            }
            throw this.handleError(error);
        }
    }

    // 备用登录方法（直接验证数据库）
    async fallbackLogin(credentials) {
        try {
            const bcrypt = require('bcrypt');
            const { Pool } = require('pg');
            
            const pool = new Pool({
                host: process.env.DB_HOST || 'postgres',
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME || 'octopus_messenger',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || 'Abc123123!'
            });

            let query;
            let params;

            if (credentials.email) {
                query = 'SELECT * FROM users WHERE email = $1 AND status = $2';
                params = [credentials.email, 'active'];
            } else {
                query = 'SELECT * FROM users WHERE username = $1 AND status = $2';
                params = [credentials.username, 'active'];
            }

            const result = await pool.query(query, params);
            
            if (result.rows.length === 0) {
                return { success: false, message: '用户不存在或已被禁用' };
            }

            const user = result.rows[0];
            
            // 验证密码
            const isValidPassword = await bcrypt.compare(credentials.password, user.password_hash);
            
            if (!isValidPassword) {
                return { success: false, message: '密码错误' };
            }

            // 生成简单的token（实际应用中应该使用JWT）
            const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');

            await pool.end();

            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    displayName: user.display_name || user.username
                },
                token: token
            };
        } catch (error) {
            logger.error('Fallback login error:', error);
            return { success: false, message: '登录失败，请稍后重试' };
        }
    }

    async logout() {
        try {
            const response = await this.client.post('/api/auth/logout');
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // 健康检查
    async healthCheck() {
        try {
            const response = await this.client.get('/health');
            return response.data;
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    // 错误处理
    handleError(error) {
        const errorResponse = {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        };

        if (error.response?.status === 401) {
            errorResponse.message = 'Unauthorized access';
        } else if (error.response?.status === 403) {
            errorResponse.message = 'Forbidden access';
        } else if (error.response?.status === 404) {
            errorResponse.message = 'Resource not found';
        } else if (error.response?.status >= 500) {
            errorResponse.message = 'Internal server error';
        }

        return errorResponse;
    }
}

module.exports = APIClient; 