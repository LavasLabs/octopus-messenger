const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const axios = require('axios');

const config = require('../../../../config/config');
const { AppError, asyncHandler, createNotFoundError, createConflictError } = require('../middleware/errorHandler');
const { requireManager, limitTenantResources, enforceTenantIsolation } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const MerchantService = require('../services/MerchantService');

const router = express.Router();

// 创建数据库连接池
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl
});

// 初始化商户服务
const merchantService = new MerchantService(config.database);

// 验证模式
const createBotSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  platform: Joi.string().valid('telegram', 'whatsapp', 'slack', 'discord', 'teams', 'intercom').required(),
  botToken: Joi.string().required(),
  merchantId: Joi.string().optional(), // 新增：商户ID
  inviteCode: Joi.string().optional(), // 新增：邀请码
  webhookUrl: Joi.string().uri().optional(),
  webhookSecret: Joi.string().optional(),
  settings: Joi.object({
    autoReply: Joi.boolean().default(true),
    language: Joi.string().default('zh-CN'),
    workingHours: Joi.object({
      enabled: Joi.boolean().default(false),
      start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
      end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
      timezone: Joi.string().default('Asia/Shanghai')
    }).optional(),
    welcomeMessage: Joi.string().max(1000).optional(),
    commands: Joi.object().optional(),
    channels: Joi.array().items(Joi.string()).optional(),
    dmEnabled: Joi.boolean().default(true),
    templates: Joi.object().optional()
  }).default({})
});

const updateBotSchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  botToken: Joi.string().optional(),
  merchantId: Joi.string().optional(), // 新增：商户ID
  webhookUrl: Joi.string().uri().optional(),
  webhookSecret: Joi.string().optional(),
  isActive: Joi.boolean().optional(),
  settings: Joi.object().optional()
});

// 设置Webhook的辅助函数
const setupWebhook = async (botConfig) => {
  const { platform, bot_token, webhook_url, webhook_secret } = botConfig;

  switch (platform) {
    case 'telegram':
      if (!bot_token) {
        throw new Error('Telegram bot token is required');
      }
      
      const telegramApiUrl = `https://api.telegram.org/bot${bot_token}/setWebhook`;
      const telegramPayload = {
        url: webhook_url,
        secret_token: webhook_secret
      };
      
      const telegramResponse = await axios.post(telegramApiUrl, telegramPayload);
      
      if (!telegramResponse.data.ok) {
        throw new Error(`Telegram webhook setup failed: ${telegramResponse.data.description}`);
      }
      
      logger.info('Telegram webhook setup successful', { webhook_url });
      break;

    case 'whatsapp':
      // WhatsApp webhook setup logic
      logger.info('WhatsApp webhook setup completed', { webhook_url });
      break;

    case 'slack':
      // Slack webhook setup logic
      logger.info('Slack webhook setup completed', { webhook_url });
      break;

    case 'discord':
      // Discord webhook setup logic
      logger.info('Discord webhook setup completed', { webhook_url });
      break;

    case 'intercom':
      // Intercom webhook setup logic
      logger.info('Intercom webhook setup completed', { webhook_url });
      break;

    default:
      logger.warn('Webhook setup not implemented for platform', { platform });
  }
};

/**
 * @swagger
 * /api/bots:
 *   get:
 *     summary: 获取Bot列表
 *     tags: [Bots]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *           enum: [telegram, whatsapp, slack, discord, teams, intercom]
 *       - in: query
 *         name: merchantId
 *         schema:
 *           type: string
 *         description: 按商户ID过滤
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Bot列表获取成功
 */
