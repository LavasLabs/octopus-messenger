# 🌟 Octopus Gateway Service

Gateway是Octopus Messenger系统的核心入口服务，提供统一的API接口、微服务路由和智能消息处理能力。

## 🚀 核心特性

### 🔥 最新功能 - AI智能分类系统
- **🧠 双模式AI分类**：支持训练模式和隐私模式
- **⚡ 实时智能分类**：消息接收时立即进行AI分类
- **🎯 租户专属模型**：支持训练个性化分类模型
- **🔄 智能回退机制**：AI服务故障时自动降级
- **📊 批量处理**：高效的批量消息分类
- **🚨 紧急消息检测**：自动识别和优先处理紧急消息

### 🌐 多平台支持
- **Telegram Bot**：完整的消息处理和交互功能
- **Discord Bot**：频道消息、私信、命令处理
- **WhatsApp Business**：商业消息、模板消息、媒体处理
- **Slack Bot**：工作区消息、斜杠命令、交互组件
- **Line Bot**：聊天消息、Rich Menu、Flex Message
- **企业微信**：企业应用消息、通讯录管理

### 🛡️ 企业级功能
- **API Gateway**：统一的API入口和路由
- **身份认证**：JWT和API Key双重认证
- **频率限制**：防止API滥用和攻击
- **负载均衡**：微服务之间的智能负载均衡
- **监控告警**：完整的性能和错误监控
- **文档系统**：自动生成的API文档

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                          Gateway Service                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │ Auth        │  │ Rate        │  │ Validation  │  │ Logging │ │
│  │ Middleware  │  │ Limiting    │  │ Middleware  │  │ System  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │ Webhook     │  │ AI Routes   │  │ Bot         │  │ User    │ │
│  │ Handlers    │  │ & Smart     │  │ Management  │  │ Auth    │ │
│  │             │  │ Classifier  │  │             │  │         │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │ Message     │  │ AI Service  │  │ Microservice│  │ Error   │ │
│  │ Processor   │  │ Client      │  │ Proxy       │  │ Handler │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Bot Platforms  │  │   AI Service    │  │  Microservices  │
│                 │  │                 │  │                 │
│ • Telegram      │  │ • Smart         │  │ • Message       │
│ • Discord       │  │   Classifier    │  │   Processor     │
│ • WhatsApp      │  │ • Tenant        │  │ • Task Service  │
│ • Slack         │  │   Models        │  │ • Bot Manager   │
│ • Line          │  │ • Mode          │  │ • Admin Panel   │
│ • WeWork        │  │   Manager       │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## 📦 快速开始

### 环境要求

```bash
Node.js >= 18.0.0
npm >= 8.0.0
PostgreSQL >= 13.0
Redis >= 6.0 (可选，用于缓存)
```

### 安装依赖

```bash
cd services/gateway
npm install
```

### 环境配置

创建 `.env` 文件：

```bash
# 服务配置
PORT=3000
NODE_ENV=development
HOST=0.0.0.0

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=octopus_messenger
DB_USER=octopus_user
DB_PASSWORD=your_password
DB_SSL=false

# JWT配置
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# AI服务配置
AI_SERVICE_URL=http://localhost:3002
AI_SERVICE_TIMEOUT=30000
AI_CLASSIFICATION_ENABLED=true
AI_BATCH_PROCESSING_ENABLED=true

# 消息处理配置
MESSAGE_RATE_LIMIT_ENABLED=true
MESSAGE_RATE_LIMIT_PER_MINUTE=60
URGENT_MESSAGE_DETECTION=true

# 缓存配置
REDIS_URL=redis://localhost:6379
AI_RESULT_CACHE_ENABLED=true
AI_RESULT_CACHE_TTL=300

# 监控配置
MONITORING_ENABLED=true
LOG_LEVEL=info

# 安全配置
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 启动服务

```bash
# 开发环境
npm run dev

# 生产环境
npm start

# 构建TypeScript (如果需要)
npm run build
```

## 🔧 配置详解

### 服务配置

Gateway支持多种配置方式：

#### 1. 环境变量配置

```bash
# 基础服务设置
export PORT=3000
export NODE_ENV=production
export HOST=0.0.0.0

