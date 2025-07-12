const axios = require('axios');
const crypto = require('crypto');
const { BaseBot } = require('./BaseBot');

class IntercomBot extends BaseBot {
  constructor(config) {
    super(config);
    this.platform = 'intercom';
    this.accessToken = config.access_token;
    this.appId = config.app_id;
    this.secretKey = config.secret_key;
    this.baseURL = config.region === 'eu' ? 'https://api.eu.intercom.io' : 
                   config.region === 'au' ? 'https://api.au.intercom.io' : 
                   'https://api.intercom.io';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Intercom-Version': '2.13'
      },
      timeout: 30000
    });

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug('Intercom API request', {
          method: config.method,
          url: config.url,
          data: config.data
        });
        return config;
      },
      (error) => {
        this.logger.error('Intercom request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug('Intercom API response', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        this.logger.error('Intercom response error', {
          status: error.response?.status,
          message: error.response?.data?.errors?.[0]?.message || error.message,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  // 验证webhook签名
  verifyWebhookSignature(payload, signature, timestamp) {
    try {
      if (!this.secretKey) {
        this.logger.warn('No secret key configured for webhook verification');
        return true; // 如果没有配置密钥，跳过验证
      }

      // Intercom使用HMAC SHA256签名
      const expectedSignature = crypto
        .createHmac('sha256', this.secretKey)
        .update(payload)
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      this.logger.error('Webhook signature verification failed', {
        error: error.message
      });
      return false;
    }
  }

  // 发送消息
  async sendMessage(conversationId, message, options = {}) {
    try {
      const payload = {
        message_type: 'comment',
        type: 'admin',
        admin_id: options.adminId || this.config.default_admin_id,
        body: message.text || message.content
      };

      // 处理附件
      if (message.attachments && message.attachments.length > 0) {
        payload.attachment_urls = message.attachments
          .filter(att => att.type === 'image' || att.type === 'file')
          .map(att => att.url)
          .slice(0, 10); // Intercom限制最多10个附件
      }

      const response = await this.client.post(
        `/conversations/${conversationId}/reply`,
        payload
      );

      this.logger.info('Message sent successfully', {
        conversationId,
        messageId: response.data.id
      });

      return {
        success: true,
        messageId: response.data.id,
        conversationId: response.data.conversation_id,
        timestamp: response.data.created_at
      };

    } catch (error) {
      this.logger.error('Failed to send message', {
        conversationId,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        code: error.response?.status
      };
    }
  }

  // 创建对话
  async createConversation(contactId, message, options = {}) {
    try {
      const payload = {
        from: {
          type: options.contactType || 'user',
          id: contactId
        },
        body: message.text || message.content
      };

      if (options.created_at) {
        payload.created_at = options.created_at;
      }

      const response = await this.client.post('/conversations', payload);

      this.logger.info('Conversation created successfully', {
        conversationId: response.data.conversation_id,
        contactId
      });

      return {
        success: true,
        conversationId: response.data.conversation_id,
        messageId: response.data.id,
        messageType: response.data.message_type
      };

    } catch (error) {
      this.logger.error('Failed to create conversation', {
        contactId,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        code: error.response?.status
      };
    }
  }

  // 获取对话详情
  async getConversation(conversationId, options = {}) {
    try {
      const params = {};
      if (options.display_as === 'plaintext') {
        params.display_as = 'plaintext';
      }

      const response = await this.client.get(
        `/conversations/${conversationId}`,
        { params }
      );

      const conversation = response.data;
      
      return {
        success: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          state: conversation.state,
          open: conversation.open,
          read: conversation.read,
          priority: conversation.priority,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
          waiting_since: conversation.waiting_since,
          assignee: {
            admin_id: conversation.admin_assignee_id,
            team_id: conversation.team_assignee_id
          },
          contacts: conversation.contacts?.contacts || [],
          teammates: conversation.teammates?.teammates || [],
          tags: conversation.tags?.tags || [],
          parts: conversation.conversation_parts?.conversation_parts || [],
          statistics: conversation.statistics,
          ai_agent_participated: conversation.ai_agent_participated,
          rating: conversation.conversation_rating
        }
      };

    } catch (error) {
      this.logger.error('Failed to get conversation', {
        conversationId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        code: error.response?.status
      };
    }
  }

  // 搜索对话
  async searchConversations(query, options = {}) {
    try {
      const payload = {
        query: query,
        pagination: {
          per_page: options.per_page || 20,
          starting_after: options.starting_after
        }
      };

      const response = await this.client.post('/conversations/search', payload);

      return {
        success: true,
        conversations: response.data.conversations || [],
        total_count: response.data.total_count,
        pages: response.data.pages
      };

    } catch (error) {
      this.logger.error('Failed to search conversations', {
        query,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        code: error.response?.status
      };
    }
  }

  // 管理对话（关闭、分配、暂停等）
  async manageConversation(conversationId, action, options = {}) {
    try {
      let payload = {
        type: 'admin',
        admin_id: options.adminId || this.config.default_admin_id
      };

      switch (action) {
        case 'close':
          payload.message_type = 'close';
          if (options.message) {
            payload.body = options.message;
          }
          break;

        case 'assign':
          payload.message_type = 'assignment';
          if (options.assignee_id) {
            payload.assignee_id = options.assignee_id;
          }
          if (options.team_id) {
            payload.team_id = options.team_id;
          }
          break;

        case 'snooze':
          payload.message_type = 'snoozed';
          payload.snoozed_until = options.snoozed_until;
          break;

        case 'open':
          payload.message_type = 'open';
          break;

        default:
          throw new Error(`Unsupported action: ${action}`);
      }

      const response = await this.client.post(
        `/conversations/${conversationId}/parts`,
        payload
      );

      this.logger.info('Conversation managed successfully', {
        conversationId,
        action,
        newState: response.data.state
      });

      return {
        success: true,
        conversation: response.data,
        action: action
      };

    } catch (error) {
      this.logger.error('Failed to manage conversation', {
        conversationId,
        action,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        code: error.response?.status
      };
    }
  }

  // 添加标签
  async addTag(conversationId, tagId, adminId) {
    try {
      const response = await this.client.post(
        `/conversations/${conversationId}/tags`,
        {
          id: tagId,
          admin_id: adminId || this.config.default_admin_id
        }
      );

      return {
        success: true,
        tag: response.data
      };

    } catch (error) {
      this.logger.error('Failed to add tag', {
        conversationId,
        tagId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // 获取或创建联系人
  async getOrCreateContact(identifier, options = {}) {
    try {
      let contact;
      
      if (identifier.email) {
        // 通过邮箱查找联系人
        const searchResult = await this.client.post('/contacts/search', {
          query: {
            field: 'email',
            operator: '=',
            value: identifier.email
          }
        });

        if (searchResult.data.data && searchResult.data.data.length > 0) {
          contact = searchResult.data.data[0];
        }
      }

      if (!contact) {
        // 创建新联系人
        const payload = {
          role: options.role || 'user'
        };

        if (identifier.email) payload.email = identifier.email;
        if (identifier.user_id) payload.user_id = identifier.user_id;
        if (identifier.external_id) payload.external_id = identifier.external_id;
        if (options.name) payload.name = options.name;
        if (options.phone) payload.phone = options.phone;
        if (options.custom_attributes) {
          payload.custom_attributes = options.custom_attributes;
        }

        const createResponse = await this.client.post('/contacts', payload);
        contact = createResponse.data;
      }

      return {
        success: true,
        contact: contact,
        created: !contact.id // 如果没有id表示是新创建的
      };

    } catch (error) {
      this.logger.error('Failed to get or create contact', {
        identifier,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // 处理webhook事件
  async processWebhook(payload, signature, timestamp) {
    try {
      // 验证签名
      if (!this.verifyWebhookSignature(JSON.stringify(payload), signature, timestamp)) {
        this.logger.warn('Invalid webhook signature');
        return { success: false, error: 'Invalid signature' };
      }

      const eventType = payload.topic;
      const eventData = payload.data;

      this.logger.info('Processing Intercom webhook', {
        type: eventType,
        id: eventData?.item?.id
      });

      let processedEvent = null;

      switch (eventType) {
        case 'conversation.user.created':
        case 'conversation.user.replied':
        case 'conversation.admin.replied':
          processedEvent = await this.handleConversationEvent(eventData);
          break;

        case 'conversation.admin.assigned':
          processedEvent = await this.handleAssignmentEvent(eventData);
          break;

        case 'conversation.admin.closed':
          processedEvent = await this.handleCloseEvent(eventData);
          break;

        case 'contact.created':
        case 'contact.signed_up':
          processedEvent = await this.handleContactEvent(eventData);
          break;

        default:
          this.logger.debug('Unhandled webhook event type', { type: eventType });
          return { success: true, message: 'Event type not processed' };
      }

      if (processedEvent) {
        // 发送到消息处理器
        await this.notifyMessageProcessor(processedEvent);
      }

      return { success: true, processed: processedEvent };

    } catch (error) {
      this.logger.error('Webhook processing failed', {
        error: error.message,
        payload: payload
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // 处理对话事件
  async handleConversationEvent(eventData) {
    const conversation = eventData.item;
    const initiator = eventData.initiator;

    return {
      type: 'conversation',
      platform: this.platform,
      conversationId: conversation.id,
      event: {
        type: eventData.type || 'message',
        created_at: conversation.created_at,
        updated_at: conversation.updated_at
      },
      message: {
        id: conversation.source?.id,
        content: conversation.source?.body,
        type: conversation.source?.type,
        author: conversation.source?.author
      },
      contacts: conversation.contacts?.contacts || [],
      assignee: {
        admin_id: conversation.admin_assignee_id,
        team_id: conversation.team_assignee_id
      },
      state: conversation.state,
      priority: conversation.priority,
      tags: conversation.tags?.tags || []
    };
  }

  // 处理分配事件
  async handleAssignmentEvent(eventData) {
    const conversation = eventData.item;
    
    return {
      type: 'assignment',
      platform: this.platform,
      conversationId: conversation.id,
      assignee: {
        admin_id: conversation.admin_assignee_id,
        team_id: conversation.team_assignee_id
      },
      assigned_by: eventData.initiator,
      timestamp: Date.now()
    };
  }

  // 处理关闭事件
  async handleCloseEvent(eventData) {
    const conversation = eventData.item;
    
    return {
      type: 'close',
      platform: this.platform,
      conversationId: conversation.id,
      closed_by: eventData.initiator,
      timestamp: Date.now(),
      final_state: conversation.state
    };
  }

  // 处理联系人事件
  async handleContactEvent(eventData) {
    const contact = eventData.item;
    
    return {
      type: 'contact',
      platform: this.platform,
      contact: {
        id: contact.id,
        email: contact.email,
        name: contact.name,
        phone: contact.phone,
        role: contact.role,
        created_at: contact.created_at,
        custom_attributes: contact.custom_attributes
      },
      event_type: eventData.type
    };
  }

  // 健康检查
  async healthCheck() {
    try {
      const response = await this.client.get('/me');
      
      return {
        status: 'healthy',
        platform: this.platform,
        admin: response.data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        platform: this.platform,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // 获取平台特定信息
  getPlatformInfo() {
    return {
      platform: this.platform,
      name: 'Intercom',
      features: [
        'conversations',
        'contacts',
        'messages',
        'tags',
        'assignments',
        'rich_media',
        'webhooks',
        'search',
        'tickets',
        'ai_agent'
      ],
      capabilities: {
        send_messages: true,
        receive_messages: true,
        file_attachments: true,
        rich_formatting: true,
        typing_indicators: false,
        read_receipts: true,
        group_conversations: true,
        conversation_management: true,
        contact_management: true,
        tagging: true,
        search: true,
        analytics: true
      },
      webhook_events: [
        'conversation.user.created',
        'conversation.user.replied', 
        'conversation.admin.replied',
        'conversation.admin.assigned',
        'conversation.admin.closed',
        'contact.created',
        'contact.signed_up'
      ]
    };
  }
}

module.exports = IntercomBot; 