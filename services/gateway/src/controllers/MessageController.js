const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../../../../config/config');

class MessageController {
  constructor() {
    this.messageProcessorUrl = `http://localhost:${config.services.messageProcessor.port}`;
    this.aiServiceUrl = `http://localhost:${config.services.aiService.port}`;
  }

  // 获取消息列表
  async getMessages(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        platform, 
        search, 
        status,
        startDate,
        endDate 
      } = req.query;
      const tenantId = req.user.tenantId;

      const response = await axios.get(`${this.messageProcessorUrl}/messages`, {
        params: { 
          page, 
          limit, 
          platform, 
          search, 
          status,
          startDate,
          endDate,
          tenantId 
        },
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Get messages error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to get messages',
        message: error.message
      });
    }
  }

  // 获取消息详情
  async getMessageById(req, res) {
    try {
      const { messageId } = req.params;
      const tenantId = req.user.tenantId;

      const response = await axios.get(`${this.messageProcessorUrl}/messages/${messageId}`, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Get message error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to get message',
        message: error.message
      });
    }
  }

  // 处理消息
  async processMessage(req, res) {
    try {
      const messageData = req.body;
      messageData.tenantId = req.user.tenantId;

      const response = await axios.post(`${this.messageProcessorUrl}/messages/process`, messageData, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': req.user.tenantId
        }
      });

      res.status(201).json(response.data);
    } catch (error) {
      logger.error('Process message error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to process message',
        message: error.message
      });
    }
  }

  // 重新处理消息
  async reprocessMessage(req, res) {
    try {
      const { messageId } = req.params;
      const tenantId = req.user.tenantId;

      const response = await axios.post(`${this.messageProcessorUrl}/messages/${messageId}/reprocess`, {}, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Reprocess message error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to reprocess message',
        message: error.message
      });
    }
  }

  // 获取消息统计
  async getMessageStats(req, res) {
    try {
      const { period = '7d', platform } = req.query;
      const tenantId = req.user.tenantId;

      const response = await axios.get(`${this.messageProcessorUrl}/messages/stats`, {
        params: { period, platform, tenantId },
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Get message stats error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to get message stats',
        message: error.message
      });
    }
  }

  // 批量处理消息
  async bulkProcessMessages(req, res) {
    try {
      const { messageIds, action } = req.body;
      const tenantId = req.user.tenantId;

      const response = await axios.post(`${this.messageProcessorUrl}/messages/bulk`, {
        messageIds,
        action,
        tenantId
      }, {
        headers: {
          'Authorization': req.headers.authorization,
          'X-Tenant-ID': tenantId
        }
      });

      res.json(response.data);
    } catch (error) {
      logger.error('Bulk process messages error:', error);
      res.status(error.response?.status || 500).json({
        error: 'Failed to bulk process messages',
        message: error.message
      });
    }
  }
}

module.exports = new MessageController(); 