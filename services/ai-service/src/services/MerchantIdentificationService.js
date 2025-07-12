const logger = require('../utils/logger');
const pool = require('../config/database');
const { AppError } = require('../utils/errors');

class MerchantIdentificationService {
  constructor() {
    this.logger = logger;
    this.userSessions = new Map(); // 临时存储用户会话
    this.merchantCache = new Map(); // 缓存商户信息
    this.similarityThreshold = 0.6; // 模糊匹配阈值
  }

  // 识别用户应该连接到哪个商户
  async identifyMerchant(userInfo, userMessage = null) {
    try {
      const {
        userId,
        platform,
        username,
        firstName,
        lastName,
        phoneNumber,
        groupId,
        groupName
      } = userInfo;

      // 1. 如果在群组中，直接返回群组对应的商户
      if (groupId) {
        return await this.getMerchantByGroup(groupId, platform);
      }

      // 2. 查找用户的历史商户关联
      const historicalMerchants = await this.getUserHistoricalMerchants(userId, platform);

      // 3. 如果只有一个历史商户，直接返回
      if (historicalMerchants.length === 1) {
        return {
          type: 'direct',
          merchant: historicalMerchants[0],
          confidence: 0.9
        };
      }

      // 4. 如果有多个历史商户，需要用户选择
      if (historicalMerchants.length > 1) {
        return {
          type: 'multiple_history',
          merchants: historicalMerchants,
          needsSelection: true
        };
      }

      // 5. 新用户，分析消息内容识别意图
      if (userMessage) {
        const intentAnalysis = await this.analyzeUserIntent(userMessage);
        const matchedMerchants = await this.findMerchantsByIntent(intentAnalysis);

        if (matchedMerchants.length > 0) {
          return {
            type: 'intent_match',
            merchants: matchedMerchants,
            intentAnalysis,
            needsSelection: matchedMerchants.length > 1
          };
        }
      }

      // 6. 无法识别，显示所有可用商户
      const availableMerchants = await this.getAllActiveMerchants();
      return {
        type: 'no_match',
        merchants: availableMerchants,
        needsSelection: true,
        message: '您好！我为多个商户提供服务，请选择您要咨询的商户：'
      };

    } catch (error) {
      this.logger.error('Error identifying merchant', {
        error: error.message,
        userId: userInfo.userId
      });
      throw error;
    }
  }

  // 根据群组获取商户
  async getMerchantByGroup(groupId, platform) {
    const query = `
      SELECT 
        t.id as tenant_id,
        t.name as merchant_name,
        t.slug,
        bc.id as bot_config_id,
        bc.name as bot_name,
        bc.settings,
        gi.group_name,
        gi.status as group_status
      FROM group_info gi
      JOIN bot_configs bc ON gi.bot_config_id = bc.id
      JOIN tenants t ON bc.tenant_id = t.id
      WHERE gi.platform_group_id = $1 AND bc.platform = $2
        AND gi.status = 'approved' AND bc.is_active = true
    `;

    const result = await pool.query(query, [groupId, platform]);

    if (result.rows.length === 0) {
      throw new AppError('Merchant not found for this group', 404);
    }

    const merchant = result.rows[0];
    return {
      type: 'group_direct',
      merchant,
      confidence: 1.0
    };
  }

  // 获取用户历史商户关联
  async getUserHistoricalMerchants(userId, platform) {
    const query = `
      SELECT DISTINCT
        t.id as tenant_id,
        t.name as merchant_name,
        t.slug,
        bc.id as bot_config_id,
        bc.name as bot_name,
        bc.settings,
        up.last_seen_at,
        up.total_messages,
        CASE t.subscription_status
          WHEN 'active' THEN true
          ELSE false
        END as is_active
      FROM user_profiles up
      JOIN tenants t ON up.tenant_id = t.id
      JOIN bot_configs bc ON t.id = bc.tenant_id AND bc.platform = $2
      WHERE up.user_identifier LIKE $1 AND bc.is_active = true
      ORDER BY up.last_seen_at DESC, up.total_messages DESC
      LIMIT 10
    `;

    const userPattern = `%${platform}:${userId}%`;
    const result = await pool.query(query, [userPattern, platform]);

    return result.rows.map(row => ({
      ...row,
      last_interaction: row.last_seen_at,
      interaction_count: row.total_messages
    }));
  }

