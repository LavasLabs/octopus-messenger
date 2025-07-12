const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');
const MerchantService = require('./MerchantService');

class AutoTenantService {
  constructor() {
    this.logger = logger;
    this.registrationSessions = new Map(); // 临时存储注册会话
    this.merchantService = new MerchantService(require('../../../../config/config').database);
  }

  // 启动对话式注册流程
  async startRegistrationFlow(groupInfo, inviterInfo) {
    const sessionId = uuidv4();
    const session = {
      sessionId,
      step: 'merchant_choice', // 新增：商户选择步骤
      groupInfo,
      inviterInfo,
      collectedData: {},
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30分钟过期
    };

    this.registrationSessions.set(sessionId, session);

    return {
      sessionId,
      message: this.getStepMessage('merchant_choice'),
      quickReplies: this.getStepQuickReplies('merchant_choice')
    };
  }

  // 处理注册步骤
  async processRegistrationStep(sessionId, userInput, userId) {
    const session = this.registrationSessions.get(sessionId);
    
    if (!session || new Date() > session.expiresAt) {
      throw new AppError('Registration session expired', 400);
    }

    // 验证用户权限（只有群主或管理员可以注册）
    if (!this.isAuthorizedUser(session.groupInfo, userId)) {
      throw new AppError('Only group owner or admins can register', 403);
    }

    const currentStep = session.step;
    const validation = this.validateStepInput(currentStep, userInput);

    if (!validation.valid) {
      return {
        error: validation.error,
        message: validation.message,
        retry: true
      };
    }

    // 保存当前步骤的数据
    session.collectedData[currentStep] = validation.processedValue;
    
    // 处理商户选择
    if (currentStep === 'merchant_choice') {
      if (validation.processedValue === 'bind_existing') {
        session.step = 'merchant_id_or_code';
        session.mode = 'bind_existing';
      } else {
        session.step = 'company_name';
        session.mode = 'create_new';
      }
      this.registrationSessions.set(sessionId, session);
      
      return {
        nextStep: session.step,
        message: this.getStepMessage(session.step),
        quickReplies: this.getStepQuickReplies(session.step),
        progress: this.getProgress(session.step)
      };
    }

    // 处理商户ID或邀请码绑定
    if (currentStep === 'merchant_id_or_code') {
      try {
        const bindResult = await this.handleMerchantBinding(session, validation.processedValue);
        this.registrationSessions.delete(sessionId);
        
        return {
          completed: true,
          tenantInfo: bindResult,
          message: this.getBindingCompletionMessage(bindResult),
          actions: this.getPostRegistrationActions(bindResult)
        };
      } catch (error) {
        return {
          error: 'BINDING_FAILED',
          message: `❌ 绑定失败：${error.message}\n\n请检查商户ID或邀请码是否正确，或选择创建新商户。`,
          retry: true
        };
      }
    }

    // 确定下一步
    const nextStep = this.getNextStep(currentStep, session.mode);
    
    if (nextStep) {
      // 还有下一步
      session.step = nextStep;
      this.registrationSessions.set(sessionId, session);
      
      return {
        nextStep,
        message: this.getStepMessage(nextStep),
        quickReplies: this.getStepQuickReplies(nextStep),
        progress: this.getProgress(nextStep)
      };
    } else {
      // 注册完成，创建租户和商户
      const tenantInfo = await this.createTenantFromSession(session);
      this.registrationSessions.delete(sessionId);
      
      return {
        completed: true,
        tenantInfo,
        message: this.getCompletionMessage(tenantInfo),
        actions: this.getPostRegistrationActions(tenantInfo)
      };
    }
  }

  // 处理商户绑定
  async handleMerchantBinding(session, input) {
    const { groupInfo } = session;
    
    // 检查是否是邀请码格式 (如: SHOP001-TG-A1B2C3)
    const inviteCodePattern = /^[A-Z0-9]+-[A-Z]{2}-[A-Z0-9]{6}$/;
    
    if (inviteCodePattern.test(input)) {
      // 通过邀请码绑定
      return await this.bindByInviteCode(input, groupInfo);
    } else {
      // 通过商户ID绑定
      return await this.bindByMerchantId(input, groupInfo);
    }
  }

