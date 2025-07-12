const express = require('express');
const { Pool } = require('pg');
const Joi = require('joi');

const config = require('../../../../config/config');
const { AppError, asyncHandler, createNotFoundError, createConflictError } = require('../middleware/errorHandler');
const { requireManager, enforceTenantIsolation } = require('../middleware/auth');
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
const createMerchantSchema = Joi.object({
  merchantName: Joi.string().min(2).max(255).required(),
  businessType: Joi.string().max(100).optional(),
  industry: Joi.string().max(100).optional(),
  contactPhone: Joi.string().pattern(/^1[3-9]\d{9}$/).optional(),
  contactEmail: Joi.string().email().optional(),
  contactAddress: Joi.string().max(500).optional(),
  description: Joi.string().max(1000).optional(),
  welcomeMessage: Joi.string().max(1000).optional(),
  servicePhone: Joi.string().optional(),
  serviceEmail: Joi.string().email().optional(),
  brandLogo: Joi.string().uri().optional(),
  language: Joi.string().default('zh-CN'),
  timezone: Joi.string().default('Asia/Shanghai'),
  businessHours: Joi.object({
    enabled: Joi.boolean().default(true),
    monday: Joi.object({ start: Joi.string(), end: Joi.string() }).optional(),
    tuesday: Joi.object({ start: Joi.string(), end: Joi.string() }).optional(),
    wednesday: Joi.object({ start: Joi.string(), end: Joi.string() }).optional(),
    thursday: Joi.object({ start: Joi.string(), end: Joi.string() }).optional(),
    friday: Joi.object({ start: Joi.string(), end: Joi.string() }).optional(),
    saturday: Joi.object({ start: Joi.string(), end: Joi.string() }).optional(),
    sunday: Joi.object({ start: Joi.string(), end: Joi.string() }).optional()
  }).optional(),
  brandColors: Joi.object({
    primary: Joi.string().optional(),
    secondary: Joi.string().optional()
  }).optional()
});

const updateMerchantSchema = Joi.object({
  merchantName: Joi.string().min(2).max(255).optional(),
  businessType: Joi.string().max(100).optional(),
  industry: Joi.string().max(100).optional(),
  contactPhone: Joi.string().pattern(/^1[3-9]\d{9}$/).optional(),
  contactEmail: Joi.string().email().optional(),
  contactAddress: Joi.string().max(500).optional(),
  description: Joi.string().max(1000).optional(),
  status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
  settings: Joi.object().optional()
});

const createInviteCodeSchema = Joi.object({
  platform: Joi.string().valid('telegram', 'whatsapp', 'slack', 'discord', 'teams', 'intercom').required(),
  maxUses: Joi.number().integer().min(1).max(1000).default(1),
  expiresInDays: Joi.number().integer().min(1).max(365).default(30)
});

/**
 * @swagger
 * /api/merchants:
 *   get:
 *     summary: 获取商户列表
 *     tags: [Merchants]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索商户名称或ID
 *       - in: query
 *         name: businessType
 *         schema:
 *           type: string
 *         description: 按业务类型过滤
 *     responses:
 *       200:
 *         description: 商户列表获取成功
 */
router.get('/', enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search = '', businessType = '' } = req.query;

  const result = await merchantService.getTenantMerchants(req.user.tenantId, {
    page: parseInt(page),
    limit: parseInt(limit),
    search,
    businessType
  });

  res.json({
    status: 'success',
    data: {
      merchants: result.merchants.map(merchant => ({
        id: merchant.merchant_id,
        name: merchant.merchant_name,
        businessType: merchant.business_type,
        industry: merchant.industry,
        status: merchant.status,
        totalBots: merchant.total_bots || 0,
        activeBots: merchant.active_bots || 0,
        platforms: merchant.platforms || [],
        createdAt: merchant.created_at
      })),
      pagination: result.pagination
    }
  });
}));

/**
 * @swagger
 * /api/merchants/{merchantId}:
 *   get:
 *     summary: 获取商户详情
 *     tags: [Merchants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 商户详情获取成功
 *       404:
 *         description: 商户不存在
 */