  // 分析用户意图
  async analyzeUserIntent(message) {
    const content = message.toLowerCase();
    
    // 行业关键词匹配
    const industryKeywords = {
      'food': ['外卖', '餐厅', '美食', '菜单', '订餐', '配送', '饭店'],
      'retail': ['购买', '商品', '价格', '库存', '下单', '商城', '店铺'],
      'education': ['课程', '培训', '学习', '报名', '老师', '教育', '考试'],
      'healthcare': ['医院', '医生', '预约', '看病', '健康', '药品', '治疗'],
      'finance': ['贷款', '投资', '理财', '银行', '保险', '金融', '借款'],
      'travel': ['酒店', '旅游', '机票', '景点', '预订', '出行', '住宿'],
      'automotive': ['汽车', '维修', '保养', '4s店', '车辆', '驾校', '租车'],
      'beauty': ['美容', '化妆', '护肤', '美发', '美甲', 'spa', '护理'],
      'real_estate': ['房子', '租房', '买房', '房产', '中介', '装修', '楼盘']
    };

    // 服务类型关键词
    const serviceKeywords = {
      'customer_service': ['客服', '咨询', '问题', '帮助', '服务', '投诉', '建议'],
      'sales': ['购买', '价格', '优惠', '促销', '下单', '支付', '订单'],
      'support': ['故障', '维修', '技术', '安装', '使用', '操作', '教程'],
      'booking': ['预约', '预订', '排队', '时间', '日期', '安排', '取消']
    };

    const analysis = {
      industries: [],
      services: [],
      keywords: [],
      confidence: 0
    };

    // 匹配行业
    for (const [industry, keywords] of Object.entries(industryKeywords)) {
      const matches = keywords.filter(keyword => content.includes(keyword));
      if (matches.length > 0) {
        analysis.industries.push({
          type: industry,
          matches,
          score: matches.length / keywords.length
        });
      }
    }

    // 匹配服务类型
    for (const [service, keywords] of Object.entries(serviceKeywords)) {
      const matches = keywords.filter(keyword => content.includes(keyword));
      if (matches.length > 0) {
        analysis.services.push({
          type: service,
          matches,
          score: matches.length / keywords.length
        });
      }
    }

    // 提取关键词
    analysis.keywords = this.extractKeywords(content);

    // 计算整体置信度
    const industryScore = analysis.industries.reduce((sum, item) => sum + item.score, 0);
    const serviceScore = analysis.services.reduce((sum, item) => sum + item.score, 0);
    analysis.confidence = Math.min((industryScore + serviceScore) / 2, 1.0);

    return analysis;
  }

  // 根据意图查找匹配的商户
  async findMerchantsByIntent(intentAnalysis) {
    if (intentAnalysis.confidence < 0.3) {
      return []; // 置信度太低，不返回匹配结果
    }

    // 构建查询条件
    let searchTerms = [];
    
    // 添加行业关键词
    intentAnalysis.industries.forEach(industry => {
      searchTerms.push(...industry.matches);
    });
    
    // 添加提取的关键词
    searchTerms.push(...intentAnalysis.keywords);

    const query = `
      SELECT 
        t.id as tenant_id,
        t.name as merchant_name,
        t.slug,
        bc.id as bot_config_id,
        bc.name as bot_name,
        bc.settings,
        t.subscription_status,
        CASE 
          WHEN t.name ILIKE ANY($1) THEN 0.9
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(bc.settings->'keywords') keyword
            WHERE keyword ILIKE ANY($1)
          ) THEN 0.7
          WHEN bc.settings->>'businessType' ILIKE ANY($1) THEN 0.6
          ELSE 0.4
        END as relevance_score
      FROM tenants t
      JOIN bot_configs bc ON t.id = bc.tenant_id
      WHERE bc.is_active = true 
        AND t.subscription_status IN ('active', 'trial')
        AND (
          t.name ILIKE ANY($1)
          OR bc.settings->>'businessType' ILIKE ANY($1)
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(bc.settings->'keywords') keyword
            WHERE keyword ILIKE ANY($1)
          )
        )
      ORDER BY relevance_score DESC, t.created_at DESC
      LIMIT 5
    `;

    const searchPatterns = searchTerms.map(term => `%${term}%`);
    const result = await pool.query(query, [searchPatterns]);

    return result.rows.map(row => ({
      ...row,
      match_score: parseFloat(row.relevance_score),
      match_reasons: this.generateMatchReasons(row, searchTerms)
    }));
  }

  // 获取所有活跃商户
  async getAllActiveMerchants() {
    const query = `
      SELECT 
        t.id as tenant_id,
        t.name as merchant_name,
        t.slug,
        bc.id as bot_config_id,
        bc.name as bot_name,
        bc.settings,
        t.subscription_status,
        t.created_at
      FROM tenants t
      JOIN bot_configs bc ON t.id = bc.tenant_id
      WHERE bc.is_active = true 
        AND t.subscription_status IN ('active', 'trial')
      ORDER BY 
        CASE t.subscription_status 
          WHEN 'active' THEN 1 
          WHEN 'trial' THEN 2 
          ELSE 3 
        END,
        t.created_at DESC
      LIMIT 20
    `;

    const result = await pool.query(query);
    return result.rows;
  }

