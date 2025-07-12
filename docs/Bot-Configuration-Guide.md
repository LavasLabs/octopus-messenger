# Bot 配置指南

## 概述

本指南将帮助您在各个平台创建和配置Bot，并将其集成到Octopus Messenger系统中。

## 🤖 Telegram Bot 配置

### 1. 创建Telegram Bot

#### 步骤1：联系BotFather

1. 在Telegram中搜索并打开 `@BotFather`
2. 发送 `/start` 开始对话
3. 发送 `/newbot` 创建新bot

#### 步骤2：设置Bot信息

```
BotFather: Alright, a new bot. How are we going to call it? Please choose a name for your bot.

You: 客服助手Bot

BotFather: Good. Now let's choose a username for your bot. It must end in `bot`. Like this, for example: TetrisBot or tetris_bot.

You: customer_service_bot

BotFather: Done! Congratulations on your new bot. You will find it at t.me/customer_service_bot. You can now add a description, about section and profile picture for your bot, see /help for a list of commands. Use this token to access the HTTP API:

1234567890:ABCdefGHIjklMNOpqrSTUVwxyz

Keep your token secure and store it safely, it can be used by anyone to control your bot.
```

#### 步骤3：配置Bot设置

```bash
# 设置Bot描述
/setdescription
选择你的bot
输入描述：智能客服助手，为您提供7x24小时服务

# 设置Bot命令菜单
/setcommands
选择你的bot
输入命令列表：
start - 开始使用
help - 获取帮助
status - 查看状态
feedback - 提交反馈

# 启用群组模式（如果需要）
/setjoingroups
选择你的bot
选择 Enable

# 设置隐私模式
/setprivacy
选择你的bot
选择 Disable (接收所有消息)
```

### 2. 在系统中配置Telegram Bot

#### 步骤1：登录管理面板

访问 `https://admin.your-domain.com` 并登录

#### 步骤2：添加Bot配置

1. 导航到 "Bot管理" > "添加Bot"
2. 填写以下信息：

```json
{
  "name": "客服助手Bot",
  "platform": "telegram",
  "botToken": "1234567890:ABCdefGHIjklMNOpqrSTUVwxyz",
  "webhookUrl": "https://api.your-domain.com/api/webhooks/telegram",
  "webhookSecret": "your-webhook-secret-key",
  "settings": {
    "autoReply": true,
    "language": "zh-CN",
    "workingHours": {
      "enabled": true,
      "start": "09:00",
      "end": "18:00",
      "timezone": "Asia/Shanghai"
    },
    "welcomeMessage": "您好！我是智能客服助手，很高兴为您服务！",
    "commands": {
      "/start": "开始使用服务",
      "/help": "获取帮助信息",
      "/status": "查看服务状态"
    }
  }
}
```

#### 步骤3：设置Webhook

系统会自动调用Telegram API设置webhook：

```bash
curl -X POST "https://api.telegram.org/bot1234567890:ABCdefGHIjklMNOpqrSTUVwxyz/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.your-domain.com/api/webhooks/telegram",
    "secret_token": "your-webhook-secret-key"
  }'
```

### 3. 测试Telegram Bot

1. 在Telegram中搜索你的bot用户名
2. 发送 `/start` 开始对话
3. 发送测试消息
4. 在管理面板查看消息是否被接收和处理

---

## 📱 WhatsApp Bot 配置

### 1. 创建WhatsApp Business API

#### 步骤1：申请Meta Business账户

