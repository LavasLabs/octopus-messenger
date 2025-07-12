# Octopus Messenger 本地部署指南

## 📋 系统要求

### 基础环境
- **Node.js**: 18.0.0+ 
- **npm**: 9.0.0+
- **Docker**: 20.10.0+ (推荐)
- **Docker Compose**: 2.0.0+

### 数据库要求
- **PostgreSQL**: 14+ (主数据库)
- **Redis**: 7+ (缓存和队列)
- **MongoDB**: 5.0+ (文档存储，可选)

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/LavasLabs/octopus-messenger.git
cd octopus-messenger
```

### 2. 创建环境配置文件

复制并编辑环境配置：

```bash
cp docs/env-template.txt .env
```

### 3. 配置必要参数

编辑 `.env` 文件，设置以下**必需参数**：

```bash
# ============================================
# 基础配置
# ============================================
NODE_ENV=development
PORT=3000

# ============================================
# 数据库配置（必需）
# ============================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=octopus_messenger
DB_USER=postgres
DB_PASSWORD=your_strong_password

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ============================================
# 安全配置（必需）
# ============================================
JWT_SECRET=your-super-secret-jwt-key-please-change-this-to-something-very-secure
SERVICE_TOKEN=your-internal-service-token-also-change-this

# ============================================
# AI服务配置（必需至少一个）
# ============================================
OPENAI_API_KEY=sk-your-openai-api-key
# 或者
CLAUDE_API_KEY=your-claude-api-key
```

## 📝 详细配置参数

### 🔑 必需配置

#### 1. 数据库配置
```bash
# PostgreSQL 主数据库
DB_HOST=localhost                    # 数据库主机
DB_PORT=5432                        # 数据库端口
DB_NAME=octopus_messenger           # 数据库名称
DB_USER=postgres                    # 数据库用户名
DB_PASSWORD=your_password           # 数据库密码

# Redis 缓存
REDIS_HOST=localhost                # Redis主机
REDIS_PORT=6379                     # Redis端口
REDIS_PASSWORD=                     # Redis密码（可选）
```

#### 2. 安全配置
```bash
# JWT密钥（用于用户认证）
JWT_SECRET=your-256-bit-secret-key

# 服务间通信密钥
SERVICE_TOKEN=your-service-token
```

#### 3. AI服务配置（至少配置一个）
```bash
# OpenAI配置
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4                  # 可选：gpt-3.5-turbo, gpt-4
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.7

# Claude配置（二选一）
CLAUDE_API_KEY=your-claude-key
CLAUDE_MODEL=claude-3-sonnet-20240229
```

### 📱 平台集成配置（可选）

#### Telegram Bot
```bash
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your_bot_token

# 获取方式：
# 1. 在Telegram中搜索 @BotFather
# 2. 发送 /newbot 创建新bot
# 3. 复制获得的token
```

#### WhatsApp Business API
```bash
WHATSAPP_ENABLED=true
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_VERIFY_TOKEN=your_verify_token

# 获取方式：
# 1. 访问 Facebook for Developers
# 2. 创建应用并添加WhatsApp产品
# 3. 获取访问令牌和电话号码ID
```

#### Slack Bot
```bash
SLACK_ENABLED=true
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your_signing_secret

# 获取方式：
# 1. 访问 api.slack.com/apps
# 2. 创建新应用
# 3. 在OAuth & Permissions页面获取Bot Token
# 4. 在Basic Information页面获取Signing Secret
```

### 🔧 CRM集成配置（可选）

#### 飞书/Lark
```bash
LARK_APP_ID=your_app_id
LARK_APP_SECRET=your_app_secret

# 获取方式：
# 1. 访问 open.larksuite.com
# 2. 创建企业自建应用
# 3. 获取App ID和App Secret
```

#### Salesforce
```bash
SALESFORCE_CLIENT_ID=your_client_id
SALESFORCE_CLIENT_SECRET=your_client_secret
SALESFORCE_USERNAME=your_username
SALESFORCE_PASSWORD=your_password_and_security_token
```

#### HubSpot
```bash
HUBSPOT_API_KEY=your_api_key

# 获取方式：
# 1. 登录HubSpot账户
# 2. 设置 → 集成 → API密钥
# 3. 生成新的API密钥
```

### 🌐 网络配置

#### 本地开发
```bash
# 服务端口配置
GATEWAY_PORT=3000
MESSAGE_PROCESSOR_PORT=3001
AI_SERVICE_PORT=3002
TASK_SERVICE_PORT=3003
BOT_MANAGER_PORT=3004
ADMIN_PANEL_PORT=3005

# 本地域名（用于webhook回调）
LOCAL_DOMAIN=http://localhost:3000