  // 模糊搜索商户
  async searchMerchants(searchQuery) {
    const query = `
      SELECT 
        t.id as tenant_id,
        t.name as merchant_name,
        t.slug,
        bc.id as bot_config_id,
        bc.name as bot_name,
        bc.settings,
        similarity(t.name, $1) as name_similarity,
        CASE 
          WHEN t.name ILIKE $2 THEN 0.9
          WHEN bc.settings->>'businessType' ILIKE $2 THEN 0.7
          WHEN bc.name ILIKE $2 THEN 0.6
          ELSE similarity(t.name, $1)
        END as relevance_score
      FROM tenants t
      JOIN bot_configs bc ON t.id = bc.tenant_id
      WHERE bc.is_active = true 
        AND t.subscription_status IN ('active', 'trial')
        AND (
          t.name ILIKE $2
          OR bc.name ILIKE $2  
          OR bc.settings->>'businessType' ILIKE $2
          OR similarity(t.name, $1) > $3
        )
      ORDER BY relevance_score DESC, name_similarity DESC
      LIMIT 10
    `;

    const searchPattern = `%${searchQuery}%`;
    const result = await pool.query(query, [
      searchQuery, 
      searchPattern, 
      this.similarityThreshold
    ]);

    return result.rows.map(row => ({
      ...row,
      match_score: Math.max(
        parseFloat(row.relevance_score), 
        parseFloat(row.name_similarity)
      )
    }));
  }

  // 生成商户选择界面
  generateMerchantSelectionMessage(identificationResult) {
    const { type, merchants, message } = identificationResult;

    let responseMessage = message || this.getDefaultSelectionMessage(type);
    let quickReplies = [];
    let inlineKeyboard = [];

    // 根据商户数量决定展示方式
    if (merchants.length <= 3) {
      // 少于3个商户，使用快捷回复按钮
      quickReplies = merchants.map((merchant, index) => ({
        text: `${index + 1}️⃣ ${merchant.merchant_name}`,
        payload: `SELECT_MERCHANT:${merchant.tenant_id}`
      }));
      
      quickReplies.push({
        text: '🔍 搜索其他商户',
        payload: 'SEARCH_MERCHANT'
      });

    } else {
      // 多个商户，使用内联键盘
      const rows = [];
      for (let i = 0; i < merchants.length; i += 2) {
        const row = [];
        row.push({
          text: merchants[i].merchant_name,
          callback_data: `SELECT_MERCHANT:${merchants[i].tenant_id}`
        });
        
        if (i + 1 < merchants.length) {
          row.push({
            text: merchants[i + 1].merchant_name,
            callback_data: `SELECT_MERCHANT:${merchants[i + 1].tenant_id}`
          });
        }
        rows.push(row);
      }
      
      rows.push([{
        text: '🔍 搜索其他商户',
        callback_data: 'SEARCH_MERCHANT'
      }]);
      
      inlineKeyboard = rows;
    }

    // 添加商户详细信息
    if (merchants.length > 0) {
      responseMessage += '\n\n📋 可选商户：\n';
      merchants.forEach((merchant, index) => {
        const businessType = merchant.settings?.businessType || '服务商户';
        const status = merchant.subscription_status === 'active' ? '🟢' : '🟡';
        responseMessage += `${index + 1}. ${status} **${merchant.merchant_name}**\n`;
        responseMessage += `   ${businessType}`;
        
        if (merchant.match_score) {
          responseMessage += ` (匹配度: ${Math.round(merchant.match_score * 100)}%)`;
        }
        responseMessage += '\n\n';
      });
    }

    return {
      message: responseMessage,
      quickReplies,
      inlineKeyboard,
      requiresSelection: true
    };
  }

  // 处理商户选择
  async handleMerchantSelection(userId, platform, selection) {
    try {
      if (selection.startsWith('SELECT_MERCHANT:')) {
        const tenantId = selection.replace('SELECT_MERCHANT:', '');
        
        // 获取商户信息
        const merchant = await this.getMerchantById(tenantId);
        
        // 记录用户选择
        await this.recordUserMerchantSelection(userId, platform, tenantId);
        
        // 创建会话
        const sessionId = await this.createUserSession(userId, platform, tenantId);
        
        return {
          success: true,
          merchant,
          sessionId,
          message: this.generateWelcomeMessage(merchant)
        };
        
      } else if (selection === 'SEARCH_MERCHANT') {
        return {
          success: true,
          requiresSearch: true,
          message: '🔍 请输入您要找的商户名称或服务类型：\n\n例如：\n• "张三奶茶店"\n• "美食外卖"\n• "手机维修"'
        };
      }
      
      throw new AppError('Invalid selection', 400);
      
    } catch (error) {
      this.logger.error('Error handling merchant selection', {
        error: error.message,
        userId,
        selection
      });
      throw error;
    }
  }

