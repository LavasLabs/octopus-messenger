const logger = require('../utils/logger');
const { ClassificationError } = require('../middleware/errorHandler');

class ClassificationManager {
  constructor(options = {}) {
    this.classifiers = options.classifiers || {};
    this.dbManager = options.dbManager;
    this.cacheManager = options.cacheManager;
    this.nlpProcessor = options.nlpProcessor;
    this.config = options.config || {};
    this.isInitialized = false;
    
    // 默认分类策略
    this.defaultStrategy = 'confidence_weighted';
    this.strategies = {
      confidence_weighted: this.confidenceWeightedStrategy.bind(this),
      majority_vote: this.majorityVoteStrategy.bind(this),
      highest_confidence: this.highestConfidenceStrategy.bind(this),
      ensemble: this.ensembleStrategy.bind(this)
    };
  }

  async initialize() {
    try {
      logger.info('Initializing classification manager...');
      
      // 验证必需的依赖
      if (!this.dbManager || !this.cacheManager) {
        throw new Error('Database manager and cache manager are required');
      }
      
      // 初始化所有分类器
      for (const [name, classifier] of Object.entries(this.classifiers)) {
        if (classifier.initialize) {
          await classifier.initialize();
          logger.info(`Classifier ${name} initialized`);
        }
      }
      
      this.isInitialized = true;
      logger.info('Classification manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize classification manager', { error: error.message });
      throw new ClassificationError('Failed to initialize classification manager', 'manager', 500);
    }
  }

  async classify(message, options = {}) {
    if (!this.isInitialized) {
      throw new ClassificationError('Classification manager not initialized', 'manager', 500);
    }

    try {
      const startTime = Date.now();
      const { 
        tenantId, 
        userId, 
        classifier, 
        strategy = this.defaultStrategy,
        forceRefresh = false 
      } = options;

      // 检查缓存
      if (!forceRefresh && this.cacheManager) {
        const cached = await this.cacheManager.getCachedClassificationResult(
          message.id, 
          tenantId
        );
        if (cached) {
          logger.classify('cache_hit', message, { tenantId });
          return cached;
        }
      }

      let result;
      
      if (classifier) {
        // 使用指定的分类器
        result = await this.classifyWithSingleClassifier(message, classifier, options);
      } else {
        // 使用多个分类器和策略
        result = await this.classifyWithStrategy(message, strategy, options);
      }

      // 后处理结果
      result = await this.postProcessResult(result, message, options);

      // 保存结果到数据库
      if (this.dbManager && tenantId) {
        await this.dbManager.saveClassificationResult(message.id, result, tenantId);
      }

      // 缓存结果
      if (this.cacheManager && tenantId) {
        await this.cacheManager.cacheClassificationResult(message.id, tenantId, result);
      }

      const processingTime = Date.now() - startTime;
      logger.classify('completed', message, { 
        ...result, 
        processingTime,
        tenantId 
      });

      return result;
    } catch (error) {
      logger.error('Classification failed', { 
        error: error.message,
        messageId: message.id,
        tenantId: options.tenantId
      });
      
      throw new ClassificationError(
        `Classification failed: ${error.message}`,
        'manager',
        500
      );
    }
  }

  async classifyWithSingleClassifier(message, classifierName, options) {
    const classifier = this.classifiers[classifierName];
    if (!classifier) {
      throw new ClassificationError(
        `Classifier ${classifierName} not found`,
        'manager',
        404
      );
    }

    return await classifier.classify(message, options);
  }

  async classifyWithStrategy(message, strategy, options) {
    const strategyFunc = this.strategies[strategy];
    if (!strategyFunc) {
      throw new ClassificationError(
        `Strategy ${strategy} not found`,
        'manager',
        404
      );
    }

    // 获取可用的分类器
    const availableClassifiers = Object.entries(this.classifiers)
      .filter(([name, classifier]) => this.isClassifierEnabled(name));

    if (availableClassifiers.length === 0) {
      throw new ClassificationError(
        'No classifiers available',
        'manager',
        503
      );
    }

    // 并行执行分类
    const classificationPromises = availableClassifiers.map(async ([name, classifier]) => {
      try {
        const result = await classifier.classify(message, options);
        return { classifier: name, result };
      } catch (error) {
        logger.error(`Classifier ${name} failed`, { error: error.message });
        return { classifier: name, error: error.message };
      }
    });

    const classificationResults = await Promise.all(classificationPromises);
    
    // 过滤出成功的结果
    const successfulResults = classificationResults.filter(r => r.result);
    
    if (successfulResults.length === 0) {
      throw new ClassificationError(
        'All classifiers failed',
        'manager',
        503
      );
    }

    // 应用策略合并结果
    return strategyFunc(successfulResults, message, options);
  }

