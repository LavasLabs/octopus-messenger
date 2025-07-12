const config = require('../../../../config/config');

const aiServiceConfig = {
  // AI服务基础配置
  baseURL: `http://localhost:${config.services.aiService.port}`,
  timeout: 30000, // 30秒超时
  retries: 3, // 重试次数
  retryDelay: 1000, // 重试延迟(毫秒)

  // 功能开关
  features: {
    smartClassification: true, // 启用智能分类
    customModels: true, // 启用自定义模型
    batchProcessing: true, // 启用批量处理
    fallbackMode: true, // 启用回退模式
    urgentDetection: true, // 启用紧急消息检测
    rateLimiting: true, // 启用频率限制
    caching: true // 启用结果缓存
  },

  // 分类配置
  classification: {
    // 默认分类器优先级
    classifierPriority: ['tenant-custom', 'openai', 'claude', 'rule-engine'],
    
    // 置信度阈值
    confidenceThreshold: {
      high: 0.8, // 高置信度
      medium: 0.6, // 中等置信度
      low: 0.3 // 低置信度
    },

    // 回退策略
    fallbackStrategy: {
      enabled: true,
      useGeneralModel: true, // 使用通用模型作为回退
      defaultCategory: 'unclassified' // 默认分类
    },

    // 缓存配置
    cache: {
      enabled: true,
      ttl: 300, // 5分钟缓存
      maxSize: 1000 // 最大缓存条数
    }
  },

  // 租户模式配置
  tenantMode: {
    // 默认模式
    defaultMode: 'normal',
    
    // 模式切换限制
    switchLimits: {
      maxSwitchesPerHour: 5, // 每小时最多切换5次
      cooldownPeriod: 300 // 5分钟冷却期
    },

    // 训练模式配置
    training: {
      minExamplesForTraining: 10, // 最少训练样本
      autoTrainingThreshold: 50, // 自动训练阈值
      maxTrainingExamples: 10000, // 最大训练样本
      dataRetentionDays: 90 // 数据保留天数
    }
  },

  // 消息处理配置
  messageProcessing: {
    // 批量处理限制
    batchLimits: {
      maxBatchSize: 50, // 最大批量大小
      batchTimeout: 30000 // 批量处理超时
    },

    // 频率限制
    rateLimit: {
      enabled: true,
      maxMessagesPerMinute: 60, // 每分钟最多60条消息
      maxMessagesPerHour: 1000, // 每小时最多1000条消息
      burstLimit: 10 // 突发限制
    },

    // 紧急消息检测
    urgentDetection: {
      enabled: true,
      keywords: [
        'urgent', 'emergency', 'help', 'error', 'bug', 'critical', 'issue',
        '紧急', '急', '帮助', '错误', '故障', '问题', '不能', '无法'
      ],
      priorityBoost: 1.5 // 优先级提升倍数
    },

    // 重试配置
    retry: {
      maxRetries: 3,
      retryDelay: 1000,
      exponentialBackoff: true
    }
  },

  // 性能监控配置
  monitoring: {
    enabled: true,
    
    // 指标收集
    metrics: {
      classificationTime: true, // 分类时间
      accuracyTracking: true, // 准确率跟踪
      throughput: true, // 吞吐量
      errorRate: true // 错误率
    },

    // 告警配置
    alerts: {
      enabled: true,
      thresholds: {
        responseTime: 5000, // 响应时间告警阈值(毫秒)
        errorRate: 0.1, // 错误率告警阈值(10%)
        queueSize: 100 // 队列大小告警阈值
      }
    },

    // 日志配置
    logging: {
      level: 'info',
      includeRequestBody: false, // 是否包含请求体
      includeResponseBody: false, // 是否包含响应体
      maxLogSize: 1000 // 最大日志字符数
    }
  },

  // API端点配置
  endpoints: {
    // 智能分类
    smartClassify: '/api/smart-classify/message',
    batchClassify: '/api/smart-classify/batch',
    previewClassify: '/api/smart-classify/preview',
    
    // 模式管理
    getCurrentMode: '/api/mode/current',
    switchMode: '/api/mode/switch',
    getModeInfo: '/api/mode/info',
    getModeRecommendation: '/api/mode/recommend',
    
    // 租户模型
    trainModel: '/api/tenant/models/train',
    predictWithModel: '/api/tenant/models/{modelType}/predict',
    getTenantModels: '/api/tenant/models',
    getTenantStats: '/api/tenant/stats',
    
    // 统计和分析
    getClassificationStats: '/api/smart-classify/stats',
    getAnalytics: '/api/analytics/trends',
    
    // 健康检查
    healthCheck: '/health'
  },

  // 错误处理配置
  errorHandling: {
    // 错误重试策略
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'],
    
    // 错误码映射
    errorMapping: {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED', 
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
      502: 'SERVICE_UNAVAILABLE',
      503: 'SERVICE_UNAVAILABLE',
      504: 'TIMEOUT'
    },

    // 默认错误响应
    defaultError: {
      success: false,
      error: 'AI service temporarily unavailable',
      message: 'Please try again later'
    }
  },

  // 开发和调试配置
  development: {
    mockResponses: false, // 是否使用模拟响应
    logAllRequests: false, // 是否记录所有请求
    skipAuthentication: false, // 是否跳过认证
    enableDebugHeaders: true // 是否启用调试头
  }
};

