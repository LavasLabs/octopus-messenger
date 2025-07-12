const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');

class TelegramBotIntegration {
  constructor({ id, token, config, webhookUrl, onMessage, onError }) {
    this.id = id;
    this.token = token;
    this.config = config;
    this.webhookUrl = webhookUrl;
    this.onMessage = onMessage;
    this.onError = onError;
    this.bot = null;
    this.isStarted = false;
  }

  async start() {
    try {
      logger.info('Starting Telegram bot', { botId: this.id });

      // 创建Bot实例
      const options = {
        polling: !this.webhookUrl, // 如果有webhook则不使用polling
        webHook: !!this.webhookUrl
      };

      this.bot = new TelegramBot(this.token, options);

      // 设置错误处理
      this.bot.on('error', (error) => {
        logger.error('Telegram bot error', {
          botId: this.id,
          error: error.message
        });
        if (this.onError) {
          this.onError(error);
        }
      });

      // 设置消息处理
      this.bot.on('message', (msg) => {
        this.handleMessage(msg);
      });

      // 设置回调查询处理
      this.bot.on('callback_query', (query) => {
        this.handleCallbackQuery(query);
      });

      // 如果使用webhook，设置webhook
      if (this.webhookUrl) {
        await this.bot.setWebHook(`${this.webhookUrl}/webhook/telegram/${this.id}`);
        logger.info('Telegram webhook set', {
          botId: this.id,
          webhookUrl: this.webhookUrl
        });
      }

      this.isStarted = true;
      logger.info('Telegram bot started successfully', { botId: this.id });

    } catch (error) {
      logger.error('Failed to start Telegram bot', {
        botId: this.id,
        error: error.message
      });
      throw error;
    }
  }

  async stop() {
    try {
      if (!this.isStarted) {
        return;
      }

      logger.info('Stopping Telegram bot', { botId: this.id });

      if (this.bot) {
        // 如果使用webhook，删除webhook
        if (this.webhookUrl) {
          await this.bot.deleteWebHook();
        }

        // 停止polling
        if (this.bot.isPolling()) {
          await this.bot.stopPolling();
        }
      }

      this.isStarted = false;
      logger.info('Telegram bot stopped', { botId: this.id });

    } catch (error) {
      logger.error('Failed to stop Telegram bot', {
        botId: this.id,
        error: error.message
      });
      throw error;
    }
  }

  async sendMessage(messageData) {
    try {
      if (!this.isStarted || !this.bot) {
        throw new Error('Bot not started');
      }

      const { channelId, content, messageType = 'text', options = {} } = messageData;

      let result;
      switch (messageType) {
        case 'text':
          result = await this.bot.sendMessage(channelId, content, {
            parse_mode: options.parseMode || 'HTML',
            disable_web_page_preview: options.disableWebPagePreview,
            reply_markup: options.replyMarkup,
            ...options
          });
          break;

        case 'photo':
          result = await this.bot.sendPhoto(channelId, content, {
            caption: options.caption,
            parse_mode: options.parseMode || 'HTML',
            reply_markup: options.replyMarkup,
            ...options
          });
          break;

        case 'document':
          result = await this.bot.sendDocument(channelId, content, {
            caption: options.caption,
            parse_mode: options.parseMode || 'HTML',
            reply_markup: options.replyMarkup,
            ...options
          });
          break;

        case 'location':
          result = await this.bot.sendLocation(channelId, options.latitude, options.longitude, {
            reply_markup: options.replyMarkup,
            ...options
          });
          break;

        default:
          throw new Error(`Unsupported message type: ${messageType}`);
      }

      logger.debug('Telegram message sent', {
        botId: this.id,
        channelId,
        messageType,
        messageId: result.message_id
      });

      return {
        success: true,
        messageId: result.message_id.toString(),
        platform: 'telegram',
        result
      };

    } catch (error) {
      logger.error('Failed to send Telegram message', {
        botId: this.id,
        error: error.message,
        messageData
      });

      return {
        success: false,
        error: error.message,
        platform: 'telegram'
      };
    }
  }

  async handleWebhook(data) {
    try {
      logger.debug('Telegram webhook received', {
        botId: this.id,
        hasMessage: !!data.message,
        hasCallbackQuery: !!data.callback_query
      });

      if (data.message) {
        await this.handleMessage(data.message);
      }

      if (data.callback_query) {
        await this.handleCallbackQuery(data.callback_query);
      }

    } catch (error) {
      logger.error('Failed to handle Telegram webhook', {
        botId: this.id,
        error: error.message
      });
    }
  }