# 微服务端口配置
export AI_SERVICE_PORT=3002
export MESSAGE_PROCESSOR_PORT=3003
export BOT_MANAGER_PORT=3004
export TASK_SERVICE_PORT=3005
```

#### 2. 配置文件

```javascript
// config/config.js
module.exports = {
  services: {
    gateway: {
      port: process.env.PORT || 3000,
      host: process.env.HOST || '0.0.0.0'
    },
    aiService: {
      port: process.env.AI_SERVICE_PORT || 3002,
      timeout: process.env.AI_SERVICE_TIMEOUT || 30000
    }
  },
  
  ai: {
    classification: {
      enabled: process.env.AI_CLASSIFICATION_ENABLED === 'true',
      batchProcessing: process.env.AI_BATCH_PROCESSING_ENABLED === 'true'
    }
  }
};
```

#### 3. AI服务配置

```javascript
// src/config/aiService.js
const aiServiceConfig = {
  baseURL: 'http://localhost:3002',
  timeout: 30000,
  features: {
    smartClassification: true,
    customModels: true,
    batchProcessing: true,
    fallbackMode: true
  }
};
```

## 🚀 API接口文档

### 🔐 认证接口

#### 用户登录
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your_password"
}

# 响应
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "tenantId": "tenant_001"
  }
}
```

#### 用户注册
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your_password",
  "name": "User Name",
  "tenantId": "tenant_001"
}
```

### 🧠 AI智能分类接口

#### 单消息智能分类
```bash
POST /api/ai/classify
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": {
    "content": "我需要技术支持，网站无法访问",
    "platform": "discord",
    "userId": "user123"
  }
}

# 响应
{
  "success": true,
  "classification": {
    "category": "technical_support",
    "confidence": 0.89,
    "mode": "training",
    "usedCustomModel": true,
    "classifier": "tenant-rule-engine"
  },
  "processingTime": 156,
  "explanation": {
    "strategy": "使用您的专属AI模型进行分类",
    "keywords": ["技术支持", "网站", "无法访问"],
    "reasoning": "基于历史数据训练的模型识别为技术支持类问题"
  }
}
```

#### 批量消息分类
```bash
POST /api/ai/classify/batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "messages": [
    {
      "content": "账户登录问题",
      "platform": "slack",
      "userId": "user123"
    },
    {
      "content": "产品价格咨询",
      "platform": "telegram",
      "userId": "user456"
    }
  ]
}

# 响应
{
  "success": true,
  "results": [
    {
      "success": true,
      "classification": {
        "category": "account_support",
        "confidence": 0.92
      }
    },
    {
      "success": true,
      "classification": {
        "category": "sales_inquiry",
        "confidence": 0.85
      }
    }
  ],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "processingTime": 234,
    "averageTimePerMessage": 117
  }
}
```

### 🔄 AI模式管理接口

#### 获取当前AI模式
```bash
GET /api/ai/mode
Authorization: Bearer <token>

# 响应
{
  "success": true,
  "mode": {
    "currentMode": "training",
    "config": {
      "dataStorage": true,
      "customModels": true,
      "personalizedService": true
    },
    "switchedAt": "2024-01-15T10:30:00Z",
    "switchedBy": "user123"
  }
}
```

#### 切换AI模式
```bash
POST /api/ai/mode
Authorization: Bearer <token>
Content-Type: application/json

{
  "mode": "training",
  "reason": "希望获得个性化AI服务"
}

# 响应
{
  "success": true,
  "message": "AI模式已成功切换",
  "previousMode": "normal",
  "currentMode": "training",
  "effectiveAt": "2024-01-15T10:35:00Z"
}
```

#### 获取模式推荐
```bash
GET /api/ai/mode/recommend
Authorization: Bearer <token>

# 响应
{
  "success": true,
  "recommendation": {
    "recommendedMode": "training",
    "reason": "基于您的使用情况，训练模式可以提供更好的分类准确性",
    "benefits": [
      "个性化AI分类",
      "更高的准确率",
      "专属模型训练"
    ],
    "considerations": [
      "会存储聊天数据用于训练",
      "需要付费订阅"
    ]
  }
}
```

### 🤖 租户模型管理接口

#### 训练专属模型
```bash
POST /api/ai/models/train
Authorization: Bearer <token>
Content-Type: application/json

{
  "modelType": "rule-engine",
  "examples": [
    {
      "text": "网站打不开了",
      "category": "technical_support"
    },
    {
      "text": "想了解产品价格",
      "category": "sales_inquiry"
    },
    {
      "text": "账户被锁定",
      "category": "account_support"
    }
  ]
}

# 响应
{
  "success": true,
  "training": {
    "modelId": "model_123",
    "modelType": "rule-engine",
    "status": "training",
    "exampleCount": 3,
    "estimatedTime": "2-3分钟",
    "createdAt": "2024-01-15T10:40:00Z"
  }
}
```

#### 查看模型列表
```bash
GET /api/ai/models
Authorization: Bearer <token>

# 响应
{
  "success": true,
  "models": [
    {
      "id": "model_123",
      "type": "rule-engine",
      "status": "trained",
      "accuracy": 0.89,
      "exampleCount": 150,
      "trainingTime": "2024-01-15T10:42:00Z",
      "lastUsed": "2024-01-15T11:30:00Z"
    }
  ]
}
```

### 📊 统计分析接口

#### 获取分类统计
```bash
GET /api/ai/stats?timeRange=24h
Authorization: Bearer <token>

