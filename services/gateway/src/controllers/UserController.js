const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../../../../config/config');

class UserController {
  constructor() {
    this.messageProcessorUrl = `http://localhost:${config.services.messageProcessor.port}`;
  }

  // 获取用户列表
  async getUsers(req, res) {
    try {
      const { page = 1, limit = 20, search, role } = req.query;
      const tenantId = req.user.tenantId;

      const response = await axios.get(`${this.messageProcessorUrl}/users`, {
        params: { page, limit, search, role, tenantId },
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Get users error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to get users',
        message: error.message
      });
    }
  }

  // 获取用户详情
  async getUserById(req, res) {
    try {
      const { userId } = req.params;
      const tenantId = req.user.tenantId;

      const response = await axios.get(`${this.messageProcessorUrl}/users/${userId}`, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Get user error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to get user',
        message: error.message
      });
    }
  }

  // 创建用户
  async createUser(req, res) {
    try {
      const userData = req.body;
      userData.tenantId = req.user.tenantId;

      const response = await axios.post(`${this.messageProcessorUrl}/users`, userData, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': req.user.tenantId
        }
      });

      res.status(201).json(response.data);
    } catch (error) {
      logger.error('Create user error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to create user',
        message: error.message
      });
    }
  }

  // 更新用户
  async updateUser(req, res) {
    try {
      const { userId } = req.params;
      const updates = req.body;
      const tenantId = req.user.tenantId;

      const response = await axios.put(`${this.messageProcessorUrl}/users/${userId}`, updates, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Update user error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to update user',
        message: error.message
      });
    }
  }

  // 删除用户
  async deleteUser(req, res) {
    try {
      const { userId } = req.params;
      const tenantId = req.user.tenantId;

      const response = await axios.delete(`${this.messageProcessorUrl}/users/${userId}`, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Delete user error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to delete user',
        message: error.message
      });
    }
  }

  // 获取用户统计
  async getUserStats(req, res) {
    try {
      const tenantId = req.user.tenantId;

      const response = await axios.get(`${this.messageProcessorUrl}/users/stats`, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Get user stats error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to get user stats',
        message: error.message
      });
    }
  }
}

module.exports = new UserController(); 