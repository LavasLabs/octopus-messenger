const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { AIServiceError } = require('../middleware/errorHandler');

class ClaudeClassifier {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isInitialized = false;
    this.model = config.model || 'claude-3-haiku-20240307';
    this.maxTokens = config.maxTokens || 1000;
    this.temperature = config.temperature || 0.3;
  }

  async initialize() {
    try {
      if (!this.config.apiKey) {
        throw new Error('Claude API key is required');
      }

      this.client = new Anthropic({
        apiKey: this.config.apiKey,
        timeout: this.config.timeout || 30000
      });

      this.isInitialized = true;
      logger.info('Claude classifier initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Claude classifier', { error: error.message });
      throw new AIServiceError('Failed to initialize Claude classifier', 'claude', 500);
    }
  }

  async classify(message, options = {}) {
    if (!this.isInitialized) {
      throw new AIServiceError('Claude classifier not initialized', 'claude', 500);
    }

    try {
      const startTime = Date.now();
      
      // 构建提示词
      const prompt = this.buildClassificationPrompt(message, options);
      
      // 生成请求hash用于缓存
      const requestHash = this.generateRequestHash(prompt);
      
      // 调用Claude API
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: this.getSystemPrompt(options.categories),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const latency = Date.now() - startTime;
      const result = this.parseResponse(response, message, latency);
      
      // 记录API调用
      logger.aiCall('claude', 
        { tokens: response.usage?.input_tokens || 0 },
        { 
          tokens: response.usage?.output_tokens || 0,
          success: true,
          latency
        }
      );

      return result;
    } catch (error) {
      logger.error('Claude classification failed', { 
        error: error.message,
        messageId: message.id
      });
      
      throw new AIServiceError(
        `Claude classification failed: ${error.message}`,
        'claude',
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
- priority: 优先级 (high/medium/low)
- sentiment: 情感倾向 (positive/negative/neutral)
- reasoning: 分类理由
- keywords: 关键词数组
- suggested_response: 建议回复（如果适用）`;

    return prompt;
  }

  getSystemPrompt(categories) {
    const defaultCategories = [
      'support', 'sales', 'complaint', 'inquiry', 'feedback',
      'appointment', 'urgent', 'spam', 'other'
    ];

    const availableCategories = categories || defaultCategories;

    return `你是一个专业的客服消息分类助手。你的任务是分析客户消息并准确分类。

分类标准：
- support: 技术支持、产品问题、使用帮助
- sales: 销售咨询、产品询价、购买意向
- complaint: 投诉、不满、问题反馈
- inquiry: 一般咨询、信息查询
- feedback: 意见反馈、建议、评价
- appointment: 预约、约定时间
- urgent: 紧急情况、需要立即处理
- spam: 垃圾消息、广告、无关内容
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
      const content = response.content[0]?.text;
      if (!content) {
        throw new Error('Empty response from Claude');
      }

      // 提取JSON内容
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const classification = JSON.parse(jsonMatch[0]);
      
      // 验证必需字段
      if (!classification.category || typeof classification.confidence !== 'number') {
        throw new Error('Invalid classification format');
      }

      // 确保置信度在有效范围内
      classification.confidence = Math.max(0, Math.min(1, classification.confidence));

      // 添加元数据
      classification.classifier = 'claude';
      classification.model = this.model;
      classification.timestamp = new Date().toISOString();
      classification.latency = latency;
      classification.tokens = {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0,
        total: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
      };

      return classification;
    } catch (error) {
      logger.error('Failed to parse Claude response', { 
        error: error.message,
        response: response.content[0]?.text
      });

      // 返回默认分类
      return {
        category: 'other',
        confidence: 0.1,
        priority: 'medium',
        sentiment: 'neutral',
        reasoning: 'Failed to parse AI response',
        keywords: [],
        classifier: 'claude',
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
      throw new AIServiceError('Claude classifier not initialized', 'claude', 500);
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 200,
        temperature: 0.3,
        system: '你是一个情感分析专家。分析文本的情感倾向并返回JSON格式结果。',
        messages: [
          {
            role: 'user',
            content: `请分析以下文本的情感倾向：\n\n"${text}"\n\n请返回JSON格式，包含：\n- sentiment: positive/negative/neutral\n- confidence: 0-1\n- emotions: 具体情感标签数组\n- intensity: 情感强度 (0-1)`
          }
        ]
      });

      const content = response.content[0]?.text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch[0]);
      
      result.classifier = 'claude';
      result.model = this.model;
      result.timestamp = new Date().toISOString();

      return result;
    } catch (error) {
      throw new AIServiceError(
        `Claude sentiment analysis failed: ${error.message}`,
        'claude',
        error.status || 500
      );
    }
  }

  async extractKeywords(text, maxKeywords = 10) {
    if (!this.isInitialized) {
      throw new AIServiceError('Claude classifier not initialized', 'claude', 500);
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 300,
        temperature: 0.3,
        system: '你是一个关键词提取专家。从文本中提取最重要的关键词。',
        messages: [
          {
            role: 'user',
            content: `请从以下文本中提取最重要的${maxKeywords}个关键词：\n\n"${text}"\n\n请返回JSON格式，包含：\n- keywords: 关键词数组\n- scores: 每个关键词的重要性分数数组 (0-1)`
          }
        ]
      });

      const content = response.content[0]?.text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch[0]);
      
      result.classifier = 'claude';
      result.model = this.model;
      result.timestamp = new Date().toISOString();

      return result;
    } catch (error) {
      throw new AIServiceError(
        `Claude keyword extraction failed: ${error.message}`,
        'claude',
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
      
      // 发送一个简单的测试请求
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ]
      });
      
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        latency,
        model: this.model,
        provider: 'claude'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        provider: 'claude'
      };
    }
  }

  async getUsageStats() {
    // Claude 不直接提供用量统计API，需要从日志或数据库获取
    return {
      provider: 'claude',
      model: this.model,
      note: 'Usage stats need to be tracked separately'
    };
  }
}

module.exports = ClaudeClassifier; 