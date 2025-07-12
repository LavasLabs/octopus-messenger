const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class WeWorkBot {
  constructor(options) {
    this.id = options.id;
    this.corpId = options.corpId || options.config?.corpId;
    this.agentId = options.agentId || options.config?.agentId;
    this.secret = options.secret || options.token;
    this.config = options.config || {};
    this.webhookUrl = options.webhookUrl;
    this.onMessage = options.onMessage;
    this.onError = options.onError;
    this.baseUrl = 'https://qyapi.weixin.qq.com/cgi-bin';
    this.isRunning = false;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async start() {
    try {
      logger.info('Starting WeWork Bot', { 
        botId: this.id,
        corpId: this.corpId,
        agentId: this.agentId
      });

      // 获取访问令牌
      await this.getAccessToken();

      // 验证应用配置
      await this.validateAgent();

      this.isRunning = true;
      logger.info('WeWork Bot started successfully', { botId: this.id });
    } catch (error) {
      logger.error('Failed to start WeWork Bot', { 
        botId: this.id,
        error: error.message 
      });
      throw error;
    }
  }

  async stop() {
    try {
      logger.info('Stopping WeWork Bot', { botId: this.id });
      this.isRunning = false;
      this.accessToken = null;
      this.tokenExpiry = null;
      logger.info('WeWork Bot stopped successfully', { botId: this.id });
    } catch (error) {
      logger.error('Failed to stop WeWork Bot', { 
        botId: this.id,
        error: error.message 
      });
      throw error;
    }
  }

  async sendMessage(messageData) {
    try {
      const { chatId, text, type = 'text', options = {} } = messageData;

      // 确保有有效的访问令牌
      await this.ensureValidToken();

      let message = {
        touser: chatId,
        msgtype: type,
        agentid: this.agentId
      };

      switch (type) {
        case 'text':
          message.text = {
            content: text
          };
          break;
        case 'textcard':
          message.textcard = {
            title: options.title || '通知',
            description: text,
            url: options.url || '',
            btntxt: options.btntxt || '详情'
          };
          break;
        case 'markdown':
          message.markdown = {
            content: text
          };
          break;
        case 'image':
          message.image = {
            media_id: options.mediaId || text
          };
          break;
        case 'voice':
          message.voice = {
            media_id: options.mediaId || text
          };
          break;
        case 'video':
          message.video = {
            media_id: options.mediaId || text,
            title: options.title || '',
            description: options.description || ''
          };
          break;
        case 'file':
          message.file = {
            media_id: options.mediaId || text
          };
          break;
        case 'news':
          message.news = {
            articles: options.articles || []
          };
          break;
        case 'mpnews':
          message.mpnews = {
            articles: options.articles || []
          };
          break;
        case 'taskcard':
          message.taskcard = {
            title: options.title || '任务',
            description: text,
            url: options.url || '',
            task_id: options.taskId || Date.now().toString(),
            btn: options.buttons || []
          };
          break;
        case 'miniprogram_notice':
          message.miniprogram_notice = {
            appid: options.appId,
            page: options.page || '',
            title: options.title || '',
            description: text,
            emphasis_first_item: options.emphasisFirstItem || false,
            content_item: options.contentItems || []
          };
          break;
        default:
          message.text = {
            content: text
          };
          message.msgtype = 'text';
      }

      // 发送到群聊
      if (options.chatId && options.chatId.startsWith('wr')) {
        message.chatid = options.chatId;
        delete message.touser;
      }

      const response = await this.callWeWorkAPI('message/send', message);

      logger.info('WeWork message sent successfully', {
        botId: this.id,
        to: chatId,
        type: type,
        invaliduser: response.invaliduser,
        invalidparty: response.invalidparty,
        invalidtag: response.invalidtag
      });

      return {
        success: true,
        messageId: response.msgid,
        data: response
      };
    } catch (error) {
      logger.error('Failed to send WeWork message', {
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
      logger.info('Received WeWork webhook', {
        botId: this.id,
        msgType: data.MsgType,
        fromUser: data.FromUserName,
        agentId: data.AgentID
      });

      // 验证消息来源
      if (data.AgentID && data.AgentID !== this.agentId.toString()) {
        logger.warn('Message from different agent', {
          botId: this.id,
          expectedAgent: this.agentId,
          receivedAgent: data.AgentID
        });
        return { status: 'wrong_agent' };
      }

      await this.handleMessage(data);
      return { status: 'ok' };
    } catch (error) {
      logger.error('Failed to handle WeWork webhook', {
        botId: this.id,
        error: error.message
      });

      if (this.onError) {
        this.onError(error);
      }

      return { status: 'error', error: error.message };
    }
  }

  async handleMessage(data) {
    try {
      const userInfo = await this.getUserInfo(data.FromUserName);
      const standardMessage = await this.convertToStandardFormat(data, userInfo);

      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }
    } catch (error) {
      logger.error('Failed to handle WeWork message', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async convertToStandardFormat(data, userInfo) {
    const standardMessage = {
      id: data.MsgId || Date.now().toString(),
      platform: 'wework',
      chatId: data.FromUserName,
      senderId: data.FromUserName,
      senderName: userInfo?.name || data.FromUserName,
      timestamp: new Date(parseInt(data.CreateTime) * 1000),
      type: data.MsgType,
      text: '',
      attachments: [],
      metadata: {
        agentId: data.AgentID,
        corpId: this.corpId,
        toUser: data.ToUserName,
        event: data.Event || null
      }
    };

    switch (data.MsgType) {
      case 'text':
        standardMessage.text = data.Content;
        break;
      case 'image':
        standardMessage.attachments.push({
          type: 'image',
          mediaId: data.MediaId,
          picUrl: data.PicUrl
        });
        break;
      case 'voice':
        standardMessage.attachments.push({
          type: 'voice',
          mediaId: data.MediaId,
          format: data.Format,
          recognition: data.Recognition || ''
        });
        standardMessage.text = data.Recognition || '语音消息';
        break;
      case 'video':
        standardMessage.attachments.push({
          type: 'video',
          mediaId: data.MediaId,
          thumbMediaId: data.ThumbMediaId
        });
        standardMessage.text = '视频消息';
        break;
      case 'file':
        standardMessage.attachments.push({
          type: 'file',
          mediaId: data.MediaId,
          fileName: data.FileName || '文件'
        });
        standardMessage.text = data.FileName || '文件消息';
        break;
      case 'location':
        standardMessage.text = `位置: ${data.Label}`;
        standardMessage.attachments.push({
          type: 'location',
          locationX: data.Location_X,
          locationY: data.Location_Y,
          scale: data.Scale,
          label: data.Label
        });
        break;
      case 'link':
        standardMessage.text = data.Title;
        standardMessage.attachments.push({
          type: 'link',
          title: data.Title,
          description: data.Description,
          url: data.Url,
          picUrl: data.PicUrl
        });
        break;
      case 'event':
        standardMessage.text = `事件: ${data.Event}`;
        standardMessage.type = 'event';
        standardMessage.metadata.eventKey = data.EventKey;
        break;
      case 'click':
        standardMessage.text = `点击: ${data.EventKey}`;
        standardMessage.type = 'click';
        standardMessage.metadata.eventKey = data.EventKey;
        break;
      case 'view':
        standardMessage.text = `跳转: ${data.EventKey}`;
        standardMessage.type = 'view';
        standardMessage.metadata.eventKey = data.EventKey;
        break;
      case 'scancode_push':
        standardMessage.text = `扫码: ${data.ScanCodeInfo.ScanResult}`;
        standardMessage.type = 'scancode';
        standardMessage.metadata.scanCodeInfo = data.ScanCodeInfo;
        break;
      case 'pic_sysphoto':
      case 'pic_photo_or_album':
      case 'pic_weixin':
        standardMessage.text = '图片消息';
        standardMessage.type = 'photo';
        standardMessage.metadata.sendPicsInfo = data.SendPicsInfo;
        break;
      case 'location_select':
        standardMessage.text = `位置选择: ${data.SendLocationInfo.Label}`;
        standardMessage.type = 'location_select';
        standardMessage.metadata.sendLocationInfo = data.SendLocationInfo;
        break;
      default:
        standardMessage.text = `未支持的消息类型: ${data.MsgType}`;
    }

    return standardMessage;
  }

  async getUserInfo(userId) {
    try {
      await this.ensureValidToken();
      
      const response = await this.callWeWorkAPI('user/get', null, 'GET', {
        userid: userId
      });

      return response;
    } catch (error) {
      logger.error('Failed to get WeWork user info', {
        botId: this.id,
        userId,
        error: error.message
      });
      return null;
    }
  }

  async getAccessToken() {
    try {
      const response = await axios.get(`${this.baseUrl}/gettoken`, {
        params: {
          corpid: this.corpId,
          corpsecret: this.secret
        }
      });

      if (response.data.errcode !== 0) {
        throw new Error(`WeWork API error: ${response.data.errmsg}`);
      }

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000; // 提前5分钟过期

      logger.info('WeWork access token obtained', {
        botId: this.id,
        expiresIn: response.data.expires_in
      });

      return this.accessToken;
    } catch (error) {
      logger.error('Failed to get WeWork access token', {
        botId: this.id,
        error: error.message
      });
      throw error;
    }
  }

  async ensureValidToken() {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.getAccessToken();
    }
  }

  async validateAgent() {
    try {
      await this.ensureValidToken();

      const response = await this.callWeWorkAPI('agent/get', null, 'GET', {
        agentid: this.agentId
      });

      logger.info('WeWork agent validated', {
        botId: this.id,
        agentName: response.name,
        agentId: response.agentid
      });

      return true;
    } catch (error) {
      logger.error('WeWork agent validation failed', {
        botId: this.id,
        error: error.message
      });
      throw new Error('Invalid WeWork agent configuration');
    }
  }

  async callWeWorkAPI(endpoint, payload = null, method = 'POST', params = {}) {
    try {
      await this.ensureValidToken();

      const config = {
        method,
        url: `${this.baseUrl}/${endpoint}`,
        params: {
          access_token: this.accessToken,
          ...params
        }
      };

      if (payload && (method === 'POST' || method === 'PUT')) {
        config.data = payload;
        config.headers = {
          'Content-Type': 'application/json'
        };
      }

      const response = await axios(config);

      if (response.data.errcode !== 0) {
        throw new Error(`WeWork API error: ${response.data.errmsg}`);
      }

      return response.data;
    } catch (error) {
      logger.error('WeWork API call failed', {
        botId: this.id,
        endpoint,
        method,
        error: error.message
      });
      throw error;
    }
  }

  async uploadMedia(filePath, type = 'image') {
    try {
      await this.ensureValidToken();

      const FormData = require('form-data');
      const fs = require('fs');
      
      const form = new FormData();
      form.append('media', fs.createReadStream(filePath));
      form.append('type', type);

      const response = await axios.post(
        `${this.baseUrl}/media/upload`,
        form,
        {
          params: {
            access_token: this.accessToken,
            type: type
          },
          headers: {
            ...form.getHeaders()
          }
        }
      );

      if (response.data.errcode !== 0) {
        throw new Error(`Upload failed: ${response.data.errmsg}`);
      }

      return response.data.media_id;
    } catch (error) {
      logger.error('Failed to upload media to WeWork', {
        botId: this.id,
        error: error.message
      });
      throw error;
    }
  }

  async createChat(chatName, userList) {
    try {
      await this.ensureValidToken();

      const response = await this.callWeWorkAPI('appchat/create', {
        name: chatName,
        owner: userList[0],
        userlist: userList
      });

      logger.info('WeWork chat created', {
        botId: this.id,
        chatId: response.chatid,
        chatName
      });

      return response.chatid;
    } catch (error) {
      logger.error('Failed to create WeWork chat', {
        botId: this.id,
        error: error.message
      });
      throw error;
    }
  }

  async sendChatMessage(chatId, message) {
    try {
      await this.ensureValidToken();

      const payload = {
        chatid: chatId,
        ...message
      };

      const response = await this.callWeWorkAPI('appchat/send', payload);

      logger.info('WeWork chat message sent', {
        botId: this.id,
        chatId,
        msgType: message.msgtype
      });

      return response;
    } catch (error) {
      logger.error('Failed to send WeWork chat message', {
        botId: this.id,
        chatId,
        error: error.message
      });
      throw error;
    }
  }

  verifySignature(timestamp, nonce, signature, token) {
    try {
      const arr = [token, timestamp, nonce].sort();
      const str = arr.join('');
      const hash = crypto.createHash('sha1').update(str).digest('hex');
      return hash === signature;
    } catch (error) {
      logger.error('Failed to verify WeWork signature', {
        botId: this.id,
        error: error.message
      });
      return false;
    }
  }

  async getDepartmentList() {
    try {
      await this.ensureValidToken();
      
      const response = await this.callWeWorkAPI('department/list', null, 'GET');
      return response.department;
    } catch (error) {
      logger.error('Failed to get WeWork department list', {
        botId: this.id,
        error: error.message
      });
      return [];
    }
  }

  async getDepartmentUsers(departmentId) {
    try {
      await this.ensureValidToken();
      
      const response = await this.callWeWorkAPI('user/list', null, 'GET', {
        department_id: departmentId
      });
      return response.userlist;
    } catch (error) {
      logger.error('Failed to get WeWork department users', {
        botId: this.id,
        departmentId,
        error: error.message
      });
      return [];
    }
  }

  getStatus() {
    return {
      id: this.id,
      platform: 'wework',
      isRunning: this.isRunning,
      corpId: this.corpId,
      agentId: this.agentId,
      tokenExpiry: this.tokenExpiry,
      config: {
        autoReply: this.config.autoReply || false,
        supportedMsgTypes: [
          'text', 'textcard', 'markdown', 'image', 'voice', 
          'video', 'file', 'news', 'mpnews', 'taskcard', 
          'miniprogram_notice'
        ]
      }
    };
  }
}

module.exports = WeWorkBot; 