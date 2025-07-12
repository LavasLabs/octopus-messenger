const logger = require('../utils/logger');
const { ModelTrainingError, ValidationError } = require('../middleware/errorHandler');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class TenantModelManager {
  constructor(options = {}) {
    this.dbManager = options.dbManager;
    this.cacheManager = options.cacheManager;
    this.config = options.config || {};
    this.modelsPath = options.modelsPath || './models';
    this.isInitialized = false;
    
    // 租户模型缓存
    this.tenantModels = new Map();
    this.tenantTrainingData = new Map();
  }

  async initialize() {
    try {
      logger.info('Initializing tenant model manager...');
      
      // 确保模型目录存在
      await this.ensureDirectoryExists(this.modelsPath);
      
      // 加载已有的租户模型
      await this.loadExistingModels();
      
      this.isInitialized = true;
      logger.info('Tenant model manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize tenant model manager', { error: error.message });
      throw new ModelTrainingError('Failed to initialize tenant model manager', 'tenant-manager', 500);
    }
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
      logger.info('Created models directory', { path: dirPath });
    }
  }

  async loadExistingModels() {
    try {
      // 从数据库加载租户模型元数据
      const query = `
        SELECT DISTINCT tenant_id, model_type, model_version, model_path, created_at, updated_at
        FROM tenant_models 
        WHERE is_active = true
        ORDER BY tenant_id, model_type, created_at DESC
      `;
      
      const result = await this.dbManager.query(query);
      
      for (const row of result.rows) {
        const key = `${row.tenant_id}:${row.model_type}`;
        this.tenantModels.set(key, {
          tenantId: row.tenant_id,
          modelType: row.model_type,
          version: row.model_version,
          path: row.model_path,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
      
      logger.info('Loaded existing tenant models', { 
        modelsCount: this.tenantModels.size 
      });
    } catch (error) {
      logger.warn('Failed to load existing models', { error: error.message });
    }
  }

  async getTenantModel(tenantId, modelType) {
    const key = `${tenantId}:${modelType}`;
    
    // 先从缓存获取
    let model = this.tenantModels.get(key);
    if (model) {
      return model;
    }

    // 从数据库加载
    try {
      const query = `
        SELECT * FROM tenant_models 
        WHERE tenant_id = $1 AND model_type = $2 AND is_active = true
        ORDER BY created_at DESC LIMIT 1
      `;
      
      const result = await this.dbManager.query(query, [tenantId, modelType]);
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        model = {
          id: row.id,
          tenantId: row.tenant_id,
          modelType: row.model_type,
          version: row.model_version,
          path: row.model_path,
          config: JSON.parse(row.model_config || '{}'),
          metrics: JSON.parse(row.model_metrics || '{}'),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
        
        // 缓存模型信息
        this.tenantModels.set(key, model);
        
        return model;
      }
    } catch (error) {
      logger.error('Failed to load tenant model', { 
        tenantId, 
        modelType, 
        error: error.message 
      });
    }
    
    return null;
  }

  async saveTenantModel(tenantId, modelType, modelData, metadata = {}) {
    try {
      const modelId = crypto.randomUUID();
      const version = await this.getNextModelVersion(tenantId, modelType);
      const modelPath = path.join(this.modelsPath, tenantId, modelType, `v${version}`);
      
      // 确保目录存在
      await this.ensureDirectoryExists(modelPath);
      
      // 保存模型文件
      const modelFilePath = path.join(modelPath, 'model.json');
      await fs.writeFile(modelFilePath, JSON.stringify(modelData, null, 2));
      
      // 保存元数据到数据库
      const query = `
        INSERT INTO tenant_models (
          id, tenant_id, model_type, model_version, model_path, 
          model_config, model_metrics, file_size, checksum, is_active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING *
      `;
      
      const checksum = await this.calculateChecksum(modelFilePath);
      const stats = await fs.stat(modelFilePath);
      
      const params = [
        modelId,
        tenantId,
        modelType,
        version,
        modelFilePath,
        JSON.stringify(metadata.config || {}),
        JSON.stringify(metadata.metrics || {}),
        stats.size,
        checksum,
        true
      ];
      
      const result = await this.dbManager.query(query, params);
      
      // 停用旧版本模型
      await this.deactivateOldModels(tenantId, modelType, version);
      
      // 更新缓存
      const key = `${tenantId}:${modelType}`;
      this.tenantModels.set(key, {
        id: modelId,
        tenantId,
        modelType,
        version,
        path: modelFilePath,
        config: metadata.config || {},
        metrics: metadata.metrics || {},
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      logger.info('Tenant model saved', { 
        tenantId, 
        modelType, 
        version, 
        path: modelFilePath 
      });
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to save tenant model', { 
        tenantId, 
        modelType, 
        error: error.message 
      });
      throw new ModelTrainingError(`Failed to save tenant model: ${error.message}`, 'tenant-manager', 500);
    }
  }

  async trainTenantModel(tenantId, modelType, examples, options = {}) {
    try {
      logger.info('Starting tenant model training', { 
        tenantId, 
        modelType, 
        exampleCount: examples.length 
      });
      
      // 验证训练数据
      this.validateTrainingData(examples);
      
      // 获取租户特定的训练数据
      const tenantTrainingData = await this.getTenantTrainingData(tenantId, modelType);
      const allExamples = [...tenantTrainingData, ...examples];
      
      // 根据模型类型选择训练方法
      let trainedModel;
      let metrics;
      
      switch (modelType) {
        case 'rule-engine':
          ({ model: trainedModel, metrics } = await this.trainRuleEngineModel(allExamples, options));
          break;
        case 'local-classifier':
          ({ model: trainedModel, metrics } = await this.trainLocalClassifier(allExamples, options));
          break;
        case 'embedding-model':
          ({ model: trainedModel, metrics } = await this.trainEmbeddingModel(allExamples, options));
          break;
        default:
          throw new ModelTrainingError(`Unsupported model type: ${modelType}`, 'tenant-manager', 400);
      }
      
      // 保存训练数据
      await this.saveTrainingData(tenantId, modelType, examples);
      
      // 保存训练好的模型
      const savedModel = await this.saveTenantModel(tenantId, modelType, trainedModel, {
        config: options,
        metrics,
        trainingExamples: allExamples.length
      });
      
      // 更新缓存中的训练数据
      const key = `${tenantId}:${modelType}`;
      this.tenantTrainingData.set(key, allExamples);
      
      logger.info('Tenant model training completed', { 
        tenantId, 
        modelType, 
        accuracy: metrics.accuracy,
        trainingTime: metrics.trainingTime 
      });
      
      return {
        success: true,
        model: savedModel,
        metrics,
        trainingExamples: allExamples.length
      };
    } catch (error) {
      logger.error('Tenant model training failed', { 
        tenantId, 
        modelType, 
        error: error.message 
      });
      throw new ModelTrainingError(`Tenant model training failed: ${error.message}`, 'tenant-manager', 500);
    }
  }

  async trainRuleEngineModel(examples, options = {}) {
    const startTime = Date.now();
    
    // 按类别分组训练数据
    const categoryGroups = {};
    examples.forEach(example => {
      const category = example.category || example.label;
      if (!categoryGroups[category]) {
        categoryGroups[category] = [];
      }
      categoryGroups[category].push(example.text || example.content);
    });
    
    // 生成规则
    const rules = [];
    Object.entries(categoryGroups).forEach(([category, texts]) => {
      const keywords = this.extractKeywords(texts);
      const patterns = this.generatePatterns(texts);
      
      if (keywords.length > 0) {
        rules.push({
          id: `tenant_rule_${category}_${Date.now()}`,
          category,
          keywords,
          patterns,
          priority: options.priority || 'medium',
          weight: this.calculateRuleWeight(texts),
          description: `Tenant-specific rule for ${category}`,
          examples: texts.length
        });
      }
    });
    
    const trainingTime = Date.now() - startTime;
    
    // 计算简单的准确性指标
    const accuracy = this.calculateRuleAccuracy(rules, examples);
    
    return {
      model: {
        type: 'rule-engine',
        rules,
        categories: Object.keys(categoryGroups),
        trainedAt: new Date().toISOString()
      },
      metrics: {
        accuracy,
        trainingTime,
        rulesGenerated: rules.length,
        categoriesCount: Object.keys(categoryGroups).length
      }
    };
  }

  async trainLocalClassifier(examples, options = {}) {
    const startTime = Date.now();
    
    // 简单的贝叶斯分类器实现
    const vocabulary = new Set();
    const categoryStats = {};
    
    // 构建词汇表和统计信息
    examples.forEach(example => {
      const category = example.category || example.label;
      const words = this.tokenize(example.text || example.content);
      
      if (!categoryStats[category]) {
        categoryStats[category] = {
          count: 0,
          wordCounts: {},
          totalWords: 0
        };
      }
      
      categoryStats[category].count++;
      
      words.forEach(word => {
        vocabulary.add(word);
        categoryStats[category].wordCounts[word] = (categoryStats[category].wordCounts[word] || 0) + 1;
        categoryStats[category].totalWords++;
      });
    });
    
    // 计算概率
    const totalDocuments = examples.length;
    const vocabularySize = vocabulary.size;
    
    const model = {
      type: 'naive-bayes',
      vocabulary: Array.from(vocabulary),
      categories: Object.keys(categoryStats),
      categoryProbs: {},
      wordProbs: {},
      trainedAt: new Date().toISOString()
    };
    
    // 计算类别概率和词概率
    Object.entries(categoryStats).forEach(([category, stats]) => {
      model.categoryProbs[category] = stats.count / totalDocuments;
      model.wordProbs[category] = {};
      
      vocabulary.forEach(word => {
        const wordCount = stats.wordCounts[word] || 0;
        // 拉普拉斯平滑
        model.wordProbs[category][word] = (wordCount + 1) / (stats.totalWords + vocabularySize);
      });
    });
    
    const trainingTime = Date.now() - startTime;
    
    // 计算交叉验证准确性
    const accuracy = await this.crossValidateModel(model, examples);
    
    return {
      model,
      metrics: {
        accuracy,
        trainingTime,
        vocabularySize,
        categoriesCount: model.categories.length
      }
    };
  }

  async trainEmbeddingModel(examples, options = {}) {
    const startTime = Date.now();
    
    // 简单的TF-IDF + 余弦相似度模型
    const documents = examples.map(example => ({
      text: example.text || example.content,
      category: example.category || example.label
    }));
    
    // 构建词汇表
    const vocabulary = new Set();
    const documentWords = documents.map(doc => {
      const words = this.tokenize(doc.text);
      words.forEach(word => vocabulary.add(word));
      return words;
    });
    
    const vocabularyArray = Array.from(vocabulary);
    const vocabularySize = vocabularyArray.length;
    
    // 计算TF-IDF向量
    const tfidfVectors = [];
    const idf = {};
    
    // 计算IDF
    vocabularyArray.forEach(word => {
      const docsWithWord = documentWords.filter(words => words.includes(word)).length;
      idf[word] = Math.log(documents.length / (docsWithWord + 1));
    });
    
    // 计算每个文档的TF-IDF向量
    documentWords.forEach((words, docIndex) => {
      const tf = {};
      const totalWords = words.length;
      
      words.forEach(word => {
        tf[word] = (tf[word] || 0) + 1;
      });
      
      const vector = vocabularyArray.map(word => {
        const termFreq = (tf[word] || 0) / totalWords;
        return termFreq * idf[word];
      });
      
      tfidfVectors.push({
        vector,
        category: documents[docIndex].category,
        text: documents[docIndex].text
      });
    });
    
    const trainingTime = Date.now() - startTime;
    
    const model = {
      type: 'tfidf-similarity',
      vocabulary: vocabularyArray,
      idf,
      trainingVectors: tfidfVectors,
      trainedAt: new Date().toISOString()
    };
    
    // 计算准确性
    const accuracy = await this.evaluateEmbeddingModel(model, examples);
    
    return {
      model,
      metrics: {
        accuracy,
        trainingTime,
        vocabularySize,
        trainingDocuments: documents.length
      }
    };
  }

  async getTenantTrainingData(tenantId, modelType) {
    const key = `${tenantId}:${modelType}`;
    
    // 先从缓存获取
    if (this.tenantTrainingData.has(key)) {
      return this.tenantTrainingData.get(key);
    }
    
    // 从数据库加载
    try {
      const query = `
        SELECT training_examples 
        FROM tenant_training_data 
        WHERE tenant_id = $1 AND model_type = $2
        ORDER BY created_at ASC
      `;
      
      const result = await this.dbManager.query(query, [tenantId, modelType]);
      const allExamples = result.rows.flatMap(row => JSON.parse(row.training_examples));
      
      // 缓存数据
      this.tenantTrainingData.set(key, allExamples);
      
      return allExamples;
    } catch (error) {
      logger.error('Failed to load tenant training data', { 
        tenantId, 
        modelType, 
        error: error.message 
      });
      return [];
    }
  }

  async saveTrainingData(tenantId, modelType, examples) {
    try {
      const query = `
        INSERT INTO tenant_training_data (
          tenant_id, model_type, training_examples, examples_count, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `;
      
      await this.dbManager.query(query, [
        tenantId,
        modelType,
        JSON.stringify(examples),
        examples.length
      ]);
      
      logger.info('Training data saved', { 
        tenantId, 
        modelType, 
        exampleCount: examples.length 
      });
    } catch (error) {
      logger.error('Failed to save training data', { 
        tenantId, 
        modelType, 
        error: error.message 
      });
    }
  }

  async predictWithTenantModel(tenantId, modelType, text) {
    const model = await this.getTenantModel(tenantId, modelType);
    if (!model) {
      throw new ModelTrainingError('Tenant model not found', 'tenant-manager', 404);
    }
    
    // 加载模型数据
    const modelData = JSON.parse(await fs.readFile(model.path, 'utf8'));
    
    // 根据模型类型进行预测
    switch (modelData.type) {
      case 'rule-engine':
        return this.predictWithRules(modelData, text);
      case 'naive-bayes':
        return this.predictWithNaiveBayes(modelData, text);
      case 'tfidf-similarity':
        return this.predictWithTFIDF(modelData, text);
      default:
        throw new ModelTrainingError('Unsupported model type', 'tenant-manager', 400);
    }
  }

  predictWithRules(model, text) {
    const words = this.tokenize(text.toLowerCase());
    let bestRule = null;
    let bestScore = 0;
    
    for (const rule of model.rules) {
      let score = 0;
      
      // 关键词匹配
      const matchedKeywords = rule.keywords.filter(keyword => 
        words.includes(keyword.toLowerCase())
      );
      score += (matchedKeywords.length / rule.keywords.length) * 0.7;
      
      // 模式匹配
      if (rule.patterns) {
        for (const pattern of rule.patterns) {
          if (new RegExp(pattern, 'i').test(text)) {
            score += 0.3;
            break;
          }
        }
      }
      
      score *= rule.weight;
      
      if (score > bestScore) {
        bestScore = score;
        bestRule = rule;
      }
    }
    
    return {
      category: bestRule ? bestRule.category : 'other',
      confidence: Math.min(bestScore, 0.95),
      rule: bestRule?.id,
      modelType: 'rule-engine'
    };
  }

  predictWithNaiveBayes(model, text) {
    const words = this.tokenize(text);
    const categoryScores = {};
    
    model.categories.forEach(category => {
      let score = Math.log(model.categoryProbs[category]);
      
      words.forEach(word => {
        if (model.wordProbs[category][word]) {
          score += Math.log(model.wordProbs[category][word]);
        }
      });
      
      categoryScores[category] = score;
    });
    
    const bestCategory = Object.entries(categoryScores)
      .reduce((a, b) => a[1] > b[1] ? a : b)[0];
    
    // 转换为概率
    const maxScore = Math.max(...Object.values(categoryScores));
    const confidence = Math.exp(categoryScores[bestCategory] - maxScore);
    
    return {
      category: bestCategory,
      confidence: Math.min(confidence, 0.95),
      modelType: 'naive-bayes',
      scores: categoryScores
    };
  }

  predictWithTFIDF(model, text) {
    const words = this.tokenize(text);
    const tf = {};
    const totalWords = words.length;
    
    words.forEach(word => {
      tf[word] = (tf[word] || 0) + 1;
    });
    
    // 计算查询向量
    const queryVector = model.vocabulary.map(word => {
      const termFreq = (tf[word] || 0) / totalWords;
      const idfValue = model.idf[word] || 0;
      return termFreq * idfValue;
    });
    
    // 计算与训练向量的相似度
    let bestMatch = null;
    let bestSimilarity = 0;
    
    model.trainingVectors.forEach(trainVector => {
      const similarity = this.cosineSimilarity(queryVector, trainVector.vector);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = trainVector;
      }
    });
    
    return {
      category: bestMatch ? bestMatch.category : 'other',
      confidence: bestSimilarity,
      modelType: 'tfidf-similarity',
      similarity: bestSimilarity
    };
  }

  // 辅助方法
  extractKeywords(texts) {
    const wordCounts = {};
    
    texts.forEach(text => {
      const words = this.tokenize(text.toLowerCase());
      words.forEach(word => {
        if (word.length > 1) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      });
    });
    
    const threshold = Math.max(1, Math.floor(texts.length * 0.3));
    return Object.entries(wordCounts)
      .filter(([word, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word]) => word);
  }

  generatePatterns(texts) {
    const patterns = [];
    
    // 查找常见短语
    const phrases = new Map();
    texts.forEach(text => {
      const words = this.tokenize(text.toLowerCase());
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`;
        phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
      }
    });
    
    // 选择高频短语作为模式
    const threshold = Math.max(1, Math.floor(texts.length * 0.2));
    phrases.forEach((count, phrase) => {
      if (count >= threshold) {
        patterns.push(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }
    });
    
    return patterns.slice(0, 10);
  }

  calculateRuleWeight(texts) {
    // 基于文本数量和多样性计算权重
    const uniqueWords = new Set();
    texts.forEach(text => {
      this.tokenize(text.toLowerCase()).forEach(word => {
        uniqueWords.add(word);
      });
    });
    
    const diversity = uniqueWords.size / Math.max(1, texts.join(' ').split(' ').length);
    const sampleSize = Math.min(texts.length / 10, 1);
    
    return Math.min(0.5 + diversity * 0.3 + sampleSize * 0.2, 1.0);
  }

  calculateRuleAccuracy(rules, examples) {
    let correct = 0;
    
    examples.forEach(example => {
      const prediction = this.predictWithRules({ rules }, example.text || example.content);
      if (prediction.category === (example.category || example.label)) {
        correct++;
      }
    });
    
    return examples.length > 0 ? correct / examples.length : 0;
  }

  async crossValidateModel(model, examples, folds = 5) {
    const foldSize = Math.floor(examples.length / folds);
    let totalAccuracy = 0;
    
    for (let i = 0; i < folds; i++) {
      const testStart = i * foldSize;
      const testEnd = i === folds - 1 ? examples.length : testStart + foldSize;
      
      const testSet = examples.slice(testStart, testEnd);
      let correct = 0;
      
      testSet.forEach(example => {
        const prediction = this.predictWithNaiveBayes(model, example.text || example.content);
        if (prediction.category === (example.category || example.label)) {
          correct++;
        }
      });
      
      totalAccuracy += correct / testSet.length;
    }
    
    return totalAccuracy / folds;
  }

  async evaluateEmbeddingModel(model, examples) {
    let correct = 0;
    
    examples.forEach(example => {
      const prediction = this.predictWithTFIDF(model, example.text || example.content);
      if (prediction.category === (example.category || example.label)) {
        correct++;
      }
    });
    
    return examples.length > 0 ? correct / examples.length : 0;
  }

  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    
    return normA && normB ? dotProduct / (normA * normB) : 0;
  }

  tokenize(text) {
    return text.match(/[\u4e00-\u9fa5]+|[a-zA-Z]+/g) || [];
  }

  validateTrainingData(examples) {
    if (!Array.isArray(examples) || examples.length === 0) {
      throw new ValidationError('Training examples must be a non-empty array');
    }
    
    examples.forEach((example, index) => {
      if (!example.text && !example.content) {
        throw new ValidationError(`Example ${index} missing text/content`);
      }
      if (!example.category && !example.label) {
        throw new ValidationError(`Example ${index} missing category/label`);
      }
    });
    
    // 检查类别平衡
    const categories = {};
    examples.forEach(example => {
      const category = example.category || example.label;
      categories[category] = (categories[category] || 0) + 1;
    });
    
    const categoryCount = Object.keys(categories).length;
    if (categoryCount < 2) {
      throw new ValidationError('At least 2 categories required for training');
    }
    
    const minSamples = Math.min(...Object.values(categories));
    if (minSamples < 3) {
      throw new ValidationError('Each category must have at least 3 examples');
    }
  }

  async getNextModelVersion(tenantId, modelType) {
    try {
      const query = `
        SELECT MAX(model_version) as max_version 
        FROM tenant_models 
        WHERE tenant_id = $1 AND model_type = $2
      `;
      
      const result = await this.dbManager.query(query, [tenantId, modelType]);
      const maxVersion = result.rows[0]?.max_version || 0;
      
      return maxVersion + 1;
    } catch (error) {
      logger.warn('Failed to get next model version, using default', { error: error.message });
      return 1;
    }
  }

  async deactivateOldModels(tenantId, modelType, currentVersion) {
    try {
      const query = `
        UPDATE tenant_models 
        SET is_active = false, updated_at = NOW()
        WHERE tenant_id = $1 AND model_type = $2 AND model_version < $3
      `;
      
      await this.dbManager.query(query, [tenantId, modelType, currentVersion]);
    } catch (error) {
      logger.warn('Failed to deactivate old models', { error: error.message });
    }
  }

  async calculateChecksum(filePath) {
    try {
      const data = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(data).digest('hex');
    } catch (error) {
      logger.warn('Failed to calculate checksum', { error: error.message });
      return '';
    }
  }

  async exportTenantModel(tenantId, modelType, format = 'json') {
    const model = await this.getTenantModel(tenantId, modelType);
    if (!model) {
      throw new ModelTrainingError('Tenant model not found', 'tenant-manager', 404);
    }
    
    const modelData = JSON.parse(await fs.readFile(model.path, 'utf8'));
    
    const exportData = {
      tenantId,
      modelType,
      version: model.version,
      model: modelData,
      metadata: {
        config: model.config,
        metrics: model.metrics,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt
      },
      exportedAt: new Date().toISOString()
    };
    
    return exportData;
  }

  async importTenantModel(tenantId, modelType, importData) {
    try {
      // 验证导入数据
      if (!importData.model || !importData.metadata) {
        throw new ValidationError('Invalid import data format');
      }
      
      // 保存模型
      const savedModel = await this.saveTenantModel(
        tenantId, 
        modelType, 
        importData.model, 
        importData.metadata
      );
      
      logger.info('Tenant model imported', { 
        tenantId, 
        modelType, 
        originalTenant: importData.tenantId 
      });
      
      return savedModel;
    } catch (error) {
      throw new ModelTrainingError(`Failed to import model: ${error.message}`, 'tenant-manager', 500);
    }
  }

  async deleteTenantModel(tenantId, modelType, version = null) {
    try {
      let query, params;
      
      if (version) {
        query = `
          UPDATE tenant_models 
          SET is_active = false, deleted_at = NOW()
          WHERE tenant_id = $1 AND model_type = $2 AND model_version = $3
        `;
        params = [tenantId, modelType, version];
      } else {
        query = `
          UPDATE tenant_models 
          SET is_active = false, deleted_at = NOW()
          WHERE tenant_id = $1 AND model_type = $2
        `;
        params = [tenantId, modelType];
      }
      
      await this.dbManager.query(query, params);
      
      // 清除缓存
      const key = `${tenantId}:${modelType}`;
      this.tenantModels.delete(key);
      this.tenantTrainingData.delete(key);
      
      logger.info('Tenant model deleted', { tenantId, modelType, version });
    } catch (error) {
      throw new ModelTrainingError(`Failed to delete model: ${error.message}`, 'tenant-manager', 500);
    }
  }

  async listTenantModels(tenantId) {
    try {
      const query = `
        SELECT model_type, model_version, model_metrics, created_at, updated_at
        FROM tenant_models 
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY model_type, model_version DESC
      `;
      
      const result = await this.dbManager.query(query, [tenantId]);
      
      return result.rows.map(row => ({
        modelType: row.model_type,
        version: row.model_version,
        metrics: JSON.parse(row.model_metrics || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      throw new ModelTrainingError(`Failed to list models: ${error.message}`, 'tenant-manager', 500);
    }
  }

  async healthCheck() {
    return {
      status: 'healthy',
      initialized: this.isInitialized,
      cachedModels: this.tenantModels.size,
      cachedTrainingData: this.tenantTrainingData.size,
      modelsPath: this.modelsPath
    };
  }

  async shutdown() {
    this.tenantModels.clear();
    this.tenantTrainingData.clear();
    this.isInitialized = false;
    logger.info('Tenant model manager shut down');
  }
}

module.exports = TenantModelManager; 