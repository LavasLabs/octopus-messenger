const logger = require('../utils/logger');
const { NLPProcessingError } = require('../middleware/errorHandler');
const crypto = require('crypto');

class NLPProcessor {
  constructor(config = {}) {
    this.config = config;
    this.isInitialized = false;
    this.cache = new Map();
    this.maxCacheSize = config.maxCacheSize || 1000;
  }

  async initialize() {
    try {
      logger.info('Initializing NLP processor...');
      
      // 初始化中文分词词典和情感词典
      this.initializeDictionaries();
      
      this.isInitialized = true;
      logger.info('NLP processor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize NLP processor', { error: error.message });
      throw new NLPProcessingError('Failed to initialize NLP processor', 'nlp', 500);
    }
  }

  initializeDictionaries() {
    // 中文停用词
    this.stopWords = new Set([
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '他', '她', '它', '我们', '你们', '他们', '她们', '它们', '可以', '已经', '还有', '什么', '怎么', '为什么', '哪里', '哪个', '什么样', '怎样'
    ]);

    // 情感词典
    this.sentimentWords = {
      positive: [
        '好', '满意', '喜欢', '棒', '优秀', '完美', '赞', '不错', '很好', '太好了', '喜欢', '爱', '开心', '高兴', '满足', '感谢', '谢谢', '优质', '靠谱', '专业', '贴心', '用心', '细心', '周到', '及时', '快速', '高效', '便捷', '方便', '实用', '有用', '有效', '值得', '推荐', '支持', '赞成', '同意', '认可', '肯定', '确定', '正确', '对的', '没错', '是的', '好的', '可以', '行', '没问题', '放心', '安心', '舒心', '省心', '顺心', '称心', '如意', '满意', '惊喜', '意外', '超出', '超越', '超过', '胜过', '比较', '更好', '最好', '第一', '顶级', '高级', '上等', '优等', '一流', '精品', '品质', '质量', '档次', '水平', '标准', '规格', '要求', '期待', '希望', '愿意', '乐意', '愿意', '想要', '需要', '必须', '应该', '值得', '配得上', '够格', '合格', '达标', '过关', '通过', '成功', '胜利', '赢得', '获得', '得到', '收获', '实现', '完成', '达成', '满足', '符合', '适合', '合适', '恰当', '正好', '刚好', '恰好', '正确', '准确', '精确', '确切', '明确', '清楚', '清晰', '明了', '了解', '知道', '明白', '理解', '懂得', '掌握', '熟悉', '熟练', '专业', '内行', '在行', '擅长', '善于', '精通', '熟知', '清楚', '明确', '确定', '肯定', '绝对', '完全', '彻底', '全面', '充分', '足够', '充足', '丰富', '丰满', '饱满', '圆满', '完整', '完善', '完美', '理想', '满意', '称心', '如意', '顺利', '顺心', '成功', '胜利', '优胜', '取胜', '获胜', '战胜', '击败', '打败', '超过', '超越', '胜过', '优于', '好于', '强于', '高于', '大于', '多于', '快于', '早于', '先于', '领先', '领导', '带头', '率先', '首先', '最先', '第一', '头一', '首位', '榜首', '冠军', '第一名', '冠军', '优胜者', '胜利者', '成功者', '赢家', '强者', '佼佼者', '杰出', '优秀', '卓越', '出色', '突出', '显著', '明显', '显然', '明显', '清楚', '清晰', '明了', '了解', '知道', '明白', '理解', '懂得', '掌握', '熟悉', '熟练', '专业', '内行', '在行', '擅长', '善于', '精通', '熟知'
      ],
      negative: [
        '差', '不满', '讨厌', '糟糕', '失望', '问题', '错误', '坏', '不好', '很差', '太差', '垃圾', '烂', '破', '坏了', '故障', '毛病', '缺点', '不足', '欠缺', '缺陷', '瑕疵', '问题', '麻烦', '困难', '难题', '障碍', '阻碍', '妨碍', '影响', '干扰', '打扰', '烦恼', '烦躁', '烦人', '讨厌', '厌恶', '反感', '不爽', '不快', '不舒服', '不适', '不便', '不方便', '麻烦', '复杂', '困难', '艰难', '棘手', '难办', '难搞', '难弄', '难处理', '处理不了', '解决不了', '搞不定', '弄不好', '做不好', '完成不了', '实现不了', '达不到', '够不着', '跟不上', '赶不上', '来不及', '太晚', '太慢', '太快', '太急', '太匆忙', '太草率', '太粗糙', '太简单', '太复杂', '太困难', '太容易', '太难', '太简单', '太复杂', '太多', '太少', '太大', '太小', '太长', '太短', '太高', '太低', '太远', '太近', '太早', '太晚', '不够', '不足', '缺少', '缺乏', '没有', '没得', '没用', '无用', '无效', '无意义', '无价值', '不值', '不值得', '不配', '不够格', '不合格', '不达标', '不过关', '不通过', '失败', '失利', '失望', '失落', '失去', '丢失', '丢掉', '失掉', '损失', '损害', '损坏', '破坏', '毁坏', '毁掉', '毁灭', '消失', '消除', '消灭', '取消', '撤销', '废除', '废止', '停止', '中止', '终止', '结束', '完结', '结局', '结果', '后果', '影响', '副作用', '负面', '消极', '悲观', '绝望', '沮丧', '失望', '失落', '难过', '痛苦', '痛心', '心痛', '伤心', '悲伤', '忧伤', '忧虑', '担心', '担忧', '焦虑', '紧张', '不安', '恐惧', '害怕', '恐慌', '惊慌', '慌张', '慌乱', '混乱', '乱套', '乱七八糟', '一团糟', '糟透了', '糟糕透了', '太糟糕了', '简直', '完全', '彻底', '全面', '整个', '全部', '所有', '一切', '什么都', '哪里都', '到处都', '处处都', '时时都', '刻刻都', '天天都', '日日都', '年年都', '总是', '一直', '始终', '永远', '从来', '从未', '绝不', '决不', '不会', '不能', '不可能', '不行', '不好', '不对', '不是', '不对头', '不像话', '不成话', '不像样', '不成样', '不行了', '不好了', '不对了', '不是了', '完了', '完蛋了', '糟了', '坏了', '毁了', '废了', '没了', '没有了', '没得了', '没用了', '无用了', '无效了', '无意义了', '无价值了', '不值了', '不值得了', '不配了', '不够格了', '不合格了', '不达标了', '不过关了', '不通过了', '失败了', '失利了', '失望了', '失落了', '失去了', '丢失了', '丢掉了', '失掉了', '损失了', '损害了', '损坏了', '破坏了', '毁坏了', '毁掉了', '毁灭了', '消失了', '消除了', '消灭了', '取消了', '撤销了', '废除了', '废止了', '停止了', '中止了', '终止了', '结束了', '完结了'
      ]
    };

    // 紧急程度关键词
    this.urgencyWords = {
      high: ['紧急', '急', '立即', '马上', '现在', '赶紧', '快点', '速度', '尽快', '立刻', '即刻', '当即', '当下', '此刻', '这就', '马上就', '立即就', '现在就', '赶紧就', '快点就', '速度就', '尽快就', '立刻就', '即刻就', '当即就', '当下就', '此刻就'],
      medium: ['尽量', '尽可能', '最好', '希望', '建议', '应该', '可以', '能够', '能不能', '可不可以', '行不行', '好不好', '怎么样', '如何', '怎样', '什么时候', '哪天', '哪时候', '何时', '几时', '什么时间', '哪个时间', '何时间', '几时间'],
      low: ['有空', '方便', '闲的时候', '有时间', '不忙的时候', '空闲时', '有机会', '合适的时候', '适当的时候', '合适时', '适当时', '将来', '以后', '今后', '往后', '后来', '后面', '接下来', '下次', '下回', '下一次', '再', '又', '还', '继续', '持续', '保持', '维持', '延续', '延长', '拖延', '推迟', '延迟', '拖后', '往后推', '向后推', '后移', '后推', '推后', '延后', '延缓', '缓解', '缓慢', '慢慢', '慢点', '慢些', '慢一点', '慢一些', '慢一步', '慢半拍', '慢吞吞', '慢腾腾', '慢悠悠', '慢条斯理', '从容不迫', '不紧不慢', '不急不躁', '不慌不忙', '稳重', '沉稳', '冷静', '镇定', '镇静', '安静', '平静', '宁静', '恬静', '静谧', '寂静', '无声', '默默', '静静', '悄悄', '轻轻', '轻声', '小声', '低声', '细声', '微声', '弱声', '轻微', '微弱', '轻巧', '轻松', '轻快', '轻盈', '轻便', '轻易', '容易', '简单', '简便', '方便', '便利', '便捷', '快捷', '高效', '有效', '实用', '有用', '好用', '管用', '顶用', '中用', '派用场', '用得上', '用得着', '用得到', '用得了', '用得起', '用得好', '用得妙', '用得巧', '用得活', '用得开', '用得顺', '用得舒服', '用得舒心', '用得放心', '用得安心', '用得省心', '用得顺心', '用得称心', '用得如意', '用得满意']
    };

    // 实体识别模式
    this.entityPatterns = {
      phone: /1[3-9]\d{9}/g,
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      url: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
      money: /\d+(\.\d{1,2})?[元|块|万|千]/g,
      date: /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?/g,
      time: /\d{1,2}[:：]\d{1,2}([:：]\d{1,2})?/g,
      idCard: /\d{17}[\dXx]/g,
      qq: /[1-9]\d{4,10}/g,
      wechat: /[a-zA-Z][a-zA-Z0-9_-]{5,19}/g
    };
  }

