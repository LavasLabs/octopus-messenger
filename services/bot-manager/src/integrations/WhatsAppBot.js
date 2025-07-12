const axios = require('axios');
const logger = require('../utils/logger');

class WhatsAppBot {
  constructor(options) {
    this.id = options.id;
    this.accessToken = options.token;
    this.phoneNumberId = options.phoneNumberId || options.config?.phoneNumberId;
    this.config = options.config || {};
    this.webhookUrl = options.webhookUrl;
    this.verifyToken = options.verifyToken || options.config?.verifyToken;
    this.onMessage = options.onMessage;
    this.onError = options.onError;
    this.baseUrl = 'https://graph.facebook.com/v18.0';
    this.isRunning = false;
    this.businessAccountId = options.config?.businessAccountId;
    this.appId = options.config?.appId;
    this.appSecret = options.config?.appSecret;
  }

  async start() {
    try {
      logger.info('Starting WhatsApp Bot', { 
        botId: this.id,
        phoneNumberId: this.phoneNumberId
      });

      // 验证访问令牌
      await this.validateAccessToken();

      // 设置 webhook（如果配置了）
      if (this.webhookUrl) {
        await this.setupWebhook();
      }

      this.isRunning = true;
      logger.info('WhatsApp Bot started successfully', { botId: this.id });
    } catch (error) {
      logger.error('Failed to start WhatsApp Bot', { 
        botId: this.id,
        error: error.message 
      });
      throw error;
    }
  }

  async stop() {
    try {
      logger.info('Stopping WhatsApp Bot', { botId: this.id });
      this.isRunning = false;
      logger.info('WhatsApp Bot stopped successfully', { botId: this.id });
    } catch (error) {
      logger.error('Failed to stop WhatsApp Bot', { 
        botId: this.id,
        error: error.message 
      });
      throw error;
    }
  }

