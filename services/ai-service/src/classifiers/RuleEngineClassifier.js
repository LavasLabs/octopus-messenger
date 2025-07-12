const logger = require('../utils/logger');
const { ClassificationError } = require('../middleware/errorHandler');

class RuleEngineClassifier {
  constructor(config = {}) {
    this.config = config;
    this.rules = [];
    this.isInitialized = false;
    this.defaultRules = this.getDefaultRules();
  }

  async initialize() {
    try {
      // 加载默认规则
      this.rules = [...this.defaultRules];
      
      this.isInitialized = true;
      logger.info('Rule engine classifier initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize rule engine classifier', { error: error.message });
      throw new ClassificationError('Failed to initialize rule engine classifier', 'rule-engine', 500);
    }
  }

  getDefaultRules() {
    return [
      // 技术支持规则
      {
        id: 'support_1',
        category: 'support',
        priority: 'high',
        keywords: ['问题', '故障', '错误', '无法', '不能', '坏了', '修复', '帮助'],
        patterns: [
          /无法.*使用/i,
          /不能.*登录/i,
          /.*故障.*/i,
          /.*错误.*/i,
          /.*问题.*/i
        ],
        weight: 0.8,
        description: '技术支持相关问题'
      },
      
      // 销售咨询规则
      {
        id: 'sales_1',
        category: 'sales',
        priority: 'medium',
        keywords: ['价格', '多少钱', '购买', '买', '订购', '产品', '服务', '费用', '套餐'],
        patterns: [
          /.*价格.*/i,
          /多少钱/i,
          /.*购买.*/i,
          /.*产品.*/i,
          /.*套餐.*/i
        ],
        weight: 0.7,
        description: '销售咨询相关'
      },
      
      // 投诉规则
      {
        id: 'complaint_1',
        category: 'complaint',
        priority: 'high',
        keywords: ['投诉', '不满', '抱怨', '差评', '退款', '赔偿', '不满意', '太差'],
        patterns: [
          /.*投诉.*/i,
          /.*不满.*/i,
          /.*退款.*/i,
          /.*赔偿.*/i,
          /.*差评.*/i
        ],
        weight: 0.9,
        description: '投诉相关'
      },
      
      // 预约规则
      {
        id: 'appointment_1',
        category: 'appointment',
        priority: 'medium',
        keywords: ['预约', '约定', '时间', '安排', '会面', '见面', '日程'],
        patterns: [
          /.*预约.*/i,
          /.*约定.*/i,
          /.*安排.*时间/i,
          /.*会面.*/i
        ],
        weight: 0.8,
        description: '预约相关'
      },
      
      // 紧急情况规则
      {
        id: 'urgent_1',
        category: 'urgent',
        priority: 'high',
        keywords: ['紧急', '急', '立即', '马上', '现在', '赶紧', '快点'],
        patterns: [
          /.*紧急.*/i,
          /.*急.*/i,
          /.*立即.*/i,
          /.*马上.*/i,
          /.*现在.*/i
        ],
        weight: 0.95,
        description: '紧急情况'
      },
      
      // 垃圾信息规则
      {
        id: 'spam_1',
        category: 'spam',
        priority: 'low',
        keywords: ['广告', '推广', '营销', '促销', '优惠', '折扣', '免费', '赚钱'],
        patterns: [
          /.*广告.*/i,
          /.*推广.*/i,
          /.*促销.*/i,
          /.*免费.*/i,
          /.*赚钱.*/i
        ],
        weight: 0.6,
        description: '垃圾信息'
      },
      
      // 一般咨询规则
      {
        id: 'inquiry_1',
        category: 'inquiry',
        priority: 'medium',
        keywords: ['咨询', '询问', '了解', '知道', '什么', '如何', '怎么', '为什么'],
        patterns: [
          /.*咨询.*/i,
          /.*询问.*/i,
          /.*了解.*/i,
          /.*什么.*/i,
          /.*如何.*/i,
          /.*怎么.*/i
        ],
        weight: 0.5,
        description: '一般咨询'
      },
      
      // 反馈规则
      {
        id: 'feedback_1',
        category: 'feedback',
        priority: 'medium',
        keywords: ['反馈', '建议', '意见', '评价', '体验', '感受', '推荐'],
        patterns: [
          /.*反馈.*/i,
          /.*建议.*/i,
          /.*意见.*/i,
          /.*评价.*/i,
          /.*体验.*/i
        ],
        weight: 0.6,
        description: '反馈建议'
      }
    ];
  }

