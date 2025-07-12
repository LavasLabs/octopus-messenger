const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class SlackBot {
  constructor(options) {
    this.id = options.id;
    this.botToken = options.token;
    this.appToken = options.appToken || options.config?.appToken;
    this.signingSecret = options.signingSecret || options.config?.signingSecret;
    this.config = options.config || {};
    this.webhookUrl = options.webhookUrl;
    this.onMessage = options.onMessage;
    this.onError = options.onError;
    this.baseUrl = 'https://slack.com/api';
    this.isRunning = false;
    this.socketMode = options.config?.socketMode || false;
    this.teamId = null;
    this.botUserId = null;
  }

  async start() {
    try {
      logger.info('Starting Slack Bot', { 
        botId: this.id,
        socketMode: this.socketMode
      });

      // 验证令牌并获取 bot 信息
      await this.validateToken();

      // 获取 bot 用户信息
      await this.getBotInfo();

      this.isRunning = true;
      logger.info('Slack Bot started successfully', { 
        botId: this.id,
        botUserId: this.botUserId,
        teamId: this.teamId
      });
    } catch (error) {
      logger.error('Failed to start Slack Bot', { 
        botId: this.id,
        error: error.message 
      });
      throw error;
    }
  }

  async stop() {
    try {
      logger.info('Stopping Slack Bot', { botId: this.id });
      this.isRunning = false;
      logger.info('Slack Bot stopped successfully', { botId: this.id });
    } catch (error) {
      logger.error('Failed to stop Slack Bot', { 
        botId: this.id,
        error: error.message 
      });
      throw error;
    }
  }

  async sendMessage(messageData) {
    try {
      const { chatId, text, type = 'text', options = {} } = messageData;

      let payload = {
        channel: chatId,
        text: text
      };

      // 根据消息类型设置不同的 payload
      switch (type) {
        case 'text':
          payload.text = text;
          break;
        case 'blocks':
          payload.blocks = options.blocks;
          payload.text = text; // fallback text
          break;
        case 'attachments':
          payload.attachments = options.attachments;
          break;
        case 'file':
          return await this.uploadFile(chatId, options.file, text);
        case 'ephemeral':
          payload.user = options.user;
          return await this.sendEphemeralMessage(payload);
        default:
          payload.text = text;
      }

      // 添加额外选项
      if (options.thread_ts) {
        payload.thread_ts = options.thread_ts;
      }
      if (options.username) {
        payload.username = options.username;
      }
      if (options.icon_emoji) {
        payload.icon_emoji = options.icon_emoji;
      }
      if (options.icon_url) {
        payload.icon_url = options.icon_url;
      }

      const response = await this.callSlackAPI('chat.postMessage', payload);

      logger.info('Slack message sent successfully', {
        botId: this.id,
        channel: chatId,
        ts: response.ts,
        type: type
      });

      return {
        success: true,
        messageId: response.ts,
        data: response
      };
    } catch (error) {
      logger.error('Failed to send Slack message', {
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
      logger.info('Received Slack webhook', {
        botId: this.id,
        type: data.type,
        event: data.event?.type
      });

      // 处理不同类型的事件
      switch (data.type) {
        case 'url_verification':
          return { challenge: data.challenge };
        case 'event_callback':
          await this.handleEvent(data.event);
          break;
        case 'interactive_message':
        case 'block_actions':
          await this.handleInteractiveMessage(data);
          break;
        case 'slash_command':
          return await this.handleSlashCommand(data);
        default:
          logger.warn('Unhandled Slack event type', {
            botId: this.id,
            type: data.type
          });
      }

      return { status: 'ok' };
    } catch (error) {
      logger.error('Failed to handle Slack webhook', {
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
      logger.debug('Handling Slack event', {
        botId: this.id,
        eventType: event.type,
        channel: event.channel,
        user: event.user
      });

      // 忽略 bot 自己发送的消息
      if (event.user === this.botUserId) {
        return;
      }

      switch (event.type) {
        case 'message':
          await this.handleMessage(event);
          break;
        case 'app_mention':
          await this.handleMention(event);
          break;
        case 'reaction_added':
          await this.handleReaction(event);
          break;
        case 'file_shared':
          await this.handleFileShared(event);
          break;
        default:
          logger.debug('Unhandled event type', {
            botId: this.id,
            eventType: event.type
          });
      }
    } catch (error) {
      logger.error('Failed to handle Slack event', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async handleMessage(event) {
    try {
      // 忽略子类型消息（如 bot_message, channel_join 等）
      if (event.subtype) {
        return;
      }

      const userInfo = await this.getUserInfo(event.user);
      const standardMessage = await this.convertToStandardFormat(event, userInfo);

      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }
    } catch (error) {
      logger.error('Failed to handle Slack message', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async handleMention(event) {
    try {
      logger.info('Slack bot mentioned', {
        botId: this.id,
        channel: event.channel,
        user: event.user
      });

      const userInfo = await this.getUserInfo(event.user);
      const standardMessage = await this.convertToStandardFormat(event, userInfo);
      standardMessage.isMention = true;

      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }
    } catch (error) {
      logger.error('Failed to handle Slack mention', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async handleInteractiveMessage(data) {
    try {
      logger.info('Slack interactive message received', {
        botId: this.id,
        type: data.type,
        user: data.user?.id,
        actions: data.actions?.length || 0
      });

      const userInfo = await this.getUserInfo(data.user.id);
      const standardMessage = {
        id: data.message_ts || Date.now().toString(),
        platform: 'slack',
        chatId: data.channel?.id || data.container?.channel_id,
        senderId: data.user.id,
        senderName: userInfo?.real_name || data.user.name,
        timestamp: new Date(),
        type: 'interactive',
        text: data.actions?.[0]?.value || '',
        metadata: {
          actionType: data.type,
          triggerId: data.trigger_id,
          actions: data.actions,
          responseUrl: data.response_url
        }
      };

      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }
    } catch (error) {
      logger.error('Failed to handle Slack interactive message', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async handleSlashCommand(data) {
    try {
      logger.info('Slack slash command received', {
        botId: this.id,
        command: data.command,
        user: data.user_id
      });

      const userInfo = await this.getUserInfo(data.user_id);
      const standardMessage = {
        id: Date.now().toString(),
        platform: 'slack',
        chatId: data.channel_id,
        senderId: data.user_id,
        senderName: userInfo?.real_name || data.user_name,
        timestamp: new Date(),
        type: 'slash_command',
        text: data.text,
        metadata: {
          command: data.command,
          triggerId: data.trigger_id,
          responseUrl: data.response_url,
          channelName: data.channel_name
        }
      };

      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }

      // 返回临时响应
      return {
        response_type: 'ephemeral',
        text: `正在处理您的请求: ${data.command} ${data.text}`
      };
    } catch (error) {
      logger.error('Failed to handle Slack slash command', {
        botId: this.id,
        error: error.message
      });

      return {
        response_type: 'ephemeral',
        text: '处理命令时发生错误，请稍后重试。'
      };
    }
  }

  async convertToStandardFormat(event, userInfo) {
    const standardMessage = {
      id: event.ts || event.event_ts,
      platform: 'slack',
      chatId: event.channel,
      senderId: event.user,
      senderName: userInfo?.real_name || userInfo?.name || event.user,
      timestamp: new Date(parseFloat(event.ts) * 1000),
      type: 'text',
      text: event.text || '',
      attachments: [],
      metadata: {
        teamId: this.teamId,
        channelType: event.channel_type || 'unknown',
        threadTs: event.thread_ts || null,
        edited: event.edited || null
      }
    };

    // 处理文件附件
    if (event.files && event.files.length > 0) {
      standardMessage.attachments = event.files.map(file => ({
        type: this.getFileType(file.filetype),
        url: file.url_private || file.url_public,
        name: file.name,
        mimeType: file.mimetype,
        size: file.size,
        title: file.title
      }));
    }

    // 处理消息中的链接
    if (event.text && event.text.includes('http')) {
      const urls = event.text.match(/https?:\/\/[^\s]+/g);
      if (urls) {
        standardMessage.metadata.urls = urls;
      }
    }

    return standardMessage;
  }

  async getUserInfo(userId) {
    try {
      const response = await this.callSlackAPI('users.info', { user: userId });
      return response.user;
    } catch (error) {
      logger.error('Failed to get Slack user info', {
        botId: this.id,
        userId,
        error: error.message
      });
      return null;
    }
  }

  async getBotInfo() {
    try {
      const response = await this.callSlackAPI('auth.test');
      this.teamId = response.team_id;
      this.botUserId = response.user_id;
      
      logger.info('Slack bot info retrieved', {
        botId: this.id,
        teamId: this.teamId,
        botUserId: this.botUserId
      });
    } catch (error) {
      logger.error('Failed to get Slack bot info', {
        botId: this.id,
        error: error.message
      });
      throw error;
    }
  }

  async validateToken() {
    try {
      const response = await this.callSlackAPI('auth.test');
      
      if (!response.ok) {
        throw new Error('Token validation failed');
      }

      logger.info('Slack token validated', {
        botId: this.id,
        team: response.team,
        user: response.user
      });

      return true;
    } catch (error) {
      logger.error('Slack token validation failed', {
        botId: this.id,
        error: error.message
      });
      throw new Error('Invalid Slack token');
    }
  }

  async callSlackAPI(method, payload = {}) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${method}`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.botToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      return response.data;
    } catch (error) {
      logger.error('Slack API call failed', {
        botId: this.id,
        method,
        error: error.message
      });
      throw error;
    }
  }

  async uploadFile(channel, file, comment = '') {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('channels', channel);
      if (comment) {
        formData.append('initial_comment', comment);
      }

      const response = await axios.post(
        `${this.baseUrl}/files.upload`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.botToken}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (!response.data.ok) {
        throw new Error(`File upload failed: ${response.data.error}`);
      }

      return {
        success: true,
        fileId: response.data.file.id,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to upload file to Slack', {
        botId: this.id,
        error: error.message
      });
      throw error;
    }
  }

  async sendEphemeralMessage(payload) {
    try {
      const response = await this.callSlackAPI('chat.postEphemeral', payload);
      return {
        success: true,
        messageId: response.message_ts,
        data: response
      };
    } catch (error) {
      logger.error('Failed to send ephemeral message', {
        botId: this.id,
        error: error.message
      });
      throw error;
    }
  }

  verifySignature(timestamp, signature, body) {
    try {
      const time = Math.floor(new Date().getTime() / 1000);
      if (Math.abs(time - timestamp) > 300) {
        return false;
      }

      const sigBasestring = `v0:${timestamp}:${body}`;
      const mySignature = `v0=${crypto
        .createHmac('sha256', this.signingSecret)
        .update(sigBasestring)
        .digest('hex')}`;

      return crypto.timingSafeEqual(
        Buffer.from(mySignature),
        Buffer.from(signature)
      );
    } catch (error) {
      logger.error('Failed to verify Slack signature', {
        botId: this.id,
        error: error.message
      });
      return false;
    }
  }

  getFileType(filetype) {
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
    const videoTypes = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
    const audioTypes = ['mp3', 'wav', 'ogg', 'flac', 'm4a'];
    const documentTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

    const type = filetype.toLowerCase();
    
    if (imageTypes.includes(type)) return 'image';
    if (videoTypes.includes(type)) return 'video';
    if (audioTypes.includes(type)) return 'audio';
    if (documentTypes.includes(type)) return 'document';
    
    return 'file';
  }

  getStatus() {
    return {
      id: this.id,
      platform: 'slack',
      isRunning: this.isRunning,
      teamId: this.teamId,
      botUserId: this.botUserId,
      config: {
        socketMode: this.socketMode,
        autoReply: this.config.autoReply || false
      }
    };
  }
}

module.exports = SlackBot; 