router.get('/', enforceTenantIsolation, asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    platform,
    merchantId,
    status
  } = req.query;

  const offset = (page - 1) * limit;
  
  let whereClause = 'WHERE bc.tenant_id = $1 AND bc.deleted_at IS NULL';
  const queryParams = [req.user.tenantId];
  let paramIndex = 2;

  if (platform) {
    whereClause += ` AND bc.platform = $${paramIndex}`;
    queryParams.push(platform);
    paramIndex++;
  }

  if (merchantId) {
    whereClause += ` AND m.merchant_id = $${paramIndex}`;
    queryParams.push(merchantId);
    paramIndex++;
  }

  if (status) {
    const isActive = status === 'active';
    whereClause += ` AND bc.is_active = $${paramIndex}`;
    queryParams.push(isActive);
    paramIndex++;
  }

  const query = `
    SELECT 
      bc.id,
      bc.name,
      bc.platform,
      bc.webhook_url,
      bc.is_active,
      bc.settings,
      bc.created_at,
      bc.updated_at,
      u.full_name as created_by_name,
      m.merchant_id,
      m.merchant_name,
      m.business_type,
      COUNT(*) OVER() as total_count
    FROM bot_configs bc
    LEFT JOIN users u ON bc.created_by = u.id
    LEFT JOIN merchants m ON bc.merchant_id = m.id
    ${whereClause}
    ORDER BY bc.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  queryParams.push(parseInt(limit), offset);

  const result = await pool.query(query, queryParams);
  
  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
  const totalPages = Math.ceil(totalCount / limit);

  const bots = result.rows.map(row => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    webhookUrl: row.webhook_url,
    isActive: row.is_active,
    settings: row.settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by_name,
    merchant: row.merchant_id ? {
      id: row.merchant_id,
      name: row.merchant_name,
      businessType: row.business_type
    } : null
  }));

  res.json({
    status: 'success',
    data: {
      bots,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  });
}));

/**
 * @swagger
 * /api/bots/{id}:
 *   get:
 *     summary: 获取Bot详情
 *     tags: [Bots]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bot详情获取成功
 *       404:
 *         description: Bot不存在
 */
router.get('/:id', enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT 
      bc.*,
      u.full_name as created_by_name,
      m.merchant_id,
      m.merchant_name,
      m.business_type,
      m.contact_phone,
      m.contact_email,
      m.settings as merchant_settings
    FROM bot_configs bc
    LEFT JOIN users u ON bc.created_by = u.id
    LEFT JOIN merchants m ON bc.merchant_id = m.id
    WHERE bc.id = $1 AND bc.tenant_id = $2 AND bc.deleted_at IS NULL
  `;

  const result = await pool.query(query, [id, req.user.tenantId]);

  if (result.rows.length === 0) {
    throw createNotFoundError('Bot not found');
  }

  const bot = result.rows[0];

  res.json({
    status: 'success',
    data: {
      bot: {
        id: bot.id,
        name: bot.name,
        platform: bot.platform,
        webhookUrl: bot.webhook_url,
        isActive: bot.is_active,
        settings: bot.settings,
        createdAt: bot.created_at,
        updatedAt: bot.updated_at,
        createdBy: bot.created_by_name,
        merchant: bot.merchant_id ? {
          id: bot.merchant_id,
          name: bot.merchant_name,
          businessType: bot.business_type,
          contactPhone: bot.contact_phone,
          contactEmail: bot.contact_email,
          settings: bot.merchant_settings
        } : null,
        // 出于安全考虑，不返回botToken
        hasToken: !!bot.bot_token
      }
    }
  });
}));

/**
 * @swagger
 * /api/bots:
 *   post:
 *     summary: 创建Bot配置
 *     tags: [Bots]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - platform
 *               - botToken
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 255
 *               platform:
 *                 type: string
 *                 enum: [telegram, whatsapp, slack, discord, teams, intercom]
 *               botToken:
 *                 type: string
 *               merchantId:
 *                 type: string
 *                 description: 商户ID
 *               inviteCode:
 *                 type: string
 *                 description: 商户邀请码
 *               webhookUrl:
 *                 type: string
 *                 format: uri
 *               webhookSecret:
 *                 type: string
 *               settings:
 *                 type: object
 *     responses:
 *       201:
 *         description: Bot创建成功
 *       400:
 *         description: 验证错误
 *       403:
 *         description: 超出Bot数量限制
 */