  async classify(message, options = {}) {
    if (!this.isInitialized) {
      throw new ClassificationError('Rule engine classifier not initialized', 'rule-engine', 500);
    }

    try {
      const startTime = Date.now();
      const text = message.content.toLowerCase();
      
      // 获取租户特定规则
      const tenantRules = await this.getTenantRules(options.tenantId);
      const allRules = [...this.rules, ...tenantRules];
      
      // 计算每个规则的匹配分数
      const ruleScores = allRules.map(rule => {
        const score = this.calculateRuleScore(text, rule);
        return { rule, score };
      });
      
      // 按分数排序
      ruleScores.sort((a, b) => b.score - a.score);
      
      // 选择最高分的规则
      const bestMatch = ruleScores[0];
      
      let classification;
      if (bestMatch.score > 0.3) {
        classification = {
          category: bestMatch.rule.category,
          confidence: Math.min(bestMatch.score, 0.95),
          priority: bestMatch.rule.priority,
          reasoning: `匹配规则: ${bestMatch.rule.description} (分数: ${bestMatch.score.toFixed(2)})`,
          keywords: this.extractMatchedKeywords(text, bestMatch.rule),
          rule_id: bestMatch.rule.id,
          rule_description: bestMatch.rule.description
        };
      } else {
        // 没有匹配的规则，返回默认分类
        classification = {
          category: 'other',
          confidence: 0.2,
          priority: 'medium',
          reasoning: '没有匹配的分类规则',
          keywords: [],
          rule_id: 'default'
        };
      }
      
      // 情感分析
      const sentiment = this.analyzeSentiment(text);
      classification.sentiment = sentiment;
      
      // 添加元数据
      const latency = Date.now() - startTime;
      classification.classifier = 'rule-engine';
      classification.timestamp = new Date().toISOString();
      classification.latency = latency;
      
      return classification;
    } catch (error) {
      logger.error('Rule engine classification failed', { 
        error: error.message,
        messageId: message.id
      });
      
      throw new ClassificationError(
        `Rule engine classification failed: ${error.message}`,
        'rule-engine',
        500
      );
    }
  }

  calculateRuleScore(text, rule) {
    let score = 0;
    
    // 关键词匹配
    const keywordMatches = rule.keywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    );
    const keywordScore = (keywordMatches.length / rule.keywords.length) * 0.6;
    
    // 正则表达式匹配
    const patternMatches = rule.patterns.filter(pattern => 
      pattern.test(text)
    );
    const patternScore = patternMatches.length > 0 ? 0.4 : 0;
    
    // 计算基础分数
    score = keywordScore + patternScore;
    
    // 应用权重
    score *= rule.weight;
    
