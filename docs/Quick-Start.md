# Octopus Messenger 快速开始

## 🚀 5分钟快速启动

### 步骤1: 下载项目
```bash
git clone https://github.com/LavasLabs/octopus-messenger.git
cd octopus-messenger
```

### 步骤2: 运行自动配置
```bash
./scripts/setup-local.sh
```

### 步骤3: 启动服务
```bash
npm run dev
```

### 步骤4: 访问系统
- 管理面板: http://localhost:3005
- API文档: http://localhost:3000/api/docs
- 健康检查: http://localhost:3000/health

## ⚡ 最小配置

如果您只想快速体验系统，只需要配置这些**必需参数**：

### 1. 创建环境文件
```bash
cp docs/env-template.txt .env
```

### 2. 编辑 `.env` 文件，设置以下参数：

```bash
# 数据库配置
DB_PASSWORD=your_postgres_password

# 安全密钥（请更改）
JWT_SECRET=your-256-bit-secret-key
SERVICE_TOKEN=your-service-token

# AI服务（至少配置一个）
OPENAI_API_KEY=sk-your-openai-api-key
# 或者
CLAUDE_API_KEY=your-claude-api-key
```

### 3. 启动数据库（使用Docker）
```bash
# PostgreSQL
docker run -d --name octopus-postgres \
  -p 5432:5432 \
  -e POSTGRES_DB=octopus_messenger \
  -e POSTGRES_PASSWORD=your_postgres_password \
  postgres:14-alpine

# Redis
docker run -d --name octopus-redis \
  -p 6379:6379 \
  redis:7-alpine
```

### 4. 安装并启动
```bash
npm install
npm run db:migrate
npm run dev
```

## 🎯 核心配置说明

### 必需配置
| 参数 | 说明 | 获取方式 |
|------|------|----------|
| `DB_PASSWORD` | PostgreSQL密码 | 自定义设置 |
| `JWT_SECRET` | JWT签名密钥 | 随机生成256位字符串 |
| `OPENAI_API_KEY` | OpenAI API密钥 | 访问 platform.openai.com |

### 可选配置
| 参数 | 说明 | 何时需要 |
|------|------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram机器人令牌 | 需要Telegram集成时 |
| `LARK_APP_ID` | 飞书应用ID | 需要飞书集成时 |
| `SALESFORCE_CLIENT_ID` | Salesforce客户端ID | 需要Salesforce集成时 |

## 🔧 获取API密钥

### OpenAI API Key
1. 访问 https://platform.openai.com
2. 登录账户
3. 导航到 API → API Keys
4. 点击 "Create new secret key"
5. 复制密钥（格式：sk-...）

### Telegram Bot Token
1. 在Telegram中搜索 `@BotFather`
2. 发送 `/newbot` 命令
3. 按提示设置机器人名称
4. 复制获得的token

### 飞书App ID
1. 访问 https://open.larksuite.com
2. 创建企业自建应用
3. 在应用信息中找到App ID

## 📱 测试系统

### 1. 检查服务状态
```bash
curl http://localhost:3000/health
```

### 2. 测试AI分类
```bash
curl -X POST http://localhost:3002/api/classify \
  -H "Content-Type: application/json" \
  -d '{"content": "我想咨询产品价格"}'
```

### 3. 访问管理面板
浏览器打开: http://localhost:3005

## 🆘 常见问题

### Q: 数据库连接失败
**A:** 检查PostgreSQL是否正在运行：
```bash
docker ps | grep postgres
```

### Q: AI服务调用失败
**A:** 验证API密钥是否正确：
```bash
# 测试OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Q: 端口被占用
**A:** 修改端口配置：
```bash
PORT=3001 npm run dev:gateway
```

### Q: 服务启动慢
**A:** 这是正常的，微服务架构需要一些时间启动所有组件。

## 🎉 下一步

系统启动后，您可以：

1. **配置Bot**: 在管理面板中添加Telegram/WhatsApp/Slack机器人
2. **设置CRM**: 集成您使用的CRM系统（Salesforce、飞书等）
3. **测试消息**: 向Bot发送测试消息，查看AI分类效果
4. **查看分析**: 监控消息处理统计和性能指标

## 📚 进阶配置

如需更详细的配置，请查看：
- [本地部署指南](Local-Deployment-Guide.md) - 完整配置选项
- [Bot配置指南](Bot-Configuration-Guide.md) - 机器人详细配置
- [CRM集成指南](CRM-Integration-Guide.md) - CRM系统集成

---

🎯 **目标**: 让您在5分钟内体验到Octopus Messenger的强大功能！ 