# 如果使用ngrok进行外网访问
LOCAL_NGROK_URL=https://your-random-id.ngrok.io
```

#### 生产环境准备
```bash
# 生产域名
PRODUCTION_DOMAIN=https://your-domain.com

# SSL配置
SSL_ENABLED=true
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

## 🐳 Docker部署（推荐）

### 1. 使用Docker Compose
```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 2. 自定义Docker配置
```bash
# 仅启动必需服务
docker-compose up -d postgres redis gateway

# 扩展特定服务
docker-compose up -d --scale gateway=2
```

## 💻 手动部署

### 1. 安装依赖
```bash
npm install
```

### 2. 设置数据库

#### PostgreSQL
```bash
# 创建数据库
createdb octopus_messenger

# 运行迁移
npm run db:migrate

# 插入初始数据
npm run db:seed
```

#### Redis
```bash
# 启动Redis服务器
redis-server

# 或使用Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### 3. 启动服务

#### 开发模式（所有服务）
```bash
npm run dev
```

#### 单独启动服务
```bash
# API网关
npm run dev:gateway

# 消息处理服务
npm run dev:message-processor

# AI分类服务
npm run dev:ai-service

# 任务管理服务
npm run dev:task-service

# Bot管理服务
npm run dev:bot-manager

# 管理面板
npm run dev:admin-panel
```

## 🧪 测试配置

### 1. 健康检查
```bash
# 检查所有服务状态
curl http://localhost:3000/health

# 检查数据库连接
curl http://localhost:3000/api/health/database

# 检查AI服务
curl http://localhost:3002/health
```

### 2. 测试AI分类
```bash
curl -X POST http://localhost:3002/api/classify \
  -H "Content-Type: application/json" \
  -d '{"content": "我想咨询产品价格"}'
```

### 3. 测试Bot集成
```bash
# 发送测试消息到Telegram webhook
curl -X POST http://localhost:3000/api/webhooks/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "message_id": 1,
      "from": {"id": 123, "first_name": "Test"},
      "chat": {"id": 123, "type": "private"},
      "text": "Hello"
    }
  }'
```

## 📊 监控和日志

### 1. 日志配置
```bash
LOG_LEVEL=info                      # debug, info, warn, error
LOG_FILE=logs/app.log
LOG_MAX_SIZE=20m
LOG_MAX_FILES=5
```

### 2. 监控端点
```bash
# Prometheus指标
curl http://localhost:9090/metrics

# 服务状态
curl http://localhost:3000/api/status

# 系统信息
curl http://localhost:3000/api/system-info
```

## 🔧 常见问题解决

### 1. 数据库连接失败
```bash
# 检查PostgreSQL状态
sudo systemctl status postgresql

# 检查连接参数
psql -h localhost -p 5432 -U postgres -d octopus_messenger
```

### 2. Redis连接失败
```bash
# 检查Redis状态
redis-cli ping

# 检查Redis配置
redis-cli config get "*"
```

### 3. AI服务调用失败
```bash
# 测试OpenAI API
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# 测试Claude API
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $CLAUDE_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

### 4. 端口冲突
```bash
# 检查端口占用
lsof -i :3000

# 更改端口配置
PORT=3001 npm run dev:gateway
```

## 🚀 生产环境建议

### 1. 性能优化
```bash
# 启用生产模式
NODE_ENV=production

# 增加进程数
PM2_INSTANCES=4

# 优化数据库连接
DB_MAX_CONNECTIONS=50
```

### 2. 安全加固
```bash
# 启用HTTPS
SSL_ENABLED=true

# 启用安全头
HELMET_ENABLED=true

# 启用CSRF保护
CSRF_ENABLED=true

# 限制CORS来源
CORS_ORIGINS=https://yourdomain.com
```

### 3. 备份策略
```bash
# 数据库备份
pg_dump octopus_messenger > backup.sql

# Redis备份
redis-cli BGSAVE

# 应用配置备份
cp .env .env.backup
```

## 📱 移动端访问

### 使用ngrok暴露本地服务
```bash
# 安装ngrok
npm install -g ngrok

# 暴露本地端口
ngrok http 3000

# 更新webhook URL
TELEGRAM_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/webhooks/telegram
```

## 🎯 下一步

部署完成后，您可以：

1. **配置Bot**: 访问 `http://localhost:3005` 进入管理面板
2. **测试消息**: 向配置的Bot发送测试消息
3. **查看分析**: 监控消息处理和AI分类效果
4. **CRM集成**: 配置您使用的CRM系统
5. **自定义规则**: 设置消息分类和路由规则

需要帮助？查看其他文档：
- [Bot配置指南](Bot-Configuration-Guide.md)
- [CRM集成指南](CRM-Integration-Guide.md)
- [API文档](API-Documentation.md)
- [故障排除指南](Troubleshooting-Guide.md) 