const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class ConversationManager {
  constructor(options = {}) {
    this.mongoManager = options.mongoManager;
    this.translationService = options.translationService;
    this.config = options.config || {};
    this.isInitialized = false;
    
    // 对话配置
    this.maxContextLength = this.config.maxContextLength || 4000; // 最大上下文长度
    this.summaryThreshold = this.config.summaryThreshold || 10; // 超过10条消息开始摘要
    this.maxHistoryMessages = this.config.maxHistoryMessages || 20; // 最多保留20条历史消息
  }

  async initialize() {
    try {
      if (!this.mongoManager) {
        throw new Error('MongoDB manager is required');
      }

      this.isInitialized = true;
      logger.info('Conversation manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize conversation manager', { error: error.message });
      throw error;
    }
  }

  // 生成对话ID
  generateConversationId(tenantId, userId, platform, channelId) {
    // 使用租户ID、用户ID、平台和频道ID生成唯一的对话ID
    const baseId = `${tenantId}_${userId}_${platform}_${channelId || 'default'}`;
    return `conv_${Buffer.from(baseId).toString('base64').slice(0, 20)}_${Date.now()}`;
  }

  // 保存用户消息
  async saveUserMessage(messageData) {
    try {
      const {
        tenantId,
        userId,
        conversationId,
        message,
        originalMessage,
        language,
        platform,
        channel,
        metadata = {}
      } = messageData;

      // 检测语言（如果没有提供）
      let detectedLanguage = language;
      if (!detectedLanguage && this.translationService) {
        detectedLanguage = await this.translationService.detectLanguage(originalMessage || message);
      }

      // 保存到MongoDB
      const messageId = await this.mongoManager.saveConversationMessage({
        conversation_id: conversationId,
        tenant_id: tenantId,
        user_id: userId,
        role: 'user',
        message: message,
        original_message: originalMessage,
        language: detectedLanguage,
        platform: platform,
        channel: channel,
        timestamp: new Date(),
        metadata: metadata
      });

      // 检查是否需要更新上下文摘要
      await this.updateContextIfNeeded(conversationId, tenantId);

      logger.debug('User message saved', {
        conversationId,
        tenantId,
        userId,
        messageId,
        language: detectedLanguage
      });

      return {
        messageId,
        conversationId,
        language: detectedLanguage
      };
    } catch (error) {
      logger.error('Failed to save user message', {
        conversationId: messageData.conversationId,
        error: error.message
      });
      throw error;
    }
  }

  // 保存AI回复
  async saveAssistantMessage(messageData) {
    try {
      const {
        tenantId,
        conversationId,
        message,
        originalMessage,
        language,
        platform,
        channel,
        metadata = {}
      } = messageData;

      const messageId = await this.mongoManager.saveConversationMessage({
        conversation_id: conversationId,
        tenant_id: tenantId,
        user_id: 'assistant',
        role: 'assistant',
        message: message,
        original_message: originalMessage,
        language: language,
        platform: platform,
        channel: channel,
        timestamp: new Date(),
        metadata: metadata
      });

      // 保存为训练数据
      await this.saveAsTrainingData(conversationId, tenantId, originalMessage, message, metadata);

      logger.debug('Assistant message saved', {
        conversationId,
        tenantId,
        messageId,
        language
      });

      return messageId;
    } catch (error) {
      logger.error('Failed to save assistant message', {
        conversationId: messageData.conversationId,
        error: error.message
      });
      throw error;
    }
  }

  // 获取对话上下文
  async getConversationContext(conversationId, tenantId, options = {}) {
    try {
      const {
        includeHistory = true,
        includeSummary = true,
        maxMessages = this.maxHistoryMessages
      } = options;

      let context = {
        conversationId,
        messages: [],
        summary: null,
        totalMessages: 0
      };

      // 获取对话历史
      if (includeHistory) {
        const messages = await this.mongoManager.getConversationHistory(
          conversationId, 
          tenantId, 
          maxMessages
        );
        context.messages = messages;
        context.totalMessages = messages.length;
      }

      // 获取上下文摘要
      if (includeSummary) {
        const summary = await this.mongoManager.getContextSummary(conversationId, tenantId);
        context.summary = summary;
      }

      logger.debug('Conversation context retrieved', {
        conversationId,
        tenantId,
        messageCount: context.messages.length,
        hasSummary: !!context.summary
      });

      return context;
    } catch (error) {
      logger.error('Failed to get conversation context', {
        conversationId,
        tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 构建AI Prompt的上下文
  async buildPromptContext(conversationId, tenantId, currentMessage, options = {}) {
    try {
      const context = await this.getConversationContext(conversationId, tenantId, options);
      
      let contextText = '';

      // 添加对话摘要（如果存在）
      if (context.summary && context.summary.summary) {
        contextText += `对话摘要: ${context.summary.summary}\n\n`;
        
        if (context.summary.key_points && context.summary.key_points.length > 0) {
          contextText += `关键要点:\n${context.summary.key_points.map(point => `- ${point}`).join('\n')}\n\n`;
        }
      }

      // 添加最近的对话历史
      if (context.messages && context.messages.length > 0) {
        contextText += '最近对话:\n';
        context.messages.forEach(msg => {
          const role = msg.role === 'user' ? '用户' : '客服';
          contextText += `${role}: ${msg.message}\n`;
        });
        contextText += '\n';
      }

      // 添加当前消息
      contextText += `当前用户消息: ${currentMessage}`;

      // 检查上下文长度，如果太长则截断
      if (contextText.length > this.maxContextLength) {
        logger.warn('Context too long, truncating', {
          conversationId,
          originalLength: contextText.length,
          maxLength: this.maxContextLength
        });
        
        contextText = contextText.substring(contextText.length - this.maxContextLength);
      }

      return {
        contextText,
        summary: context.summary,
        messageCount: context.totalMessages
      };
    } catch (error) {
      logger.error('Failed to build prompt context', {
        conversationId,
        tenantId,
        error: error.message
      });
      
      // 返回基本上下文
      return {
        contextText: `当前用户消息: ${currentMessage}`,
        summary: null,
        messageCount: 0
      };
    }
  }

  // 更新上下文摘要（如果需要）
  async updateContextIfNeeded(conversationId, tenantId) {
    try {
      const messages = await this.mongoManager.getConversationHistory(conversationId, tenantId);
      
      // 如果消息数量超过阈值，生成或更新摘要
      if (messages.length >= this.summaryThreshold && messages.length % 5 === 0) {
        await this.generateContextSummary(conversationId, tenantId, messages);
      }
    } catch (error) {
      logger.error('Failed to update context summary', {
        conversationId,
        tenantId,
        error: error.message
      });
      // 不抛出错误，避免影响主流程
    }
  }

  // 生成上下文摘要
  async generateContextSummary(conversationId, tenantId, messages) {
    try {
      // 构建对话内容
      const conversationText = messages.map(msg => {
        const role = msg.role === 'user' ? '用户' : '客服';
        return `${role}: ${msg.message}`;
      }).join('\n');

      // 这里可以使用AI服务来生成摘要，暂时使用简单的摘要逻辑
      const summary = await this.generateSimpleSummary(conversationText, messages);

      // 保存摘要
      await this.mongoManager.saveContextSummary({
        conversation_id: conversationId,
        tenant_id: tenantId,
        summary: summary.text,
        key_points: summary.keyPoints,
        sentiment_trend: summary.sentiment,
        message_count: messages.length
      });

      logger.info('Context summary generated', {
        conversationId,
        tenantId,
        messageCount: messages.length,
        summaryLength: summary.text.length
      });

      return summary;
    } catch (error) {
      logger.error('Failed to generate context summary', {
        conversationId,
        tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 生成简单摘要（可以替换为AI服务）
  async generateSimpleSummary(conversationText, messages) {
    try {
      // 分析对话主题
      const themes = this.extractThemes(conversationText);
      
      // 分析情感趋势
      const sentiment = this.analyzeSentimentTrend(messages);
      
      // 提取关键要点
      const keyPoints = this.extractKeyPoints(messages);

      // 生成摘要文本
      const summaryText = `用户咨询主要涉及${themes.join('、')}等话题。对话共${messages.length}轮，用户${sentiment.overall}。`;

      return {
        text: summaryText,
        keyPoints: keyPoints,
        sentiment: sentiment.overall,
        themes: themes
      };
    } catch (error) {
      logger.error('Failed to generate simple summary', { error: error.message });
      
      // 返回基础摘要
      return {
        text: `对话包含${messages.length}条消息`,
        keyPoints: [],
        sentiment: 'neutral',
        themes: []
      };
    }
  }

  // 提取对话主题
  extractThemes(conversationText) {
    const themes = [];
    const keywords = {
      '账户问题': ['账户', '登录', '密码', '账号'],
      '账单咨询': ['账单', '费用', '扣费', '金额'],
      '技术支持': ['不能用', '错误', '问题', '故障', 'bug'],
      '产品咨询': ['产品', '功能', '使用', '如何'],
      '投诉建议': ['投诉', '建议', '不满', '差']
    };

    for (const [theme, words] of Object.entries(keywords)) {
      if (words.some(word => conversationText.includes(word))) {
        themes.push(theme);
      }
    }

    return themes.length > 0 ? themes : ['一般咨询'];
  }

  // 分析情感趋势
  analyzeSentimentTrend(messages) {
    // 简单的情感分析逻辑
    const userMessages = messages.filter(msg => msg.role === 'user');
    const positiveWords = ['好', '谢谢', '满意', '棒', '赞'];
    const negativeWords = ['不行', '差', '问题', '错误', '投诉'];

    let positiveCount = 0;
    let negativeCount = 0;

    userMessages.forEach(msg => {
      positiveWords.forEach(word => {
        if (msg.message.includes(word)) positiveCount++;
      });
      negativeWords.forEach(word => {
        if (msg.message.includes(word)) negativeCount++;
      });
    });

    let overall = 'neutral';
    if (positiveCount > negativeCount) {
      overall = 'positive';
    } else if (negativeCount > positiveCount) {
      overall = 'negative';
    }

    return { overall, positive: positiveCount, negative: negativeCount };
  }

  // 提取关键要点
  extractKeyPoints(messages) {
    const keyPoints = [];
    const userMessages = messages.filter(msg => msg.role === 'user');

    // 提取包含问号的消息作为关键问题
    userMessages.forEach(msg => {
      if (msg.message.includes('？') || msg.message.includes('?')) {
        keyPoints.push(msg.message.substring(0, 50) + (msg.message.length > 50 ? '...' : ''));
      }
    });

    return keyPoints.slice(0, 3); // 最多3个关键要点
  }

  // 保存为训练数据
  async saveAsTrainingData(conversationId, tenantId, userMessage, assistantMessage, metadata = {}) {
    try {
      // 构建训练数据格式
      const prompt = `用户: ${userMessage}\n客服:`;
      const completion = assistantMessage;

      await this.mongoManager.saveTrainingData({
        tenant_id: tenantId,
        conversation_id: conversationId,
        data_type: 'conversation',
        prompt: prompt,
        completion: completion,
        metadata: {
          ...metadata,
          generated_at: new Date(),
          source: 'customer_service'
        },
        quality_score: 0.8 // 默认质量分数，后续可以通过用户反馈调整
      });

      logger.debug('Training data saved', {
        conversationId,
        tenantId,
        promptLength: prompt.length,
        completionLength: completion.length
      });
    } catch (error) {
      logger.error('Failed to save training data', {
        conversationId,
        tenantId,
        error: error.message
      });
      // 不抛出错误，避免影响主流程
    }
  }

  // 检查是否需要人工介入
  async checkForHumanHandoff(conversationId, tenantId, message, classification) {
    try {
      // 检查是否已经有人工介入
      const existingHandoff = await this.mongoManager.checkHumanHandoff(conversationId, tenantId);
      if (existingHandoff) {
        return {
          needsHandoff: true,
          existing: true,
          handoff: existingHandoff
        };
      }

      // 检查分类结果是否需要人工介入
      let needsHandoff = false;
      let reason = '';
      let escalationType = '';

      // 检查置信度
      if (classification.confidence < 0.3) {
        needsHandoff = true;
        reason = 'AI分类置信度较低，建议人工确认';
        escalationType = 'complex';
      }

      // 检查特定类别
      const escalationCategories = ['complaint', 'refund', 'legal', 'permission'];
      if (escalationCategories.includes(classification.category)) {
        needsHandoff = true;
        reason = `检测到${classification.category}类问题，需要人工处理`;
        escalationType = 'permission';
      }

      // 检查关键词
      const escalationKeywords = ['投诉', '退款', '法律', '起诉', '权限', '经理'];
      if (escalationKeywords.some(keyword => message.includes(keyword))) {
        needsHandoff = true;
        reason = '检测到需要人工权限的关键词';
        escalationType = 'permission';
      }

      if (needsHandoff) {
        logger.info('Human handoff needed', {
          conversationId,
          tenantId,
          reason,
          escalationType,
          category: classification.category,
          confidence: classification.confidence
        });
      }

      return {
        needsHandoff,
        reason,
        escalationType,
        existing: false
      };
    } catch (error) {
      logger.error('Failed to check for human handoff', {
        conversationId,
        tenantId,
        error: error.message
      });
      
      // 出错时保守处理，建议人工介入
      return {
        needsHandoff: true,
        reason: '系统检查出错，建议人工处理',
        escalationType: 'system_error'
      };
    }
  }

  // 开始人工介入
  async startHumanHandoff(conversationId, tenantId, reason, escalationType, assignedAgent = null) {
    try {
      const handoffId = await this.mongoManager.saveHumanHandoff({
        conversation_id: conversationId,
        tenant_id: tenantId,
        is_human_intervened: true,
        assigned_agent: assignedAgent,
        reason: reason,
        escalation_type: escalationType,
        started_at: new Date()
      });

      logger.info('Human handoff started', {
        conversationId,
        tenantId,
        handoffId,
        assignedAgent,
        reason,
        escalationType
      });

      return handoffId;
    } catch (error) {
      logger.error('Failed to start human handoff', {
        conversationId,
        tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 结束人工介入
  async endHumanHandoff(conversationId, tenantId, endReason = 'resolved') {
    try {
      const handoff = await this.mongoManager.checkHumanHandoff(conversationId, tenantId);
      if (!handoff) {
        throw new Error('No active human handoff found');
      }

      // 更新记录（这里需要在MongoDB Manager中添加update方法）
      // 暂时通过保存新记录的方式处理
      await this.mongoManager.saveHumanHandoff({
        conversation_id: conversationId,
        tenant_id: tenantId,
        is_human_intervened: false,
        assigned_agent: handoff.assigned_agent,
        reason: handoff.reason,
        escalation_type: handoff.escalation_type,
        started_at: handoff.started_at,
        ended_at: new Date(),
        metadata: {
          end_reason: endReason,
          duration_minutes: Math.floor((new Date() - handoff.started_at) / (1000 * 60))
        }
      });

      logger.info('Human handoff ended', {
        conversationId,
        tenantId,
        endReason,
        duration: Math.floor((new Date() - handoff.started_at) / (1000 * 60))
      });

      return true;
    } catch (error) {
      logger.error('Failed to end human handoff', {
        conversationId,
        tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 清理对话数据
  async cleanupConversation(conversationId, tenantId) {
    try {
      // 这里可以实现对话数据的清理逻辑
      // 例如删除过期的消息、压缩历史记录等
      
      logger.info('Conversation cleanup completed', {
        conversationId,
        tenantId
      });

      return true;
    } catch (error) {
      logger.error('Failed to cleanup conversation', {
        conversationId,
        tenantId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = ConversationManager; 