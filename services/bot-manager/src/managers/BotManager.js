const logger = require('../utils/logger');

class BotManager {
  constructor({ dbManager, cacheManager, config }) {
    this.db = dbManager;
    this.cache = cacheManager;
    this.config = config;
    this.botTypes = new Map(); // 注册的Bot类型
    this.activeBots = new Map(); // 活跃的Bot实例
    this.initialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing BotManager...');
      
      if (!this.db || !this.cache) {
        throw new Error('Missing required dependencies');
      }

      this.initialized = true;
      logger.info('BotManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize BotManager', { error: error.message });
      throw error;
    }
  }

  // 注册Bot类型
  registerBotType(platform, BotClass) {
    try {
      this.botTypes.set(platform, BotClass);
      logger.info('Bot type registered', { platform, className: BotClass.name });
    } catch (error) {
      logger.error('Failed to register bot type', { error: error.message, platform });
      throw error;
    }
  }

  // 获取所有Bot配置
  async getAllBots(tenantId) {
    try {
      if (!this.initialized) {
        throw new Error('BotManager not initialized');
      }

      const query = `
        SELECT * FROM bots 
        WHERE tenant_id = $1 
        ORDER BY created_at DESC
      `;
      
      const result = await this.db.query(query, [tenantId]);
      const bots = result.rows.map(bot => ({
        ...bot,
        isActive: this.activeBots.has(bot.id),
        lastActivity: this.getLastActivity(bot.id)
      }));

      logger.debug('Retrieved bots', { tenantId, count: bots.length });
      return bots;
    } catch (error) {
      logger.error('Failed to get all bots', { error: error.message, tenantId });
      throw error;
    }
  }

  // 创建Bot配置
  async createBot(botConfig) {
    try {
      if (!this.initialized) {
        throw new Error('BotManager not initialized');
      }

      logger.bot('create', 'new', { botConfig });

      // 验证Bot配置
      this.validateBotConfig(botConfig);

      // 检查Bot类型是否支持
      if (!this.botTypes.has(botConfig.platform)) {
        throw new Error(`Unsupported bot platform: ${botConfig.platform}`);
      }

      // 创建Bot记录
      const query = `
        INSERT INTO bots (
          tenant_id, name, platform, bot_token, webhook_url, 
          settings, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *
      `;

      const params = [
        botConfig.tenantId,
        botConfig.name,
        botConfig.platform,
        botConfig.botToken,
        botConfig.webhookUrl || null,
        JSON.stringify(botConfig.settings || {}),
        'inactive'
      ];

      const result = await this.db.query(query, params);
      const bot = result.rows[0];

      logger.bot('created', bot.id, {
        tenantId: botConfig.tenantId,
        name: bot.name,
        platform: bot.platform
      });

      return bot;
    } catch (error) {
      logger.error('Failed to create bot', { error: error.message, botConfig });
      throw error;
    }
  }

  // 启动Bot
  async startBot(botId, tenantId) {
    try {
      if (!this.initialized) {
        throw new Error('BotManager not initialized');
      }

      logger.bot('start', botId, { tenantId });

      // 获取Bot配置
      const bot = await this.getBotById(botId, tenantId);
      if (!bot) {
        throw new Error('Bot not found');
      }

      // 检查Bot是否已经在运行
      if (this.activeBots.has(botId)) {
        logger.warn('Bot already running', { botId });
        return { success: true, message: 'Bot already running' };
      }

      // 获取Bot类
      const BotClass = this.botTypes.get(bot.platform);
      if (!BotClass) {
        throw new Error(`Unsupported bot platform: ${bot.platform}`);
      }

      // 创建Bot实例
      const botInstance = new BotClass({
        id: bot.id,
        token: bot.bot_token,
        config: JSON.parse(bot.settings || '{}'),
        webhookUrl: bot.webhook_url,
        onMessage: (message) => this.handleMessage(botId, message),
        onError: (error) => this.handleBotError(botId, error)
      });

      // 启动Bot
      await botInstance.start();
      
      // 保存Bot实例
      this.activeBots.set(botId, {
        instance: botInstance,
        startedAt: new Date(),
        platform: bot.platform,
        tenantId: bot.tenant_id
      });

      // 更新数据库状态
      await this.updateBotStatus(botId, 'active');

      logger.bot('started', botId, {
        platform: bot.platform,
        tenantId: bot.tenant_id
      });

      return { success: true, message: 'Bot started successfully' };
    } catch (error) {
      logger.error('Failed to start bot', { error: error.message, botId });
      throw error;
    }
  }

  // 停止Bot
  async stopBot(botId, tenantId) {
    try {
      if (!this.initialized) {
        throw new Error('BotManager not initialized');
      }

      logger.bot('stop', botId, { tenantId });

      const botData = this.activeBots.get(botId);
      if (!botData) {
        logger.warn('Bot not running', { botId });
        return { success: true, message: 'Bot not running' };
      }

      // 停止Bot实例
      if (botData.instance && typeof botData.instance.stop === 'function') {
        await botData.instance.stop();
      }

      // 从活跃列表移除
      this.activeBots.delete(botId);

      // 更新数据库状态
      await this.updateBotStatus(botId, 'inactive');

      logger.bot('stopped', botId, {
        platform: botData.platform,
        tenantId: botData.tenantId
      });

      return { success: true, message: 'Bot stopped successfully' };
    } catch (error) {
      logger.error('Failed to stop bot', { error: error.message, botId });
      throw error;
    }
  }

  // 发送消息
  async sendMessage(botId, messageData) {
    try {
      if (!this.initialized) {
        throw new Error('BotManager not initialized');
      }

      const botData = this.activeBots.get(botId);
      if (!botData) {
        throw new Error('Bot not running');
      }

      logger.message('send', messageData, { botId });

      const result = await botData.instance.sendMessage(messageData);

      logger.message('sent', messageData, { 
        botId, 
        result: result.success 
      });

      return result;
    } catch (error) {
      logger.error('Failed to send message', { 
        error: error.message, 
        botId, 
        messageData 
      });
      throw error;
    }
  }

  // 处理Webhook
  async handleWebhook(platform, botId, data) {
    try {
      const botData = this.activeBots.get(botId);
      if (!botData) {
        logger.warn('Webhook received for inactive bot', { platform, botId });
        return;
      }

      logger.webhook(platform, botId, { 
        dataType: typeof data,
        hasContent: !!data.message?.text 
      });

      if (botData.instance && typeof botData.instance.handleWebhook === 'function') {
        await botData.instance.handleWebhook(data);
      }
    } catch (error) {
      logger.error('Failed to handle webhook', { 
        error: error.message, 
        platform, 
        botId 
      });
      throw error;
    }
  }

  // 处理消息
  async handleMessage(botId, message) {
    try {
      logger.message('received', message, { botId });

      // 将消息转发给消息处理服务
      const messageProcessorUrl = `http://localhost:${this.config.services.messageProcessor.port}`;
      const axios = require('axios');

      const response = await axios.post(`${messageProcessorUrl}/messages/process`, {
        ...message,
        botId
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.SERVICE_API_KEY || 'octopus-service-key'
        }
      });

      logger.message('forwarded', message, { 
        botId, 
        success: response.status === 201 
      });

    } catch (error) {
      logger.error('Failed to handle message', { 
        error: error.message, 
        botId, 
        message 
      });
    }
  }

  // 处理Bot错误
  async handleBotError(botId, error) {
    try {
      logger.error('Bot error occurred', { 
        botId, 
        error: error.message 
      });

      // 更新Bot状态
      await this.updateBotStatus(botId, 'error');

      // 可以在这里添加重启逻辑或通知管理员
    } catch (err) {
      logger.error('Failed to handle bot error', { 
        error: err.message, 
        botId, 
        originalError: error.message 
      });
    }
  }

  // 启动已配置的Bots
  async startConfiguredBots() {
    try {
      if (!this.initialized) {
        throw new Error('BotManager not initialized');
      }

      logger.info('Starting configured bots...');

      // 获取所有应该自动启动的Bots
      const query = `
        SELECT * FROM bots 
        WHERE auto_start = true 
        ORDER BY created_at
      `;
      
      const result = await this.db.query(query);
      const bots = result.rows;

      let startedCount = 0;
      for (const bot of bots) {
        try {
          await this.startBot(bot.id, bot.tenant_id);
          startedCount++;
        } catch (error) {
          logger.error('Failed to auto-start bot', {
            error: error.message,
            botId: bot.id,
            botName: bot.name
          });
        }
      }

      logger.info('Configured bots startup completed', {
        total: bots.length,
        started: startedCount,
        failed: bots.length - startedCount
      });

    } catch (error) {
      logger.error('Failed to start configured bots', { error: error.message });
    }
  }

  // 停止所有Bots
  async stopAllBots() {
    try {
      logger.info('Stopping all active bots...');

      const botIds = Array.from(this.activeBots.keys());
      let stoppedCount = 0;

      for (const botId of botIds) {
        try {
          const botData = this.activeBots.get(botId);
          await this.stopBot(botId, botData.tenantId);
          stoppedCount++;
        } catch (error) {
          logger.error('Failed to stop bot during shutdown', {
            error: error.message,
            botId
          });
        }
      }

      logger.info('All bots stopped', {
        total: botIds.length,
        stopped: stoppedCount
      });

    } catch (error) {
      logger.error('Failed to stop all bots', { error: error.message });
    }
  }

  // 获取Bot统计信息
  async getBotStats() {
    try {
      const activeBots = this.activeBots.size;
      const platforms = {};
      
      for (const [botId, botData] of this.activeBots) {
        const platform = botData.platform;
        platforms[platform] = (platforms[platform] || 0) + 1;
      }

      // 从数据库获取总计
      const statsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
          COUNT(CASE WHEN status = 'error' THEN 1 END) as error
        FROM bots
      `;

      const result = await this.db.query(statsQuery);
      const dbStats = result.rows[0];

      return {
        total: parseInt(dbStats.total),
        active: activeBots,
        inactive: parseInt(dbStats.inactive),
        error: parseInt(dbStats.error),
        platforms
      };
    } catch (error) {
      logger.error('Failed to get bot stats', { error: error.message });
      throw error;
    }
  }

  // 私有方法
  async getBotById(botId, tenantId) {
    const query = `
      SELECT * FROM bots 
      WHERE id = $1 AND tenant_id = $2
    `;
    const result = await this.db.query(query, [botId, tenantId]);
    return result.rows[0] || null;
  }

  async updateBotStatus(botId, status) {
    const query = `
      UPDATE bots 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2
    `;
    await this.db.query(query, [status, botId]);
  }

  getLastActivity(botId) {
    const botData = this.activeBots.get(botId);
    return botData ? botData.startedAt : null;
  }

  validateBotConfig(config) {
    const required = ['tenantId', 'name', 'platform', 'botToken'];
    const missing = required.filter(field => !config[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    const supportedPlatforms = Array.from(this.botTypes.keys());
    if (!supportedPlatforms.includes(config.platform)) {
      throw new Error(`Unsupported platform: ${config.platform}. Supported: ${supportedPlatforms.join(', ')}`);
    }
  }

  // 关闭Bot管理器
  async shutdown() {
    try {
      logger.info('Shutting down BotManager...');
      
      await this.stopAllBots();
      this.initialized = false;
      
      logger.info('BotManager shut down successfully');
    } catch (error) {
      logger.error('Error during BotManager shutdown', { error: error.message });
      throw error;
    }
  }
}

module.exports = BotManager; 