  confidenceWeightedStrategy(results, message, options) {
    // 基于置信度加权平均
    const categoryScores = {};
    let totalWeight = 0;

    results.forEach(({ classifier, result }) => {
      const weight = this.getClassifierWeight(classifier);
      const adjustedConfidence = result.confidence * weight;
      
      if (!categoryScores[result.category]) {
        categoryScores[result.category] = 0;
      }
      categoryScores[result.category] += adjustedConfidence;
      totalWeight += weight;
    });

    // 找出最高分的类别
    const bestCategory = Object.entries(categoryScores)
      .reduce((a, b) => a[1] > b[1] ? a : b)[0];

    const finalConfidence = categoryScores[bestCategory] / totalWeight;

    // 合并其他属性
    const mergedResult = this.mergeResults(results, bestCategory, finalConfidence);
    mergedResult.strategy = 'confidence_weighted';
    
    return mergedResult;
  }

  majorityVoteStrategy(results, message, options) {
    // 简单多数投票
    const categoryVotes = {};
    
    results.forEach(({ classifier, result }) => {
      if (!categoryVotes[result.category]) {
        categoryVotes[result.category] = 0;
      }
      categoryVotes[result.category]++;
    });

    const bestCategory = Object.entries(categoryVotes)
      .reduce((a, b) => a[1] > b[1] ? a : b)[0];

    const voteCount = categoryVotes[bestCategory];
    const finalConfidence = voteCount / results.length;

    const mergedResult = this.mergeResults(results, bestCategory, finalConfidence);
    mergedResult.strategy = 'majority_vote';
    
    return mergedResult;
  }

  highestConfidenceStrategy(results, message, options) {
    // 选择置信度最高的结果
    const bestResult = results.reduce((best, current) => 
      current.result.confidence > best.result.confidence ? current : best
    );

    const result = { ...bestResult.result };
    result.strategy = 'highest_confidence';
    result.classifier = bestResult.classifier;
    
    return result;
  }

  ensembleStrategy(results, message, options) {
    // 集成多个策略的结果
    const confidenceWeighted = this.confidenceWeightedStrategy(results, message, options);
    const majorityVote = this.majorityVoteStrategy(results, message, options);
    const highestConfidence = this.highestConfidenceStrategy(results, message, options);

    // 如果三个策略都同意，使用置信度加权结果
    if (confidenceWeighted.category === majorityVote.category && 
        majorityVote.category === highestConfidence.category) {
      confidenceWeighted.strategy = 'ensemble_unanimous';
      confidenceWeighted.confidence = Math.min(confidenceWeighted.confidence + 0.1, 1.0);
      return confidenceWeighted;
    }

    // 如果有分歧，使用置信度最高的结果但降低置信度
    const finalResult = { ...highestConfidence };
    finalResult.strategy = 'ensemble_conflicted';
    finalResult.confidence = Math.max(finalResult.confidence - 0.2, 0.1);
    finalResult.conflict = true;
    
    return finalResult;
  }

  mergeResults(results, category, confidence) {
    const mergedResult = {
      category,
      confidence,
      timestamp: new Date().toISOString(),
      classifiers_used: results.map(r => r.classifier),
      individual_results: results.map(r => ({
        classifier: r.classifier,
        category: r.result.category,
        confidence: r.result.confidence,
        priority: r.result.priority,
        sentiment: r.result.sentiment
      }))
    };

    // 合并优先级（取最高的）
    const priorities = results.map(r => r.result.priority).filter(p => p);
    if (priorities.length > 0) {
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      mergedResult.priority = Object.entries(priorityOrder)
        .find(([p, v]) => v === Math.max(...priorities.map(p => priorityOrder[p] || 0)))[0];
    }

    // 合并情感分析（多数投票）
    const sentiments = results.map(r => r.result.sentiment).filter(s => s);
    if (sentiments.length > 0) {
      const sentimentCounts = {};
      sentiments.forEach(s => {
        sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
      });
      mergedResult.sentiment = Object.entries(sentimentCounts)
        .reduce((a, b) => a[1] > b[1] ? a : b)[0];
    }

    // 合并关键词
    const allKeywords = results.flatMap(r => r.result.keywords || []);
    mergedResult.keywords = [...new Set(allKeywords)];

    // 合并推理
    const reasonings = results.map(r => r.result.reasoning).filter(r => r);
    if (reasonings.length > 0) {
      mergedResult.reasoning = reasonings.join('; ');
    }

    return mergedResult;
  }