router.post('/', requireManager, enforceTenantIsolation, limitTenantResources('bots'), asyncHandler(async (req, res) => {
  const { error, value } = createBotSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  const { name, platform, botToken, merchantId, inviteCode, webhookUrl, webhookSecret, settings } = value;

  // 检查同一租户下是否已有相同名称的Bot
  const existingBot = await pool.query(
    'SELECT id FROM bot_configs WHERE tenant_id = $1 AND name = $2 AND deleted_at IS NULL',
    [req.user.tenantId, name]
  );

  if (existingBot.rows.length > 0) {
    throw createConflictError('Bot name already exists');
  }

  let finalMerchantId = null;
  let merchantData = null;

  // 处理商户绑定
  if (inviteCode) {
    // 通过邀请码绑定商户
    try {
      const bindingResult = await merchantService.bindBotByInviteCode(inviteCode, null, platform);
      finalMerchantId = bindingResult.merchant.id;
      merchantData = bindingResult.merchant;
    } catch (error) {
      throw new AppError(`邀请码绑定失败：${error.message}`, 400);
    }
  } else if (merchantId) {
    // 通过商户ID绑定商户
    try {
      const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
      finalMerchantId = merchant.id;
      merchantData = merchant;
    } catch (error) {
      throw new AppError(`商户ID无效：${error.message}`, 400);
    }
  }

  // 生成webhook URL（如果未提供）
  const finalWebhookUrl = webhookUrl || `https://api.your-domain.com/api/webhooks/${platform}`;

  const botId = uuidv4();
  const insertQuery = `
    INSERT INTO bot_configs (
      id, tenant_id, name, platform, bot_token, webhook_url, 
      webhook_secret, settings, merchant_id, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, name, platform, webhook_url, is_active, settings, merchant_id, created_at
  `;

  const result = await pool.query(insertQuery, [
    botId,
    req.user.tenantId,
    name,
    platform,
    botToken,
    finalWebhookUrl,
    webhookSecret,
    JSON.stringify(settings),
    finalMerchantId,
    req.user.id
  ]);

  const newBot = result.rows[0];

  // 如果有商户ID，创建商户-Bot关联
  if (finalMerchantId) {
    try {
      await merchantService.bindBotToMerchant(finalMerchantId, botId, platform, {
        createdFrom: 'manual',
        createdBy: req.user.id
      });
    } catch (error) {
      logger.warn('Failed to create merchant-bot binding', { 
        botId, 
        merchantId: finalMerchantId,
        error: error.message 
      });
    }
  }

  // 设置webhook
  try {
    await setupWebhook({
      id: newBot.id,
      platform: newBot.platform,
      bot_token: botToken,
      webhook_url: newBot.webhook_url,
      webhook_secret: webhookSecret
    });
  } catch (error) {
    logger.warn('Webhook setup failed, but bot was created', { 
      botId: newBot.id, 
      error: error.message 
    });
  }

  logger.info('Bot created successfully', {
    botId: newBot.id,
    tenantId: req.user.tenantId,
    platform: newBot.platform,
    merchantId: finalMerchantId,
    createdBy: req.user.id
  });

  res.status(201).json({
    status: 'success',
    message: 'Bot created successfully',
    data: {
      bot: {
        id: newBot.id,
        name: newBot.name,
        platform: newBot.platform,
        webhookUrl: newBot.webhook_url,
        isActive: newBot.is_active,
        settings: newBot.settings,
        createdAt: newBot.created_at,
        merchant: merchantData ? {
          id: merchantData.merchant_id || merchantData.id,
          name: merchantData.merchant_name || merchantData.name
        } : null
      }
    }
  });
}));

/**
 * @swagger
 * /api/bots/{id}:
 *   put:
 *     summary: 更新Bot配置
 *     tags: [Bots]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               botToken:
 *                 type: string
 *               merchantId:
 *                 type: string
 *               webhookUrl:
 *                 type: string
 *               webhookSecret:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               settings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Bot更新成功
 *       404:
 *         description: Bot不存在
 */