  // 通过邀请码绑定
  async bindByInviteCode(inviteCode, groupInfo) {
    try {
      // 开始数据库事务
      await pool.query('BEGIN');

      // 1. 验证邀请码并获取商户信息
      const codeQuery = `
        SELECT 
          mic.*, 
          m.id as merchant_id,
          m.merchant_name,
          m.tenant_id,
          m.settings as merchant_settings
        FROM merchant_invite_codes mic
        JOIN merchants m ON mic.merchant_id = m.id
        WHERE mic.invite_code = $1 
          AND mic.platform = $2 
          AND mic.is_active = true
          AND (mic.expires_at IS NULL OR mic.expires_at > NOW())
          AND mic.used_count < mic.max_uses
      `;
      
      const codeResult = await pool.query(codeQuery, [inviteCode, groupInfo.platform]);
      
      if (codeResult.rows.length === 0) {
        throw new Error('邀请码无效、已过期或已用完');
      }

      const merchantData = codeResult.rows[0];

      // 2. 创建Bot配置
      const botId = uuidv4();
      const botQuery = `
        INSERT INTO bot_configs (
          id, tenant_id, name, platform, bot_token, merchant_id,
          is_active, settings, created_from
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, 'invite_code_binding')
        RETURNING *
      `;
      
      const botSettings = {
        ...JSON.parse(merchantData.merchant_settings),
        platform: groupInfo.platform,
        groupId: groupInfo.groupId,
        bindingMethod: 'invite_code'
      };
      
      const botResult = await pool.query(botQuery, [
        botId,
        merchantData.tenant_id,
        `${merchantData.merchant_name} ${groupInfo.platform}助手`,
        groupInfo.platform,
        'auto_generated', // 将在后续步骤中更新
        merchantData.merchant_id,
        JSON.stringify(botSettings)
      ]);

      // 3. 绑定Bot到商户
      await this.merchantService.bindBotToMerchant(
        merchantData.merchant_id,
        botId,
        groupInfo.platform,
        { bindingMethod: 'invite_code', inviteCode }
      );

      // 4. 更新邀请码使用次数
      await pool.query(
        'UPDATE merchant_invite_codes SET used_count = used_count + 1 WHERE id = $1',
        [merchantData.id]
      );

      // 5. 设置群组权限
      await this.setupGroupPermissions(merchantData.tenant_id, botId, groupInfo, merchantData.merchant_id);

      // 提交事务
      await pool.query('COMMIT');

      return {
        tenant: { id: merchantData.tenant_id, name: merchantData.merchant_name },
        merchant: {
          id: merchantData.merchant_id,
          name: merchantData.merchant_name,
          settings: JSON.parse(merchantData.merchant_settings)
        },
        bot: botResult.rows[0],
        bindingMethod: 'invite_code'
      };

    } catch (error) {
      await pool.query('ROLLBACK');
      this.logger.error('Error binding by invite code', {
        error: error.message,
        inviteCode
      });
      throw error;
    }
  }

  // 通过商户ID绑定
  async bindByMerchantId(merchantId, groupInfo) {
    try {
      // 开始数据库事务
      await pool.query('BEGIN');

      // 1. 验证商户ID并获取商户信息
      const merchantQuery = `
        SELECT 
          m.*,
          t.name as tenant_name
        FROM merchants m
        JOIN tenants t ON m.tenant_id = t.id
        WHERE m.merchant_id = $1 AND m.deleted_at IS NULL
      `;
      
      const merchantResult = await pool.query(merchantQuery, [merchantId]);
      
      if (merchantResult.rows.length === 0) {
        throw new Error('商户ID不存在或已被删除');
      }

      const merchantData = merchantResult.rows[0];

      // 2. 检查是否已经在该平台有Bot
      const existingBotQuery = `
        SELECT id FROM merchant_bots 
        WHERE merchant_id = $1 AND platform = $2 AND is_active = true
      `;
      
      const existingBotResult = await pool.query(existingBotQuery, [merchantData.id, groupInfo.platform]);
      
      if (existingBotResult.rows.length > 0) {
        throw new Error(`该商户在${groupInfo.platform}平台已有活跃的Bot`);
      }

      // 3. 创建Bot配置
      const botId = uuidv4();
      const botQuery = `
        INSERT INTO bot_configs (
          id, tenant_id, name, platform, bot_token, merchant_id,
          is_active, settings, created_from
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, 'merchant_id_binding')
        RETURNING *
      `;
      
      const botSettings = {
        ...JSON.parse(merchantData.settings),
        platform: groupInfo.platform,
        groupId: groupInfo.groupId,
        bindingMethod: 'merchant_id'
      };
      
      const botResult = await pool.query(botQuery, [
        botId,
        merchantData.tenant_id,
        `${merchantData.merchant_name} ${groupInfo.platform}助手`,
        groupInfo.platform,
        'auto_generated', // 将在后续步骤中更新
        merchantData.id,
        JSON.stringify(botSettings)
      ]);

      // 4. 绑定Bot到商户
      await this.merchantService.bindBotToMerchant(
        merchantData.id,
        botId,
        groupInfo.platform,
        { bindingMethod: 'merchant_id' }
      );

      // 5. 设置群组权限
      await this.setupGroupPermissions(merchantData.tenant_id, botId, groupInfo, merchantData.id);

      // 提交事务
      await pool.query('COMMIT');

      return {
        tenant: { id: merchantData.tenant_id, name: merchantData.tenant_name },
        merchant: {
          id: merchantData.id,
          name: merchantData.merchant_name,
          settings: JSON.parse(merchantData.settings)
        },
        bot: botResult.rows[0],
        bindingMethod: 'merchant_id'
      };

    } catch (error) {
      await pool.query('ROLLBACK');
      this.logger.error('Error binding by merchant ID', {
        error: error.message,
        merchantId
      });
      throw error;
    }
  }

