const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class DiscordBot {
  constructor(options) {
    this.id = options.id;
    this.botToken = options.token;
    this.applicationId = options.applicationId || options.config?.applicationId;
    this.publicKey = options.publicKey || options.config?.publicKey;
    this.config = options.config || {};
    this.webhookUrl = options.webhookUrl;
    this.onMessage = options.onMessage;
    this.onError = options.onError;
    this.baseUrl = 'https://discord.com/api/v10';
    this.isRunning = false;
    this.guildId = options.config?.guildId;
  }

  async start() {
    try {
      logger.info('Starting Discord Bot', { 
        botId: this.id,
        applicationId: this.applicationId,
        guildId: this.guildId
      });

      // 验证机器人令牌
      await this.validateToken();

      // 注册斜杠命令
      if (this.config.autoRegisterCommands) {
        await this.registerSlashCommands();
      }

      this.isRunning = true;
      logger.info('Discord Bot started successfully', { botId: this.id });
    } catch (error) {
      logger.error('Failed to start Discord Bot', { 
        botId: this.id,
        error: error.message 
      });
      throw error;
    }
  }

  async stop() {
    try {
      logger.info('Stopping Discord Bot', { botId: this.id });
      this.isRunning = false;
      logger.info('Discord Bot stopped successfully', { botId: this.id });
    } catch (error) {
      logger.error('Failed to stop Discord Bot', { 
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
        content: text,
        tts: options.tts || false
      };

      switch (type) {
        case 'text':
          payload.content = text;
          break;
        case 'embed':
          payload.embeds = [{
            title: options.title || '',
            description: text,
            color: options.color || 0x00AE86,
            fields: options.fields || [],
            footer: options.footer ? { text: options.footer } : undefined,
            timestamp: options.timestamp ? new Date().toISOString() : undefined
          }];
          payload.content = options.content || '';
          break;
        case 'file':
          // Discord 文件上传需要使用 multipart/form-data
          return await this.uploadFile(chatId, options.file, text);
        case 'components':
          payload.components = options.components;
          break;
        default:
          payload.content = text;
      }

      // 添加额外选项
      if (options.reply_to) {
        payload.message_reference = {
          message_id: options.reply_to
        };
      }

      const response = await this.callDiscordAPI(`channels/${chatId}/messages`, payload, 'POST');

      logger.info('Discord message sent successfully', {
        botId: this.id,
        channelId: chatId,
        messageId: response.id,
        type: type
      });

      return {
        success: true,
        messageId: response.id,
        data: response
      };
    } catch (error) {
      logger.error('Failed to send Discord message', {
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
      logger.info('Received Discord webhook', {
        botId: this.id,
        type: data.type,
        interactionType: data.data?.type
      });

      // 处理不同类型的交互
      switch (data.type) {
        case 1: // PING
          return { type: 1 }; // PONG
        case 2: // APPLICATION_COMMAND
          await this.handleSlashCommand(data);
          break;
        case 3: // MESSAGE_COMPONENT
          await this.handleMessageComponent(data);
          break;
        case 4: // APPLICATION_COMMAND_AUTOCOMPLETE
          await this.handleAutocomplete(data);
          break;
        case 5: // MODAL_SUBMIT
          await this.handleModalSubmit(data);
          break;
        default:
          logger.warn('Unhandled Discord interaction type', {
            botId: this.id,
            type: data.type
          });
      }

      return { status: 'ok' };
    } catch (error) {
      logger.error('Failed to handle Discord webhook', {
        botId: this.id,
        error: error.message
      });

      if (this.onError) {
        this.onError(error);
      }

      return { status: 'error', error: error.message };
    }
  }

  async handleSlashCommand(interaction) {
    try {
      const commandName = interaction.data.name;
      const user = interaction.member?.user || interaction.user;
      const standardMessage = await this.convertToStandardFormat(interaction, user);

      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }

      // 返回临时响应
      return {
        type: 4,
        data: {
          content: `正在处理命令: /${commandName}`,
          flags: 64 // EPHEMERAL
        }
      };
    } catch (error) {
      logger.error('Failed to handle Discord slash command', {
        botId: this.id,
        error: error.message
      });

      return {
        type: 4,
        data: {
          content: '处理命令时发生错误，请稍后重试。',
          flags: 64 // EPHEMERAL
        }
      };
    }
  }

  async handleMessageComponent(interaction) {
    try {
      const customId = interaction.data.custom_id;
      const user = interaction.member?.user || interaction.user;
      const standardMessage = await this.convertToStandardFormat(interaction, user);
      standardMessage.metadata.customId = customId;
      standardMessage.metadata.componentType = interaction.data.component_type;

      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }

      return {
        type: 4,
        data: {
          content: '操作已处理',
          flags: 64 // EPHEMERAL
        }
      };
    } catch (error) {
      logger.error('Failed to handle Discord message component', {
        botId: this.id,
        error: error.message
      });

      return {
        type: 4,
        data: {
          content: '处理操作时发生错误。',
          flags: 64 // EPHEMERAL
        }
      };
    }
  }

  async convertToStandardFormat(interaction, user) {
    const standardMessage = {
      id: interaction.id,
      platform: 'discord',
      chatId: interaction.channel_id,
      senderId: user.id,
      senderName: user.global_name || user.username,
      timestamp: new Date(),
      type: this.getMessageType(interaction),
      text: this.getMessageText(interaction),
      attachments: [],
      metadata: {
        guildId: interaction.guild_id || null,
        interactionType: interaction.type,
        token: interaction.token,
        applicationId: interaction.application_id,
        locale: interaction.locale || 'en-US',
        guildLocale: interaction.guild_locale || null
      }
    };

    // 处理斜杠命令参数
    if (interaction.data?.options) {
      standardMessage.metadata.commandOptions = interaction.data.options;
    }

    // 处理组件交互数据
    if (interaction.data?.values) {
      standardMessage.metadata.selectedValues = interaction.data.values;
    }

    return standardMessage;
  }

  getMessageType(interaction) {
    switch (interaction.type) {
      case 2: return 'slash_command';
      case 3: return 'component_interaction';
      case 4: return 'autocomplete';
      case 5: return 'modal_submit';
      default: return 'unknown';
    }
  }

  getMessageText(interaction) {
    if (interaction.type === 2) { // SLASH_COMMAND
      const commandName = interaction.data.name;
      const options = interaction.data.options || [];
      const params = options.map(opt => `${opt.name}:${opt.value}`).join(' ');
      return `/${commandName} ${params}`.trim();
    } else if (interaction.type === 3) { // MESSAGE_COMPONENT
      return `组件交互: ${interaction.data.custom_id}`;
    }
    return '交互消息';
  }

  async validateToken() {
    try {
      const response = await this.callDiscordAPI('applications/@me');
      
      logger.info('Discord token validated', {
        botId: this.id,
        applicationName: response.name,
        applicationId: response.id
      });

      return true;
    } catch (error) {
      logger.error('Discord token validation failed', {
        botId: this.id,
        error: error.message
      });
      throw new Error('Invalid Discord bot token');
    }
  }

  async callDiscordAPI(endpoint, payload = null, method = 'GET') {
    try {
      const config = {
        method,
        url: `${this.baseUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Octopus-Messenger (https://github.com/LavasLabs/octopus-messenger, 1.0.0)'
        }
      };

      if (payload && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.data = payload;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error('Discord API call failed', {
        botId: this.id,
        endpoint,
        method,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      throw error;
    }
  }

  async registerSlashCommands() {
    try {
      const commands = this.getDefaultCommands();
      
      for (const command of commands) {
        const endpoint = this.guildId 
          ? `applications/${this.applicationId}/guilds/${this.guildId}/commands`
          : `applications/${this.applicationId}/commands`;
        
        await this.callDiscordAPI(endpoint, command, 'POST');
        
        logger.info('Discord slash command registered', {
          botId: this.id,
          commandName: command.name,
          isGlobal: !this.guildId
        });
      }
    } catch (error) {
      logger.error('Failed to register Discord slash commands', {
        botId: this.id,
        error: error.message
      });
    }
  }

  getDefaultCommands() {
    return [
      {
        name: 'help',
        description: '显示帮助信息',
        type: 1 // CHAT_INPUT
      },
      {
        name: 'support',
        description: '联系客服支持',
        type: 1 // CHAT_INPUT
      },
      {
        name: 'faq',
        description: '查看常见问题',
        type: 1 // CHAT_INPUT
      },
      {
        name: 'status',
        description: '查看服务状态',
        type: 1 // CHAT_INPUT
      }
    ];
  }

  async uploadFile(channelId, fileData, content = '') {
    try {
      const FormData = require('form-data');
      const form = new FormData();
      
      form.append('files[0]', fileData.buffer, fileData.name);
      form.append('payload_json', JSON.stringify({
        content: content,
        attachments: [{
          id: 0,
          filename: fileData.name
        }]
      }));

      const response = await axios.post(
        `${this.baseUrl}/channels/${channelId}/messages`,
        form,
        {
          headers: {
            'Authorization': `Bot ${this.botToken}`,
            ...form.getHeaders()
          }
        }
      );

      return {
        success: true,
        messageId: response.data.id,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to upload file to Discord', {
        botId: this.id,
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  async editMessage(channelId, messageId, content, options = {}) {
    try {
      const payload = {
        content: content,
        ...options
      };

      const response = await this.callDiscordAPI(
        `channels/${channelId}/messages/${messageId}`,
        payload,
        'PATCH'
      );

      return {
        success: true,
        data: response
      };
    } catch (error) {
      logger.error('Failed to edit Discord message', {
        botId: this.id,
        channelId,
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  async deleteMessage(channelId, messageId) {
    try {
      await this.callDiscordAPI(
        `channels/${channelId}/messages/${messageId}`,
        null,
        'DELETE'
      );

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete Discord message', {
        botId: this.id,
        channelId,
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  async addReaction(channelId, messageId, emoji) {
    try {
      await this.callDiscordAPI(
        `channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
        null,
        'PUT'
      );

      return { success: true };
    } catch (error) {
      logger.error('Failed to add Discord reaction', {
        botId: this.id,
        channelId,
        messageId,
        emoji,
        error: error.message
      });
      throw error;
    }
  }

  verifySignature(timestamp, signature, body) {
    try {
      const nacl = require('tweetnacl');
      
      const sig = Buffer.from(signature, 'hex');
      const msg = Buffer.from(timestamp + body);
      const key = Buffer.from(this.publicKey, 'hex');
      
      return nacl.sign.detached.verify(msg, sig, key);
    } catch (error) {
      logger.error('Failed to verify Discord signature', {
        botId: this.id,
        error: error.message
      });
      return false;
    }
  }

  async handleAutocomplete(interaction) {
    // 实现自动完成逻辑
    return {
      type: 8, // APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
      data: {
        choices: []
      }
    };
  }

  async handleModalSubmit(interaction) {
    try {
      const user = interaction.member?.user || interaction.user;
      const standardMessage = await this.convertToStandardFormat(interaction, user);
      standardMessage.metadata.modalData = interaction.data;

      if (this.onMessage) {
        await this.onMessage(standardMessage);
      }

      return {
        type: 4,
        data: {
          content: '表单已提交',
          flags: 64 // EPHEMERAL
        }
      };
    } catch (error) {
      logger.error('Failed to handle Discord modal submit', {
        botId: this.id,
        error: error.message
      });

      return {
        type: 4,
        data: {
          content: '提交表单时发生错误。',
          flags: 64 // EPHEMERAL
        }
      };
    }
  }

  getStatus() {
    return {
      id: this.id,
      platform: 'discord',
      isRunning: this.isRunning,
      applicationId: this.applicationId,
      guildId: this.guildId,
      config: {
        autoRegisterCommands: this.config.autoRegisterCommands || false,
        supportedInteractionTypes: [
          'slash_command',
          'component_interaction',
          'autocomplete',
          'modal_submit'
        ]
      }
    };
  }
}

module.exports = DiscordBot; 