  async handleMessage(msg) {
    try {
      // 转换Telegram消息格式为标准格式
      const standardMessage = this.convertToStandardFormat(msg);

      logger.debug('Telegram message processed', {
        botId: this.id,
        messageId: msg.message_id,
        chatId: msg.chat.id,
        hasText: !!msg.text
      });

      // 调用回调函数
      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }

    } catch (error) {
      logger.error('Failed to handle Telegram message', {
        botId: this.id,
        error: error.message,
        messageId: msg.message_id
      });
    }
  }

  async handleCallbackQuery(query) {
    try {
      // 转换回调查询为标准格式
      const standardMessage = this.convertCallbackToStandardFormat(query);

      logger.debug('Telegram callback query processed', {
        botId: this.id,
        queryId: query.id,
        data: query.data
      });

      // 确认回调查询
      await this.bot.answerCallbackQuery(query.id);

      // 调用回调函数
      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }

    } catch (error) {
      logger.error('Failed to handle Telegram callback query', {
        botId: this.id,
        error: error.message,
        queryId: query.id
      });
    }
  }

  convertToStandardFormat(msg) {
    const user = msg.from || {};
    const chat = msg.chat || {};

    return {
      platform: 'telegram',
      messageId: msg.message_id.toString(),
      channelId: chat.id.toString(),
      fromUserId: user.id.toString(),
      content: msg.text || msg.caption || '',
      messageType: this.getMessageType(msg),
      timestamp: new Date(msg.date * 1000).toISOString(),
      metadata: {
        chat: {
          id: chat.id,
          type: chat.type,
          title: chat.title,
          username: chat.username
        },
        user: {
          id: user.id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          languageCode: user.language_code
        },
        raw: msg
      }
    };
  }

  convertCallbackToStandardFormat(query) {
    const user = query.from || {};
    const message = query.message || {};
    const chat = message.chat || {};

    return {
      platform: 'telegram',
      messageId: query.id,
      channelId: chat.id?.toString() || '',
      fromUserId: user.id.toString(),
      content: query.data || '',
      messageType: 'callback_query',
      timestamp: new Date().toISOString(),
      metadata: {
        query: {
          id: query.id,
          data: query.data
        },
        message: message,
        user: {
          id: user.id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name
        },
        raw: query
      }
    };
  }

  getMessageType(msg) {
    if (msg.text) return 'text';
    if (msg.photo) return 'photo';
    if (msg.document) return 'document';
    if (msg.video) return 'video';
    if (msg.audio) return 'audio';
    if (msg.voice) return 'voice';
    if (msg.location) return 'location';
    if (msg.contact) return 'contact';
    if (msg.sticker) return 'sticker';
    return 'unknown';
  }

  // 创建内联键盘
  createInlineKeyboard(buttons) {
    return {
      inline_keyboard: buttons
    };
  }

  // 创建回复键盘
  createReplyKeyboard(buttons, options = {}) {
    return {
      keyboard: buttons,
      resize_keyboard: options.resize || true,
      one_time_keyboard: options.oneTime || false,
      selective: options.selective || false
    };
  }

  // 移除键盘
  removeKeyboard() {
    return {
      remove_keyboard: true
    };
  }

  // 获取Bot信息
  async getBotInfo() {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }

      const me = await this.bot.getMe();
      return {
        id: me.id,
        username: me.username,
        firstName: me.first_name,
        isBot: me.is_bot,
        canJoinGroups: me.can_join_groups,
        canReadAllGroupMessages: me.can_read_all_group_messages,
        supportsInlineQueries: me.supports_inline_queries
      };
    } catch (error) {
      logger.error('Failed to get Telegram bot info', {
        botId: this.id,
        error: error.message
      });
      throw error;
    }
  }

  // 获取聊天信息
  async getChatInfo(chatId) {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }

      const chat = await this.bot.getChat(chatId);
      return {
        id: chat.id,
        type: chat.type,
        title: chat.title,
        username: chat.username,
        firstName: chat.first_name,
        lastName: chat.last_name,
        description: chat.description,
        memberCount: chat.all_members_are_administrators
      };
    } catch (error) {
      logger.error('Failed to get Telegram chat info', {
        botId: this.id,
        chatId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = TelegramBotIntegration; 