  // 获取商户信息
  async getMerchantById(tenantId) {
    const query = `
      SELECT 
        t.id as tenant_id,
        t.name as merchant_name,
        t.slug,
        bc.id as bot_config_id,
        bc.name as bot_name,
        bc.settings,
        t.subscription_status
      FROM tenants t
      JOIN bot_configs bc ON t.id = bc.tenant_id
      WHERE t.id = $1 AND bc.is_active = true
      LIMIT 1
    `;

    const result = await pool.query(query, [tenantId]);
    
    if (result.rows.length === 0) {
      throw new AppError('Merchant not found', 404);
    }

    return result.rows[0];
  }

  // 记录用户商户选择
  async recordUserMerchantSelection(userId, platform, tenantId) {
    const query = `
      INSERT INTO user_merchant_selections (
        user_id, platform, tenant_id, selected_at
      ) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, platform, tenant_id) 
      DO UPDATE SET selected_at = NOW(), selection_count = user_merchant_selections.selection_count + 1
    `;

    await pool.query(query, [userId, platform, tenantId]);
  }

  // 创建用户会话
  async createUserSession(userId, platform, tenantId) {
    const sessionId = require('uuid').v4();
    
    const query = `
      INSERT INTO user_sessions (
        id, user_id, platform, tenant_id, created_at, expires_at, is_active
      ) VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '24 hours', true)
      RETURNING id
    `;

    const result = await pool.query(query, [sessionId, userId, platform, tenantId]);
    return result.rows[0].id;
  }

  // 生成欢迎消息
  generateWelcomeMessage(merchant) {
    const settings = merchant.settings || {};
    const businessType = settings.businessType || '服务';
    
    return `🎉 欢迎来到 **${merchant.merchant_name}**！

我是您的专属智能助手，很高兴为您服务！

💼 服务类型：${businessType}
⏰ 服务时间：${this.formatServiceHours(settings.serviceHours)}

💡 您可以：
• 直接告诉我您的需求
• 输入 /help 查看可用命令
• 输入 /menu 查看服务菜单

有什么可以帮您的吗？`;
  }

  // 格式化服务时间
  formatServiceHours(serviceHours) {
    if (!serviceHours || !serviceHours.enabled) {
      return '24小时服务';
    }
    
    return `${serviceHours.start}-${serviceHours.end}`;
  }

  // 获取默认选择消息
  getDefaultSelectionMessage(type) {
    const messages = {
      'multiple_history': '您好！我发现您之前使用过多个商户的服务，请选择您要咨询的商户：',
      'intent_match': '根据您的需求，我为您找到了以下匹配的商户：',
      'no_match': '您好！我为多个商户提供服务，请选择您要咨询的商户：'
    };

    return messages[type] || '请选择您要咨询的商户：';
  }

  // 生成匹配原因
  generateMatchReasons(merchant, searchTerms) {
    const reasons = [];
    
    if (merchant.merchant_name) {
      const nameMatches = searchTerms.filter(term => 
        merchant.merchant_name.toLowerCase().includes(term.toLowerCase())
      );
      if (nameMatches.length > 0) {
        reasons.push(`商户名称包含: ${nameMatches.join(', ')}`);
      }
    }
    
    if (merchant.settings?.businessType) {
      const typeMatches = searchTerms.filter(term => 
        merchant.settings.businessType.toLowerCase().includes(term.toLowerCase())
      );
      if (typeMatches.length > 0) {
        reasons.push(`业务类型匹配: ${typeMatches.join(', ')}`);
      }
    }
    
    return reasons;
  }

  // 提取关键词
  extractKeywords(text) {
    // 简单的关键词提取，实际可以用更复杂的NLP算法
    const words = text.toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, '') // 只保留中文、英文、数字
      .split(/\s+/)
      .filter(word => word.length > 1);
    
    // 去除常见停用词
    const stopWords = ['的', '了', '在', '是', '我', '你', '他', '它', '这', '那', '和', '或', '但', '因为', '所以'];
    
    return words.filter(word => !stopWords.includes(word)).slice(0, 10);
  }

  // 清理过期会话
  async cleanupExpiredSessions() {
    const query = `
      UPDATE user_sessions 
      SET is_active = false 
      WHERE expires_at < NOW() AND is_active = true
    `;
    
    await pool.query(query);
  }
}

module.exports = MerchantIdentificationService; 