  async analyze(text, features = ['sentiment', 'entities', 'keywords']) {
    if (!this.isInitialized) {
      throw new NLPProcessingError('NLP processor not initialized', 'nlp', 500);
    }

    try {
      const startTime = Date.now();
      const result = {};

      // 并行处理各个特征
      const analysisPromises = features.map(async (feature) => {
        switch (feature) {
          case 'sentiment':
            result.sentiment = await this.analyzeSentiment(text);
            break;
          case 'entities':
            result.entities = await this.extractEntities(text);
            break;
          case 'keywords':
            result.keywords = await this.extractKeywords(text);
            break;
          case 'urgency':
            result.urgency = await this.analyzeUrgency(text);
            break;
          case 'complexity':
            result.complexity = await this.analyzeComplexity(text);
            break;
          case 'language':
            result.language = await this.detectLanguage(text);
            break;
          case 'category':
            result.category = await this.suggestCategory(text);
            break;
          default:
            logger.warn(`Unknown NLP feature: ${feature}`);
        }
      });

      await Promise.all(analysisPromises);

      const processingTime = Date.now() - startTime;
      result.processingTime = processingTime;
      result.timestamp = new Date().toISOString();

      return result;
    } catch (error) {
      logger.error('NLP analysis failed', { error: error.message, text: text.substring(0, 100) });
      throw new NLPProcessingError(`NLP analysis failed: ${error.message}`, 'nlp', 500);
    }
  }