1. 访问 [Meta for Developers](https://developers.facebook.com/)
2. 创建开发者账户
3. 创建新应用，选择 "Business" 类型

#### 步骤2：设置WhatsApp Business API

1. 在应用中添加 "WhatsApp" 产品
2. 完成电话号码验证
3. 获取临时访问令牌

#### 步骤3：获取永久访问令牌

```bash
# 使用临时令牌获取永久令牌
curl -X GET "https://graph.facebook.com/v17.0/me" \
  -H "Authorization: Bearer YOUR_TEMPORARY_ACCESS_TOKEN"
```

### 2. 在系统中配置WhatsApp Bot

#### 步骤1：添加Bot配置

```json
{
  "name": "WhatsApp客服",
  "platform": "whatsapp",
  "botToken": "your-permanent-access-token",
  "phoneNumberId": "your-phone-number-id",
  "webhookUrl": "https://api.your-domain.com/api/webhooks/whatsapp",
  "webhookSecret": "your-verify-token",
  "settings": {
    "autoReply": true,
    "language": "zh-CN",
    "businessHours": {
      "enabled": true,
      "start": "09:00",
      "end": "18:00"
    },
    "templates": {
      "welcome": "欢迎使用WhatsApp客服！",
      "offline": "我们的客服时间是9:00-18:00，请稍后联系。"
    }
  }
}
```

#### 步骤2：配置Webhook

1. 在Meta开发者控制台中设置webhook URL
2. 验证令牌：`your-verify-token`
3. 订阅字段：`messages`

### 3. 测试WhatsApp Bot

1. 向配置的WhatsApp号码发送消息
2. 验证消息是否被系统接收
3. 检查自动回复功能

---

## 🔔 Slack Bot 配置

### 1. 创建Slack App

#### 步骤1：创建应用

1. 访问 [Slack API](https://api.slack.com/apps)
2. 点击 "Create New App"
3. 选择 "From scratch"
4. 输入应用名称和选择工作区

#### 步骤2：配置Bot权限

在 "OAuth & Permissions" 页面添加以下权限：

```
Bot Token Scopes:
- chat:write
- channels:read
- groups:read
- im:read
- mpim:read
- users:read
- files:read
- reactions:read
```

#### 步骤3：启用事件订阅

1. 在 "Event Subscriptions" 页面启用事件
2. 设置请求URL：`https://api.your-domain.com/api/webhooks/slack`
3. 订阅Bot事件：
   - `message.channels`
   - `message.groups`
   - `message.im`
   - `message.mpim`

#### 步骤4：安装应用

1. 在 "Install App" 页面安装到工作区
2. 获取 Bot User OAuth Token

### 2. 在系统中配置Slack Bot

```json
{
  "name": "Slack客服助手",
  "platform": "slack",
  "botToken": "xoxb-your-bot-token",
  "appToken": "xapp-your-app-token",
  "signingSecret": "your-signing-secret",
  "webhookUrl": "https://api.your-domain.com/api/webhooks/slack",
  "settings": {
    "socketMode": false,
    "autoReply": true,
    "channels": ["general", "support"],
    "dmEnabled": true,
    "workingHours": {
      "enabled": true,
      "start": "09:00",
      "end": "18:00"
    }
  }
}
```

### 3. 测试Slack Bot

1. 在Slack工作区中@mention你的bot
2. 发送直接消息给bot
3. 验证消息接收和处理

---

## ⚙️ 高级配置

### 1. 消息分类规则

```json
{
  "classificationRules": [
    {
      "name": "技术支持",
      "keywords": ["bug", "错误", "故障", "无法使用"],
      "category": "技术支持",
      "priority": "high",
      "autoAssignTo": "tech-team"
    },
    {
      "name": "销售咨询",
      "keywords": ["价格", "购买", "方案", "报价"],
      "category": "销售",
      "priority": "medium",
      "autoAssignTo": "sales-team"
    }
  ]
}
```

### 2. 自动回复设置

```json
{
  "autoReplies": [
    {
      "trigger": "工作时间外",
      "condition": "outside_business_hours",
      "message": "感谢您的咨询！我们的工作时间是周一至周五9:00-18:00，将在工作时间内回复您。"
    },
    {
      "trigger": "关键词匹配",
      "condition": "contains_keywords",
      "keywords": ["价格", "报价"],
      "message": "您好！关于价格信息，我们的销售团队会尽快与您联系。"
    }
  ]
}
```

### 3. 集成Lark任务

```json
{
  "larkIntegration": {
    "enabled": true,
    "appId": "your-lark-app-id",
    "appSecret": "your-lark-app-secret",
    "defaultProject": "customer-service",
    "taskMapping": {
      "技术支持": {
        "assignee": "tech-lead@company.com",
        "priority": "高"
      },
      "销售咨询": {
        "assignee": "sales-lead@company.com",
        "priority": "中"
      }
    }
  }
}
```

---

## 🔍 监控和管理

### 1. Bot状态监控

在管理面板中可以查看：

- Bot在线状态
- 消息接收统计
- 响应时间
- 错误日志

### 2. 性能指标

- **消息处理速度**: 平均处理时间
- **分类准确率**: AI分类的准确性
- **任务创建率**: 自动创建任务的比例
- **用户满意度**: 基于反馈的评分

### 3. 故障排除

#### 常见问题

**1. Webhook无法接收消息**

```bash
# 检查webhook URL是否可访问
curl -X GET "https://api.your-domain.com/health"

# 验证SSL证书
curl -I "https://api.your-domain.com/api/webhooks/telegram"
```

**2. Bot认证失败**

- 检查Token是否正确
- 确认Token权限是否足够
- 验证API配额是否用完

**3. 消息处理延迟**

- 检查服务器负载
- 查看消息队列状态
- 监控数据库性能

---

## 📚 API接口

### 1. 创建Bot配置

```bash
POST /api/bots
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "name": "客服Bot",
  "platform": "telegram",
  "botToken": "bot-token",
  "webhookUrl": "webhook-url",
  "settings": {}
}
```

### 2. 更新Bot配置

```bash
PUT /api/bots/{bot-id}
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "settings": {
    "autoReply": false
  }
}
```

### 3. 获取Bot状态

```bash
GET /api/bots/{bot-id}/status
Authorization: Bearer <your-token>
```

### 4. 测试Bot连接

```bash
POST /api/bots/{bot-id}/test
Authorization: Bearer <your-token>
```

---

## 💡 最佳实践

### 1. 安全建议

- 定期更换API密钥
- 使用HTTPS进行webhook通信
- 设置IP白名单限制访问
- 监控异常API调用

### 2. 性能优化

- 启用消息缓存
- 设置合理的超时时间
- 使用异步处理长时间任务
- 定期清理历史数据

### 3. 用户体验

- 设置友好的欢迎消息
- 提供清晰的命令说明
- 快速响应用户查询
- 定期收集用户反馈

---

## 🆘 技术支持

如果在配置过程中遇到问题，请：

1. 查看[故障排除指南](docs/Troubleshooting.md)
2. 提交[GitHub Issue](https://github.com/your-org/octopus-messenger/issues)
3. 联系技术支持：support@octopus-messenger.com
4. 查看[FAQ文档](docs/FAQ.md)

---

## 📋 配置检查清单

### Telegram Bot
- [ ] 从BotFather获取Token
- [ ] 设置Bot命令和描述
- [ ] 配置隐私设置
- [ ] 在系统中添加Bot配置
- [ ] 设置Webhook
- [ ] 测试消息接收

### WhatsApp Bot
- [ ] 创建Meta Business账户
- [ ] 获取永久访问令牌
- [ ] 验证电话号码
- [ ] 配置Webhook
- [ ] 测试消息发送和接收

### Slack Bot
- [ ] 创建Slack应用
- [ ] 配置OAuth权限
- [ ] 启用事件订阅
- [ ] 安装到工作区
- [ ] 测试消息处理

### 系统配置
- [ ] 配置分类规则
- [ ] 设置自动回复
- [ ] 集成Lark任务
- [ ] 配置监控告警
- [ ] 测试端到端流程 