router.get('/:merchantId', enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { merchantId } = req.params;

  const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
  if (!merchant) {
    throw createNotFoundError('Merchant not found');
  }

  const bots = await merchantService.getMerchantBots(merchant.id);
  const inviteCodes = await merchantService.getMerchantInviteCodes(merchant.id);

  res.json({
    status: 'success',
    data: {
      merchant: {
        id: merchant.merchant_id,
        name: merchant.merchant_name,
        businessType: merchant.business_type,
        industry: merchant.industry,
        contactPhone: merchant.contact_phone,
        contactEmail: merchant.contact_email,
        contactAddress: merchant.contact_address,
        description: merchant.description,
        status: merchant.status,
        settings: merchant.settings,
        totalBots: merchant.total_bots,
        totalMessages: merchant.total_messages,
        totalCustomers: merchant.total_customers,
        createdAt: merchant.created_at,
        updatedAt: merchant.updated_at
      },
      bots: bots.map(bot => ({
        id: bot.id,
        name: bot.bot_name,
        platform: bot.platform,
        isActive: bot.is_active,
        isPrimary: bot.is_primary,
        messageCount: bot.message_count,
        lastMessageAt: bot.last_message_at,
        createdAt: bot.created_at
      })),
      inviteCodes: inviteCodes.map(code => ({
        id: code.id,
        code: code.invite_code,
        platform: code.platform,
        maxUses: code.max_uses,
        usedCount: code.used_count,
        expiresAt: code.expires_at,
        isActive: code.is_active,
        createdAt: code.created_at
      }))
    }
  });
}));

/**
 * @swagger
 * /api/merchants:
 *   post:
 *     summary: 创建商户
 *     tags: [Merchants]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - merchantName
 *             properties:
 *               merchantName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 255
 *               businessType:
 *                 type: string
 *                 maxLength: 100
 *               industry:
 *                 type: string
 *                 maxLength: 100
 *               contactPhone:
 *                 type: string
 *                 pattern: '^1[3-9]\d{9}$'
 *               contactEmail:
 *                 type: string
 *                 format: email
 *               contactAddress:
 *                 type: string
 *                 maxLength: 500
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               welcomeMessage:
 *                 type: string
 *                 maxLength: 1000
 *               servicePhone:
 *                 type: string
 *               serviceEmail:
 *                 type: string
 *                 format: email
 *               brandLogo:
 *                 type: string
 *                 format: uri
 *               language:
 *                 type: string
 *                 default: zh-CN
 *               timezone:
 *                 type: string
 *                 default: Asia/Shanghai
 *               businessHours:
 *                 type: object
 *               brandColors:
 *                 type: object
 *     responses:
 *       201:
 *         description: 商户创建成功
 *       400:
 *         description: 验证错误
 */
router.post('/', requireManager, enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { error, value } = createMerchantSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  const merchant = await merchantService.createMerchant(req.user.tenantId, value, req.user.id);

  logger.info('Merchant created successfully', {
    merchantId: merchant.id,
    merchantIdentifier: merchant.merchant_id,
    tenantId: req.user.tenantId,
    createdBy: req.user.id
  });

  res.status(201).json({
    status: 'success',
    message: 'Merchant created successfully',
    data: {
      merchant: {
        id: merchant.merchant_id,
        name: merchant.merchant_name,
        businessType: merchant.business_type,
        industry: merchant.industry,
        contactPhone: merchant.contact_phone,
        contactEmail: merchant.contact_email,
        status: merchant.status,
        settings: merchant.settings,
        createdAt: merchant.created_at
      }
    }
  });
}));

/**
 * @swagger
 * /api/merchants/{merchantId}:
 *   put:
 *     summary: 更新商户信息
 *     tags: [Merchants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
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
 *               merchantName:
 *                 type: string
 *               businessType:
 *                 type: string
 *               industry:
 *                 type: string
 *               contactPhone:
 *                 type: string
 *               contactEmail:
 *                 type: string
 *               contactAddress:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended]
 *               settings:
 *                 type: object
 *     responses:
 *       200:
 *         description: 商户更新成功
 *       404:
 *         description: 商户不存在
 */