    return score;
  }

  extractMatchedKeywords(text, rule) {
    const matched = [];
    
    // 提取匹配的关键词
    rule.keywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        matched.push(keyword);
      }
    });
    
    return matched;
  }

  analyzeSentiment(text) {
    const positiveWords = ['好', '满意', '喜欢', '棒', '优秀', '完美', '赞', '不错'];
    const negativeWords = ['差', '不满', '讨厌', '糟糕', '失望', '问题', '错误', '坏'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveWords.forEach(word => {
      if (text.includes(word)) positiveCount++;
    });
    
    negativeWords.forEach(word => {
      if (text.includes(word)) negativeCount++;
    });
    
    if (positiveCount > negativeCount) {
      return 'positive';
    } else if (negativeCount > positiveCount) {
      return 'negative';
    } else {
      return 'neutral';
    }
  }

  async getTenantRules(tenantId) {
    if (!tenantId) {
      return [];
    }
    
    // 这里应该从数据库或缓存获取租户特定规则
    // 简化实现，返回空数组
    return [];
  }

  async classifyBatch(messages, options = {}) {
    const results = [];
    
    for (const message of messages) {
      try {
        const result = await this.classify(message, options);
        results.push(result);
      } catch (error) {
        results.push({
          error: error.message,
          messageId: message.id
        });
      }
    }
    
    return results;
  }

  async addRule(rule, tenantId) {
    try {
      // 验证规则格式
      if (!rule.category || !rule.keywords || !Array.isArray(rule.keywords)) {
        throw new Error('Invalid rule format');
      }
      
      // 设置默认值
      rule.id = rule.id || `custom_${Date.now()}`;
      rule.priority = rule.priority || 'medium';
      rule.weight = rule.weight || 0.7;
      rule.patterns = rule.patterns || [];
      rule.description = rule.description || `Custom rule for ${rule.category}`;
      
      // 如果有租户ID，保存到数据库
      if (tenantId) {
        // 这里应该调用数据库保存规则
        logger.info('Rule added for tenant', { 
          ruleId: rule.id, 
          tenantId, 
          category: rule.category 
        });
      } else {
        // 添加到内存中的规则
        this.rules.push(rule);
      }
      
      return rule;
    } catch (error) {
      throw new ClassificationError(
        `Failed to add rule: ${error.message}`,
        'rule-engine',
        400
      );
    }
  }

  async updateRule(ruleId, updates, tenantId) {
    try {
      let rule;
      
      if (tenantId) {
        // 从数据库更新
        // 这里应该调用数据库更新规则
        logger.info('Rule updated for tenant', { ruleId, tenantId });
      } else {
        // 更新内存中的规则
        const index = this.rules.findIndex(r => r.id === ruleId);
        if (index === -1) {
          throw new Error('Rule not found');
        }
        
        this.rules[index] = { ...this.rules[index], ...updates };
        rule = this.rules[index];
      }
      
      return rule;
    } catch (error) {
      throw new ClassificationError(
        `Failed to update rule: ${error.message}`,
        'rule-engine',
        400
      );
    }
  }

  async deleteRule(ruleId, tenantId) {
    try {
      if (tenantId) {
        // 从数据库删除
        // 这里应该调用数据库删除规则
        logger.info('Rule deleted for tenant', { ruleId, tenantId });
      } else {
        // 从内存中删除
        const index = this.rules.findIndex(r => r.id === ruleId);
        if (index === -1) {
          throw new Error('Rule not found');
        }
        
        this.rules.splice(index, 1);
      }
      
      return true;
    } catch (error) {
      throw new ClassificationError(
        `Failed to delete rule: ${error.message}`,
        'rule-engine',
        400
      );
    }
  }

  async getRules(tenantId) {
    if (tenantId) {
      // 获取租户特定规则
      const tenantRules = await this.getTenantRules(tenantId);
      return [...this.rules, ...tenantRules];
    } else {
      return this.rules;
    }
  }

  async trainModel(examples, options = {}) {
    try {
      // 基于示例数据自动生成规则
      const generatedRules = this.generateRulesFromExamples(examples);
      
      // 添加生成的规则
      for (const rule of generatedRules) {
        await this.addRule(rule, options.tenantId);
      }
      
      return {
        success: true,
        rulesGenerated: generatedRules.length,
        rules: generatedRules
      };
    } catch (error) {
      throw new ClassificationError(
        `Failed to train rule engine: ${error.message}`,
        'rule-engine',
        500
      );
    }
  }

  generateRulesFromExamples(examples) {
    const categoryGroups = {};
    
    // 按类别分组示例
    examples.forEach(example => {
      const category = example.category || example.label;
      if (!categoryGroups[category]) {
        categoryGroups[category] = [];
      }
      categoryGroups[category].push(example.text || example.content);
    });
    
    const generatedRules = [];
    
    // 为每个类别生成规则
    Object.entries(categoryGroups).forEach(([category, texts]) => {
      const keywords = this.extractCommonKeywords(texts);
      
      if (keywords.length > 0) {
        const rule = {
          id: `generated_${category}_${Date.now()}`,
          category,
          priority: 'medium',
          keywords,
          patterns: [],
          weight: 0.7,
          description: `Generated rule for ${category} based on training examples`
        };
        
        generatedRules.push(rule);
      }
    });
    
    return generatedRules;
  }

  extractCommonKeywords(texts) {
    const wordCounts = {};
    
    texts.forEach(text => {
      const words = text.toLowerCase().match(/[\u4e00-\u9fa5]+|[a-zA-Z]+/g) || [];
      words.forEach(word => {
        if (word.length > 1) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      });
    });
    
    // 选择出现频率高的词作为关键词
    const threshold = Math.max(1, Math.floor(texts.length * 0.3));
    const keywords = Object.entries(wordCounts)
      .filter(([word, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
    
    return keywords;
  }

  async healthCheck() {
    return {
      status: 'healthy',
      rulesCount: this.rules.length,
      provider: 'rule-engine',
      initialized: this.isInitialized
    };
  }

  async getStats() {
    return {
      provider: 'rule-engine',
      rulesCount: this.rules.length,
      categories: [...new Set(this.rules.map(r => r.category))],
      averageWeight: this.rules.reduce((sum, r) => sum + r.weight, 0) / this.rules.length
    };
  }
}

module.exports = RuleEngineClassifier; 