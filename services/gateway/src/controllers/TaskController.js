const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../../../../config/config');

class TaskController {
  constructor() {
    this.taskServiceUrl = `http://localhost:${config.services.taskService.port}`;
  }

  // 获取任务列表
  async getTasks(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        priority, 
        category,
        assignedTo,
        search 
      } = req.query;
      const tenantId = req.user.tenantId;

      const response = await axios.get(`${this.taskServiceUrl}/tasks`, {
        params: { 
          page, 
          limit, 
          status, 
          priority, 
          category,
          assignedTo,
          search,
          tenantId 
        },
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Get tasks error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to get tasks',
        message: error.message
      });
    }
  }

  // 获取任务详情
  async getTaskById(req, res) {
    try {
      const { taskId } = req.params;
      const tenantId = req.user.tenantId;

      const response = await axios.get(`${this.taskServiceUrl}/tasks/${taskId}`, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Get task error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to get task',
        message: error.message
      });
    }
  }

  // 创建任务
  async createTask(req, res) {
    try {
      const taskData = req.body;
      taskData.tenantId = req.user.tenantId;

      const response = await axios.post(`${this.taskServiceUrl}/tasks`, taskData, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': req.user.tenantId
        }
      });

      res.status(201).json(response.data);
    } catch (error) {
      logger.error('Create task error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to create task',
        message: error.message
      });
    }
  }

  // 更新任务
  async updateTask(req, res) {
    try {
      const { taskId } = req.params;
      const updates = req.body;
      const tenantId = req.user.tenantId;

      const response = await axios.put(`${this.taskServiceUrl}/tasks/${taskId}`, updates, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Update task error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to update task',
        message: error.message
      });
    }
  }

  // 同步任务到CRM
  async syncTaskToCRM(req, res) {
    try {
      const { taskId } = req.params;
      const { integrationIds, strategy } = req.body;
      const tenantId = req.user.tenantId;

      const response = await axios.post(`${this.taskServiceUrl}/tasks/${taskId}/sync`, {
        integrationIds,
        strategy
      }, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Sync task error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to sync task',
        message: error.message
      });
    }
  }

  // 获取任务统计
  async getTaskStats(req, res) {
    try {
      const { period = '7d', groupBy = 'status' } = req.query;
      const tenantId = req.user.tenantId;

      const response = await axios.get(`${this.taskServiceUrl}/tasks/stats`, {
        params: { period, groupBy, tenantId },
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Get task stats error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to get task stats',
        message: error.message
      });
    }
  }

  // 批量操作任务
  async bulkOperateTasks(req, res) {
    try {
      const { taskIds, action, data } = req.body;
      const tenantId = req.user.tenantId;

      const response = await axios.post(`${this.taskServiceUrl}/tasks/bulk`, {
        taskIds,
        action,
        data,
        tenantId
      }, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Bulk operate tasks error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to bulk operate tasks',
        message: error.message
      });
    }
  }

  // 获取CRM集成状态
  async getCRMIntegrations(req, res) {
    try {
      const tenantId = req.user.tenantId;

      const response = await axios.get(`${this.taskServiceUrl}/integrations`, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Get CRM integrations error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to get CRM integrations',
        message: error.message
      });
    }
  }
}

module.exports = new TaskController(); 