const axios = require('axios');
const logger = require('./logger');

class AIServiceClient {
  constructor(config) {
    this.config = config || {};
    this.baseURL = this.config.baseURL || process.env.AI_SERVICE_URL || 'http://localhost:3001';
    this.timeout = this.config.timeout || 30000;
    this.retries = this.config.retries || 3;
    
    // 创建axios实例
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'message-processor/1.0.0'
      }
    });

    // 添加请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        // 添加服务间通信token
        if (process.env.SERVICE_TOKEN) {
          config.headers['x-service-token'] = process.env.SERVICE_TOKEN;
        }
        
        logger.debug('AI Service request', {
          method: config.method,
          url: config.url,
          data: config.data ? 'present' : 'none'
        });
        
        return config;
      },
      (error) => {
        logger.error('AI Service request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // 添加响应拦截器
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('AI Service response', {
          status: response.status,
          url: response.config.url,
          data: response.data ? 'present' : 'none'
        });
        
        return response;
      },
      async (error) => {
        const originalRequest = error.config;
        
        // 重试逻辑
        if (error.code === 'ECONNREFUSED' && !originalRequest._retry && this.retries > 0) {
          originalRequest._retry = true;
          originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
          
          if (originalRequest._retryCount <= this.retries) {
            logger.warn('AI Service connection failed, retrying...', {
              attempt: originalRequest._retryCount,
              maxRetries: this.retries
            });
            
            // 延迟重试
            await new Promise(resolve => setTimeout(resolve, 1000 * originalRequest._retryCount));
            return this.client(originalRequest);
          }
        }
        
        logger.error('AI Service response error', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url
        });
        
        return Promise.reject(error);
      }
    );
  }

  // 处理客服对话
  async processCustomerServiceChat(messageData, options = {}) {
    try {
      const { tenantId, conversationId, userId, message, platform, channel, language } = messageData;
      
      const response = await this.client.post('/api/customer-service/chat', {
        message: message,
        conversationId: conversationId,
        userId: userId,
        platform: platform,
        channel: channel,
        language: language
      }, {
        headers: {
          'x-tenant-id': tenantId,
          'Authorization': options.token ? `Bearer ${options.token}` : undefined
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Customer service chat processing failed', {
        error: error.message,
        messageData: {
          tenantId: messageData.tenantId,
          conversationId: messageData.conversationId,
          userId: messageData.userId
        }
      });
      throw error;
    }
  }

  // 智能分类消息
  async classifyMessage(messageData, options = {}) {
    try {
      const { tenantId, message, platform, userId } = messageData;
      
      const response = await this.client.post('/api/smart-classify/message', {
        message: {
          content: message.content,
          platform: platform,
          userId: userId,
          id: message.id
        },
        options: {
          conversationId: message.conversationId,
          includeContext: options.includeContext || false
        }
      }, {
        headers: {
          'x-tenant-id': tenantId,
          'Authorization': options.token ? `Bearer ${options.token}` : undefined
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Message classification failed', {
        error: error.message,
        messageId: messageData.message?.id,
        tenantId: messageData.tenantId
      });
      throw error;
    }
  }

  // 翻译文本
  async translateText(text, targetLanguage, sourceLanguage, options = {}) {
    try {
      const response = await this.client.post('/api/customer-service/translate', {
        text: text,
        targetLanguage: targetLanguage,
        sourceLanguage: sourceLanguage,
        provider: options.provider
      }, {
        headers: {
          'x-tenant-id': options.tenantId,
          'Authorization': options.token ? `Bearer ${options.token}` : undefined
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Translation failed', {
        error: error.message,
        textLength: text.length,
        targetLanguage: targetLanguage
      });
      throw error;
    }
  }

  // 获取对话历史
  async getConversationHistory(conversationId, options = {}) {
    try {
      const response = await this.client.get(`/api/customer-service/conversation/${conversationId}/history`, {
        params: {
          limit: options.limit || 50
        },
        headers: {
          'x-tenant-id': options.tenantId,
          'Authorization': options.token ? `Bearer ${options.token}` : undefined
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get conversation history', {
        error: error.message,
        conversationId: conversationId
      });
      throw error;
    }
  }

  // 触发人工介入
  async triggerHumanHandoff(conversationId, reason, options = {}) {
    try {
      const response = await this.client.post(`/api/customer-service/handoff/${conversationId}`, {
        reason: reason,
        escalationType: options.escalationType || 'manual',
        assignedAgent: options.assignedAgent
      }, {
        headers: {
          'x-tenant-id': options.tenantId,
          'Authorization': options.token ? `Bearer ${options.token}` : undefined
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to trigger human handoff', {
        error: error.message,
        conversationId: conversationId,
        reason: reason
      });
      throw error;
    }
  }

  // 批量分类消息
  async classifyMessageBatch(messages, options = {}) {
    try {
      const response = await this.client.post('/api/smart-classify/batch', {
        messages: messages.map(msg => ({
          content: msg.content,
          platform: msg.platform,
          userId: msg.userId,
          id: msg.id
        })),
        options: options
      }, {
        headers: {
          'x-tenant-id': options.tenantId,
          'Authorization': options.token ? `Bearer ${options.token}` : undefined
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Batch message classification failed', {
        error: error.message,
        messageCount: messages.length,
        tenantId: options.tenantId
      });
      throw error;
    }
  }

  // 健康检查
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      logger.error('AI Service health check failed', { error: error.message });
      return { status: 'unhealthy', error: error.message };
    }
  }

  // 获取AI服务统计
  async getServiceStats(options = {}) {
    try {
      const response = await this.client.get('/api/analytics/stats', {
        headers: {
          'x-tenant-id': options.tenantId,
          'Authorization': options.token ? `Bearer ${options.token}` : undefined
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get AI service stats', {
        error: error.message,
        tenantId: options.tenantId
      });
      throw error;
    }
  }

  // 生成对话ID
  generateConversationId(tenantId, userId, platform, channelId) {
    const baseId = `${tenantId}_${userId}_${platform}_${channelId || 'default'}`;
    const hash = require('crypto').createHash('md5').update(baseId).digest('hex').substring(0, 16);
    return `conv_${hash}_${Date.now()}`;
  }

  // 检测是否为新对话
  isNewConversation(message, lastMessageTime) {
    // 如果没有最后消息时间，或者超过30分钟，则认为是新对话
    const conversationTimeout = 30 * 60 * 1000; // 30分钟
    const now = new Date();
    
    if (!lastMessageTime || (now - new Date(lastMessageTime)) > conversationTimeout) {
      return true;
    }
    
    return false;
  }

  // 标准化消息数据
  normalizeMessageData(rawMessage, tenantId) {
    return {
      tenantId: tenantId,
      userId: rawMessage.senderId || rawMessage.user_id,
      conversationId: rawMessage.conversationId || rawMessage.conversation_id,
      message: rawMessage.content || rawMessage.text || rawMessage.message,
      platform: rawMessage.platform,
      channel: rawMessage.channelId || rawMessage.channel_id || rawMessage.channel,
      language: rawMessage.language || rawMessage.detected_language,
      messageId: rawMessage.id || rawMessage.message_id,
      timestamp: rawMessage.timestamp || rawMessage.created_at || new Date(),
      metadata: {
        senderName: rawMessage.senderName || rawMessage.sender_name,
        senderUsername: rawMessage.senderUsername || rawMessage.sender_username,
        messageType: rawMessage.messageType || rawMessage.message_type || 'text',
        attachments: rawMessage.attachments || [],
        originalContent: rawMessage.originalContent || rawMessage.original_content
      }
    };
  }
}

module.exports = AIServiceClient; 