const logger = require('./logger');

class PerformanceOptimizer {
  constructor(options = {}) {
    this.cacheManager = options.cacheManager;
    this.config = options.config || {};
    
    // 性能配置
    this.performance = {
      // 分类器性能基准
      classifierBenchmarks: {
        openai: { avgResponseTime: 2000, reliability: 0.98, cost: 0.005 },
        claude: { avgResponseTime: 1800, reliability: 0.97, cost: 0.004 },
        ruleEngine: { avgResponseTime: 50, reliability: 0.85, cost: 0.0001 }
      },
      
      // 缓存策略
      cache: {
        classificationTTL: this.config.classificationCacheTTL || 3600000, // 1小时
        translationTTL: this.config.translationCacheTTL || 86400000, // 24小时
        contextTTL: this.config.contextCacheTTL || 1800000, // 30分钟
        maxCacheSize: this.config.maxCacheSize || 10000
      },
      
      // 性能阈值
      thresholds: {
        maxResponseTime: this.config.maxResponseTime || 5000, // 5秒
        minConfidence: this.config.minConfidence || 0.7,
        maxConcurrency: this.config.maxConcurrency || 10,
        retryLimit: this.config.retryLimit || 3
      }
    };
    
    // 实时性能统计
    this.stats = {
      requests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalResponseTime: 0,
      classifierUsage: {},
      errorCount: 0,
      retryCount: 0
    };
    
    // 分类器性能跟踪
    this.classifierPerformance = new Map();
    
    // 初始化分类器统计
    Object.keys(this.performance.classifierBenchmarks).forEach(classifier => {
      this.classifierPerformance.set(classifier, {
        requests: 0,
        totalTime: 0,
        errors: 0,
        avgConfidence: 0,
        recentPerformance: []
      });
    });
  }

  // 智能分类器选择
  selectOptimalClassifier(messageData, context = {}) {
    const { urgency, complexity, language, tenantMode } = context;
    
    // 1. 检查租户模式偏好
    if (tenantMode === 'privacy' || tenantMode === 'normal') {
      // 隐私模式优先使用快速分类器
      return this.selectFastClassifier();
    }
    
    // 2. 根据消息特征选择
    if (urgency === 'high' || this.isSimpleMessage(messageData.content)) {
      return this.selectFastClassifier();
    }
    
    if (complexity === 'high' || this.isComplexMessage(messageData.content)) {
      return this.selectAccurateClassifier();
    }
    
    // 3. 根据语言选择
    if (language && language !== 'en' && language !== 'zh') {
      return this.selectMultilingualClassifier();
    }
    
    // 4. 基于性能历史选择
    return this.selectByPerformance();
  }

  selectFastClassifier() {
    // 优先选择响应时间最快的分类器
    const available = this.getAvailableClassifiers();
    const fastest = available.reduce((best, current) => {
      const currentStats = this.classifierPerformance.get(current);
      const bestStats = this.classifierPerformance.get(best);
      
      const currentAvgTime = currentStats.totalTime / (currentStats.requests || 1);
      const bestAvgTime = bestStats.totalTime / (bestStats.requests || 1);
      
      return currentAvgTime < bestAvgTime ? current : best;
    });
    
    logger.debug('Selected fast classifier', { classifier: fastest });
    return fastest;
  }

  selectAccurateClassifier() {
    // 优先选择准确率最高的分类器
    const available = this.getAvailableClassifiers();
    const mostAccurate = available.reduce((best, current) => {
      const currentStats = this.classifierPerformance.get(current);
      const bestStats = this.classifierPerformance.get(best);
      
      return currentStats.avgConfidence > bestStats.avgConfidence ? current : best;
    });
    
    logger.debug('Selected accurate classifier', { classifier: mostAccurate });
    return mostAccurate;
  }

  selectMultilingualClassifier() {
    // 对于多语言，优先选择OpenAI或Claude
    const multilingualClassifiers = ['openai', 'claude'];
    const available = this.getAvailableClassifiers();
    
    for (const classifier of multilingualClassifiers) {
      if (available.includes(classifier)) {
        logger.debug('Selected multilingual classifier', { classifier });
        return classifier;
      }
    }
    
    return available[0];
  }

