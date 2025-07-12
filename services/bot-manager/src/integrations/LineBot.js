const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class LineBot {
  constructor(options) {
    this.id = options.id;
    this.channelAccessToken = options.token;
    this.channelSecret = options.channelSecret || options.config?.channelSecret;
    this.config = options.config || {};
    this.webhookUrl = options.webhookUrl;
    this.onMessage = options.onMessage;
    this.onError = options.onError;
    this.baseUrl = 'https://api.line.me/v2/bot';
    this.isRunning = false;
    this.richMenuId = options.config?.richMenuId;
  }

  async start() {
    try {
      logger.info('Starting Line Bot', { 
        botId: this.id,
        hasRichMenu: !!this.richMenuId
      });

      // 验证访问令牌
      await this.validateToken();

      // 设置 Rich Menu（如果配置了）
      if (this.config.richMenu) {
        await this.setupRichMenu();
      }

      this.isRunning = true;
      logger.info('Line Bot started successfully', { botId: this.id });
    } catch (error) {
      logger.error('Failed to start Line Bot', { 
        botId: this.id,
        error: error.message 
      });
      throw error;
    }
  }

  async stop() {
    try {
      logger.info('Stopping Line Bot', { botId: this.id });
      this.isRunning = false;
      logger.info('Line Bot stopped successfully', { botId: this.id });
    } catch (error) {
      logger.error('Failed to stop Line Bot', { 
        botId: this.id,
        error: error.message 
      });
      throw error;
    }
  }

  async sendMessage(messageData) {
    try {
      const { chatId, text, type = 'text', options = {} } = messageData;

      let message;

      switch (type) {
        case 'text':
          message = {
            type: 'text',
            text: text
          };
          break;
        case 'image':
          message = {
            type: 'image',
            originalContentUrl: options.originalContentUrl || text,
            previewImageUrl: options.previewImageUrl || text
          };
          break;
        case 'video':
          message = {
            type: 'video',
            originalContentUrl: options.originalContentUrl || text,
            previewImageUrl: options.previewImageUrl || text
          };
          break;
        case 'audio':
          message = {
            type: 'audio',
            originalContentUrl: options.originalContentUrl || text,
            duration: options.duration || 1000
          };
          break;
        case 'file':
          message = {
            type: 'file',
            originalContentUrl: options.originalContentUrl || text,
            previewImageUrl: options.previewImageUrl || text
          };
          break;
        case 'location':
          message = {
            type: 'location',
            title: options.title || '位置',
            address: options.address || text,
            latitude: options.latitude,
            longitude: options.longitude
          };
          break;
        case 'sticker':
          message = {
            type: 'sticker',
            packageId: options.packageId || '1',
            stickerId: options.stickerId || '1'
          };
          break;
        case 'imagemap':
          message = {
            type: 'imagemap',
            baseUrl: options.baseUrl,
            altText: options.altText || text,
            baseSize: options.baseSize || { width: 1040, height: 1040 },
            actions: options.actions || []
          };
          break;
        case 'template':
          message = {
            type: 'template',
            altText: options.altText || text,
            template: options.template
          };
          break;
        case 'flex':
          message = {
            type: 'flex',
            altText: options.altText || text,
            contents: options.contents
          };
          break;
        default:
          message = {
            type: 'text',
            text: text
          };
      }

      // 添加 Quick Reply
      if (options.quickReply) {
        message.quickReply = {
          items: options.quickReply.map(item => ({
            type: 'action',
            action: item
          }))
        };
      }

      const payload = {
        to: chatId,
        messages: [message]
      };

      const response = await this.callLineAPI('message/push', payload);

      logger.info('Line message sent successfully', {
        botId: this.id,
        to: chatId,
        type: type
      });

      return {
        success: true,
        messageId: response.sentMessages?.[0]?.id,
        data: response
      };
    } catch (error) {
      logger.error('Failed to send Line message', {
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
      logger.info('Received Line webhook', {
        botId: this.id,
        events: data.events?.length || 0
      });

      if (!data.events || data.events.length === 0) {
        return { status: 'no_events' };
      }

      for (const event of data.events) {
        await this.handleEvent(event);
      }

      return { status: 'ok' };
    } catch (error) {
      logger.error('Failed to handle Line webhook', {
        botId: this.id,
        error: error.message
      });

      if (this.onError) {
        this.onError(error);
      }

      return { status: 'error', error: error.message };
    }
  }

  async handleEvent(event) {
    try {
      logger.debug('Handling Line event', {
        botId: this.id,
        eventType: event.type,
        userId: event.source?.userId,
        groupId: event.source?.groupId
      });

      switch (event.type) {
        case 'message':
          await this.handleMessage(event);
          break;
        case 'follow':
          await this.handleFollow(event);
          break;
        case 'unfollow':
          await this.handleUnfollow(event);
          break;
        case 'join':
          await this.handleJoin(event);
          break;
        case 'leave':
          await this.handleLeave(event);
          break;
        case 'postback':
          await this.handlePostback(event);
          break;
        case 'beacon':
          await this.handleBeacon(event);
          break;
        case 'accountLink':
          await this.handleAccountLink(event);
          break;
        case 'things':
          await this.handleThings(event);
          break;
        default:
          logger.debug('Unhandled Line event type', {
            botId: this.id,
            eventType: event.type
          });
      }
    } catch (error) {
      logger.error('Failed to handle Line event', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async handleMessage(event) {
    try {
      const userProfile = await this.getUserProfile(event.source.userId);
      const standardMessage = await this.convertToStandardFormat(event, userProfile);

      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }
    } catch (error) {
      logger.error('Failed to handle Line message', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async handleFollow(event) {
    try {
      logger.info('Line user followed', {
        botId: this.id,
        userId: event.source.userId
      });

      // 发送欢迎消息
      if (this.config.welcomeMessage) {
        await this.sendMessage({
          chatId: event.source.userId,
          text: this.config.welcomeMessage,
          type: 'text'
        });
      }
    } catch (error) {
      logger.error('Failed to handle Line follow', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async handleUnfollow(event) {
    try {
      logger.info('Line user unfollowed', {
        botId: this.id,
        userId: event.source.userId
      });
    } catch (error) {
      logger.error('Failed to handle Line unfollow', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async handlePostback(event) {
    try {
      logger.info('Line postback received', {
        botId: this.id,
        userId: event.source.userId,
        data: event.postback.data
      });

      const userProfile = await this.getUserProfile(event.source.userId);
      const standardMessage = {
        id: event.replyToken,
        platform: 'line',
        chatId: this.getChatId(event.source),
        senderId: event.source.userId,
        senderName: userProfile?.displayName || event.source.userId,
        timestamp: new Date(event.timestamp),
        type: 'postback',
        text: event.postback.data,
        metadata: {
          postbackData: event.postback.data,
          params: event.postback.params || null
        }
      };

      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }
    } catch (error) {
      logger.error('Failed to handle Line postback', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async convertToStandardFormat(event, userProfile) {
    const standardMessage = {
      id: event.message.id,
      platform: 'line',
      chatId: this.getChatId(event.source),
      senderId: event.source.userId,
      senderName: userProfile?.displayName || event.source.userId,
      timestamp: new Date(event.timestamp),
      type: event.message.type,
      text: '',
      attachments: [],
      metadata: {
        replyToken: event.replyToken,
        sourceType: event.source.type,
        userId: event.source.userId,
        groupId: event.source.groupId || null,
        roomId: event.source.roomId || null
      }
    };

    const message = event.message;

    switch (message.type) {
      case 'text':
        standardMessage.text = message.text;
        break;
      case 'image':
        standardMessage.attachments.push({
          type: 'image',
          id: message.id,
          contentProvider: message.contentProvider
        });
        break;
      case 'video':
        standardMessage.attachments.push({
          type: 'video',
          id: message.id,
          duration: message.duration,
          contentProvider: message.contentProvider
        });
        break;
      case 'audio':
        standardMessage.attachments.push({
          type: 'audio',
          id: message.id,
          duration: message.duration,
          contentProvider: message.contentProvider
        });
        break;
      case 'file':
        standardMessage.text = message.fileName;
        standardMessage.attachments.push({
          type: 'file',
          id: message.id,
          fileName: message.fileName,
          fileSize: message.fileSize
        });
        break;
      case 'location':
        standardMessage.text = `位置: ${message.title}`;
        standardMessage.attachments.push({
          type: 'location',
          title: message.title,
          address: message.address,
          latitude: message.latitude,
          longitude: message.longitude
        });
        break;
      case 'sticker':
        standardMessage.text = '贴纸';
        standardMessage.attachments.push({
          type: 'sticker',
          packageId: message.packageId,
          stickerId: message.stickerId
        });
        break;
      default:
        standardMessage.text = `未支持的消息类型: ${message.type}`;
    }

    return standardMessage;
  }

  async getUserProfile(userId) {
    try {
      const response = await this.callLineAPI(`profile/${userId}`);
      return response;
    } catch (error) {
      logger.error('Failed to get Line user profile', {
        botId: this.id,
        userId,
        error: error.message
      });
      return null;
    }
  }

  async validateToken() {
    try {
      // 通过获取 bot 信息来验证 token
      const response = await this.callLineAPI('info');
      
      logger.info('Line token validated', {
        botId: this.id,
        botBasicId: response.basicId,
        premiumId: response.premiumId
      });

      return true;
    } catch (error) {
      logger.error('Line token validation failed', {
        botId: this.id,
        error: error.message
      });
      throw new Error('Invalid Line channel access token');
    }
  }

  async callLineAPI(endpoint, payload = null, method = 'GET') {
    try {
      const config = {
        method,
        url: `${this.baseUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.channelAccessToken}`,
          'Content-Type': 'application/json'
        }
      };

      if (payload && (method === 'POST' || method === 'PUT')) {
        config.data = payload;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error('Line API call failed', {
        botId: this.id,
        endpoint,
        method,
        error: error.message
      });
      throw error;
    }
  }

  async setupRichMenu() {
    try {
      logger.info('Setting up Line Rich Menu', { botId: this.id });

      const richMenuConfig = this.config.richMenu;
      
      // 创建 Rich Menu
      const richMenu = await this.callLineAPI('richmenu', richMenuConfig, 'POST');
      this.richMenuId = richMenu.richMenuId;

      // 上传 Rich Menu 图片
      if (richMenuConfig.imageUrl) {
        await this.uploadRichMenuImage(this.richMenuId, richMenuConfig.imageUrl);
      }

      // 设置为默认 Rich Menu
      await this.callLineAPI('user/all/richmenu/' + this.richMenuId, {}, 'POST');

      logger.info('Line Rich Menu setup completed', {
        botId: this.id,
        richMenuId: this.richMenuId
      });
    } catch (error) {
      logger.error('Failed to setup Line Rich Menu', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async uploadRichMenuImage(richMenuId, imageUrl) {
    try {
      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data);

      await axios.post(
        `${this.baseUrl}/richmenu/${richMenuId}/content`,
        imageBuffer,
        {
          headers: {
            'Authorization': `Bearer ${this.channelAccessToken}`,
            'Content-Type': 'image/jpeg'
          }
        }
      );

      logger.info('Rich Menu image uploaded', {
        botId: this.id,
        richMenuId
      });
    } catch (error) {
      logger.error('Failed to upload Rich Menu image', {
        botId: this.id,
        richMenuId,
        error: error.message
      });
      throw error;
    }
  }

  verifySignature(body, signature) {
    try {
      const hash = crypto
        .createHmac('SHA256', this.channelSecret)
        .update(body)
        .digest('base64');

      return hash === signature;
    } catch (error) {
      logger.error('Failed to verify Line signature', {
        botId: this.id,
        error: error.message
      });
      return false;
    }
  }

  getChatId(source) {
    if (source.type === 'user') {
      return source.userId;
    } else if (source.type === 'group') {
      return source.groupId;
    } else if (source.type === 'room') {
      return source.roomId;
    }
    return source.userId;
  }

  async handleJoin(event) {
    logger.info('Line bot joined group/room', {
      botId: this.id,
      sourceType: event.source.type,
      sourceId: event.source.groupId || event.source.roomId
    });
  }

  async handleLeave(event) {
    logger.info('Line bot left group/room', {
      botId: this.id,
      sourceType: event.source.type,
      sourceId: event.source.groupId || event.source.roomId
    });
  }

  async handleBeacon(event) {
    logger.info('Line beacon event received', {
      botId: this.id,
      beaconHwid: event.beacon.hwid,
      beaconType: event.beacon.type
    });
  }

  async handleAccountLink(event) {
    logger.info('Line account link event received', {
      botId: this.id,
      result: event.link.result,
      nonce: event.link.nonce
    });
  }

  async handleThings(event) {
    logger.info('Line Things event received', {
      botId: this.id,
      deviceId: event.things.deviceId,
      type: event.things.type
    });
  }

  getStatus() {
    return {
      id: this.id,
      platform: 'line',
      isRunning: this.isRunning,
      richMenuId: this.richMenuId,
      config: {
        hasRichMenu: !!this.config.richMenu,
        autoReply: this.config.autoReply || false,
        welcomeMessage: !!this.config.welcomeMessage
      }
    };
  }
}

module.exports = LineBot; 