# 响应
{
  "success": true,
  "stats": {
    "totalMessages": 1250,
    "classifiedMessages": 1200,
    "averageConfidence": 0.85,
    "topCategories": [
      {
        "category": "support",
        "count": 450,
        "percentage": 37.5
      },
      {
        "category": "sales",
        "count": 300,
        "percentage": 25.0
      }
    ],
    "modelUsage": {
      "customModel": 800,
      "generalModel": 400
    }
  }
}
```

### 🤖 Bot管理接口

#### 获取Bot列表
```bash
GET /api/bots
Authorization: Bearer <token>

# 响应
{
  "success": true,
  "bots": [
    {
      "id": "bot_123",
      "name": "客服Bot",
      "platform": "telegram",
      "status": "active",
      "createdAt": "2024-01-10T15:00:00Z"
    }
  ]
}
```

#### 创建新Bot
```bash
POST /api/bots
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "技术支持Bot",
  "platform": "discord",
  "token": "your_bot_token",
  "webhookUrl": "https://yourdomain.com/webhook/discord"
}
```

## 🔗 Webhook接口

### 平台Webhook端点

| 平台 | 端点 | 方法 | 认证 |
|------|------|------|------|
| Telegram | `/api/webhooks/telegram` | POST | Secret Token |
| Discord | `/api/webhooks/discord` | POST | Public Key |
| WhatsApp | `/api/webhooks/whatsapp` | POST/GET | Signature |
| Slack | `/api/webhooks/slack` | POST | Signature |
| Line | `/api/webhooks/line` | POST | Signature |
| WeWork | `/api/webhooks/wework` | POST | Signature |

### Webhook配置示例

#### Telegram Bot
```bash
# 设置Webhook
curl -X POST https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourdomain.com/api/webhooks/telegram",
    "secret_token": "your_secret_token"
  }'
```

#### Discord Bot
```bash
# 在Discord Developer Portal配置
# Interactions Endpoint URL: https://yourdomain.com/api/webhooks/discord
```

#### WhatsApp Business
```bash
# 在Meta Developer Console配置
# Webhook URL: https://yourdomain.com/api/webhooks/whatsapp
# Verify Token: your_verify_token
```

## 🛡️ 安全配置

### 认证方式

#### 1. JWT Token认证
```javascript
// 在请求头中添加
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 2. API Key认证
```javascript
// 在请求头中添加
X-API-Key: your_api_key
```

### 频率限制

```javascript
// 默认限制配置
{
  windowMs: 60000,        // 1分钟窗口
  maxRequests: 100,       // 最多100个请求
  skipSuccessfulRequests: false
}
```

### CORS配置

```javascript
// 允许的源
const corsOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://yourdomain.com'
];
```

## 📊 监控和日志

### 健康检查

```bash
GET /health

# 响应
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00Z",
  "uptime": 86400,
  "service": "gateway",
  "dependencies": {
    "database": "connected",
    "redis": "connected",
    "aiService": "connected"
  }
}
```

### 日志格式

```json
{
  "level": "info",
  "message": "AI classification completed",
  "timestamp": "2024-01-15T12:00:00Z",
  "service": "gateway",
  "messageId": "msg_12345",
  "tenantId": "tenant_001",
  "platform": "telegram",
  "classification": {
    "category": "support",
    "confidence": 0.89,
    "processingTime": 156
  }
}
```

### 性能指标

Gateway收集以下性能指标：

- **请求响应时间**
- **API调用成功率**
- **AI分类准确率**
- **消息处理吞吐量**
- **错误率统计**
- **资源使用率**

## 🚀 部署指南

### Docker部署

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

```bash
# 构建和运行
docker build -t octopus-gateway .
docker run -p 3000:3000 --env-file .env octopus-gateway
```

### Docker Compose部署

```yaml
# docker-compose.yml
version: '3.8'

services:
  gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    
  postgres:
    image: postgres:13
    environment:
      - POSTGRES_DB=octopus_messenger
      - POSTGRES_USER=octopus_user
      - POSTGRES_PASSWORD=your_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    
  redis:
    image: redis:6-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 生产环境部署

```bash
# 1. 安装依赖
npm ci --only=production

# 2. 构建项目
npm run build

# 3. 启动服务
PM2_ENV=production pm2 start ecosystem.config.js

# 4. 配置Nginx反向代理
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🧪 测试

### 单元测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

### API测试

```bash
# 健康检查
curl http://localhost:3000/health

# 用户认证
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# AI分类测试
curl -X POST http://localhost:3000/api/ai/classify \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message":{"content":"测试消息","platform":"test"}}'
```

