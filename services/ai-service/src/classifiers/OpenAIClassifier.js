const OpenAI = require('openai');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { AIServiceError } = require('../middleware/errorHandler');

class OpenAIClassifier {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isInitialized = false;
    this.model = config.model || 'gpt-3.5-turbo';
    this.maxTokens = config.maxTokens || 1000;
    this.temperature = config.temperature || 0.3;
  }

  async initialize() {
    try {
      if (!this.config.apiKey) {
        throw new Error('OpenAI API key is required');
      }

      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        organization: this.config.organization,
        timeout: this.config.timeout || 30000
      });

      // 测试连接
      await this.client.models.list();
      
      this.isInitialized = true;
      logger.info('OpenAI classifier initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OpenAI classifier', { error: error.message });
      throw new AIServiceError('Failed to initialize OpenAI classifier', 'openai', 500);
    }
  }

  async classify(message, options = {}) {
    if (!this.isInitialized) {
      throw new AIServiceError('OpenAI classifier not initialized', 'openai', 500);
    }

    try {
      const startTime = Date.now();
      
      // 构建提示词
      const prompt = this.buildClassificationPrompt(message, options);
      
      // 生成请求hash用于缓存
      const requestHash = this.generateRequestHash(prompt);
      
      // 调用OpenAI API
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(options.categories)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        response_format: { type: 'json_object' }
      });

      const latency = Date.now() - startTime;
      const result = this.parseResponse(response, message, latency);
      
      // 记录API调用
      logger.aiCall('openai', 
        { tokens: response.usage?.prompt_tokens || 0 },
        { 
          tokens: response.usage?.completion_tokens || 0,
          success: true,
          latency
        }
      );

      return result;
    } catch (error) {
      logger.error('OpenAI classification failed', { 
        error: error.message,
        messageId: message.id
      });
      
      throw new AIServiceError(
        `OpenAI classification failed: ${error.message}`,
        'openai',
        error.status || 500
      );
    }
  }

  buildClassificationPrompt(message, options) {
    const { categories, includeContext = false } = options;
    
    let prompt = `请分析以下消息并进行分类：

消息内容: "${message.content}"
平台: ${message.platform || 'unknown'}
发送者: ${message.sender_name || 'unknown'}`;

    if (message.timestamp) {
      prompt += `\n时间: ${message.timestamp}`;
    }

    if (includeContext && message.context) {
      prompt += `\n上下文: ${JSON.stringify(message.context)}`;
    }

    if (categories && categories.length > 0) {
      prompt += `\n\n可选分类: ${categories.join(', ')}`;
    }

    prompt += `\n\n请返回JSON格式的分类结果，包含：
- category: 分类类别
- confidence: 置信度 (0-1)
- escalate: 是否需要人工介入 (true/false)
- reason: 分类原因的简短说明
- language: 检测到的语言（zh/en/ja/ko/ru等）
- urgency: 紧急程度 (low/medium/high/urgent)
- sentiment: 情感倾向 (positive/negative/neutral)
- keywords: 关键词数组
- suggested_action: 建议的处理方式（如果需要人工介入，说明原因）`;

    return prompt;
  }

  getSystemPrompt(categories) {
    const defaultCategories = [
      'support', 'sales', 'complaint', 'billing', 'technical', 
      'permission', 'refund', 'inquiry', 'urgent', 'general'
    ];

    const availableCategories = categories || defaultCategories;

    return `你是"Lava Assistant"，一名专业信用卡和支付领域的客服专家。
你的任务是分析客户消息并进行准确分类，同时判断是否需要人工介入。

分类标准：
- support: 技术支持、产品问题、使用帮助
- sales: 销售咨询、产品询价、购买意向  
- complaint: 投诉、不满、服务问题
- billing: 账单问题、费用查询、扣费疑问
- technical: 技术故障、系统问题、登录问题
- permission: 需要特殊权限的操作（额度调整、账户修改等）
- refund: 退款申请、退费咨询
- inquiry: 一般咨询、信息查询
- urgent: 紧急情况、需要立即处理
- general: 其他一般性问题

人工介入判断标准：
- 涉及账户权限修改、信用额度调整
- 退款、投诉、法律纠纷相关
- 复杂的技术问题超出AI能力范围
- 检测到强烈不满情绪或威胁性语言
- 需要查看敏感信息或执行高风险操作

语言检测：
- 自动识别客户使用的语言（中文、英文、日文、韩文、俄文等）
- 当客户使用非中文时，AI应切换到对应语言回复

请始终以JSON格式回复，包含完整的分析结果。
- other: 其他无法归类的消息

可用分类: ${availableCategories.join(', ')}

请根据消息内容、语气、紧急程度等因素进行综合判断。
置信度应该反映你对分类结果的确信程度。
优先级应该基于消息的紧急程度和重要性。
情感分析应该识别客户的情绪状态。

请始终返回有效的JSON格式响应。`;
  }

  parseResponse(response, message, latency) {
    try {
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const classification = JSON.parse(content);
      
      // 验证必需字段
      if (!classification.category || typeof classification.confidence !== 'number') {
        throw new Error('Invalid classification format');
      }

      // 确保置信度在有效范围内
      classification.confidence = Math.max(0, Math.min(1, classification.confidence));

      // 添加元数据
      classification.classifier = 'openai';
      classification.model = this.model;
      classification.timestamp = new Date().toISOString();
      classification.latency = latency;
      classification.tokens = {
        prompt: response.usage?.prompt_tokens || 0,
        completion: response.usage?.completion_tokens || 0,
        total: response.usage?.total_tokens || 0
      };

      return classification;
    } catch (error) {
      logger.error('Failed to parse OpenAI response', { 
        error: error.message,
        response: response.choices[0]?.message?.content
      });

      // 返回默认分类
      return {
        category: 'other',
        confidence: 0.1,
        priority: 'medium',
        sentiment: 'neutral',
        reasoning: 'Failed to parse AI response',
        keywords: [],
        classifier: 'openai',
        model: this.model,
        timestamp: new Date().toISOString(),
        latency,
        error: 'Parse error'
      };
    }
  }

  generateRequestHash(prompt) {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

  async classifyBatch(messages, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 5;
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      
      const batchPromises = batch.map(message => 
        this.classify(message, options).catch(error => ({
          error: error.message,
          messageId: message.id
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 避免API限制，批次间稍作延迟
      if (i + batchSize < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  async analyzeSentiment(text, options = {}) {
    if (!this.isInitialized) {
      throw new AIServiceError('OpenAI classifier not initialized', 'openai', 500);
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你是一个情感分析专家。分析文本的情感倾向并返回JSON格式结果。'
          },
          {
            role: 'user',
            content: `请分析以下文本的情感倾向：\n\n"${text}"\n\n请返回JSON格式，包含：\n- sentiment: positive/negative/neutral\n- confidence: 0-1\n- emotions: 具体情感标签数组\n- intensity: 情感强度 (0-1)`
          }
        ],
        max_tokens: 200,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      result.classifier = 'openai';
      result.model = this.model;
      result.timestamp = new Date().toISOString();

      return result;
    } catch (error) {
      throw new AIServiceError(
        `OpenAI sentiment analysis failed: ${error.message}`,
        'openai',
        error.status || 500
      );
    }
  }

  async extractKeywords(text, maxKeywords = 10) {
    if (!this.isInitialized) {
      throw new AIServiceError('OpenAI classifier not initialized', 'openai', 500);
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你是一个关键词提取专家。从文本中提取最重要的关键词。'
          },
          {
            role: 'user',
            content: `请从以下文本中提取最重要的${maxKeywords}个关键词：\n\n"${text}"\n\n请返回JSON格式，包含：\n- keywords: 关键词数组\n- scores: 每个关键词的重要性分数数组 (0-1)`
          }
        ],
        max_tokens: 300,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      result.classifier = 'openai';
      result.model = this.model;
      result.timestamp = new Date().toISOString();

      return result;
    } catch (error) {
      throw new AIServiceError(
        `OpenAI keyword extraction failed: ${error.message}`,
        'openai',
        error.status || 500
      );
    }
  }

  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return { status: 'unhealthy', error: 'Not initialized' };
      }

      const start = Date.now();
      await this.client.models.list();
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        latency,
        model: this.model,
        provider: 'openai'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        provider: 'openai'
      };
    }
  }

  async getUsageStats() {
    // OpenAI 不直接提供用量统计API，需要从日志或数据库获取
    return {
      provider: 'openai',
      model: this.model,
      note: 'Usage stats need to be tracked separately'
    };
  }
}

module.exports = OpenAIClassifier; 