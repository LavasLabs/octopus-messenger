const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const crypto = require('crypto');

class MerchantService {
  constructor(config) {
    this.pool = new Pool(config);
    this.logger = require('../utils/logger');
  }

  // 创建商户
  async createMerchant(tenantId, merchantData, createdBy) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 生成商户ID
      const merchantId = await this.generateMerchantId(tenantId);
      const merchantSlug = this.generateMerchantSlug(merchantData.merchantName);

      // 创建商户
      const insertQuery = `
        INSERT INTO merchants (
          tenant_id, merchant_id, merchant_name, merchant_slug, 
          business_type, industry, contact_phone, contact_email, 
          contact_address, description, settings, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;

      const settings = {
        auto_reply: true,
        language: merchantData.language || 'zh-CN',
        timezone: merchantData.timezone || 'Asia/Shanghai',
        business_hours: merchantData.businessHours || {
          enabled: true,
          monday: { start: '09:00', end: '18:00' },
          tuesday: { start: '09:00', end: '18:00' },
          wednesday: { start: '09:00', end: '18:00' },
          thursday: { start: '09:00', end: '18:00' },
          friday: { start: '09:00', end: '18:00' },
          saturday: { start: '10:00', end: '17:00' },
          sunday: { start: '10:00', end: '17:00' }
        },
        welcome_message: merchantData.welcomeMessage || '欢迎来到我们的店铺！有什么可以帮助您的吗？',
        service_phone: merchantData.servicePhone || '',
        service_email: merchantData.serviceEmail || '',
        brand_logo: merchantData.brandLogo || '',
        brand_colors: merchantData.brandColors || {
          primary: '#007bff',
          secondary: '#6c757d'
        }
      };

      const result = await client.query(insertQuery, [
        tenantId,
        merchantId,
        merchantData.merchantName,
        merchantSlug,
        merchantData.businessType || '零售',
        merchantData.industry || '电子商务',
        merchantData.contactPhone,
        merchantData.contactEmail,
        merchantData.contactAddress,
        merchantData.description,
        JSON.stringify(settings),
        createdBy
      ]);

      const merchant = result.rows[0];

      // 创建初始邀请码
      const platforms = ['telegram', 'whatsapp', 'slack', 'discord'];
      for (const platform of platforms) {
        await this.createInviteCode(merchant.id, platform, createdBy, { 
          maxUses: 10, 
          expiresInDays: 30 
        });
      }

      await client.query('COMMIT');

      this.logger.info('Merchant created successfully', {
        merchantId: merchant.id,
        merchantIdentifier: merchant.merchant_id,
        tenantId,
        createdBy
      });

      return merchant;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Error creating merchant', {
        error: error.message,
        tenantId,
        merchantData
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // 生成商户ID
  async generateMerchantId(tenantId) {
    const prefix = 'SHOP';
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const randomNum = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
      const merchantId = `${prefix}${randomNum}`;

      // 检查是否已存在
      const checkQuery = `
        SELECT id FROM merchants 
        WHERE tenant_id = $1 AND merchant_id = $2
      `;
      
      const result = await this.pool.query(checkQuery, [tenantId, merchantId]);
      
      if (result.rows.length === 0) {
        return merchantId;
      }
      
      attempts++;
    }

    throw new Error('Failed to generate unique merchant ID');
  }

  // 生成商户标识符
  generateMerchantSlug(merchantName) {
    return merchantName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // 移除特殊字符
      .replace(/[-\s]+/g, '-') // 替换空格和连字符
      .trim();
  }

  // 绑定Bot到商户
  async bindBotToMerchant(merchantId, botConfigId, platform, settings = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 检查商户是否存在
      const merchantQuery = `
        SELECT id, merchant_id FROM merchants WHERE id = $1
      `;
      const merchantResult = await client.query(merchantQuery, [merchantId]);
      
      if (merchantResult.rows.length === 0) {
        throw new Error('Merchant not found');
      }

      // 检查Bot是否已绑定
      const existingQuery = `
        SELECT id FROM merchant_bots 
        WHERE merchant_id = $1 AND bot_config_id = $2
      `;
      const existingResult = await client.query(existingQuery, [merchantId, botConfigId]);
      
      if (existingResult.rows.length > 0) {
        throw new Error('Bot already bound to merchant');
      }

      // 获取Bot信息
      const botQuery = `
        SELECT id, platform, bot_token FROM bot_configs WHERE id = $1
      `;
      const botResult = await client.query(botQuery, [botConfigId]);
      
      if (botResult.rows.length === 0) {
        throw new Error('Bot config not found');
      }

      const bot = botResult.rows[0];

      // 创建商户-Bot关联
      const insertQuery = `
        INSERT INTO merchant_bots (
          merchant_id, bot_config_id, platform, bot_settings, is_active, is_primary
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      // 检查是否为该商户的第一个Bot
      const countQuery = `
        SELECT COUNT(*) as count FROM merchant_bots 
        WHERE merchant_id = $1 AND is_active = true
      `;
      const countResult = await client.query(countQuery, [merchantId]);
      const isPrimary = countResult.rows[0].count === '0';

      const result = await client.query(insertQuery, [
        merchantId,
        botConfigId,
        platform,
        JSON.stringify(settings),
        true,
        isPrimary
      ]);

      // 更新bot_configs表，添加商户ID关联
      const updateBotQuery = `
        UPDATE bot_configs SET merchant_id = $1 WHERE id = $2
      `;
      await client.query(updateBotQuery, [merchantId, botConfigId]);

      await client.query('COMMIT');

      this.logger.info('Bot bound to merchant successfully', {
        merchantId,
        botConfigId,
        platform,
        isPrimary
      });

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Error binding bot to merchant', {
        error: error.message,
        merchantId,
        botConfigId,
        platform
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // 通过邀请码绑定Bot
  async bindBotByInviteCode(inviteCode, botConfigId, platform) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 验证邀请码
      const codeQuery = `
        SELECT mic.*, m.id as merchant_id, m.merchant_name
        FROM merchant_invite_codes mic
        JOIN merchants m ON mic.merchant_id = m.id
        WHERE mic.invite_code = $1 
          AND mic.platform = $2 
          AND mic.is_active = true
          AND (mic.expires_at IS NULL OR mic.expires_at > NOW())
          AND mic.used_count < mic.max_uses
      `;
      
      const codeResult = await client.query(codeQuery, [inviteCode, platform]);
      
      if (codeResult.rows.length === 0) {
        throw new Error('Invalid or expired invite code');
      }

      const inviteData = codeResult.rows[0];

      // 绑定Bot到商户
      const binding = await this.bindBotToMerchant(
        inviteData.merchant_id, 
        botConfigId, 
        platform
      );

      // 更新邀请码使用次数
      const updateCodeQuery = `
        UPDATE merchant_invite_codes 
        SET used_count = used_count + 1,
            updated_at = NOW()
        WHERE id = $1
      `;
      await client.query(updateCodeQuery, [inviteData.id]);

      await client.query('COMMIT');

      this.logger.info('Bot bound via invite code', {
        inviteCode,
        merchantId: inviteData.merchant_id,
        botConfigId,
        platform
      });

      return {
        binding,
        merchant: {
          id: inviteData.merchant_id,
          name: inviteData.merchant_name
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Error binding bot via invite code', {
        error: error.message,
        inviteCode,
        botConfigId,
        platform
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // 创建邀请码
  async createInviteCode(merchantId, platform, createdBy, options = {}) {
    const client = await this.pool.connect();
    try {
      // 获取商户信息
      const merchantQuery = `
        SELECT merchant_id FROM merchants WHERE id = $1
      `;
      const merchantResult = await client.query(merchantQuery, [merchantId]);
      
      if (merchantResult.rows.length === 0) {
        throw new Error('Merchant not found');
      }

      const merchantIdentifier = merchantResult.rows[0].merchant_id;

      // 生成邀请码
      const platformCode = platform.toUpperCase().substring(0, 2);
      const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      const inviteCode = `${merchantIdentifier}-${platformCode}-${randomSuffix}`;

      // 计算过期时间
      const expiresAt = options.expiresInDays ? 
        new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000) : 
        null;

      const insertQuery = `
        INSERT INTO merchant_invite_codes (
          merchant_id, invite_code, platform, max_uses, expires_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        merchantId,
        inviteCode,
        platform,
        options.maxUses || 1,
        expiresAt,
        createdBy
      ]);

      this.logger.info('Invite code created', {
        merchantId,
        inviteCode,
        platform,
        maxUses: options.maxUses || 1
      });

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error creating invite code', {
        error: error.message,
        merchantId,
        platform
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // 获取商户信息
  async getMerchantById(merchantId) {
    const query = `
      SELECT 
        m.*,
        t.name as tenant_name,
        u.full_name as created_by_name,
        COUNT(mb.id) as total_bots,
        COUNT(CASE WHEN mb.is_active THEN 1 END) as active_bots,
        ARRAY_AGG(DISTINCT mb.platform) FILTER (WHERE mb.is_active) as platforms
      FROM merchants m
      LEFT JOIN tenants t ON m.tenant_id = t.id
      LEFT JOIN users u ON m.created_by = u.id
      LEFT JOIN merchant_bots mb ON m.id = mb.merchant_id
      WHERE m.id = $1 AND m.deleted_at IS NULL
      GROUP BY m.id, t.name, u.full_name
    `;

    const result = await this.pool.query(query, [merchantId]);
    
    if (result.rows.length === 0) {
      throw new Error('Merchant not found');
    }

    return result.rows[0];
  }

  // 通过商户标识符获取商户
  async getMerchantByIdentifier(tenantId, merchantIdentifier) {
    const query = `
      SELECT * FROM merchants 
      WHERE tenant_id = $1 AND merchant_id = $2 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [tenantId, merchantIdentifier]);
    
    if (result.rows.length === 0) {
      throw new Error('Merchant not found');
    }

    return result.rows[0];
  }

  // 获取商户的所有Bot
  async getMerchantBots(merchantId) {
    const query = `
      SELECT 
        mb.*,
        bc.name as bot_name,
        bc.platform,
        bc.is_active as bot_active,
        bc.webhook_url,
        bc.settings as bot_settings
      FROM merchant_bots mb
      JOIN bot_configs bc ON mb.bot_config_id = bc.id
      WHERE mb.merchant_id = $1
      ORDER BY mb.is_primary DESC, mb.created_at ASC
    `;

    const result = await this.pool.query(query, [merchantId]);
    return result.rows;
  }

  // 获取商户的邀请码
  async getMerchantInviteCodes(merchantId) {
    const query = `
      SELECT 
        mic.*,
        u.full_name as created_by_name
      FROM merchant_invite_codes mic
      LEFT JOIN users u ON mic.created_by = u.id
      WHERE mic.merchant_id = $1 AND mic.is_active = true
      ORDER BY mic.created_at DESC
    `;

    const result = await this.pool.query(query, [merchantId]);
    return result.rows;
  }

  // 跨平台数据同步
  async syncSharedData(merchantId, dataType, dataKey, dataValue) {
    const client = await this.pool.connect();
    try {
      const upsertQuery = `
        INSERT INTO merchant_shared_data (merchant_id, data_type, data_key, data_value)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (merchant_id, data_type, data_key)
        DO UPDATE SET 
          data_value = EXCLUDED.data_value,
          sync_status = 'synced',
          last_synced_at = NOW(),
          updated_at = NOW()
        RETURNING *
      `;

      const result = await client.query(upsertQuery, [
        merchantId,
        dataType,
        dataKey,
        JSON.stringify(dataValue)
      ]);

      this.logger.info('Shared data synced', {
        merchantId,
        dataType,
        dataKey
      });

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error syncing shared data', {
        error: error.message,
        merchantId,
        dataType,
        dataKey
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // 获取共享数据
  async getSharedData(merchantId, dataType, dataKey = null) {
    let query = `
      SELECT * FROM merchant_shared_data 
      WHERE merchant_id = $1 AND data_type = $2
    `;
    const params = [merchantId, dataType];

    if (dataKey) {
      query += ` AND data_key = $3`;
      params.push(dataKey);
    }

    query += ` ORDER BY updated_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // 更新商户设置
  async updateMerchantSettings(merchantId, settings) {
    const client = await this.pool.connect();
    try {
      const updateQuery = `
        UPDATE merchants 
        SET settings = settings || $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;

      const result = await client.query(updateQuery, [
        merchantId,
        JSON.stringify(settings)
      ]);

      this.logger.info('Merchant settings updated', {
        merchantId,
        settings: Object.keys(settings)
      });

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error updating merchant settings', {
        error: error.message,
        merchantId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // 获取租户的所有商户
  async getTenantMerchants(tenantId, options = {}) {
    const { page = 1, limit = 20, search = '', businessType = '' } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE m.tenant_id = $1 AND m.deleted_at IS NULL';
    const params = [tenantId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (m.merchant_name ILIKE $${paramIndex} OR m.merchant_id ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (businessType) {
      whereClause += ` AND m.business_type = $${paramIndex}`;
      params.push(businessType);
      paramIndex++;
    }

    const query = `
      SELECT 
        m.*,
        COUNT(mb.id) as total_bots,
        COUNT(CASE WHEN mb.is_active THEN 1 END) as active_bots,
        ARRAY_AGG(DISTINCT mb.platform) FILTER (WHERE mb.is_active) as platforms,
        COUNT(*) OVER() as total_count
      FROM merchants m
      LEFT JOIN merchant_bots mb ON m.id = mb.merchant_id
      ${whereClause}
      GROUP BY m.id
      ORDER BY m.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);
    const result = await this.pool.query(query, params);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    return {
      merchants: result.rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  // 删除商户（软删除）
  async deleteMerchant(merchantId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 软删除商户
      const deleteQuery = `
        UPDATE merchants 
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;

      const result = await client.query(deleteQuery, [merchantId]);

      if (result.rows.length === 0) {
        throw new Error('Merchant not found');
      }

      // 禁用所有关联的Bot
      await client.query(
        'UPDATE merchant_bots SET is_active = false WHERE merchant_id = $1',
        [merchantId]
      );

      // 禁用所有邀请码
      await client.query(
        'UPDATE merchant_invite_codes SET is_active = false WHERE merchant_id = $1',
        [merchantId]
      );

      await client.query('COMMIT');

      this.logger.info('Merchant deleted', { merchantId });
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Error deleting merchant', {
        error: error.message,
        merchantId
      });
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = MerchantService; 