const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// 导入配置和工具
const config = require('../../../config/config');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

// 导入Bot管理器
const TelegramBot = require('./integrations/TelegramBot');
const DiscordBot = require('./integrations/DiscordBot');
const SlackBot = require('./integrations/SlackBot');
const WhatsAppBot = require('./integrations/WhatsAppBot');
const LineBot = require('./integrations/LineBot');
const WeWorkBot = require('./integrations/WeWorkBot');
const BotManager = require('./managers/BotManager');

// 导入工具
const DatabaseManager = require('./utils/DatabaseManager');
const CacheManager = require('./utils/CacheManager');

// 创建Express应用
const app = express();

// 基础中间件
app.use(helmet());
app.use(cors({
  origin: config.security.corsOrigins,
  credentials: true
}));
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// 限流中间件
const limiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// 解析JSON和URL编码
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'bot-manager',
    version: '1.0.0'
  });
});

// 服务状态端点
app.get('/status', authMiddleware, async (req, res) => {
  try {
    const botStats = await botManager.getBotStats();
    
    res.json({
      service: 'bot-manager',
      status: 'running',
      bots: botStats,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get service status',
      message: error.message
    });
  }
});

// Bot配置端点
app.get('/bots', authMiddleware, async (req, res) => {
  try {
    const bots = await botManager.getAllBots(req.user.tenantId);
    
    res.json({
      success: true,
      bots: bots,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Get bots error:', error);
    res.status(500).json({
      error: 'Failed to get bots',
      message: error.message
    });
  }
});

// 创建Bot配置端点
app.post('/bots', authMiddleware, async (req, res) => {
  try {
    const { name, platform, botToken, webhookUrl, settings } = req.body;
    
    if (!name || !platform || !botToken) {
      return res.status(400).json({
        error: 'Name, platform, and botToken are required'
      });
    }

    const botConfig = {
      tenantId: req.user.tenantId,
      name,
      platform,
      botToken,
      webhookUrl,
      settings: settings || {}
    };

    const bot = await botManager.createBot(botConfig);
    
    res.status(201).json({
      success: true,
      bot: bot,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Create bot error:', error);
    res.status(500).json({
      error: 'Failed to create bot',
      message: error.message
    });
  }
});

// 启动Bot端点
app.post('/bots/:botId/start', authMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    
    const result = await botManager.startBot(botId, req.user.tenantId);
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Start bot error:', error);
    res.status(500).json({
      error: 'Failed to start bot',
      message: error.message
    });
  }
});

// 停止Bot端点
app.post('/bots/:botId/stop', authMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    
    const result = await botManager.stopBot(botId, req.user.tenantId);
    
    res.json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Stop bot error:', error);
    res.status(500).json({
      error: 'Failed to stop bot',
      message: error.message
    });
  }
});