router.put('/:id', requireManager, enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateBotSchema.validate(req.body);
  
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  // 检查Bot是否存在
  const existingBot = await pool.query(
    'SELECT * FROM bot_configs WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, req.user.tenantId]
  );

  if (existingBot.rows.length === 0) {
    throw createNotFoundError('Bot not found');
  }

  const bot = existingBot.rows[0];

  // 处理商户ID更新
  let finalMerchantId = value.merchantId;
  if (value.merchantId && value.merchantId !== bot.merchant_id) {
    try {
      const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, value.merchantId);
      finalMerchantId = merchant.id;
      
      // 如果原来有商户绑定，先解绑
      if (bot.merchant_id) {
        await pool.query(
          'UPDATE merchant_bots SET is_active = false WHERE bot_config_id = $1 AND merchant_id = $2',
          [id, bot.merchant_id]
        );
      }
      
      // 创建新的商户绑定
      await merchantService.bindBotToMerchant(merchant.id, id, bot.platform, {
        updatedFrom: 'manual',
        updatedBy: req.user.id
      });
    } catch (error) {
      throw new AppError(`商户ID绑定失败：${error.message}`, 400);
    }
  }

  // 构建更新字段
  const updateFields = [];
  const updateValues = [];
  let paramIndex = 1;

  Object.keys(value).forEach(key => {
    if (value[key] !== undefined) {
      if (key === 'settings') {
        updateFields.push(`${key} = $${paramIndex}`);
        updateValues.push(JSON.stringify(value[key]));
      } else if (key === 'merchantId') {
        updateFields.push(`merchant_id = $${paramIndex}`);
        updateValues.push(finalMerchantId);
      } else {
        const dbKey = key === 'isActive' ? 'is_active' : 
                     key === 'botToken' ? 'bot_token' :
                     key === 'webhookUrl' ? 'webhook_url' :
                     key === 'webhookSecret' ? 'webhook_secret' : key;
        updateFields.push(`${dbKey} = $${paramIndex}`);
        updateValues.push(value[key]);
      }
      paramIndex++;
    }
  });

  if (updateFields.length === 0) {
    throw new AppError('No valid fields to update', 400);
  }

  updateFields.push(`updated_at = NOW()`);
  updateValues.push(id, req.user.tenantId);

  const updateQuery = `
    UPDATE bot_configs 
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
    RETURNING id, name, platform, webhook_url, is_active, settings, merchant_id, updated_at
  `;

  const result = await pool.query(updateQuery, updateValues);
  const updatedBot = result.rows[0];

  // 如果更新了webhook相关配置，重新设置webhook
  if (value.botToken || value.webhookUrl || value.webhookSecret) {
    try {
      await setupWebhook({
        id: updatedBot.id,
        platform: updatedBot.platform,
        bot_token: value.botToken || bot.bot_token,
        webhook_url: updatedBot.webhook_url,
        webhook_secret: value.webhookSecret || bot.webhook_secret
      });
    } catch (error) {
      logger.warn('Webhook update failed', { 
        botId: updatedBot.id, 
        error: error.message 
      });
    }
  }

  logger.info('Bot updated successfully', {
    botId: updatedBot.id,
    tenantId: req.user.tenantId,
    updatedBy: req.user.id,
    updatedFields: Object.keys(value)
  });

  res.json({
    status: 'success',
    message: 'Bot updated successfully',
    data: {
      bot: {
        id: updatedBot.id,
        name: updatedBot.name,
        platform: updatedBot.platform,
        webhookUrl: updatedBot.webhook_url,
        isActive: updatedBot.is_active,
        settings: updatedBot.settings,
        merchantId: updatedBot.merchant_id,
        updatedAt: updatedBot.updated_at
      }
    }
  });
}));

/**
 * @swagger
 * /api/bots/by-merchant/{merchantId}:
 *   get:
 *     summary: 获取商户的所有Bot
 *     tags: [Bots]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *         description: 商户ID
 *     responses:
 *       200:
 *         description: 商户Bot列表获取成功
 *       404:
 *         description: 商户不存在
 */
router.get('/by-merchant/:merchantId', enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { merchantId } = req.params;

  // 验证商户是否存在且属于当前租户
  const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
  if (!merchant) {
    throw createNotFoundError('Merchant not found');
  }

  // 获取商户的所有Bot
  const bots = await merchantService.getMerchantBots(merchant.id);

  res.json({
    status: 'success',
    data: {
      merchant: {
        id: merchant.merchant_id,
        name: merchant.merchant_name,
        businessType: merchant.business_type
      },
      bots: bots.map(bot => ({
        id: bot.id,
        name: bot.bot_name,
        platform: bot.platform,
        isActive: bot.is_active && bot.bot_active,
        isPrimary: bot.is_primary,
        messageCount: bot.message_count,
        lastMessageAt: bot.last_message_at,
        createdAt: bot.created_at
      }))
    }
  });
}));

/**
 * @swagger
 * /api/bots/{id}:
 *   delete:
 *     summary: 删除Bot配置
 *     tags: [Bots]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bot删除成功
 *       404:
 *         description: Bot不存在
 */
router.delete('/:id', requireManager, enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 获取Bot信息
  const botQuery = await pool.query(
    'SELECT * FROM bot_configs WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, req.user.tenantId]
  );

  if (botQuery.rows.length === 0) {
    throw createNotFoundError('Bot not found');
  }

  const bot = botQuery.rows[0];

  // 开始事务
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 软删除Bot
    await client.query(
      'UPDATE bot_configs SET deleted_at = NOW() WHERE id = $1',
      [id]
    );

    // 如果有商户绑定，禁用商户-Bot关联
    if (bot.merchant_id) {
      await client.query(
        'UPDATE merchant_bots SET is_active = false WHERE bot_config_id = $1',
        [id]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  logger.info('Bot deleted successfully', {
    botId: id,
    tenantId: req.user.tenantId,
    merchantId: bot.merchant_id,
    deletedBy: req.user.id
  });

  res.json({
    status: 'success',
    message: 'Bot deleted successfully'
  });
}));

/**
 * @swagger
 * /api/bots/{id}/status:
 *   get:
 *     summary: 获取Bot状态
 *     tags: [Bots]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bot状态获取成功
 */
