const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
  // 环境配置
  env: process.env.NODE_ENV || 'development',
  
  // 数据库配置
  database: {
    // PostgreSQL 配置
    postgres: {
      host: process.env.PG_HOST || 'localhost',
      port: process.env.PG_PORT || 5432,
      database: process.env.PG_DATABASE || 'octopus_messenger',
      username: process.env.PG_USERNAME || 'postgres',
      password: process.env.PG_PASSWORD || 'password',
      schema: process.env.PG_SCHEMA || 'public',
      ssl: process.env.PG_SSL === 'true' || false,
      pool: {
        min: parseInt(process.env.PG_POOL_MIN) || 2,
        max: parseInt(process.env.PG_POOL_MAX) || 10,
        idle: parseInt(process.env.PG_POOL_IDLE) || 10000
      }
    },
    
    // Redis 配置
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || null,
      db: parseInt(process.env.REDIS_DB) || 0,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'octopus:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableOfflineQueue: false
    },
    
    // MongoDB 配置
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/octopus_messenger',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      }
    }
  },

  // 对话管理配置
  conversation: {
    maxContextLength: parseInt(process.env.CONVERSATION_MAX_CONTEXT_LENGTH) || 4000,
    summaryThreshold: parseInt(process.env.CONVERSATION_SUMMARY_THRESHOLD) || 10,
    maxHistoryMessages: parseInt(process.env.CONVERSATION_MAX_HISTORY_MESSAGES) || 20
  },

  // 翻译服务配置
  translation: {
    enabled: process.env.TRANSLATION_ENABLED === 'true',
    defaultProvider: process.env.TRANSLATION_DEFAULT_PROVIDER || 'openai',
    
    // OpenAI翻译配置
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.TRANSLATION_OPENAI_MODEL || 'gpt-3.5-turbo'
    },
    
    // DeepL配置
    deepl: {
      apiKey: process.env.DEEPL_API_KEY
    },
    
    // Google翻译配置
    google: {
      apiKey: process.env.GOOGLE_TRANSLATE_API_KEY
    },
    
    // 语言检测配置
    languageDetection: {
      enabled: process.env.LANGUAGE_DETECTION_ENABLED === 'true',
      provider: process.env.LANGUAGE_DETECTION_PROVIDER || 'pattern',
      apiKey: process.env.LANGUAGE_DETECTION_API_KEY
    }
  },
  
  // 微服务配置
  services: {
    gateway: {
      port: process.env.GATEWAY_PORT || 3000,
      host: process.env.GATEWAY_HOST || '0.0.0.0'
    },
    messageProcessor: {
      port: process.env.MESSAGE_PROCESSOR_PORT || 3001,
      host: process.env.MESSAGE_PROCESSOR_HOST || '0.0.0.0',
      enableAI: process.env.ENABLE_AI_PROCESSING !== 'false',
      enableTranslation: process.env.ENABLE_TRANSLATION === 'true',
      batchSize: parseInt(process.env.BATCH_SIZE) || 10,
      processingTimeout: parseInt(process.env.PROCESSING_TIMEOUT) || 30000
    },
    aiService: {
      port: process.env.AI_SERVICE_PORT || 3002,
      host: process.env.AI_SERVICE_HOST || '0.0.0.0',
      baseURL: process.env.AI_SERVICE_URL || 'http://localhost:3002',
      timeout: 30000,
      retries: 3
    },
    taskService: {
      port: process.env.TASK_SERVICE_PORT || 3003,
      host: process.env.TASK_SERVICE_HOST || '0.0.0.0'
    },
    botManager: {
      port: process.env.BOT_MANAGER_PORT || 3004,
      host: process.env.BOT_MANAGER_HOST || '0.0.0.0'
    },
    adminPanel: {
      port: process.env.ADMIN_PANEL_PORT || 3005,
      host: process.env.ADMIN_PANEL_HOST || '0.0.0.0'
    }
  },
  
  // 队列配置
  queue: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB || 0
    },
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY) || 5,
    attempts: parseInt(process.env.QUEUE_ATTEMPTS) || 3,
    removeOnComplete: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE) || 100,
    removeOnFail: parseInt(process.env.QUEUE_REMOVE_ON_FAIL) || 50
  },
  
  // 认证配置
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    },
    bcrypt: {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12
    },
    session: {
      secret: process.env.SESSION_SECRET || 'your-session-secret',
      timeout: parseInt(process.env.SESSION_TIMEOUT) || 3600000 // 1 hour
    }
  },
  
  // 安全配置
  security: {
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:3005'],
    trustedProxies: process.env.TRUSTED_PROXIES ? process.env.TRUSTED_PROXIES.split(',') : ['127.0.0.1'],
    encryptionKey: process.env.ENCRYPTION_KEY || 'your-encryption-key-32-characters'
  },
  
  // 限流配置
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
    skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true'
  },
  
  // AI服务配置
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY,
      model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
      maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 1000,
      temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.7
    },
    enabled: {
      openai: process.env.AI_OPENAI_ENABLED === 'true',
      claude: process.env.AI_CLAUDE_ENABLED === 'true'
    }
  },
  
  // 消息平台配置
  platforms: {
    telegram: {
      enabled: process.env.TELEGRAM_ENABLED === 'true',
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET
    },
    discord: {
      enabled: process.env.DISCORD_ENABLED === 'true',
      botToken: process.env.DISCORD_BOT_TOKEN,
      applicationId: process.env.DISCORD_APPLICATION_ID,
      publicKey: process.env.DISCORD_PUBLIC_KEY,
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      guildId: process.env.DISCORD_GUILD_ID,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL
    },
    slack: {
      enabled: process.env.SLACK_ENABLED === 'true',
      botToken: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      clientId: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET,
      webhookUrl: process.env.SLACK_WEBHOOK_URL
    },
    whatsapp: {
      enabled: process.env.WHATSAPP_ENABLED === 'true',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      webhookUrl: process.env.WHATSAPP_WEBHOOK_URL
    },
    line: {
      enabled: process.env.LINE_ENABLED === 'true',
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.LINE_CHANNEL_SECRET,
      webhookUrl: process.env.LINE_WEBHOOK_URL
    },
    wework: {
      enabled: process.env.WEWORK_ENABLED === 'true',
      corpId: process.env.WEWORK_CORP_ID,
      agentId: process.env.WEWORK_AGENT_ID,
      secret: process.env.WEWORK_SECRET,
      webhookUrl: process.env.WEWORK_WEBHOOK_URL,
      webhookToken: process.env.WEWORK_WEBHOOK_TOKEN
    }
  },
  
  // CRM系统配置
  crm: {
    salesforce: {
      enabled: process.env.SALESFORCE_ENABLED === 'true',
      clientId: process.env.SALESFORCE_CLIENT_ID,
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
      username: process.env.SALESFORCE_USERNAME,
      password: process.env.SALESFORCE_PASSWORD,
      securityToken: process.env.SALESFORCE_SECURITY_TOKEN,
      instanceUrl: process.env.SALESFORCE_INSTANCE_URL || 'https://login.salesforce.com'
    },
    hubspot: {
      enabled: process.env.HUBSPOT_ENABLED === 'true',
      apiKey: process.env.HUBSPOT_API_KEY,
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
      portalId: process.env.HUBSPOT_PORTAL_ID
    },
    lark: {
      enabled: process.env.LARK_ENABLED === 'true',
      appId: process.env.LARK_APP_ID,
      appSecret: process.env.LARK_APP_SECRET,
      baseUrl: process.env.LARK_BASE_URL || 'https://open.feishu.cn'
    },
    dingtalk: {
      enabled: process.env.DINGTALK_ENABLED === 'true',
      appKey: process.env.DINGTALK_APP_KEY,
      appSecret: process.env.DINGTALK_APP_SECRET,
      baseUrl: process.env.DINGTALK_BASE_URL || 'https://oapi.dingtalk.com'
    },
    notion: {
      enabled: process.env.NOTION_ENABLED === 'true',
      token: process.env.NOTION_TOKEN,
      databaseId: process.env.NOTION_DATABASE_ID
    },
    jira: {
      enabled: process.env.JIRA_ENABLED === 'true',
      host: process.env.JIRA_HOST,
      username: process.env.JIRA_USERNAME,
      apiToken: process.env.JIRA_API_TOKEN,
      projectKey: process.env.JIRA_PROJECT_KEY
    }
  },
  
  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined',
    file: {
      enabled: process.env.LOG_FILE_ENABLED === 'true',
      filename: process.env.LOG_FILE_NAME || 'logs/app.log',
      maxSize: process.env.LOG_FILE_MAX_SIZE || '10m',
      maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES) || 5
    },
    console: {
      enabled: process.env.LOG_CONSOLE_ENABLED !== 'false',
      colorize: process.env.LOG_CONSOLE_COLORIZE !== 'false'
    }
  },
  
  // 队列配置
  queue: {
    redis: {
      host: process.env.QUEUE_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
      port: process.env.QUEUE_REDIS_PORT || process.env.REDIS_PORT || 6379,
      password: process.env.QUEUE_REDIS_PASSWORD || process.env.REDIS_PASSWORD || null,
      db: parseInt(process.env.QUEUE_REDIS_DB) || 1
    },
    defaultJobOptions: {
      removeOnComplete: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE) || 10,
      removeOnFail: parseInt(process.env.QUEUE_REMOVE_ON_FAIL) || 5,
      attempts: parseInt(process.env.QUEUE_ATTEMPTS) || 3,
      backoff: {
        type: 'exponential',
        delay: parseInt(process.env.QUEUE_BACKOFF_DELAY) || 2000
      }
    }
  },
  
  // 文件存储配置
  storage: {
    type: process.env.STORAGE_TYPE || 'local', // local, s3, gcs
    local: {
      uploadDir: process.env.STORAGE_LOCAL_DIR || './uploads',
      maxFileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
    },
    s3: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.AWS_S3_BUCKET
    }
  },
  
  // 监控配置
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    prometheus: {
      enabled: process.env.PROMETHEUS_ENABLED === 'true',
      port: process.env.PROMETHEUS_PORT || 9090,
      path: process.env.PROMETHEUS_PATH || '/metrics'
    },
    healthCheck: {
      enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
      path: process.env.HEALTH_CHECK_PATH || '/health',
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000
    }
  },
  
  // 缓存配置
  cache: {
    ttl: parseInt(process.env.CACHE_TTL) || 3600, // 1 hour
    max: parseInt(process.env.CACHE_MAX) || 1000,
    updateAgeOnGet: process.env.CACHE_UPDATE_AGE_ON_GET === 'true'
  },
  
  // 邮件配置
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    },
    from: process.env.EMAIL_FROM || 'noreply@octopus-messenger.com'
  },
  
  // 多租户配置
  multiTenant: {
    enabled: process.env.MULTI_TENANT_ENABLED === 'true',
    defaultTenant: process.env.DEFAULT_TENANT || 'default',
    tenantHeader: process.env.TENANT_HEADER || 'X-Tenant-ID'
  }
};

// 验证必需的配置
function validateConfig() {
  const requiredEnvVars = [];
  
  // 检查数据库配置
  if (!config.database.postgres.password && config.env === 'production') {
    requiredEnvVars.push('PG_PASSWORD');
  }
  
  // 检查JWT密钥
  if (!process.env.JWT_SECRET && config.env === 'production') {
    requiredEnvVars.push('JWT_SECRET');
  }
  
  if (requiredEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${requiredEnvVars.join(', ')}`);
  }
}

// 开发环境不进行严格验证
if (config.env === 'production') {
  validateConfig();
}

module.exports = config; 