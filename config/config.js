const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config();

const config = {
  // 基础配置
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3000,

  // 数据库配置
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'octopus_messenger',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000,
  },

  // Redis配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB) || 0,
    retryDelayOnFailover: 100,
    enableOfflineQueue: false,
  },

  // MongoDB配置
  mongodb: {
    url: process.env.MONGODB_URL || 'mongodb://localhost:27017/octopus_messenger',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
  },

  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256',
  },

  // 服务端口配置
  services: {
    gateway: {
      port: parseInt(process.env.GATEWAY_PORT) || 3000,
      host: process.env.GATEWAY_HOST || '0.0.0.0',
    },
    messageProcessor: {
      port: parseInt(process.env.MESSAGE_PROCESSOR_PORT) || 3001,
      host: process.env.MESSAGE_PROCESSOR_HOST || '0.0.0.0',
    },
    aiService: {
      port: parseInt(process.env.AI_SERVICE_PORT) || 3002,
      host: process.env.AI_SERVICE_HOST || '0.0.0.0',
    },
    taskService: {
      port: parseInt(process.env.TASK_SERVICE_PORT) || 3003,
      host: process.env.TASK_SERVICE_HOST || '0.0.0.0',
    },
    botManager: {
      port: parseInt(process.env.BOT_MANAGER_PORT) || 3004,
      host: process.env.BOT_MANAGER_HOST || '0.0.0.0',
    },
    adminPanel: {
      port: parseInt(process.env.ADMIN_PANEL_PORT) || 3005,
      host: process.env.ADMIN_PANEL_HOST || '0.0.0.0',
    },
  },

  // 第三方服务配置
  integrations: {
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || '',
      apiUrl: 'https://api.telegram.org/bot',
    },
    whatsapp: {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
      apiUrl: 'https://graph.facebook.com/v17.0',
    },
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN || '',
      signingSecret: process.env.SLACK_SIGNING_SECRET || '',
      appToken: process.env.SLACK_APP_TOKEN || '',
      socketMode: process.env.SLACK_SOCKET_MODE === 'true',
    },
    discord: {
      botToken: process.env.DISCORD_BOT_TOKEN || '',
      clientId: process.env.DISCORD_CLIENT_ID || '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
      publicKey: process.env.DISCORD_PUBLIC_KEY || '',
      guildId: process.env.DISCORD_GUILD_ID || '',
      webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
      apiUrl: 'https://discord.com/api/v10',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY || '',
      model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
      maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 1000,
    },
    lark: {
      appId: process.env.LARK_APP_ID || '',
      appSecret: process.env.LARK_APP_SECRET || '',
      webhookUrl: process.env.LARK_WEBHOOK_URL || '',
      apiUrl: 'https://open.larksuite.com/open-apis',
    },
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
  },

  // 限流配置
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },

  // 队列配置
  queue: {
    name: process.env.QUEUE_NAME || 'message-processing',
    redisUrl: process.env.QUEUE_REDIS_URL || 'redis://localhost:6379',
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  },

  // 缓存配置
  cache: {
    ttl: parseInt(process.env.CACHE_TTL) || 3600,
    prefix: process.env.CACHE_PREFIX || 'octopus:',
    maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 100,
  },

  // 文件上传配置
  upload: {
    maxSize: process.env.UPLOAD_MAX_SIZE || '10MB',
    allowedTypes: (process.env.UPLOAD_ALLOWED_TYPES || 'image/*,application/pdf,text/*').split(','),
    destination: process.env.UPLOAD_DESTINATION || 'uploads/',
  },

  // 安全配置
  security: {
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000'],
    helmetEnabled: process.env.HELMET_ENABLED !== 'false',
    csrfEnabled: process.env.CSRF_ENABLED === 'true',
  },

  // 监控配置
  monitoring: {
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT) || 9090,
    grafanaPort: parseInt(process.env.GRAFANA_PORT) || 3001,
    healthCheckPath: process.env.HEALTH_CHECK_PATH || '/health',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
  },

  // 邮件配置
  email: {
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || '',
      },
    },
    from: process.env.SMTP_FROM || 'noreply@your-domain.com',
  },
};

module.exports = config; 