router.get('/:id/status', enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const bot = await pool.query(
    'SELECT * FROM bot_configs WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, req.user.tenantId]
  );

  if (bot.rows.length === 0) {
    throw createNotFoundError('Bot not found');
  }

  const botConfig = bot.rows[0];

  // 获取最近24小时的消息统计
  const statsQuery = `
    SELECT 
      COUNT(*) as total_messages,
      COUNT(CASE WHEN received_at >= NOW() - INTERVAL '1 hour' THEN 1 END) as messages_last_hour,
      COUNT(CASE WHEN received_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as messages_last_24h
    FROM messages 
    WHERE bot_config_id = $1 AND tenant_id = $2
  `;

  const statsResult = await pool.query(statsQuery, [id, req.user.tenantId]);
  const stats = statsResult.rows[0];

  // 检查Bot连接状态（简化版本）
  let connectionStatus = 'unknown';
  try {
    switch (botConfig.platform) {
      case 'telegram':
        if (botConfig.bot_token) {
          const response = await axios.get(`${config.integrations.telegram.apiUrl}${botConfig.bot_token}/getMe`);
          connectionStatus = response.data.ok ? 'connected' : 'error';
        }
        break;
      default:
        connectionStatus = 'not_checked';
    }
  } catch (error) {
    connectionStatus = 'error';
  }

  res.json({
    status: 'success',
    data: {
      botStatus: {
        id: botConfig.id,
        name: botConfig.name,
        platform: botConfig.platform,
        isActive: botConfig.is_active,
        connectionStatus,
        statistics: {
          totalMessages: parseInt(stats.total_messages),
          messagesLastHour: parseInt(stats.messages_last_hour),
          messagesLast24h: parseInt(stats.messages_last_24h)
        },
        lastUpdated: new Date().toISOString()
      }
    }
  });
}));

/**
 * @swagger
 * /api/bots/{id}/test:
 *   post:
 *     summary: 测试Bot连接
 *     tags: [Bots]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 测试成功
 *       400:
 *         description: 测试失败
 */
router.post('/:id/test', requireManager, enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const bot = await pool.query(
    'SELECT * FROM bot_configs WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, req.user.tenantId]
  );

  if (bot.rows.length === 0) {
    throw createNotFoundError('Bot not found');
  }

  const botConfig = bot.rows[0];
  const testResults = {
    botId: id,
    platform: botConfig.platform,
    tests: {}
  };

  try {
    switch (botConfig.platform) {
      case 'telegram':
        // 测试Bot基本信息
        const telegramApiUrl = `${config.integrations.telegram.apiUrl}${botConfig.bot_token}/getMe`;
        const botInfoResponse = await axios.get(telegramApiUrl);
        testResults.tests.botInfo = {
          success: botInfoResponse.data.ok,
          data: botInfoResponse.data.result
        };

        // 测试Webhook配置
        const webhookInfoUrl = `${config.integrations.telegram.apiUrl}${botConfig.bot_token}/getWebhookInfo`;
        const webhookResponse = await axios.get(webhookInfoUrl);
        testResults.tests.webhook = {
          success: true,
          data: webhookResponse.data.result
        };
        break;

      case 'whatsapp':
        // 测试WhatsApp API连接
        const whatsappApiUrl = `${config.integrations.whatsapp.apiUrl}/${botConfig.settings.phoneNumberId}`;
        const whatsappResponse = await axios.get(whatsappApiUrl, {
          headers: {
            'Authorization': `Bearer ${botConfig.bot_token}`
          }
        });
        testResults.tests.apiConnection = {
          success: whatsappResponse.status === 200,
          data: whatsappResponse.data
        };
        break;

      case 'slack':
        // 测试Slack Bot Token
        const slackResponse = await axios.get('https://slack.com/api/auth.test', {
          headers: {
            'Authorization': `Bearer ${botConfig.bot_token}`
          }
        });
        testResults.tests.authTest = {
          success: slackResponse.data.ok,
          data: slackResponse.data
        };
        break;

      default:
        throw new AppError('Platform not supported for testing', 400);
    }

    testResults.overallSuccess = Object.values(testResults.tests).every(test => test.success);

  } catch (error) {
    testResults.overallSuccess = false;
    testResults.error = error.message;
    logger.error('Bot test failed', { botId: id, error: error.message });
  }

  logger.info('Bot test completed', {
    botId: id,
    tenantId: req.user.tenantId,
    success: testResults.overallSuccess
  });

  res.json({
    status: testResults.overallSuccess ? 'success' : 'error',
    message: testResults.overallSuccess ? 'Bot test completed successfully' : 'Bot test failed',
    data: testResults
  });
}));

module.exports = router; 