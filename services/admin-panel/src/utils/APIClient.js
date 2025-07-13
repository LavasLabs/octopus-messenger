const axios = require('axios');
const logger = require('./logger');

class APIClient {
    constructor(baseURL = 'http://gateway:3000', timeout = 30000) {
        this.client = axios.create({
            baseURL,
            timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // 请求拦截器
        this.client.interceptors.request.use(
            (config) => {
                logger.debug('API Request:', {
                    method: config.method,
                    url: config.url,
                    data: config.data
                });
                return config;
            },
            (error) => {
                logger.error('API Request Error:', error);
                return Promise.reject(error);
            }
        );

        // 响应拦截器
        this.client.interceptors.response.use(
            (response) => {
                logger.debug('API Response:', {
                    status: response.status,
                    data: response.data
                });
                return response;
            },
            (error) => {
                logger.error('API Response Error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message
                });
                return Promise.reject(error);
            }
        );
    }

    setAuthToken(token) {
        this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    handleError(error) {
        const message = error.response?.data?.message || error.message || 'Unknown error';
        const status = error.response?.status || 500;
        return { error: message, status };
    }

    // ===============================
    // 认证相关API
    // ===============================
    async login(credentials) {
        try {
            const response = await this.client.post('/api/auth/login', credentials);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async register(userData) {
        try {
            const response = await this.client.post('/api/auth/register', userData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async verifyToken() {
        try {
            const response = await this.client.get('/api/auth/verify');
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // ===============================
    // 用户管理API
    // ===============================
    async getUsers(params = {}) {
        try {
            const response = await this.client.get('/api/users', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getUserById(userId) {
        try {
            const response = await this.client.get(`/api/users/${userId}`);
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

    // ===============================
    // 消息管理API
    // ===============================
    async getMessages(params = {}) {
        try {
            const response = await this.client.get('/api/messages', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getMessageById(messageId) {
        try {
            const response = await this.client.get(`/api/messages/${messageId}`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async processMessage(messageData) {
        try {
            const response = await this.client.post('/api/messages/process', messageData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async reprocessMessage(messageId) {
        try {
            const response = await this.client.post(`/api/messages/${messageId}/reprocess`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async bulkProcessMessages(messageIds, action) {
        try {
            const response = await this.client.post('/api/messages/bulk', {
                messageIds,
                action
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async classifyMessage(messageId, options = {}) {
        try {
            const response = await this.client.post(`/api/messages/${messageId}/classify`, options);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // ===============================
    // 任务管理API
    // ===============================
    async getTasks(params = {}) {
        try {
            const response = await this.client.get('/api/tasks', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getTaskById(taskId) {
        try {
            const response = await this.client.get(`/api/tasks/${taskId}`);
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

    async deleteTask(taskId) {
        try {
            const response = await this.client.delete(`/api/tasks/${taskId}`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async assignTask(taskId, assigneeId) {
        try {
            const response = await this.client.post(`/api/tasks/${taskId}/assign`, { assigneeId });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async syncTask(taskId, integrationIds) {
        try {
            const response = await this.client.post(`/api/tasks/${taskId}/sync`, { integrationIds });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // ===============================
    // Bot管理API
    // ===============================
    async getBots(params = {}) {
        try {
            const response = await this.client.get('/api/bots', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getBotById(botId) {
        try {
            const response = await this.client.get(`/api/bots/${botId}`);
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

    async getBotStatus(botId) {
        try {
            const response = await this.client.get(`/api/bots/${botId}/status`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async startBot(botId) {
        try {
            const response = await this.client.post(`/api/bots/${botId}/start`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async stopBot(botId) {
        try {
            const response = await this.client.post(`/api/bots/${botId}/stop`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getBotsByMerchant(merchantId) {
        try {
            const response = await this.client.get(`/api/bots/by-merchant/${merchantId}`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // ===============================
    // 商户管理API
    // ===============================
    async getMerchants(params = {}) {
        try {
            const response = await this.client.get('/api/merchants', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getMerchantById(merchantId) {
        try {
            const response = await this.client.get(`/api/merchants/${merchantId}`);
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

    async updateMerchant(merchantId, merchantData) {
        try {
            const response = await this.client.put(`/api/merchants/${merchantId}`, merchantData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async deleteMerchant(merchantId) {
        try {
            const response = await this.client.delete(`/api/merchants/${merchantId}`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getMerchantStats(merchantId, params = {}) {
        try {
            const response = await this.client.get(`/api/merchants/${merchantId}/stats`, { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getMerchantData(merchantId, params = {}) {
        try {
            const response = await this.client.get(`/api/merchants/${merchantId}/data`, { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async createMerchantInviteCode(merchantId, codeData) {
        try {
            const response = await this.client.post(`/api/merchants/${merchantId}/invite-codes`, codeData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getMerchantInviteCodes(merchantId) {
        try {
            const response = await this.client.get(`/api/merchants/${merchantId}/invite-codes`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // ===============================
    // AI分类API
    // ===============================
    async classifyMessageWithAI(messageData, options = {}) {
        try {
            const response = await this.client.post('/api/ai/classify', {
                message: messageData,
                options
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getClassificationRules(params = {}) {
        try {
            const response = await this.client.get('/api/classifications/rules', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async createClassificationRule(ruleData) {
        try {
            const response = await this.client.post('/api/classifications/rules', ruleData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async updateClassificationRule(ruleId, ruleData) {
        try {
            const response = await this.client.put(`/api/classifications/rules/${ruleId}`, ruleData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async deleteClassificationRule(ruleId) {
        try {
            const response = await this.client.delete(`/api/classifications/rules/${ruleId}`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // ===============================
    // 统计和分析API
    // ===============================
    async getStats(params = {}) {
        try {
            const response = await this.client.get('/api/stats', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getDashboardStats() {
        try {
            const response = await this.client.get('/api/stats/dashboard');
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getUserAnalytics(params = {}) {
        try {
            const response = await this.client.get('/api/user-analytics', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // ===============================
    // 租户管理API
    // ===============================
    async getTenants(params = {}) {
        try {
            const response = await this.client.get('/api/tenants', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getTenantById(tenantId) {
        try {
            const response = await this.client.get(`/api/tenants/${tenantId}`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async updateTenant(tenantId, tenantData) {
        try {
            const response = await this.client.put(`/api/tenants/${tenantId}`, tenantData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // ===============================
    // 群组管理API
    // ===============================
    async getGroups(params = {}) {
        try {
            const response = await this.client.get('/api/groups', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getGroupById(groupId) {
        try {
            const response = await this.client.get(`/api/groups/${groupId}`);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async updateGroup(groupId, groupData) {
        try {
            const response = await this.client.put(`/api/groups/${groupId}`, groupData);
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    // ===============================
    // 健康检查
    // ===============================
    async healthCheck() {
        try {
            const response = await this.client.get('/health');
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }
}

module.exports = APIClient; 