  async sendMessage(messageData) {
    try {
      const { chatId, text, type = 'text', options = {} } = messageData;

      const payload = {
        messaging_product: 'whatsapp',
        to: chatId,
        type: type
      };

      switch (type) {
        case 'text':
          payload.text = { body: text };
          break;
        case 'image':
          payload.image = {
            link: options.imageUrl || text,
            caption: options.caption || ''
          };
          break;
        case 'document':
          payload.document = {
            link: options.documentUrl || text,
            caption: options.caption || '',
            filename: options.filename || 'document'
          };
          break;
        case 'audio':
          payload.audio = {
            link: options.audioUrl || text
          };
          break;
        case 'video':
          payload.video = {
            link: options.videoUrl || text,
            caption: options.caption || ''
          };
          break;
        case 'template':
          payload.template = {
            name: options.templateName,
            language: { code: options.language || 'zh_CN' },
            components: options.components || []
          };
          break;
        case 'interactive':
          payload.interactive = options.interactive;
          break;
        default:
          payload.text = { body: text };
      }

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('WhatsApp message sent successfully', {
        botId: this.id,
        messageId: response.data.messages[0].id,
        to: chatId,
        type: type
      });

      return {
        success: true,
        messageId: response.data.messages[0].id,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to send WhatsApp message', {
        botId: this.id,
        error: error.message,
        chatId: messageData.chatId
      });

      if (this.onError) {
        this.onError(error);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  async handleWebhook(data) {
    try {
      logger.info('Received WhatsApp webhook', {
        botId: this.id,
        object: data.object,
        entryCount: data.entry?.length || 0
      });

      if (data.object !== 'whatsapp_business_account') {
        logger.warn('Unexpected webhook object type', {
          botId: this.id,
          object: data.object
        });
        return;
      }

      for (const entry of data.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === 'messages') {
            await this.processMessages(change.value);
          } else if (change.field === 'message_delivery_updates') {
            await this.processDeliveryUpdates(change.value);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to handle WhatsApp webhook', {
        botId: this.id,
        error: error.message
      });

      if (this.onError) {
        this.onError(error);
      }
    }
  }

  async processMessages(messageData) {
    try {
      const { messages, contacts, metadata } = messageData;

      if (!messages || messages.length === 0) {
        return;
      }

      for (const message of messages) {
        const contact = contacts?.find(c => c.wa_id === message.from);
        const contactName = contact?.profile?.name || message.from;

        const standardMessage = await this.convertToStandardFormat(message, contactName);
        
        if (this.onMessage) {
          await this.onMessage(standardMessage);
        }
      }
    } catch (error) {
      logger.error('Failed to process WhatsApp messages', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async processDeliveryUpdates(updateData) {
    try {
      logger.info('WhatsApp delivery update received', {
        botId: this.id,
        statuses: updateData.statuses?.length || 0
      });

      // 处理消息状态更新（已发送、已送达、已读等）
      for (const status of updateData.statuses || []) {
        logger.debug('Message status update', {
          botId: this.id,
          messageId: status.id,
          status: status.status,
          timestamp: status.timestamp
        });
      }
    } catch (error) {
      logger.error('Failed to process WhatsApp delivery updates', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async convertToStandardFormat(message, senderName) {
    const standardMessage = {
      id: message.id,
      platform: 'whatsapp',
      chatId: message.from,
      senderId: message.from,
      senderName: senderName,
      timestamp: new Date(parseInt(message.timestamp) * 1000),
      type: message.type,
      text: '',
      attachments: [],
      metadata: {
        phoneNumber: message.from,
        context: message.context || null,
        forwarded: message.forwarded || false
      }
    };

    switch (message.type) {
      case 'text':
        standardMessage.text = message.text.body;
        break;
      case 'image':
        standardMessage.text = message.image.caption || '';
        standardMessage.attachments.push({
          type: 'image',
          url: await this.getMediaUrl(message.image.id),
          mimeType: message.image.mime_type,
          caption: message.image.caption
        });
        break;
      case 'document':
        standardMessage.text = message.document.caption || message.document.filename || '';
        standardMessage.attachments.push({
          type: 'document',
          url: await this.getMediaUrl(message.document.id),
          mimeType: message.document.mime_type,
          filename: message.document.filename,
          caption: message.document.caption
        });
        break;
      case 'audio':
        standardMessage.attachments.push({
          type: 'audio',
          url: await this.getMediaUrl(message.audio.id),
          mimeType: message.audio.mime_type
        });
        break;
      case 'video':
        standardMessage.text = message.video.caption || '';
        standardMessage.attachments.push({
          type: 'video',
          url: await this.getMediaUrl(message.video.id),
          mimeType: message.video.mime_type,
          caption: message.video.caption
        });
        break;
      case 'location':
        standardMessage.text = `位置: ${message.location.name || '未知位置'}`;
        standardMessage.attachments.push({
          type: 'location',
          latitude: message.location.latitude,
          longitude: message.location.longitude,
          name: message.location.name,
          address: message.location.address
        });
        break;
      case 'contacts':
        standardMessage.text = '联系人信息';
        standardMessage.attachments.push({
          type: 'contacts',
          contacts: message.contacts
        });
        break;
      case 'interactive':
        if (message.interactive.type === 'button_reply') {
          standardMessage.text = message.interactive.button_reply.title;
          standardMessage.metadata.buttonId = message.interactive.button_reply.id;
        } else if (message.interactive.type === 'list_reply') {
          standardMessage.text = message.interactive.list_reply.title;
          standardMessage.metadata.listId = message.interactive.list_reply.id;
        }
        break;
      case 'button':
        standardMessage.text = message.button.text;
        standardMessage.metadata.buttonPayload = message.button.payload;
        break;
      default:
        standardMessage.text = `未支持的消息类型: ${message.type}`;
    }

    return standardMessage;
  }

  async getMediaUrl(mediaId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${mediaId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      return response.data.url;
    } catch (error) {
      logger.error('Failed to get WhatsApp media URL', {
        botId: this.id,
        mediaId,
        error: error.message
      });
      return null;
    }
  }

  async validateAccessToken() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.phoneNumberId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      logger.info('WhatsApp access token validated', {
        botId: this.id,
        phoneNumber: response.data.display_phone_number
      });

      return true;
    } catch (error) {
      logger.error('WhatsApp access token validation failed', {
        botId: this.id,
        error: error.message
      });
      throw new Error('Invalid WhatsApp access token');
    }
  }

  async setupWebhook() {
    try {
      logger.info('Setting up WhatsApp webhook', {
        botId: this.id,
        webhookUrl: this.webhookUrl
      });

      // WhatsApp webhook 设置通常在 Meta 开发者控制台中完成
      // 这里只是记录日志
      logger.info('WhatsApp webhook configuration should be done in Meta Developer Console');
    } catch (error) {
      logger.error('Failed to setup WhatsApp webhook', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async markAsRead(messageId) {
    try {
      await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.debug('WhatsApp message marked as read', {
        botId: this.id,
        messageId
      });
    } catch (error) {
      logger.error('Failed to mark WhatsApp message as read', {
        botId: this.id,
        messageId,
        error: error.message
      });
    }
  }

  async getBusinessProfile() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.phoneNumberId}/whatsapp_business_profile`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      return response.data.data[0];
    } catch (error) {
      logger.error('Failed to get WhatsApp business profile', {
        botId: this.id,
        error: error.message
      });
      return null;
    }
  }

  getStatus() {
    return {
      id: this.id,
      platform: 'whatsapp',
      isRunning: this.isRunning,
      phoneNumberId: this.phoneNumberId,
      config: {
        autoReply: this.config.autoReply || false,
        businessHours: this.config.businessHours || null
      }
    };
  }
}

module.exports = WhatsAppBot; 