  // 获取步骤消息
  getStepMessage(step) {
    const messages = {
      merchant_choice: `🏪 请选择您的商户设置方式：

🆕 **创建新商户** - 首次使用，创建全新的商户账户
🔗 **绑定现有商户** - 已有商户，在新平台添加机器人

💡 如果您已经在其他平台（如微信、QQ）使用过我们的服务，请选择"绑定现有商户"来共享数据。`,

      merchant_id_or_code: `🔑 请输入您的商户ID或邀请码：

📝 **商户ID格式**：SHOP1234
🎫 **邀请码格式**：SHOP1234-TG-A1B2C3

❓ **找不到商户ID？**
- 查看其他平台的机器人欢迎消息
- 登录管理后台查看
- 联系客服获取支持`,
      
      company_name: `🏢 请问您的企业/店铺名称是什么？

💡 这将显示在您的客服界面中`,
      
      contact_phone: `📱 请提供您的联系手机号

🔒 仅用于重要通知，我们承诺保护您的隐私`,
      
      business_type: `🎯 请选择您的业务类型：`,
      
      group_purpose: `💬 这个群组主要用于：`,
      
      service_hours: `⏰ 您希望客服机器人的工作时间是？`
    };

    return messages[step] || '请继续...';
  }

  // 获取快捷回复选项
  getStepQuickReplies(step) {
    const quickReplies = {
      merchant_choice: [
        '🆕 创建新商户',
        '🔗 绑定现有商户'
      ],

      business_type: [
        '🛍️ 零售电商',
        '🍽️ 餐饮服务', 
        '🏠 房产中介',
        '💄 美容美发',
        '🎓 教育培训',
        '💼 其他服务'
      ],
      
      group_purpose: [
        '🛠️ 客服支持',
        '📢 营销推广',
        '👥 内部沟通',
        '🎯 用户社群'
      ],
      
      service_hours: [
        '🌅 全天24小时',
        '💼 工作时间 (9:00-18:00)',
        '🌙 延长时间 (8:00-22:00)',
        '🎯 自定义时间'
      ]
    };

    return quickReplies[step] || [];
  }