  async analyzeSentiment(text) {
    const hash = this.generateHash(text);
    const cached = this.cache.get(`sentiment_${hash}`);
    if (cached) {
      return cached;
    }

    let positiveScore = 0;
    let negativeScore = 0;
    let neutralScore = 0;

    // 分词（简单实现）
    const words = this.tokenize(text);

    // 计算情感分数
    words.forEach(word => {
      if (this.sentimentWords.positive.includes(word)) {
        positiveScore++;
      } else if (this.sentimentWords.negative.includes(word)) {
        negativeScore++;
      } else {
        neutralScore++;
      }
    });

    // 计算总分和置信度
    const totalScore = positiveScore + negativeScore + neutralScore;
    let sentiment = 'neutral';
    let confidence = 0.5;

    if (totalScore > 0) {
      const positiveRatio = positiveScore / totalScore;
      const negativeRatio = negativeScore / totalScore;
      const neutralRatio = neutralScore / totalScore;

      if (positiveRatio > negativeRatio && positiveRatio > neutralRatio) {
        sentiment = 'positive';
        confidence = positiveRatio;
      } else if (negativeRatio > positiveRatio && negativeRatio > neutralRatio) {
        sentiment = 'negative';
        confidence = negativeRatio;
      } else {
        sentiment = 'neutral';
        confidence = neutralRatio;
      }
    }

    const result = {
      sentiment,
      confidence,
      scores: {
        positive: positiveScore,
        negative: negativeScore,
        neutral: neutralScore
      },
      intensity: Math.max(positiveRatio || 0, negativeRatio || 0)
    };

    this.cacheResult(`sentiment_${hash}`, result);
    return result;
  }

  async extractEntities(text) {
    const hash = this.generateHash(text);
    const cached = this.cache.get(`entities_${hash}`);
    if (cached) {
      return cached;
    }

    const entities = {};

    // 使用正则表达式提取实体
    Object.entries(this.entityPatterns).forEach(([type, pattern]) => {
      const matches = text.match(pattern);
      if (matches) {
        entities[type] = [...new Set(matches)]; // 去重
      }
    });

    this.cacheResult(`entities_${hash}`, entities);
    return entities;
  }

