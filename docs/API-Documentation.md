# Octopus Messenger API 文档

## 概述

Octopus Messenger API 是一个RESTful API，支持多平台消息处理、AI分类和任务管理。

### 基础URL

- 开发环境: `http://localhost:3000`
- 生产环境: `https://api.octopus-messenger.com`

### 认证

API使用JWT Bearer token进行认证。

```
Authorization: Bearer <token>
```

### 响应格式

所有API响应都遵循以下格式：

```json
{
  "status": "success|error",
  "message": "描述信息",
  "data": {
    // 响应数据
  }
}
```

## 认证接口

### 用户登录

**POST** `/api/auth/login`

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**响应:**
```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "token": "jwt-token-here",
    "user": {
      "id": "user-id",
      "username": "username",
      "email": "user@example.com",
      "role": "admin",
      "tenantId": "tenant-id"
    }
  }
}
```

### 用户注册

**POST** `/api/auth/register`

```json
{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "password123",
  "fullName": "New User",
  "tenantName": "Company Name",
  "tenantSlug": "company-slug"
}
```

### 验证Token

**GET** `/api/auth/verify`

需要Bearer token

## 消息管理

### 获取消息列表

**GET** `/api/messages`

查询参数:
- `page` (int): 页码，默认1
- `limit` (int): 每页数量，默认20
- `platform` (string): 平台筛选
- `messageType` (string): 消息类型筛选
- `search` (string): 搜索内容