router.put('/:merchantId', requireManager, enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { merchantId } = req.params;
  const { error, value } = updateMerchantSchema.validate(req.body);
  
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
  if (!merchant) {
    throw createNotFoundError('Merchant not found');
  }

  // 构建更新数据
  const updateData = {};
  if (value.merchantName) updateData.merchant_name = value.merchantName;
  if (value.businessType) updateData.business_type = value.businessType;
  if (value.industry) updateData.industry = value.industry;
  if (value.contactPhone) updateData.contact_phone = value.contactPhone;
  if (value.contactEmail) updateData.contact_email = value.contactEmail;
  if (value.contactAddress) updateData.contact_address = value.contactAddress;
  if (value.description) updateData.description = value.description;
  if (value.status) updateData.status = value.status;

  // 更新设置
  if (value.settings) {
    const updatedMerchant = await merchantService.updateMerchantSettings(merchant.id, value.settings);
    
    res.json({
      status: 'success',
      message: 'Merchant updated successfully',
      data: {
        merchant: {
          id: updatedMerchant.merchant_id,
          name: updatedMerchant.merchant_name,
          businessType: updatedMerchant.business_type,
          industry: updatedMerchant.industry,
          status: updatedMerchant.status,
          settings: updatedMerchant.settings,
          updatedAt: updatedMerchant.updated_at
        }
      }
    });
  } else {
    // 更新基本信息
    const updateQuery = `
      UPDATE merchants 
      SET ${Object.keys(updateData).map((key, index) => `${key} = $${index + 1}`).join(', ')}, updated_at = NOW()
      WHERE id = $${Object.keys(updateData).length + 1}
      RETURNING *
    `;

    const updateValues = [...Object.values(updateData), merchant.id];
    const result = await pool.query(updateQuery, updateValues);
    const updatedMerchant = result.rows[0];

    logger.info('Merchant updated successfully', {
      merchantId: merchant.id,
      merchantIdentifier: merchant.merchant_id,
      tenantId: req.user.tenantId,
      updatedBy: req.user.id,
      updatedFields: Object.keys(updateData)
    });

    res.json({
      status: 'success',
      message: 'Merchant updated successfully',
      data: {
        merchant: {
          id: updatedMerchant.merchant_id,
          name: updatedMerchant.merchant_name,
          businessType: updatedMerchant.business_type,
          industry: updatedMerchant.industry,
          status: updatedMerchant.status,
          settings: updatedMerchant.settings,
          updatedAt: updatedMerchant.updated_at
        }
      }
    });
  }
}));

/**
 * @swagger
 * /api/merchants/{merchantId}:
 *   delete:
 *     summary: 删除商户
 *     tags: [Merchants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 商户删除成功
 *       404:
 *         description: 商户不存在
 */
router.delete('/:merchantId', requireManager, enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { merchantId } = req.params;

  const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
  if (!merchant) {
    throw createNotFoundError('Merchant not found');
  }

  await merchantService.deleteMerchant(merchant.id);

  logger.info('Merchant deleted successfully', {
    merchantId: merchant.id,
    merchantIdentifier: merchant.merchant_id,
    tenantId: req.user.tenantId,
    deletedBy: req.user.id
  });

  res.json({
    status: 'success',
    message: 'Merchant deleted successfully'
  });
}));

/**
 * @swagger
 * /api/merchants/{merchantId}/invite-codes:
 *   post:
 *     summary: 创建商户邀请码
 *     tags: [Merchants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - platform
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: [telegram, whatsapp, slack, discord, teams, intercom]
 *               maxUses:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 1000
 *                 default: 1
 *               expiresInDays:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 365
 *                 default: 30
 *     responses:
 *       201:
 *         description: 邀请码创建成功
 *       404:
 *         description: 商户不存在
 */
