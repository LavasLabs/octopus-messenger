# Discord Bot 配置指南

## 概述

本指南将帮助您在Octopus Messenger系统中配置Discord Bot集成，实现Discord平台的智能客服和消息处理功能。

## 🎯 Discord Bot 功能特性

### 核心功能
- **斜杠命令支持** - 现代化的Discord交互方式
- **嵌入式消息** - 美观的富媒体消息展示
- **按钮交互** - 用户友好的交互界面
- **频道和私信支持** - 支持服务器频道和私人消息
- **权限管理** - 精细的权限控制

### 智能功能
- **AI消息分类** - 自动识别用户意图
- **自动回复** - 基于FAQ的智能回复
- **客服排队** - 智能客服分配系统
- **实时通知** - 即时消息推送

## 📋 准备工作

### 1. 创建Discord应用

1. 访问 [Discord Developer Portal](https://discord.com/developers/applications)
2. 点击 "New Application"
3. 输入应用名称（如：`Octopus Customer Service Bot`）
4. 点击 "Create"

### 2. 配置Bot

1. 在应用页面点击左侧 "Bot" 菜单
2. 点击 "Add Bot"
3. 自定义Bot名称和头像
4. 复制Bot Token（稍后需要）

### 3. 配置OAuth2

1. 在应用页面点击左侧 "OAuth2" > "URL Generator"
2. 选择权限范围 (Scopes)：
   - `bot`
   - `applications.commands`
3. 选择Bot权限 (Bot Permissions)：
   - `Send Messages`
   - `Read Message History`
   - `Use Slash Commands`
   - `Embed Links`
   - `Attach Files`
   - `Read Messages`
   - `Manage Messages`

### 4. 生成邀请链接

1. 复制生成的URL
2. 访问该URL将Bot添加到您的服务器
3. 选择目标服务器并授权

## ⚙️ 系统配置

### 1. 环境变量配置

在项目根目录的 `.env` 文件中添加：

```bash
# Discord Bot Configuration
DISCORD_ENABLED=true
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
DISCORD_PUBLIC_KEY=your_public_key_here
DISCORD_GUILD_ID=your_guild_id_here
DISCORD_WEBHOOK_URL=https://your-domain.com/api/webhooks/discord

# 可选配置
DISCORD_COMMAND_PREFIX=/
DISCORD_AUTO_REPLY=true
DISCORD_AI_CLASSIFICATION=true
```

### 2. 获取必要的密钥

#### Bot Token
1. 在Discord Developer Portal中，进入您的应用
2. 点击 "Bot" 菜单
3. 在 "Token" 部分点击 "Copy"

#### Client ID 和 Client Secret
1. 在 "General Information" 页面
2. 复制 "Application ID" (这是Client ID)
3. 复制 "Client Secret"

#### Public Key
1. 在 "General Information" 页面
2. 复制 "Public Key"

#### Guild ID（服务器ID）
1. 在Discord客户端中，右键点击您的服务器
2. 选择 "复制服务器ID"
3. 如果看不到此选项，请先启用开发者模式：
   - 设置 → 高级 → 开发者模式

## 🔧 Bot配置

### 1. 在管理面板中配置

1. 登录Octopus Messenger管理面板
2. 导航到 "Bot配置" 页面
3. 点击 "添加新Bot"
4. 选择 "Discord" 平台
5. 填写配置信息：

```json
{
  "botName": "Octopus Discord Bot",
  "platform": "discord",
  "botToken": "your_bot_token",
  "clientId": "your_client_id",
  "clientSecret": "your_client_secret",
  "publicKey": "your_public_key",
  "guildId": "your_guild_id",
  "webhookUrl": "https://your-domain.com/api/webhooks/discord",
  "settings": {
    "autoReply": true,
    "aiClassification": true,
    "forwardToCRM": true,
    "supportedLanguages": ["en", "zh"],
    "slashCommands": [
      {
        "name": "help",
        "description": "显示帮助信息"
      },
      {
        "name": "support",
        "description": "联系客服支持"
      },
      {
        "name": "faq",
        "description": "查看常见问题"
      },
      {
        "name": "status",
        "description": "查看服务状态"
      }
    ]
  }
}
```

### 2. 斜杠命令配置

系统支持以下内置斜杠命令：

#### `/help` - 帮助命令
显示可用命令和使用方法

#### `/support` - 客服支持
启动客服会话，用户将被添加到客服队列

#### `/faq` - 常见问题
显示常见问题分类，用户可以通过按钮选择

#### `/status` - 服务状态
显示系统和客服状态信息

### 3. 自定义命令

您可以在配置中添加自定义命令：

```json
{
  "customCommands": [
    {
      "name": "order",
      "description": "查询订单状态",
      "options": [
        {
          "name": "order_id",
          "description": "订单ID",
          "type": "string",
          "required": true
        }
      ],
      "handler": "order_status"
    }
  ]
}
```

## 🎨 消息模板配置

### 1. 嵌入式消息模板

```json
{
  "embedTemplates": {
    "welcome": {
      "title": "欢迎使用客服系统",
      "description": "请选择您需要的服务类型",
      "color": 3447003,
      "fields": [
        {
          "name": "📞 客服支持",
          "value": "使用 `/support` 命令联系人工客服",
          "inline": true
        },
        {
          "name": "❓ 常见问题",
          "value": "使用 `/faq` 命令查看常见问题",
          "inline": true
        }
      ],
      "footer": {
        "text": "客服工作时间：9:00-18:00"
      }
    },
    "queueStatus": {
      "title": "客服队列状态",
      "description": "您已加入客服队列",
      "color": 16776960,
      "fields": [
        {
          "name": "队列位置",
          "value": "第 {position} 位",
          "inline": true
        },
        {
          "name": "预计等待时间",
          "value": "{estimatedTime} 分钟",
          "inline": true
        }
      ]
    }
  }
}
```

### 2. 按钮交互配置

```json
{
  "buttonComponents": {
    "customerService": [
      {
        "customId": "customer_service_contact",
        "label": "联系客服",
        "style": "Primary",
        "emoji": "🎧"
      },
      {
        "customId": "customer_service_faq",
        "label": "常见问题",
        "style": "Secondary",
        "emoji": "❓"
      },
      {
        "customId": "customer_service_status",
        "label": "服务状态",
        "style": "Success",
        "emoji": "📊"
      }
    ]
  }
}
```

## 🔐 权限配置

### 1. 服务器权限

确保Bot在服务器中有以下权限：

```json
{
  "requiredPermissions": [
    "VIEW_CHANNEL",
    "SEND_MESSAGES",
    "EMBED_LINKS",
    "ATTACH_FILES",
    "READ_MESSAGE_HISTORY",
    "USE_SLASH_COMMANDS",
    "MANAGE_MESSAGES",
    "ADD_REACTIONS"
  ]
}
```

### 2. 频道权限

为特定频道配置权限：

```json
{
  "channelPermissions": {
    "customer-support": {
      "allowedRoles": ["@everyone"],
      "deniedRoles": [],
      "allowedCommands": ["help", "support", "faq"],
      "autoReply": true
    },
    "staff-only": {
      "allowedRoles": ["Staff", "Admin"],
      "deniedRoles": ["@everyone"],
      "allowedCommands": ["admin", "stats", "manage"],
      "autoReply": false
    }
  }
}
```

## 🚀 启动和测试

### 1. 启动系统

```bash
# 安装依赖
npm install

# 运行数据库迁移
npm run db:migrate

# 启动服务
npm run dev
```

### 2. 测试Bot功能

1. 在Discord服务器中使用 `/help` 命令
2. 测试 `/support` 命令启动客服会话
3. 测试 `/faq` 命令查看常见问题
4. 验证自动回复功能

### 3. 验证Webhook

确保Discord可以成功调用您的webhook：

```bash
# 检查webhook日志
docker-compose logs -f gateway

# 测试webhook连接
curl -X POST https://your-domain.com/api/webhooks/discord \
  -H "Content-Type: application/json" \
  -H "X-Signature-Ed25519: test_signature" \
  -H "X-Signature-Timestamp: $(date +%s)" \
  -d '{"type": 1}'
```

## 📊 监控和分析

### 1. 消息统计

查看Discord消息统计：

```sql
-- 查看每日消息统计
SELECT * FROM discord_message_analytics 
ORDER BY date DESC 
LIMIT 7;

-- 查看活跃频道
SELECT * FROM discord_guild_activity 
ORDER BY message_count DESC 
LIMIT 10;
```

### 2. 性能监控

监控Discord Bot性能：

```javascript
// 获取Bot状态
const botStatus = await discordBot.getStatus();
console.log('Discord Bot Status:', botStatus);

// 监控指标
const metrics = {
  guilds: botStatus.guilds,
  users: botStatus.users,
  uptime: botStatus.uptime,
  memoryUsage: process.memoryUsage()
};
```

## 🔧 故障排除

### 常见问题

#### 1. Bot无法响应命令

**可能原因**：
- Bot Token无效或过期
- 权限不足
- 斜杠命令未正确注册

**解决方案**：
```bash
# 检查Bot Token
curl -H "Authorization: Bot YOUR_BOT_TOKEN" \
  https://discord.com/api/v10/users/@me

# 重新注册斜杠命令
npm run discord:register-commands
```

#### 2. Webhook签名验证失败

**可能原因**：
- Public Key错误
- 时间戳问题
- 签名算法不匹配

**解决方案**：
```javascript
// 验证公钥配置
const publicKey = process.env.DISCORD_PUBLIC_KEY;
console.log('Public Key:', publicKey);

// 检查时间戳
const timestamp = req.headers['x-signature-timestamp'];
const now = Date.now();
const requestTime = parseInt(timestamp) * 1000;
const timeDiff = Math.abs(now - requestTime);
console.log('Time difference:', timeDiff);
```

#### 3. 嵌入式消息不显示

**可能原因**：
- 缺少 `EMBED_LINKS` 权限
- 嵌入数据格式错误
- 消息内容过长

**解决方案**：
```javascript
// 检查权限
const permissions = channel.permissionsFor(client.user);
console.log('Has embed permission:', permissions.has('EMBED_LINKS'));

// 验证嵌入数据
const embed = new EmbedBuilder()
  .setTitle('Test')
  .setDescription('Test description')
  .setColor(0x00AE86);
```

### 调试模式

启用详细日志：

```bash
# 设置环境变量
export DEBUG=discord:*
export LOG_LEVEL=debug

# 启动服务
npm run dev
```

## 🎯 高级配置

### 1. 自动调节功能

根据服务器活动自动调整Bot行为：

```json
{
  "autoModeration": {
    "enabled": true,
    "rules": [
      {
        "type": "spam_detection",
        "threshold": 5,
        "action": "timeout",
        "duration": 300
      },
      {
        "type": "flood_control",
        "maxMessagesPerMinute": 10,
        "action": "rate_limit"
      }
    ]
  }
}
```

### 2. 多语言支持

配置多语言回复：

```json
{
  "localization": {
    "default": "en",
    "supported": ["en", "zh", "ja", "ko"],
    "messages": {
      "en": {
        "welcome": "Welcome to our customer service!",
        "queue_position": "Your position in queue: {position}"
      },
      "zh": {
        "welcome": "欢迎使用客服系统！",
        "queue_position": "您在队列中的位置：{position}"
      }
    }
  }
}
```

### 3. 集成第三方服务

与其他服务集成：

```json
{
  "integrations": {
    "analytics": {
      "enabled": true,
      "provider": "google_analytics",
      "trackingId": "GA_TRACKING_ID"
    },
    "crm": {
      "enabled": true,
      "provider": "salesforce",
      "syncUserData": true
    }
  }
}
```

## 📚 API参考

### Discord Bot API

#### 发送消息
```javascript
await discordBot.sendMessage(channelId, content, options);
```

#### 发送嵌入式消息
```javascript
await discordBot.sendEmbed(channelId, embedData);
```

#### 发送私信
```javascript
await discordBot.sendDM(userId, content);
```

#### 注册斜杠命令
```javascript
await discordBot.registerSlashCommand(commandData);
```

### Webhook API

#### 处理交互
```javascript
POST /api/webhooks/discord
Content-Type: application/json
X-Signature-Ed25519: signature
X-Signature-Timestamp: timestamp

{
  "type": 2,
  "data": {
    "name": "support",
    "options": []
  },
  "user": {
    "id": "user_id",
    "username": "username"
  }
}
```

通过本指南，您应该能够成功配置和部署Discord Bot集成。如果遇到问题，请查看日志文件或联系技术支持。 