**响应:**
```json
{
  "status": "success",
  "data": {
    "messages": [
      {
        "id": "message-id",
        "platform": "telegram",
        "messageType": "text",
        "content": "消息内容",
        "senderName": "发送者姓名",
        "receivedAt": "2024-01-01T10:00:00Z",
        "classification": {
          "category": "技术支持",
          "priority": "high"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

### 获取消息详情

**GET** `/api/messages/{id}`

### 消息分类

**POST** `/api/messages/{id}/classify`

```json
{
  "aiModel": "gpt-4",
  "forceReClassify": false
}
```

## 任务管理

### 获取任务列表

**GET** `/api/tasks`

查询参数:
- `page` (int): 页码
- `limit` (int): 每页数量
- `status` (string): 任务状态筛选
- `priority` (string): 优先级筛选
- `assignee` (string): 负责人筛选

**响应:**
```json
{
  "status": "success",
  "data": {
    "tasks": [
      {
        "id": "task-id",
        "title": "任务标题",
        "description": "任务描述",
        "status": "pending",
        "priority": "high",
        "assignee": {
          "id": "user-id",
          "name": "负责人姓名"
        },
        "createdAt": "2024-01-01T10:00:00Z",
        "dueDate": "2024-01-02T18:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

### 创建任务

**POST** `/api/tasks`

```json
{
  "title": "任务标题",
  "description": "任务描述",
  "priority": "high",
  "assigneeId": "user-id",
  "dueDate": "2024-01-02T18:00:00Z",
  "tags": ["标签1", "标签2"],
  "messageId": "关联消息ID"
}
```

### 更新任务

**PUT** `/api/tasks/{id}`

```json
{
  "title": "更新的标题",
  "status": "in_progress",
  "priority": "medium"
}
```

### 删除任务

**DELETE** `/api/tasks/{id}`

## Bot管理

### 获取Bot列表

**GET** `/api/bots`

### 创建Bot配置

**POST** `/api/bots`

```json
{
  "name": "客服Bot",
  "platform": "telegram",
  "botToken": "telegram-bot-token",
  "webhookUrl": "https://api.example.com/webhook/telegram",
  "settings": {
    "autoReply": true,
    "language": "zh-CN"
  }
}
```

### 更新Bot配置

**PUT** `/api/bots/{id}`

### 删除Bot配置

**DELETE** `/api/bots/{id}`

## 分类规则

### 获取分类规则

**GET** `/api/classifications/rules`

### 创建分类规则

**POST** `/api/classifications/rules`

```json
{
  "name": "技术支持规则",
  "description": "识别技术支持相关消息",
  "keywords": ["bug", "错误", "问题", "故障"],
  "category": "技术支持",
  "priority": "high",
  "autoAssignTo": "tech-support-user-id"
}
```

## Webhook接口

### Telegram Webhook

**POST** `/api/webhooks/telegram`

Headers:
- `X-Telegram-Bot-Api-Secret-Token`: Telegram密钥

### WhatsApp Webhook

**POST** `/api/webhooks/whatsapp`

Headers:
- `X-Hub-Signature-256`: WhatsApp签名

**GET** `/api/webhooks/whatsapp`

用于验证webhook。

### Slack Webhook

**POST** `/api/webhooks/slack`

Headers:
- `X-Slack-Signature`: Slack签名
- `X-Slack-Request-Timestamp`: 请求时间戳

## 统计和报告

### 获取统计数据

**GET** `/api/stats`

查询参数:
- `period` (string): 时间周期 (day, week, month, year)
- `start` (string): 开始日期
- `end` (string): 结束日期

**响应:**
```json
{
  "status": "success",
  "data": {
    "totalMessages": 1000,
    "totalTasks": 150,
    "tasksByStatus": {
      "pending": 50,
      "in_progress": 30,
      "completed": 70
    },
    "messagesByPlatform": {
      "telegram": 400,
      "whatsapp": 350,
      "slack": 250
    },
    "avgResponseTime": 120,
    "topCategories": [
      {
        "category": "技术支持",
        "count": 300
      },
      {
        "category": "销售咨询",
        "count": 200
      }
    ]
  }
}
```

## 错误代码

| 状态码 | 错误类型 | 描述 |
|--------|----------|------|
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未授权，需要登录 |
| 403 | Forbidden | 权限不足 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突 |
| 422 | Validation Error | 数据验证失败 |
| 429 | Too Many Requests | 请求过于频繁 |
| 500 | Internal Server Error | 服务器内部错误 |
| 502 | Bad Gateway | 网关错误 |
| 503 | Service Unavailable | 服务不可用 |

## 限流

API实施了限流机制:
- 每分钟最多100个请求
- 超过限制将返回429状态码

## 分页

支持分页的接口使用以下参数:
- `page`: 页码（从1开始）
- `limit`: 每页数量（默认20，最大100）

分页响应格式:
```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## 排序

支持排序的接口使用以下参数:
- `sort`: 排序字段
- `order`: 排序方向（asc/desc）

示例: `/api/messages?sort=receivedAt&order=desc`

## 过滤

支持过滤的接口可以使用多种过滤条件:
- 等值过滤: `?status=pending`
- 范围过滤: `?createdAt_gte=2024-01-01&createdAt_lte=2024-01-31`
- 包含过滤: `?tags_in=标签1,标签2`
- 搜索过滤: `?search=关键词`

## SDK和工具

### Postman集合

导入Postman集合文件: `docs/postman/octopus-messenger-api.json`

### JavaScript SDK

```javascript
const OctopusClient = require('@octopus-messenger/sdk');

const client = new OctopusClient({
  baseUrl: 'https://api.octopus-messenger.com',
  apiKey: 'your-api-key'
});

// 获取消息列表
const messages = await client.messages.list({
  platform: 'telegram',
  limit: 50
});

// 创建任务
const task = await client.tasks.create({
  title: '新任务',
  description: '任务描述',
  priority: 'high'
});
```

### Python SDK

```python
from octopus_messenger import OctopusClient

client = OctopusClient(
    base_url='https://api.octopus-messenger.com',
    api_key='your-api-key'
)

# 获取消息列表
messages = client.messages.list(platform='telegram', limit=50)

# 创建任务
task = client.tasks.create(
    title='新任务',
    description='任务描述',
    priority='high'
)
```

## 支持

如有问题，请联系：
- 技术支持邮箱: support@octopus-messenger.com
- 文档更新: docs@octopus-messenger.com
- GitHub Issues: https://github.com/your-org/octopus-messenger/issues 