// 发送消息端点
app.post('/bots/:botId/send', authMiddleware, async (req, res) => {
  try {
    const { botId } = req.params;
    const { channelId, content, messageType, options } = req.body;
    
    if (!channelId || !content) {
      return res.status(400).json({
        error: 'ChannelId and content are required'
      });
    }

    const result = await botManager.sendMessage(botId, {
      channelId,
      content,
      messageType: messageType || 'text',
      options: options || {},
      tenantId: req.user.tenantId
    });
    
    res.json({
      success: true,
      message: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Send message error:', error);
    res.status(500).json({
      error: 'Failed to send message',
      message: error.message
    });
  }
});

// Webhook处理端点 - Telegram
app.post('/webhook/telegram/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const update = req.body;
    
    await botManager.handleWebhook('telegram', botId, update);
    
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Telegram webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook处理端点 - Discord
app.post('/webhook/discord/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const data = req.body;
    
    await botManager.handleWebhook('discord', botId, data);
    
    res.status(200).json({ type: 1 });
  } catch (error) {
    logger.error('Discord webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook处理端点 - Slack
app.post('/webhook/slack/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const payload = req.body;
    
    // Slack URL验证
    if (payload.type === 'url_verification') {
      return res.json({ challenge: payload.challenge });
    }
    
    await botManager.handleWebhook('slack', botId, payload);
    
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Slack webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook处理端点 - WhatsApp
app.post('/webhook/whatsapp/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const data = req.body;
    
    await botManager.handleWebhook('whatsapp', botId, data);
    
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('WhatsApp webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// WhatsApp webhook验证端点
app.get('/webhook/whatsapp/:botId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// Webhook处理端点 - Line Bot
app.post('/webhook/line/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const data = req.body;
    
    // 验证Line签名
    const signature = req.headers['x-line-signature'];
    const body = JSON.stringify(data);
    
    // 这里应该验证签名，但为了简化示例，我们跳过验证
    // 在生产环境中，必须验证签名
    
    await botManager.handleWebhook('line', botId, data);
    
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Line webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook处理端点 - 企业微信
app.post('/webhook/wework/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const data = req.body;
    
    await botManager.handleWebhook('wework', botId, data);
    
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('WeWork webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// 企业微信webhook验证端点
app.get('/webhook/wework/:botId', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  
  // 这里应该验证签名
  // 在生产环境中，必须验证签名
  
  if (echostr) {
    logger.info('WeWork webhook verified');
    res.status(200).send(echostr);
  } else {
    res.status(403).send('Forbidden');
  }
});

// API路由
app.use('/api/bots', authMiddleware, require('./routes/bots'));
app.use('/api/messages', authMiddleware, require('./routes/messages'));
app.use('/api/webhooks', require('./routes/webhooks'));

// 全局变量
let botManager;
let dbManager;
let cacheManager;

// 初始化服务
async function initializeService() {
  try {
    logger.info('Initializing Bot Manager Service...');
    
    // 初始化数据库管理器
    dbManager = new DatabaseManager(config.database);
    await dbManager.initialize();
    logger.info('Database manager initialized');

    // 初始化缓存管理器
    cacheManager = new CacheManager(config.database.redis);
    await cacheManager.initialize();
    logger.info('Cache manager initialized');

    // 初始化Bot管理器
    botManager = new BotManager({
      dbManager,
      cacheManager,
      config
    });

    // 注册Bot类型
    botManager.registerBotType('telegram', TelegramBot);
    botManager.registerBotType('discord', DiscordBot);
    botManager.registerBotType('slack', SlackBot);
    botManager.registerBotType('whatsapp', WhatsAppBot);
    botManager.registerBotType('line', LineBot);
    botManager.registerBotType('wework', WeWorkBot);

    await botManager.initialize();
    logger.info('Bot manager initialized');

    // 启动已配置的Bots
    await botManager.startConfiguredBots();
    logger.info('Configured bots started');

    // 设置全局变量供路由使用
    app.locals.botManager = botManager;
    app.locals.dbManager = dbManager;
    app.locals.cacheManager = cacheManager;

    logger.info('Bot Manager Service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Bot Manager Service:', error);
    process.exit(1);
  }
}

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const PORT = config.services.botManager.port || 3004;
const HOST = config.services.botManager.host || '0.0.0.0';

async function startServer() {
  try {
    await initializeService();
    
    const server = app.listen(PORT, HOST, () => {
      logger.info(`Bot Manager Service started on ${HOST}:${PORT}`);
      logger.info(`Health check available at http://${HOST}:${PORT}/health`);
      logger.info(`Webhook endpoints:`);
      logger.info(`  Telegram: http://${HOST}:${PORT}/webhook/telegram/:botId`);
      logger.info(`  Discord: http://${HOST}:${PORT}/webhook/discord/:botId`);
      logger.info(`  Slack: http://${HOST}:${PORT}/webhook/slack/:botId`);
      logger.info(`  WhatsApp: http://${HOST}:${PORT}/webhook/whatsapp/:botId`);
      logger.info(`  Line: http://${HOST}:${PORT}/webhook/line/:botId`);
      logger.info(`  WeWork: http://${HOST}:${PORT}/webhook/wework/:botId`);
    });

    // 优雅关闭
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      server.close(async () => {
        try {
          // 停止所有Bots
          if (botManager) {
            await botManager.stopAllBots();
            logger.info('All bots stopped');
          }

          // 关闭数据库连接
          if (dbManager) {
            await dbManager.close();
            logger.info('Database connections closed');
          }

          // 关闭缓存连接
          if (cacheManager) {
            await cacheManager.close();
            logger.info('Cache connections closed');
          }

          logger.info('Bot Manager Service shut down successfully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    // 未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start Bot Manager Service:', error);
    process.exit(1);
  }
}

// 启动服务
startServer();

module.exports = app; 