  getClassifierWeight(classifierName) {
    const weights = {
      'openai': 0.4,
      'claude': 0.4,
      'rule-engine': 0.2
    };
    return weights[classifierName] || 0.1;
  }

  isClassifierEnabled(classifierName) {
    const config = this.config.ai?.enabled || {};
    return config[classifierName] !== false;
  }

  async postProcessResult(result, message, options) {
    // 后处理：验证和增强结果
    
    // 确保置信度在有效范围内
    if (result.confidence < 0) result.confidence = 0;
    if (result.confidence > 1) result.confidence = 1;
    
    // 添加消息元数据
    result.message_id = message.id;
    result.platform = message.platform;
    result.content_length = message.content?.length || 0;
    
    // 如果没有情感分析，尝试快速分析
    if (!result.sentiment && this.nlpProcessor) {
      try {
        const sentiment = await this.nlpProcessor.quickSentimentAnalysis(message.content);
        result.sentiment = sentiment;
      } catch (error) {
        logger.debug('Quick sentiment analysis failed', { error: error.message });
      }
    }
    
    return result;
  }

  async classifyBatch(messages, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;
    
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
    }
    
    return results;
  }

  async trainModel(modelType, examples, options = {}) {
    const classifier = this.classifiers[modelType];
    if (!classifier) {
      throw new ClassificationError(
        `Classifier ${modelType} not found`,
        'manager',
        404
      );
    }

    if (!classifier.trainModel) {
      throw new ClassificationError(
        `Classifier ${modelType} does not support training`,
        'manager',
        400
      );
    }

    try {
      const result = await classifier.trainModel(examples, options);
      
      // 保存训练数据
      if (this.dbManager && options.tenantId) {
        await this.dbManager.saveTrainingData(options.tenantId, examples, modelType);
      }
      
      return result;
    } catch (error) {
      throw new ClassificationError(
        `Training failed for ${modelType}: ${error.message}`,
        'manager',
        500
      );
    }
  }

  async getStats() {
    const stats = {
      classifiers: {},
      total_classifiers: Object.keys(this.classifiers).length,
      enabled_classifiers: Object.keys(this.classifiers).filter(name => 
        this.isClassifierEnabled(name)
      ).length,
      strategies: Object.keys(this.strategies),
      default_strategy: this.defaultStrategy
    };

    // 获取每个分类器的统计信息
    for (const [name, classifier] of Object.entries(this.classifiers)) {
      try {
        if (classifier.getStats) {
          stats.classifiers[name] = await classifier.getStats();
        } else {
          stats.classifiers[name] = { status: 'available' };
        }
      } catch (error) {
        stats.classifiers[name] = { status: 'error', error: error.message };
      }
    }

    return stats;
  }

  async healthCheck() {
    const health = {
      status: 'healthy',
      classifiers: {},
      initialized: this.isInitialized
    };

    for (const [name, classifier] of Object.entries(this.classifiers)) {
      try {
        if (classifier.healthCheck) {
          health.classifiers[name] = await classifier.healthCheck();
        } else {
          health.classifiers[name] = { status: 'unknown' };
        }
      } catch (error) {
        health.classifiers[name] = { 
          status: 'unhealthy', 
          error: error.message 
        };
      }
    }

    // 检查是否有任何分类器可用
    const healthyClassifiers = Object.values(health.classifiers)
      .filter(c => c.status === 'healthy').length;
    
    if (healthyClassifiers === 0) {
      health.status = 'unhealthy';
      health.message = 'No healthy classifiers available';
    }

    return health;
  }

  async setThresholds(tenantId, thresholds) {
    // 设置分类阈值
    const cacheKey = `thresholds_${tenantId}`;
    await this.cacheManager.set(cacheKey, thresholds, 86400); // 24小时缓存
    
    logger.info('Classification thresholds updated', { tenantId, thresholds });
    return thresholds;
  }

  async getThresholds(tenantId) {
    const cacheKey = `thresholds_${tenantId}`;
    const cached = await this.cacheManager.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    // 返回默认阈值
    return {
      confidence_threshold: 0.6,
      priority_thresholds: {
        high: 0.8,
        medium: 0.5,
        low: 0.3
      },
      sentiment_threshold: 0.7
    };
  }

  async shutdown() {
    logger.info('Shutting down classification manager...');
    
    // 关闭所有分类器
    for (const [name, classifier] of Object.entries(this.classifiers)) {
      if (classifier.shutdown) {
        await classifier.shutdown();
      }
    }
    
    this.isInitialized = false;
    logger.info('Classification manager shut down');
  }
}

module.exports = ClassificationManager; 