## 📚 API文档

### Swagger文档

启动服务后，访问以下地址查看完整API文档：

```
http://localhost:3000/api/docs
```

### API集合

我们提供了Postman和Insomnia的API集合文件：

- `docs/postman-collection.json`
- `docs/insomnia-collection.json`

## 🚨 故障排除

### 常见问题

#### 1. 服务启动失败
```bash
# 检查端口占用
lsof -i :3000

# 检查环境变量
printenv | grep -E "(PORT|NODE_ENV|DB_)"

# 查看日志
tail -f logs/gateway.log
```

#### 2. 数据库连接失败
```bash
# 测试数据库连接
psql -h localhost -p 5432 -U octopus_user -d octopus_messenger

# 检查数据库配置
node -e "console.log(require('./config/config').database)"
```

#### 3. AI服务连接失败
```bash
# 检查AI服务状态
curl http://localhost:3002/health

# 检查网络连接
telnet localhost 3002

# 验证AI服务配置
node -e "console.log(require('./src/config/aiService').aiServiceConfig)"
```

#### 4. 性能问题
```bash
# 查看资源使用
htop
iostat -x 1
df -h

# 检查日志错误
grep -i error logs/gateway.log
```

### 调试技巧

#### 1. 启用详细日志
```bash
export LOG_LEVEL=debug
export DEBUG=*
npm run dev
```

#### 2. 使用调试工具
```bash
# Node.js调试
node --inspect src/index.js

# 使用nodemon调试
nodemon --inspect src/index.js
```

#### 3. 性能分析
```bash
# 使用clinic.js
npx clinic doctor -- node src/index.js

# 内存分析
node --inspect --max-old-space-size=4096 src/index.js
```

## 🔧 开发指南

### 项目结构

```
services/gateway/
├── src/
│   ├── config/           # 配置文件
│   │   └── aiService.js  # AI服务配置
│   ├── controllers/      # 控制器
│   ├── middleware/       # 中间件
│   │   ├── auth.js       # 认证中间件
│   │   ├── errorHandler.js # 错误处理
│   │   └── messageProcessor.js # 消息处理
│   ├── routes/           # 路由
│   │   ├── auth.js       # 认证路由
│   │   ├── ai.js         # AI路由
│   │   ├── bots.js       # Bot管理
│   │   ├── messages.js   # 消息管理
│   │   ├── tasks.js      # 任务管理
│   │   ├── users.js      # 用户管理
│   │   └── webhooks.js   # Webhook处理
│   ├── utils/            # 工具函数
│   │   ├── logger.js     # 日志工具
│   │   └── AIServiceClient.js # AI服务客户端
│   └── index.js          # 入口文件
├── tests/                # 测试文件
├── docs/                 # 文档
├── logs/                 # 日志目录
├── package.json          # 项目配置
└── README.md             # 说明文档
```

### 代码规范

#### 1. ESLint配置
```javascript
// .eslintrc.js
module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    'no-console': 'warn',
    'no-unused-vars': 'error',
    'prefer-const': 'error',
  },
};
```

#### 2. Prettier配置
```javascript
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2
}
```

### 贡献指南

1. **Fork项目**
2. **创建特性分支**：`git checkout -b feature/new-feature`
3. **提交更改**：`git commit -am 'Add new feature'`
4. **推送分支**：`git push origin feature/new-feature`
5. **提交PR**：创建Pull Request

### 版本发布

```bash
# 更新版本号
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.1 -> 1.1.0
npm version major  # 1.1.0 -> 2.0.0

# 发布到npm
npm publish
```

## 📞 技术支持

### 社区支持

- **GitHub Issues**: [提交问题](https://github.com/octopus-messenger/gateway/issues)
- **讨论区**: [技术讨论](https://github.com/octopus-messenger/gateway/discussions)
- **Wiki**: [详细文档](https://github.com/octopus-messenger/gateway/wiki)

### 联系我们

- **邮箱**: support@octopus-messenger.com
- **技术支持**: tech@octopus-messenger.com
- **商务合作**: business@octopus-messenger.com

### 资源链接

- **官方网站**: https://octopus-messenger.com
- **文档中心**: https://docs.octopus-messenger.com
- **状态页面**: https://status.octopus-messenger.com

## 📄 许可证

本项目使用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

---

<div align="center">
  <p><strong>🐙 Octopus Messenger Gateway</strong></p>
  <p>统一的多平台消息处理网关，支持AI智能分类和双模式服务</p>
  <p>
    <a href="https://github.com/octopus-messenger/gateway">GitHub</a> •
    <a href="https://docs.octopus-messenger.com">文档</a> •
    <a href="https://octopus-messenger.com">官网</a>
  </p>
</div> 