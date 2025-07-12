const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { logger } = require('../utils/logger');

class DiscordBot {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isConnected = false;
    this.messageHandlers = new Map();
    this.commandHandlers = new Map();
    
    // 初始化Discord客户端
    this.initializeClient();
  }

  initializeClient() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
      ]
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // 连接成功事件
    this.client.on('ready', () => {
      this.isConnected = true;
      logger.info('Discord bot connected successfully', {
        botName: this.client.user.tag,
        guildCount: this.client.guilds.cache.size
      });
    });

    // 消息接收事件
    this.client.on('messageCreate', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        logger.error('Error handling Discord message', {
          error: error.message,
          messageId: message.id,
          guildId: message.guildId
        });
      }
    });

    // 交互事件（按钮点击、斜杠命令等）
    this.client.on('interactionCreate', async (interaction) => {
      try {
        await this.handleInteraction(interaction);
      } catch (error) {
        logger.error('Error handling Discord interaction', {
          error: error.message,
          interactionId: interaction.id,
          type: interaction.type
        });
      }
    });

    // 错误处理
    this.client.on('error', (error) => {
      logger.error('Discord client error', { error: error.message });
    });

    // 连接断开事件
    this.client.on('disconnect', () => {
      this.isConnected = false;
      logger.warn('Discord bot disconnected');
    });
  }

  async connect() {
    try {
      await this.client.login(this.config.token);
      logger.info('Discord bot login initiated');
    } catch (error) {
      logger.error('Failed to connect Discord bot', { error: error.message });
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.destroy();
      this.isConnected = false;
      logger.info('Discord bot disconnected');
    }
  }

  async handleMessage(message) {
    // 忽略机器人消息
    if (message.author.bot) return;

    // 构建消息数据
    const messageData = {
      id: message.id,
      content: message.content,
      senderId: message.author.id,
      senderName: message.author.username,
      senderDisplayName: message.author.displayName || message.author.username,
      senderAvatar: message.author.displayAvatarURL(),
      channelId: message.channel.id,
      channelName: message.channel.name,
      guildId: message.guildId,
      guildName: message.guild?.name,
      timestamp: message.createdAt,
      platform: 'discord',
      messageType: message.channel.type === 1 ? 'dm' : 'guild', // 1 = DM, 0 = Guild Text
      attachments: message.attachments.map(att => ({
        id: att.id,
        name: att.name,
        url: att.url,
        size: att.size,
        contentType: att.contentType
      })),
      embeds: message.embeds.map(embed => ({
        title: embed.title,
        description: embed.description,
        url: embed.url,
        color: embed.color
      })),
      mentions: {
        users: message.mentions.users.map(user => ({
          id: user.id,
          username: user.username,
          displayName: user.displayName
        })),
        roles: message.mentions.roles.map(role => ({
          id: role.id,
          name: role.name
        })),
        channels: message.mentions.channels.map(channel => ({
          id: channel.id,
          name: channel.name
        }))
      }
    };

    // 发送到消息处理器
    await this.processMessage(messageData);
  }

  async handleInteraction(interaction) {
    if (interaction.isCommand()) {
      await this.handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await this.handleButtonInteraction(interaction);
    } else if (interaction.isSelectMenu()) {
      await this.handleSelectMenuInteraction(interaction);
    }
  }

  async handleSlashCommand(interaction) {
    const command = interaction.commandName;
    const handler = this.commandHandlers.get(command);

    if (handler) {
      await handler(interaction);
    } else {
      await interaction.reply({
        content: '未找到该命令的处理器',
        ephemeral: true
      });
    }
  }

  async handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    
    // 处理客服相关按钮
    if (customId.startsWith('customer_service_')) {
      await this.handleCustomerServiceButton(interaction);
    } else if (customId.startsWith('faq_')) {
      await this.handleFAQButton(interaction);
    }
  }

  async handleCustomerServiceButton(interaction) {
    const action = interaction.customId.replace('customer_service_', '');
    
    switch (action) {
      case 'contact':
        await this.startCustomerServiceSession(interaction);
        break;
      case 'faq':
        await this.showFAQOptions(interaction);
        break;
      case 'status':
        await this.showServiceStatus(interaction);
        break;
      default:
        await interaction.reply({
          content: '未知操作',
          ephemeral: true
        });
    }
  }

  async startCustomerServiceSession(interaction) {
    // 创建客服会话
    const sessionData = {
      userId: interaction.user.id,
      userName: interaction.user.username,
      channelId: interaction.channel.id,
      guildId: interaction.guildId,
      platform: 'discord',
      sessionType: 'customer_service',
      startTime: new Date()
    };

    // 发送到客服系统
    await this.sendToCustomerService(sessionData);

    const embed = new EmbedBuilder()
      .setTitle('🎧 客服支持')
      .setDescription('您的客服请求已提交，我们会尽快为您安排客服人员。')
      .setColor(0x00AE86)
      .addFields(
        { name: '预计等待时间', value: '5-10分钟', inline: true },
        { name: '服务状态', value: '排队中', inline: true }
      )
      .setFooter({ text: '客服工作时间：9:00-18:00' })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }

  async showFAQOptions(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('❓ 常见问题')
      .setDescription('请选择您想了解的问题类型：')
      .setColor(0x3498DB);

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('faq_product')
          .setLabel('产品问题')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📦'),
        new ButtonBuilder()
          .setCustomId('faq_technical')
          .setLabel('技术支持')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔧'),
        new ButtonBuilder()
          .setCustomId('faq_billing')
          .setLabel('付费问题')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('💰')
      );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }

  async sendMessage(channelId, content, options = {}) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      
      if (!channel) {
        throw new Error(`Channel ${channelId} not found`);
      }

      const messageOptions = {
        content: content,
        ...options
      };

      const message = await channel.send(messageOptions);
      
      logger.info('Discord message sent', {
        channelId: channelId,
        messageId: message.id,
        contentLength: content.length
      });

      return message;
    } catch (error) {
      logger.error('Failed to send Discord message', {
        channelId: channelId,
        error: error.message
      });
      throw error;
    }
  }

  async sendEmbed(channelId, embedData) {
    const embed = new EmbedBuilder()
      .setTitle(embedData.title)
      .setDescription(embedData.description)
      .setColor(embedData.color || 0x00AE86);

    if (embedData.fields) {
      embed.addFields(embedData.fields);
    }

    if (embedData.footer) {
      embed.setFooter({ text: embedData.footer });
    }

    if (embedData.timestamp) {
      embed.setTimestamp();
    }

    return await this.sendMessage(channelId, '', { embeds: [embed] });
  }

  async sendDM(userId, content, options = {}) {
    try {
      const user = await this.client.users.fetch(userId);
      const message = await user.send({
        content: content,
        ...options
      });

      logger.info('Discord DM sent', {
        userId: userId,
        messageId: message.id
      });

      return message;
    } catch (error) {
      logger.error('Failed to send Discord DM', {
        userId: userId,
        error: error.message
      });
      throw error;
    }
  }

  async createWebhook(channelId, name, avatar) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      const webhook = await channel.createWebhook({
        name: name,
        avatar: avatar
      });

      logger.info('Discord webhook created', {
        channelId: channelId,
        webhookId: webhook.id,
        name: name
      });

      return webhook;
    } catch (error) {
      logger.error('Failed to create Discord webhook', {
        channelId: channelId,
        error: error.message
      });
      throw error;
    }
  }

  async registerSlashCommand(commandData) {
    try {
      const command = await this.client.application.commands.create(commandData);
      
      logger.info('Discord slash command registered', {
        commandName: command.name,
        commandId: command.id
      });

      return command;
    } catch (error) {
      logger.error('Failed to register Discord slash command', {
        commandName: commandData.name,
        error: error.message
      });
      throw error;
    }
  }

  async registerCommands() {
    const commands = [
      {
        name: 'help',
        description: '显示帮助信息'
      },
      {
        name: 'support',
        description: '联系客服支持'
      },
      {
        name: 'faq',
        description: '查看常见问题'
      },
      {
        name: 'status',
        description: '查看服务状态'
      }
    ];

    for (const command of commands) {
      await this.registerSlashCommand(command);
    }
  }

  registerMessageHandler(pattern, handler) {
    this.messageHandlers.set(pattern, handler);
  }

  registerCommandHandler(command, handler) {
    this.commandHandlers.set(command, handler);
  }

  async processMessage(messageData) {
    try {
      // 发送到消息处理服务
      const response = await fetch(`${process.env.MESSAGE_PROCESSOR_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SERVICE_TOKEN}`
        },
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      logger.info('Message processed successfully', {
        messageId: messageData.id,
        platform: 'discord',
        classification: result.classification
      });

      // 根据处理结果发送回复
      if (result.autoReply) {
        await this.sendAutoReply(messageData, result.autoReply);
      }

    } catch (error) {
      logger.error('Failed to process Discord message', {
        messageId: messageData.id,
        error: error.message
      });
    }
  }

  async sendAutoReply(originalMessage, replyData) {
    try {
      if (replyData.type === 'embed') {
        await this.sendEmbed(originalMessage.channelId, replyData.content);
      } else {
        await this.sendMessage(originalMessage.channelId, replyData.content);
      }
    } catch (error) {
      logger.error('Failed to send auto reply', {
        originalMessageId: originalMessage.id,
        error: error.message
      });
    }
  }

  async sendToCustomerService(sessionData) {
    try {
      const response = await fetch(`${process.env.CUSTOMER_SERVICE_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SERVICE_TOKEN}`
        },
        body: JSON.stringify(sessionData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      logger.info('Customer service session created', {
        sessionId: result.sessionId,
        platform: 'discord',
        userId: sessionData.userId
      });

      return result;
    } catch (error) {
      logger.error('Failed to create customer service session', {
        userId: sessionData.userId,
        error: error.message
      });
      throw error;
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      platform: 'discord',
      uptime: this.client?.uptime || 0,
      guilds: this.client?.guilds.cache.size || 0,
      users: this.client?.users.cache.size || 0,
      channels: this.client?.channels.cache.size || 0
    };
  }
}

module.exports = DiscordBot; 