  // 验证步骤输入
  validateStepInput(step, input) {
    switch (step) {
      case 'merchant_choice':
        const cleanChoice = input.replace(/[🆕🔗]/g, '').trim();
        const validChoices = ['创建新商户', '绑定现有商户'];
        
        if (!validChoices.includes(cleanChoice)) {
          return {
            valid: false,
            error: 'INVALID_CHOICE',
            message: '❌ 请选择"创建新商户"或"绑定现有商户"'
          };
        }
        
        return {
          valid: true,
          processedValue: cleanChoice === '创建新商户' ? 'create_new' : 'bind_existing'
        };

      case 'merchant_id_or_code':
        const cleanInput = input.trim().toUpperCase();
        
        if (cleanInput.length < 4) {
          return {
            valid: false,
            error: 'INVALID_INPUT',
            message: '❌ 商户ID或邀请码长度不足'
          };
        }
        
        // 验证商户ID格式 (SHOP1234) 或邀请码格式 (SHOP1234-TG-A1B2C3)
        const merchantIdPattern = /^[A-Z0-9]{4,20}$/;
        const inviteCodePattern = /^[A-Z0-9]+-[A-Z]{2}-[A-Z0-9]{6}$/;
        
        if (!merchantIdPattern.test(cleanInput) && !inviteCodePattern.test(cleanInput)) {
          return {
            valid: false,
            error: 'INVALID_FORMAT',
            message: '❌ 格式错误\n\n✅ 商户ID：SHOP1234\n✅ 邀请码：SHOP1234-TG-A1B2C3'
          };
        }
        
        return {
          valid: true,
          processedValue: cleanInput
        };

      case 'company_name':
        if (!input || input.trim().length < 2) {
          return {
            valid: false,
            error: 'INVALID_COMPANY_NAME',
            message: '❌ 企业名称至少需要2个字符，请重新输入'
          };
        }
        if (input.trim().length > 50) {
          return {
            valid: false,
            error: 'COMPANY_NAME_TOO_LONG',
            message: '❌ 企业名称不能超过50个字符'
          };
        }
        return {
          valid: true,
          processedValue: input.trim()
        };

      case 'contact_phone':
        const phoneRegex = /^1[3-9]\d{9}$/;
        const cleanPhone = input.replace(/\D/g, '');
        
        if (!phoneRegex.test(cleanPhone)) {
          return {
            valid: false,
            error: 'INVALID_PHONE',
            message: '❌ 请输入正确的手机号格式，如：13812345678'
          };
        }
        return {
          valid: true,
          processedValue: cleanPhone
        };

      case 'business_type':
        const validTypes = ['零售电商', '餐饮服务', '房产中介', '美容美发', '教育培训', '其他服务'];
        const cleanType = input.replace(/[🛍️🍽️🏠💄🎓💼]/g, '').trim();
        
        if (!validTypes.includes(cleanType)) {
          return {
            valid: false,
            error: 'INVALID_BUSINESS_TYPE',
            message: '❌ 请从提供的选项中选择业务类型'
          };
        }
        return {
          valid: true,
          processedValue: cleanType
        };

      case 'group_purpose':
        const validPurposes = ['客服支持', '营销推广', '内部沟通', '用户社群'];
        const cleanPurpose = input.replace(/[🛠️📢👥🎯]/g, '').trim();
        
        if (!validPurposes.includes(cleanPurpose)) {
          return {
            valid: false,
            error: 'INVALID_GROUP_PURPOSE',
            message: '❌ 请从提供的选项中选择群组用途'
          };
        }
        return {
          valid: true,
          processedValue: cleanPurpose
        };

      case 'service_hours':
        const validHours = ['全天24小时', '工作时间 (9:00-18:00)', '延长时间 (8:00-22:00)', '自定义时间'];
        const cleanHours = input.replace(/[🌅💼🌙🎯]/g, '').trim();
        
        if (!validHours.includes(cleanHours)) {
          return {
            valid: false,
            error: 'INVALID_SERVICE_HOURS',
            message: '❌ 请从提供的选项中选择服务时间'
          };
        }
        return {
          valid: true,
          processedValue: cleanHours
        };

      default:
        return {
          valid: true,
          processedValue: input
        };
    }
  }

  // 获取下一步
  getNextStep(currentStep, mode) {
    if (mode === 'bind_existing') {
      // 绑定现有商户的流程
      return null; // 绑定流程在 merchant_id_or_code 步骤完成
    }
    
    // 创建新商户的流程
    const steps = [
      'merchant_choice',
      'company_name',
      'contact_phone', 
      'business_type',
      'group_purpose',
      'service_hours'
    ];
    
    const currentIndex = steps.indexOf(currentStep);
    return currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
  }

  // 获取进度
  getProgress(currentStep) {
    const steps = ['merchant_choice', 'company_name', 'contact_phone', 'business_type', 'group_purpose', 'service_hours'];
    const currentIndex = steps.indexOf(currentStep);
    const progress = Math.round(((currentIndex + 1) / steps.length) * 100);
    
    return {
      current: currentIndex + 1,
      total: steps.length,
      percentage: progress
    };
  }