router.post('/:merchantId/invite-codes', requireManager, enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { merchantId } = req.params;
  const { error, value } = createInviteCodeSchema.validate(req.body);
  
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
  if (!merchant) {
    throw createNotFoundError('Merchant not found');
  }

  const inviteCode = await merchantService.createInviteCode(
    merchant.id,
    value.platform,
    req.user.id,
    {
      maxUses: value.maxUses,
      expiresInDays: value.expiresInDays
    }
  );

  logger.info('Invite code created successfully', {
    merchantId: merchant.id,
    merchantIdentifier: merchant.merchant_id,
    inviteCode: inviteCode.invite_code,
    platform: value.platform,
    tenantId: req.user.tenantId,
    createdBy: req.user.id
  });

  res.status(201).json({
    status: 'success',
    message: 'Invite code created successfully',
    data: {
      inviteCode: {
        id: inviteCode.id,
        code: inviteCode.invite_code,
        platform: inviteCode.platform,
        maxUses: inviteCode.max_uses,
        usedCount: inviteCode.used_count,
        expiresAt: inviteCode.expires_at,
        isActive: inviteCode.is_active,
        createdAt: inviteCode.created_at
      }
    }
  });
}));

/**
 * @swagger
 * /api/merchants/{merchantId}/invite-codes:
 *   get:
 *     summary: 获取商户邀请码列表
 *     tags: [Merchants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 邀请码列表获取成功
 *       404:
 *         description: 商户不存在
 */
router.get('/:merchantId/invite-codes', enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { merchantId } = req.params;

  const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
  if (!merchant) {
    throw createNotFoundError('Merchant not found');
  }

  const inviteCodes = await merchantService.getMerchantInviteCodes(merchant.id);

  res.json({
    status: 'success',
    data: {
      inviteCodes: inviteCodes.map(code => ({
        id: code.id,
        code: code.invite_code,
        platform: code.platform,
        maxUses: code.max_uses,
        usedCount: code.used_count,
        expiresAt: code.expires_at,
        isActive: code.is_active,
        createdBy: code.created_by_name,
        createdAt: code.created_at
      }))
    }
  });
}));

/**
 * @swagger
 * /api/merchants/{merchantId}/invite-codes/{codeId}:
 *   delete:
 *     summary: 删除邀请码
 *     tags: [Merchants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: codeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 邀请码删除成功
 *       404:
 *         description: 邀请码不存在
 */
router.delete('/:merchantId/invite-codes/:codeId', requireManager, enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { merchantId, codeId } = req.params;

  const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
  if (!merchant) {
    throw createNotFoundError('Merchant not found');
  }

  const result = await pool.query(
    'UPDATE merchant_invite_codes SET is_active = false WHERE id = $1 AND merchant_id = $2 RETURNING *',
    [codeId, merchant.id]
  );

  if (result.rows.length === 0) {
    throw createNotFoundError('Invite code not found');
  }

  logger.info('Invite code deleted successfully', {
    merchantId: merchant.id,
    merchantIdentifier: merchant.merchant_id,
    codeId,
    tenantId: req.user.tenantId,
    deletedBy: req.user.id
  });

  res.json({
    status: 'success',
    message: 'Invite code deleted successfully'
  });
}));

/**
 * @swagger
 * /api/merchants/{merchantId}/data:
 *   get:
 *     summary: 获取商户共享数据
 *     tags: [Merchants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: dataType
 *         schema:
 *           type: string
 *         description: 数据类型
 *     responses:
 *       200:
 *         description: 共享数据获取成功
 *       404:
 *         description: 商户不存在
 */
router.get('/:merchantId/data', enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { merchantId } = req.params;
  const { dataType } = req.query;

  const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
  if (!merchant) {
    throw createNotFoundError('Merchant not found');
  }

  const sharedData = await merchantService.getSharedData(merchant.id, dataType);

  res.json({
    status: 'success',
    data: {
      sharedData: sharedData.map(data => ({
        id: data.id,
        dataType: data.data_type,
        dataKey: data.data_key,
        dataValue: data.data_value,
        syncStatus: data.sync_status,
        lastSyncedAt: data.last_synced_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }))
    }
  });
}));