  async extractKeywords(text, maxKeywords = 10) {
    const hash = this.generateHash(text + maxKeywords);
    const cached = this.cache.get(`keywords_${hash}`);
    if (cached) {
      return cached;
    }

    // 分词
    const words = this.tokenize(text);
    
    // 过滤停用词
    const filteredWords = words.filter(word => 
      !this.stopWords.has(word) && word.length > 1
    );

    // 统计词频
    const wordFreq = {};
    filteredWords.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // 计算TF-IDF简化版（仅使用词频）
    const keywords = Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, maxKeywords)
      .map(([word, freq]) => ({
        word,
        frequency: freq,
        score: freq / filteredWords.length
      }));

    this.cacheResult(`keywords_${hash}`, keywords);
    return keywords;
  }

  async analyzeUrgency(text) {
    const hash = this.generateHash(text);
    const cached = this.cache.get(`urgency_${hash}`);
    if (cached) {
      return cached;
    }

    let urgencyScore = 0;
    let urgencyLevel = 'medium';

    // 检查紧急程度关键词
    const words = this.tokenize(text.toLowerCase());
    
    words.forEach(word => {
      if (this.urgencyWords.high.includes(word)) {
        urgencyScore += 3;
      } else if (this.urgencyWords.medium.includes(word)) {
        urgencyScore += 2;
      } else if (this.urgencyWords.low.includes(word)) {
        urgencyScore += 1;
      }
    });

    // 检查感叹号和问号
    const exclamationCount = (text.match(/!/g) || []).length;
    const questionCount = (text.match(/\?/g) || []).length;
    urgencyScore += exclamationCount * 2 + questionCount;

    // 检查重复字符（表示强调）
    const repeatPattern = /(.)\1{2,}/g;
    const repeats = text.match(repeatPattern);
    if (repeats) {
      urgencyScore += repeats.length;
    }

    // 确定紧急程度
    if (urgencyScore >= 5) {
      urgencyLevel = 'high';
    } else if (urgencyScore >= 2) {
      urgencyLevel = 'medium';
    } else {
      urgencyLevel = 'low';
    }

    const result = {
      level: urgencyLevel,
      score: urgencyScore,
      confidence: Math.min(urgencyScore / 10, 1)
    };

    this.cacheResult(`urgency_${hash}`, result);
    return result;
  }

  async analyzeComplexity(text) {
    const hash = this.generateHash(text);
    const cached = this.cache.get(`complexity_${hash}`);
    if (cached) {
      return cached;
    }

    const words = this.tokenize(text);
    const sentences = text.split(/[。！？\.\!\?]+/).filter(s => s.trim());
    
    const metrics = {
      characterCount: text.length,
      wordCount: words.length,
      sentenceCount: sentences.length,
      avgWordsPerSentence: sentences.length > 0 ? words.length / sentences.length : 0,
      avgCharsPerWord: words.length > 0 ? text.length / words.length : 0,
      uniqueWords: [...new Set(words)].length,
      lexicalDiversity: words.length > 0 ? [...new Set(words)].length / words.length : 0
    };

    // 计算复杂度分数
    let complexityScore = 0;
    
    // 基于文本长度
    if (metrics.characterCount > 500) complexityScore += 3;
    else if (metrics.characterCount > 200) complexityScore += 2;
    else if (metrics.characterCount > 100) complexityScore += 1;
    
    // 基于平均句子长度
    if (metrics.avgWordsPerSentence > 20) complexityScore += 3;
    else if (metrics.avgWordsPerSentence > 10) complexityScore += 2;
    else if (metrics.avgWordsPerSentence > 5) complexityScore += 1;
    
    // 基于词汇多样性
    if (metrics.lexicalDiversity > 0.8) complexityScore += 3;
    else if (metrics.lexicalDiversity > 0.6) complexityScore += 2;
    else if (metrics.lexicalDiversity > 0.4) complexityScore += 1;

    let complexityLevel = 'simple';
    if (complexityScore >= 7) {
      complexityLevel = 'complex';
    } else if (complexityScore >= 4) {
      complexityLevel = 'medium';
    }

    const result = {
      level: complexityLevel,
      score: complexityScore,
      metrics
    };

    this.cacheResult(`complexity_${hash}`, result);
    return result;
  }

  async detectLanguage(text) {
    const hash = this.generateHash(text);
    const cached = this.cache.get(`language_${hash}`);
    if (cached) {
      return cached;
    }

    // 简单的语言检测
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
    const englishChars = text.match(/[a-zA-Z]/g);
    const numbers = text.match(/\d/g);

    const chineseCount = chineseChars ? chineseChars.length : 0;
    const englishCount = englishChars ? englishChars.length : 0;
    const numberCount = numbers ? numbers.length : 0;

    const totalChars = chineseCount + englishCount + numberCount;

    let language = 'unknown';
    let confidence = 0;

    if (totalChars === 0) {
      language = 'unknown';
      confidence = 0;
    } else if (chineseCount > englishCount) {
      language = 'chinese';
      confidence = chineseCount / totalChars;
    } else if (englishCount > chineseCount) {
      language = 'english';
      confidence = englishCount / totalChars;
    } else {
      language = 'mixed';
      confidence = 0.5;
    }

    const result = {
      language,
      confidence,
      distribution: {
        chinese: chineseCount,
        english: englishCount,
        numbers: numberCount,
        total: totalChars
      }
    };

    this.cacheResult(`language_${hash}`, result);
    return result;
  }

  async suggestCategory(text) {
    const hash = this.generateHash(text);
    const cached = this.cache.get(`category_${hash}`);
    if (cached) {
      return cached;
    }

    // 基于关键词的简单分类
    const categoryKeywords = {
      support: ['问题', '故障', '错误', '无法', '不能', '帮助', '支持'],
      sales: ['价格', '购买', '产品', '服务', '费用', '套餐', '多少钱'],
      complaint: ['投诉', '不满', '退款', '赔偿', '差评'],
      appointment: ['预约', '约定', '时间', '安排', '会面'],
      inquiry: ['咨询', '询问', '了解', '什么', '如何', '怎么'],
      feedback: ['反馈', '建议', '意见', '评价', '体验']
    };

    const words = this.tokenize(text.toLowerCase());
    const categoryScores = {};

    Object.entries(categoryKeywords).forEach(([category, keywords]) => {
      let score = 0;
      keywords.forEach(keyword => {
        if (words.includes(keyword)) {
          score++;
        }
      });
      categoryScores[category] = score;
    });

    const bestCategory = Object.entries(categoryScores)
      .reduce((a, b) => a[1] > b[1] ? a : b);

    const result = {
      category: bestCategory[1] > 0 ? bestCategory[0] : 'other',
      confidence: bestCategory[1] / words.length,
      scores: categoryScores
    };

    this.cacheResult(`category_${hash}`, result);
    return result;
  }

  async quickSentimentAnalysis(text) {
    // 快速情感分析，仅返回情感标签
    const sentiment = await this.analyzeSentiment(text);
    return sentiment.sentiment;
  }

  async calculateSimilarity(text1, text2) {
    // 简单的余弦相似度计算
    const words1 = new Set(this.tokenize(text1.toLowerCase()));
    const words2 = new Set(this.tokenize(text2.toLowerCase()));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    const similarity = intersection.size / union.size;
    
    return {
      similarity,
      commonWords: Array.from(intersection),
      uniqueWords1: Array.from(new Set([...words1].filter(x => !words2.has(x)))),
      uniqueWords2: Array.from(new Set([...words2].filter(x => !words1.has(x))))
    };
  }

  async analyzeBatch(texts, features = ['sentiment', 'entities', 'keywords']) {
    const results = [];
    
    for (const text of texts) {
      try {
        const result = await this.analyze(text, features);
        results.push(result);
      } catch (error) {
        results.push({
          error: error.message,
          text: text.substring(0, 50)
        });
      }
    }
    
    return results;
  }

  tokenize(text) {
    // 简单的中英文分词
    const chineseWords = text.match(/[\u4e00-\u9fa5]+/g) || [];
    const englishWords = text.match(/[a-zA-Z]+/g) || [];
    const numbers = text.match(/\d+/g) || [];
    
    return [...chineseWords, ...englishWords, ...numbers]
      .map(word => word.toLowerCase())
      .filter(word => word.length > 0);
  }

  generateHash(text) {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
  }

  cacheResult(key, result) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, result);
  }

  async healthCheck() {
    return {
      status: 'healthy',
      initialized: this.isInitialized,
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      dictionarySize: {
        stopWords: this.stopWords.size,
        positiveWords: this.sentimentWords.positive.length,
        negativeWords: this.sentimentWords.negative.length
      }
    };
  }

  clearCache() {
    this.cache.clear();
    logger.info('NLP processor cache cleared');
  }

  async shutdown() {
    this.clearCache();
    this.isInitialized = false;
    logger.info('NLP processor shut down');
  }
}

module.exports = NLPProcessor; 