  // 从会话创建租户和商户
  async createTenantFromSession(session) {
    const { collectedData, groupInfo, inviterInfo } = session;
    
    try {
      // 开始数据库事务
      await pool.query('BEGIN');

      // 1. 创建租户
      const tenantId = uuidv4();
      const tenantSlug = this.generateTenantSlug(collectedData.company_name);
      
      const tenantQuery = `
        INSERT INTO tenants (
          id, name, slug, subscription_status, subscription_plan,
          max_bots, max_messages_per_month, trial_ends_at, created_from
        ) VALUES ($1, $2, $3, 'trial', 'starter', 3, 1000, $4, 'chat_registration')
        RETURNING *
      `;
      
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 7); // 7天试用
      
      const tenantResult = await pool.query(tenantQuery, [
        tenantId,
        collectedData.company_name,
        tenantSlug,
        trialEndDate
      ]);
      
      const tenant = tenantResult.rows[0];

      // 2. 创建管理员用户
      const userId = uuidv4();
      const temporaryPassword = this.generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
      
      const userQuery = `
        INSERT INTO users (
          id, tenant_id, username, email, password_hash, full_name, phone,
          role, is_active, email_verified, created_from
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin', true, false, 'chat_registration')
        RETURNING *
      `;
      
      const email = `${tenantSlug}@temp.octopus-messenger.com`; // 临时邮箱
      
      const userResult = await pool.query(userQuery, [
        userId,
        tenantId,
        tenantSlug,
        email,
        hashedPassword,
        collectedData.company_name + ' 管理员',
        collectedData.contact_phone
      ]);
      
      const user = userResult.rows[0];

      // 3. 创建商户
      const merchant = await this.merchantService.createMerchant(tenantId, {
        merchantName: collectedData.company_name,
        businessType: collectedData.business_type,
        contactPhone: collectedData.contact_phone,
        description: `${collectedData.group_purpose}群组的智能客服`,
        welcomeMessage: `欢迎来到${collectedData.company_name}！我是您的智能助手，有什么可以帮您的吗？`,
        businessHours: this.parseServiceHours(collectedData.service_hours)
      }, userId);

      // 4. 创建Bot配置
      const botId = uuidv4();
      const botQuery = `
        INSERT INTO bot_configs (
          id, tenant_id, name, platform, bot_token, merchant_id,
          is_active, settings, created_by, created_from
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, 'auto_setup')
        RETURNING *
      `;
      
      const botSettings = {
        autoReply: true,
        language: 'zh-CN',
        businessType: collectedData.business_type,
        groupPurpose: collectedData.group_purpose,
        serviceHours: this.parseServiceHours(collectedData.service_hours),
        welcomeMessage: `欢迎来到${collectedData.company_name}！我是您的智能助手，有什么可以帮您的吗？`,
        merchantId: merchant.merchant_id
      };
      
      const botResult = await pool.query(botQuery, [
        botId,
        tenantId,
        `${collectedData.company_name} 智能助手`,
        groupInfo.platform,
        'auto_generated', // 将在后续步骤中更新
        merchant.id,
        JSON.stringify(botSettings),
        userId
      ]);

      // 5. 绑定Bot到商户
      await this.merchantService.bindBotToMerchant(
        merchant.id,
        botId,
        groupInfo.platform,
        { createdFrom: 'chat_registration' }
      );

      // 6. 配置群组权限
      await this.setupGroupPermissions(tenantId, botId, groupInfo, merchant.id);

      // 7. 创建访问令牌
      const accessToken = jwt.sign(
        { userId, tenantId, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // 提交事务
      await pool.query('COMMIT');

      return {
        tenant,
        user,
        merchant,
        bot: botResult.rows[0],
        accessToken,
        temporaryPassword,
        adminUrl: `${process.env.ADMIN_URL}?token=${accessToken}`,
        trialInfo: {
          endsAt: trialEndDate,
          messageQuota: 1000,
          daysRemaining: 7
        }
      };

    } catch (error) {
      await pool.query('ROLLBACK');
      this.logger.error('Error creating tenant from session', {
        error: error.message,
        sessionId: session.sessionId
      });
      throw error;
    }
  }

  // 生成租户标识符
  generateTenantSlug(companyName) {
    const base = companyName
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
      .substring(0, 20);
    
    const timestamp = Date.now().toString().slice(-6);
    return `${base}${timestamp}`;
  }

  // 生成临时密码
  generateTemporaryPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  // 解析服务时间
  parseServiceHours(serviceHours) {
    const hourMappings = {
      '全天24小时': { enabled: false },
      '工作时间 (9:00-18:00)': { enabled: true, start: '09:00', end: '18:00' },
      '延长时间 (8:00-22:00)': { enabled: true, start: '08:00', end: '22:00' },
      '自定义时间': { enabled: true, start: '09:00', end: '18:00' }
    };
    
    return hourMappings[serviceHours] || { enabled: false };
  }

  // 设置群组权限
  async setupGroupPermissions(tenantId, botId, groupInfo, merchantId = null) {
    // 创建群组信息记录
    const groupInfoQuery = `
      INSERT INTO group_info (
        tenant_id, bot_config_id, platform_group_id, group_name,
        group_type, member_count, status, message_quota, merchant_id,
        invited_by_user_id, invite_timestamp, bot_join_date
      ) VALUES ($1, $2, $3, $4, $5, $6, 'approved', 1000, $7, $8, NOW(), NOW())
    `;
    
    await pool.query(groupInfoQuery, [
      tenantId,
      botId,
      groupInfo.groupId,
      groupInfo.groupName,
      groupInfo.groupType,
      groupInfo.memberCount,
      merchantId,
      groupInfo.invitedByUserId
    ]);

    // 设置权限策略为开放模式（试用期）
    const policyQuery = `
      INSERT INTO bot_auth_policies (
        tenant_id, bot_config_id, policy_type, auto_approve,
        max_groups, default_message_quota
      ) VALUES ($1, $2, 'open', true, 3, 1000)
      ON CONFLICT (tenant_id, bot_config_id) DO NOTHING
    `;
    
    await pool.query(policyQuery, [tenantId, botId]);
  }

  // 获取绑定完成消息
  getBindingCompletionMessage(bindResult) {
    return `🎉 恭喜！成功绑定到商户 **${bindResult.merchant.name}**！

🏪 **商户信息**
🆔 商户ID：${bindResult.merchant.id}
🏢 商户名称：${bindResult.merchant.name}
📱 平台：${bindResult.bot.platform}

✅ **已启用功能**
🤖 智能问答回复
📊 跨平台数据同步
🔄 客服排队管理
📈 统计分析

🚀 **开始使用**
现在您可以在此群组中使用智能客服功能了！所有对话数据将与您在其他平台的机器人共享。

💡 **提示**：发送 /help 查看可用命令`;
  }

  // 获取完成消息
  getCompletionMessage(tenantInfo) {
    return `🎉 恭喜！您的智能客服已成功激活！

📊 **企业账户信息**
🏢 企业名称：${tenantInfo.tenant.name}
🆔 商户ID：${tenantInfo.merchant.merchant_id}
🎁 试用期：7天（${tenantInfo.trialInfo.messageQuota}条消息）

🔧 **管理后台**
🌐 访问地址：${tenantInfo.adminUrl}
👤 临时密码：${tenantInfo.temporaryPassword}

💡 **立即可用功能**
✅ 智能问答回复
✅ 客服排队管理  
✅ 消息数据统计
✅ 自定义话术
✅ 跨平台数据同步

🚀 **试试这些命令**
/help - 查看所有功能
/stats - 查看群组数据
/settings - 修改设置
/merchant - 查看商户信息

📱 **跨平台使用**
您可以使用商户ID **${tenantInfo.merchant.merchant_id}** 在其他平台（微信、QQ、抖音等）绑定同一个商户数据。

---
💎 7天后可升级到付费版，享受更多高级功能！`;
  }

  // 获取注册后操作
  getPostRegistrationActions(tenantInfo) {
    return [
      {
        type: 'button',
        text: '🌐 打开管理后台',
        url: tenantInfo.adminUrl
      },
      {
        type: 'button', 
        text: '📚 查看使用教程',
        url: `${process.env.DOCS_URL}/quick-start`
      },
      {
        type: 'command',
        text: '🎯 开始体验',
        command: '/help'
      },
      {
        type: 'command',
        text: '🏪 查看商户信息',
        command: '/merchant'
      }
    ];
  }

  // 检查用户权限
  isAuthorizedUser(groupInfo, userId) {
    // 这里需要调用各平台的API检查用户是否为群主或管理员
    // 暂时返回 true，实际使用时需要实现具体的权限检查逻辑
    return true;
  }

  // 清理过期会话
  cleanupExpiredSessions() {
    const now = new Date();
    for (const [sessionId, session] of this.registrationSessions.entries()) {
      if (now > session.expiresAt) {
        this.registrationSessions.delete(sessionId);
        this.logger.info('Cleaned up expired registration session', { sessionId });
      }
    }
  }

  // 获取活跃会话统计
  getActiveSessionsStats() {
    const now = new Date();
    const activeCount = Array.from(this.registrationSessions.values())
      .filter(session => now <= session.expiresAt).length;
    
    return {
      total: this.registrationSessions.size,
      active: activeCount,
      expired: this.registrationSessions.size - activeCount
    };
  }
}

module.exports = AutoTenantService; 