/**
 * @swagger
 * /api/merchants/{merchantId}/data:
 *   post:
 *     summary: 同步商户共享数据
 *     tags: [Merchants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dataType
 *               - dataKey
 *               - dataValue
 *             properties:
 *               dataType:
 *                 type: string
 *               dataKey:
 *                 type: string
 *               dataValue:
 *                 type: object
 *     responses:
 *       200:
 *         description: 数据同步成功
 *       404:
 *         description: 商户不存在
 */
router.post('/:merchantId/data', enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { merchantId } = req.params;
  const { dataType, dataKey, dataValue } = req.body;

  if (!dataType || !dataKey || !dataValue) {
    throw new AppError('dataType, dataKey, and dataValue are required', 400);
  }

  const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
  if (!merchant) {
    throw createNotFoundError('Merchant not found');
  }

  const syncedData = await merchantService.syncSharedData(merchant.id, dataType, dataKey, dataValue);

  logger.info('Shared data synced successfully', {
    merchantId: merchant.id,
    merchantIdentifier: merchant.merchant_id,
    dataType,
    dataKey,
    tenantId: req.user.tenantId
  });

  res.json({
    status: 'success',
    message: 'Data synced successfully',
    data: {
      sharedData: {
        id: syncedData.id,
        dataType: syncedData.data_type,
        dataKey: syncedData.data_key,
        dataValue: syncedData.data_value,
        syncStatus: syncedData.sync_status,
        lastSyncedAt: syncedData.last_synced_at
      }
    }
  });
}));

/**
 * @swagger
 * /api/merchants/{merchantId}/stats:
 *   get:
 *     summary: 获取商户统计数据
 *     tags: [Merchants]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *           default: month
 *     responses:
 *       200:
 *         description: 统计数据获取成功
 *       404:
 *         description: 商户不存在
 */
router.get('/:merchantId/stats', enforceTenantIsolation, asyncHandler(async (req, res) => {
  const { merchantId } = req.params;
  const { period = 'month' } = req.query;

  const merchant = await merchantService.getMerchantByIdentifier(req.user.tenantId, merchantId);
  if (!merchant) {
    throw createNotFoundError('Merchant not found');
  }

  // 获取统计数据
  const statsQuery = `
    SELECT 
      COUNT(DISTINCT mb.id) as total_bots,
      COUNT(DISTINCT CASE WHEN mb.is_active THEN mb.id END) as active_bots,
      SUM(mb.message_count) as total_messages,
      COUNT(DISTINCT up.id) as total_customers,
      COUNT(DISTINCT CASE WHEN up.last_seen_at >= NOW() - INTERVAL '7 days' THEN up.id END) as active_customers_7d,
      COUNT(DISTINCT CASE WHEN up.last_seen_at >= NOW() - INTERVAL '30 days' THEN up.id END) as active_customers_30d,
      ARRAY_AGG(DISTINCT mb.platform) FILTER (WHERE mb.is_active) as active_platforms
    FROM merchants m
    LEFT JOIN merchant_bots mb ON m.id = mb.merchant_id
    LEFT JOIN user_profiles up ON m.id = up.merchant_id
    WHERE m.id = $1
    GROUP BY m.id
  `;

  const statsResult = await pool.query(statsQuery, [merchant.id]);
  const stats = statsResult.rows[0] || {};

  res.json({
    status: 'success',
    data: {
      merchant: {
        id: merchant.merchant_id,
        name: merchant.merchant_name
      },
      stats: {
        totalBots: parseInt(stats.total_bots) || 0,
        activeBots: parseInt(stats.active_bots) || 0,
        totalMessages: parseInt(stats.total_messages) || 0,
        totalCustomers: parseInt(stats.total_customers) || 0,
        activeCustomers7d: parseInt(stats.active_customers_7d) || 0,
        activeCustomers30d: parseInt(stats.active_customers_30d) || 0,
        activePlatforms: stats.active_platforms || [],
        period
      }
    }
  });
}));

module.exports = router; 