# 🏪 商户系统使用指南

## 概述

Octopus Messenger 商户系统让老板可以轻松管理多个店铺，每个店铺拥有唯一的商户ID，可以在不同聊天平台（Telegram、WhatsApp、Discord等）中使用同一套客户数据。

## 🚀 快速开始

### 1. 初始化数据库

```bash
# 给脚本执行权限
chmod +x scripts/init-database.sh

# 运行初始化（使用默认参数）
./scripts/init-database.sh

# 或指定数据库参数
./scripts/init-database.sh my_database my_user localhost 5432
```

### 2. 启动服务

```bash
# 安装依赖
npm install

# 启动所有服务
npm run start

# 或分别启动
npm run start:gateway     # API网关 (端口3000)
npm run start:admin       # 管理面板 (端口3005)
```

## 🏪 商户管理

### 创建商户

**API接口:**
```http
POST /api/merchants
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "merchantName": "小王奶茶店",
  "businessType": "餐饮服务",
  "industry": "饮品",
  "contactPhone": "13812345678",
  "contactEmail": "xiaowang@example.com",
  "description": "专注新鲜现制茶饮",
  "welcomeMessage": "欢迎来到小王奶茶店！今天想喝什么呢？"
}
```

**响应:**
```json
{
  "status": "success",
  "data": {
    "merchant": {
      "id": "SHOP001",
      "name": "小王奶茶店",
      "businessType": "餐饮服务",
      "status": "active"
    }
  }
}
```

### 生成邀请码

```http
POST /api/merchants/SHOP001/invite-codes
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "platform": "telegram",
  "maxUses": 10,
  "expiresInDays": 30
}
```

**响应:**
```json
{
  "status": "success",
  "data": {
    "inviteCode": {
      "code": "SHOP001-TG-A1B2C3",
      "platform": "telegram",
      "maxUses": 10,
      "expiresAt": "2024-02-01T00:00:00Z"
    }
  }
}
```

## 🤖 Bot绑定

### 方式1: 通过商户ID绑定

```http
POST /api/bots
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "小王奶茶店 Telegram助手",
  "platform": "telegram",
  "botToken": "YOUR_BOT_TOKEN",
  "merchantId": "SHOP001",
  "settings": {
    "autoReply": true,
    "language": "zh-CN"
  }
}
```

### 方式2: 通过邀请码绑定

```http
POST /api/bots
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "小王奶茶店 WhatsApp助手",
  "platform": "whatsapp",
  "botToken": "YOUR_BOT_TOKEN",
  "inviteCode": "SHOP001-WA-B2C3D4"
}
```

## 💬 对话式注册

### 群组中注册流程

1. **邀请Bot到群组**
2. **Bot自动发起注册对话:**

```
🏪 请选择您的商户设置方式：

🆕 创建新商户 - 首次使用，创建全新的商户账户
🔗 绑定现有商户 - 已有商户，在新平台添加机器人

💡 如果您已经在其他平台使用过我们的服务，
   请选择"绑定现有商户"来共享数据。
```

3. **选择"绑定现有商户"时:**

```
🔑 请输入您的商户ID或邀请码：

📝 商户ID格式：SHOP1234
🎫 邀请码格式：SHOP1234-TG-A1B2C3

❓ 找不到商户ID？
- 查看其他平台的机器人欢迎消息
- 登录管理后台查看
- 联系客服获取支持
```

4. **绑定成功提示:**

```
🎉 恭喜！成功绑定到商户 **小王奶茶店**！

🏪 商户信息
🆔 商户ID：SHOP001
🏢 商户名称：小王奶茶店
📱 平台：telegram

✅ 已启用功能
🤖 智能问答回复
📊 跨平台数据同步
🔄 客服排队管理
📈 统计分析

🚀 开始使用
现在您可以在此群组中使用智能客服功能了！
所有对话数据将与您在其他平台的机器人共享。
```

## 📊 数据同步

### 自动同步的数据类型

- **🗣️ 对话历史** - 跨平台对话记录
- **👤 用户档案** - 客户基本信息和行为
- **🏷️ 用户标签** - 智能标签自动应用
- **📈 统计数据** - 消息量、活跃度等指标
- **⚙️ 客服设置** - 欢迎语、营业时间等