  selectByPerformance() {
    // 基于综合性能评分选择
    const available = this.getAvailableClassifiers();
    const scored = available.map(classifier => ({
      classifier,
      score: this.calculatePerformanceScore(classifier)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    const selected = scored[0].classifier;
    
    logger.debug('Selected by performance', { 
      classifier: selected, 
      score: scored[0].score 
    });
    
    return selected;
  }

  calculatePerformanceScore(classifier) {
    const stats = this.classifierPerformance.get(classifier);
    const benchmark = this.performance.classifierBenchmarks[classifier];
    
    if (!stats || stats.requests === 0) {
      return benchmark.reliability * 100;
    }
    
    const avgTime = stats.totalTime / stats.requests;
    const errorRate = stats.errors / stats.requests;
    const reliability = 1 - errorRate;
    
    // 综合评分：可靠性 (50%) + 速度 (30%) + 置信度 (20%)
    const reliabilityScore = reliability * 50;
    const speedScore = Math.max(0, (benchmark.avgResponseTime - avgTime) / benchmark.avgResponseTime) * 30;
    const confidenceScore = stats.avgConfidence * 20;
    
    return reliabilityScore + speedScore + confidenceScore;
  }

  // 智能缓存管理
  async getCachedClassification(messageContent, context = {}) {
    try {
      const cacheKey = this.generateClassificationCacheKey(messageContent, context);
      const cached = await this.cacheManager.get(cacheKey);
      
      if (cached) {
        this.stats.cacheHits++;
        const result = JSON.parse(cached);
        
        logger.debug('Classification cache hit', { 
          cacheKey: cacheKey.substring(0, 20) + '...',
          category: result.category 
        });
        
        return result;
      }
      
      this.stats.cacheMisses++;
      return null;
      
    } catch (error) {
      logger.debug('Cache retrieval failed', { error: error.message });
      this.stats.cacheMisses++;
      return null;
    }
  }

  async setCachedClassification(messageContent, context, result) {
    try {
      const cacheKey = this.generateClassificationCacheKey(messageContent, context);
      const ttl = this.performance.cache.classificationTTL;
      
      await this.cacheManager.set(cacheKey, JSON.stringify(result), ttl);
      
      logger.debug('Classification cached', { 
        cacheKey: cacheKey.substring(0, 20) + '...',
        ttl
      });
      
    } catch (error) {
      logger.debug('Cache storage failed', { error: error.message });
    }
  }

  generateClassificationCacheKey(content, context) {
    const crypto = require('crypto');
    const normalizedContent = content.toLowerCase().trim();
    const contextStr = JSON.stringify({
      tenantId: context.tenantId,
      language: context.language,
      platform: context.platform
    });
    
    const combined = normalizedContent + contextStr;
    const hash = crypto.createHash('md5').update(combined).digest('hex');
    
    return `classification:${hash}`;
  }

  // 性能监控
  recordClassifierPerformance(classifier, responseTime, confidence, error = null) {
    this.stats.requests++;
    this.stats.totalResponseTime += responseTime;
    
    const stats = this.classifierPerformance.get(classifier);
    if (!stats) return;
    
    stats.requests++;
    stats.totalTime += responseTime;
    
    if (error) {
      stats.errors++;
      this.stats.errorCount++;
    } else {
      // 更新平均置信度
      const prevAvg = stats.avgConfidence;
      const newCount = stats.requests - stats.errors;
      stats.avgConfidence = ((prevAvg * (newCount - 1)) + confidence) / newCount;
    }
    
    // 记录最近性能
    stats.recentPerformance.push({
      responseTime,
      confidence,
      error: !!error,
      timestamp: Date.now()
    });
    
    // 保持最近50条记录
    if (stats.recentPerformance.length > 50) {
      stats.recentPerformance.shift();
    }
    
    // 更新统计
    if (!this.stats.classifierUsage[classifier]) {
      this.stats.classifierUsage[classifier] = 0;
    }
    this.stats.classifierUsage[classifier]++;
  }

  // 自适应重试逻辑
  async executeWithRetry(classifier, operation, context = {}) {
    const maxRetries = this.performance.thresholds.retryLimit;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      
      try {
        const result = await operation();
        const responseTime = Date.now() - startTime;
        
        // 记录成功性能
        this.recordClassifierPerformance(classifier, responseTime, result.confidence || 0);
        
        return result;
        
      } catch (error) {
        lastError = error;
        const responseTime = Date.now() - startTime;
        
        // 记录失败性能
        this.recordClassifierPerformance(classifier, responseTime, 0, error);
        this.stats.retryCount++;
        
        logger.warn('Classifier operation failed', {
          classifier,
          attempt,
          maxRetries,
          error: error.message,
          responseTime
        });
        
        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * attempt, 5000); // 指数退避，最大5秒
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Classifier ${classifier} failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  // 负载均衡
  async executeWithLoadBalancing(classifiers, operation, context = {}) {
    // 根据当前负载选择分类器
    const availableClassifiers = classifiers.filter(classifier => 
      this.isClassifierAvailable(classifier)
    );
    
    if (availableClassifiers.length === 0) {
      throw new Error('No available classifiers');
    }
    
    // 选择负载最轻的分类器
    const selectedClassifier = this.selectLeastLoadedClassifier(availableClassifiers);
    
    return await this.executeWithRetry(selectedClassifier, () => operation(selectedClassifier), context);
  }

  selectLeastLoadedClassifier(classifiers) {
    return classifiers.reduce((best, current) => {
      const currentStats = this.classifierPerformance.get(current);
      const bestStats = this.classifierPerformance.get(best);
      
      // 计算当前负载（最近请求的平均响应时间）
      const currentLoad = this.calculateCurrentLoad(currentStats);
      const bestLoad = this.calculateCurrentLoad(bestStats);
      
      return currentLoad < bestLoad ? current : best;
    });
  }

  calculateCurrentLoad(stats) {
    if (!stats || stats.recentPerformance.length === 0) {
      return 0;
    }
    
    const recentRequests = stats.recentPerformance.slice(-10); // 最近10个请求
    const avgResponseTime = recentRequests.reduce((sum, perf) => sum + perf.responseTime, 0) / recentRequests.length;
    const errorRate = recentRequests.filter(perf => perf.error).length / recentRequests.length;
    
    return avgResponseTime * (1 + errorRate); // 考虑错误率的负载
  }

  // 健康检查
  isClassifierAvailable(classifier) {
    const stats = this.classifierPerformance.get(classifier);
    if (!stats || stats.requests === 0) {
      return true; // 新分类器默认可用
    }
    
    // 检查最近的错误率
    const recentErrors = stats.recentPerformance.slice(-10).filter(perf => perf.error).length;
    const errorRate = recentErrors / Math.min(10, stats.recentPerformance.length);
    
    // 如果错误率超过50%，认为不可用
    return errorRate < 0.5;
  }

  getAvailableClassifiers() {
    const allClassifiers = Object.keys(this.performance.classifierBenchmarks);
    return allClassifiers.filter(classifier => this.isClassifierAvailable(classifier));
  }

  // 消息复杂度分析
  isSimpleMessage(content) {
    if (!content) return true;
    
    const wordCount = content.split(/\s+/).length;
    const hasQuestions = content.includes('?') || content.includes('？');
    const hasMultipleSentences = (content.match(/[.!?。！？]/g) || []).length > 1;
    
    return wordCount <= 10 && !hasQuestions && !hasMultipleSentences;
  }

  isComplexMessage(content) {
    if (!content) return false;
    
    const wordCount = content.split(/\s+/).length;
    const hasMultipleQuestions = (content.match(/[?？]/g) || []).length > 1;
    const hasLongSentences = content.split(/[.!?。！？]/).some(sentence => sentence.length > 100);
    const hasSpecialTerms = /\b(API|SDK|配置|集成|部署|架构)\b/i.test(content);
    
    return wordCount > 50 || hasMultipleQuestions || hasLongSentences || hasSpecialTerms;
  }

  // 获取性能统计
  getPerformanceStats() {
    const avgResponseTime = this.stats.requests > 0 ? 
      this.stats.totalResponseTime / this.stats.requests : 0;
    
    const cacheHitRate = this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0;
    const errorRate = this.stats.errorCount / this.stats.requests || 0;
    
    const classifierStats = {};
    this.classifierPerformance.forEach((stats, classifier) => {
      classifierStats[classifier] = {
        requests: stats.requests,
        avgResponseTime: stats.requests > 0 ? stats.totalTime / stats.requests : 0,
        errorRate: stats.requests > 0 ? stats.errors / stats.requests : 0,
        avgConfidence: stats.avgConfidence,
        available: this.isClassifierAvailable(classifier)
      };
    });
    
    return {
      overall: {
        totalRequests: this.stats.requests,
        avgResponseTime,
        cacheHitRate,
        errorRate,
        retryRate: this.stats.retryCount / this.stats.requests || 0
      },
      classifiers: classifierStats,
      usage: this.stats.classifierUsage
    };
  }

  // 重置统计
  resetStats() {
    this.stats = {
      requests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalResponseTime: 0,
      classifierUsage: {},
      errorCount: 0,
      retryCount: 0
    };
    
    this.classifierPerformance.forEach(stats => {
      stats.requests = 0;
      stats.totalTime = 0;
      stats.errors = 0;
      stats.avgConfidence = 0;
      stats.recentPerformance = [];
    });
  }
}

module.exports = PerformanceOptimizer; 