// 根据环境调整配置
if (process.env.NODE_ENV === 'development') {
  aiServiceConfig.development.logAllRequests = true;
  aiServiceConfig.monitoring.logging.level = 'debug';
  aiServiceConfig.monitoring.logging.includeRequestBody = true;
}

if (process.env.NODE_ENV === 'production') {
  aiServiceConfig.timeout = 10000; // 生产环境缩短超时时间
  aiServiceConfig.retries = 5; // 增加重试次数
  aiServiceConfig.monitoring.alerts.enabled = true;
}

// 验证配置
function validateConfig() {
  const errors = [];

  // 检查必需的配置
  if (!aiServiceConfig.baseURL) {
    errors.push('AI service base URL is required');
  }

  if (aiServiceConfig.timeout < 1000) {
    errors.push('Timeout should be at least 1000ms');
  }

  if (aiServiceConfig.classification.confidenceThreshold.high < 
      aiServiceConfig.classification.confidenceThreshold.medium) {
    errors.push('High confidence threshold should be greater than medium');
  }

  if (errors.length > 0) {
    throw new Error(`AI service configuration errors: ${errors.join(', ')}`);
  }
}

// 获取特定功能的配置
function getFeatureConfig(featureName) {
  const featureConfigs = {
    smartClassification: {
      enabled: aiServiceConfig.features.smartClassification,
      endpoint: aiServiceConfig.endpoints.smartClassify,
      timeout: aiServiceConfig.timeout,
      retries: aiServiceConfig.retries
    },
    
    batchProcessing: {
      enabled: aiServiceConfig.features.batchProcessing,
      endpoint: aiServiceConfig.endpoints.batchClassify,
      maxBatchSize: aiServiceConfig.messageProcessing.batchLimits.maxBatchSize,
      timeout: aiServiceConfig.messageProcessing.batchLimits.batchTimeout
    },
    
    tenantMode: {
      enabled: aiServiceConfig.features.customModels,
      defaultMode: aiServiceConfig.tenantMode.defaultMode,
      endpoints: {
        getCurrentMode: aiServiceConfig.endpoints.getCurrentMode,
        switchMode: aiServiceConfig.endpoints.switchMode
      }
    }
  };

  return featureConfigs[featureName] || null;
}

// 获取错误处理配置
function getErrorConfig(errorCode) {
  const errorType = aiServiceConfig.errorHandling.errorMapping[errorCode];
  if (errorType) {
    return {
      type: errorType,
      retryable: aiServiceConfig.errorHandling.retryableErrors.includes(errorType)
    };
  }
  
  return {
    type: 'UNKNOWN_ERROR',
    retryable: false
  };
}

// 检查功能是否启用
function isFeatureEnabled(featureName) {
  return aiServiceConfig.features[featureName] === true;
}

// 获取环境特定配置
function getEnvironmentConfig() {
  return {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    logLevel: aiServiceConfig.monitoring.logging.level,
    debugMode: aiServiceConfig.development.enableDebugHeaders
  };
}

// 初始化时验证配置
validateConfig();

module.exports = {
  aiServiceConfig,
  getFeatureConfig,
  getErrorConfig,
  isFeatureEnabled,
  getEnvironmentConfig,
  validateConfig
}; 