### 查询共享数据

```http
GET /api/merchants/SHOP001/data?dataType=customer_profiles
Authorization: Bearer YOUR_TOKEN
```

### 手动同步数据

```http
POST /api/merchants/SHOP001/data
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "dataType": "customer_profiles",
  "dataKey": "user_13812345678",
  "dataValue": {
    "name": "张三",
    "phone": "13812345678",
    "orders": 5,
    "totalAmount": 150.00
  }
}
```

## 📈 商户统计

### 获取商户统计

```http
GET /api/merchants/SHOP001/stats?period=month
Authorization: Bearer YOUR_TOKEN
```

**响应:**
```json
{
  "status": "success",
  "data": {
    "merchant": {
      "id": "SHOP001",
      "name": "小王奶茶店"
    },
    "stats": {
      "totalBots": 3,
      "activeBots": 3,
      "totalMessages": 1250,
      "totalCustomers": 85,
      "activeCustomers7d": 32,
      "activeCustomers30d": 67,
      "activePlatforms": ["telegram", "whatsapp", "discord"]
    }
  }
}
```

## 🛠️ 管理面板操作

### 1. 访问管理面板
```
http://localhost:3005
```

### 2. 商户管理页面
- 查看所有商户列表
- 创建新商户
- 编辑商户信息
- 查看商户统计

### 3. Bot管理页面
- 查看商户的所有Bot
- 按商户筛选Bot
- 查看跨平台绑定状态

### 4. 邀请码管理
- 为商户生成新邀请码
- 查看邀请码使用情况
- 设置邀请码过期时间

## 🎯 使用场景示例

### 场景1: 连锁店管理

```
👨‍💼 老板小李有3家奶茶店：

🏪 店A - 商户ID: SHOP001
  📱 Telegram群: 绑定SHOP001
  💬 WhatsApp: 使用邀请码 SHOP001-WA-A1B2C3
  
🏪 店B - 商户ID: SHOP002  
  📱 Telegram群: 绑定SHOP002
  🎮 Discord服务器: 使用邀请码 SHOP002-DC-B2C3D4
  
🏪 店C - 商户ID: SHOP003
  💬 WhatsApp: 绑定SHOP003
  📞 微信群: 使用邀请码 SHOP003-WX-C3D4E5

✅ 优势:
- 每家店的数据独立管理
- 同一家店在不同平台数据同步
- 统一的客服设置和话术
- 跨平台用户识别和标签
```

### 场景2: 多品牌管理

```
🏢 餐饮集团有多个品牌：

🥤 奶茶品牌 - SHOP001
🍔 汉堡品牌 - SHOP002  
🥗 轻食品牌 - SHOP003

每个品牌可以在多个平台部署客服Bot，
数据按品牌隔离，但使用同一套管理系统。
```

## 🔧 故障排除

### 常见问题

**1. 邀请码无效**
- 检查邀请码格式是否正确
- 确认邀请码未过期
- 验证平台类型是否匹配

**2. 数据同步失败**
- 检查网络连接
- 确认商户ID正确
- 查看系统日志

**3. Bot绑定失败**
- 验证Bot Token有效性
- 检查商户是否存在
- 确认权限设置正确

### 查看日志

```bash
# 查看Gateway服务日志
docker logs octopus-gateway

# 查看数据库日志
docker logs octopus-database
```

## 🌟 最佳实践

### 1. 商户ID规划
- 使用有意义的前缀：`SHOP`、`STORE`、`CAFE`
- 按业务类型分组：`TEA001`、`BURGER001`
- 预留扩展空间：`SHOP001` ~ `SHOP999`

### 2. 邀请码管理
- 为不同平台生成专用邀请码
- 设置合理的过期时间（30天）
- 定期清理未使用的邀请码

### 3. 数据同步策略
- 重要数据立即同步
- 统计数据批量同步
- 定期备份共享数据

### 4. 权限控制
- 群主或管理员才能绑定商户
- 设置消息配额防止滥用
- 监控异常使用行为

---

🎉 现在您已经掌握了 Octopus Messenger 商户系统的完整使用方法！每个商户都有唯一ID，可以轻松在不同平台间共享数据。 