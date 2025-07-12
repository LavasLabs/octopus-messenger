# Intercom 集成配置指南

## 概述

Intercom是一个强大的客户服务和营销平台，提供完整的客户沟通解决方案。本指南将详细介绍如何将Intercom集成到我们的Octopus Messenger系统中。

## 功能特性

### ✅ 支持的功能

- **对话管理**：创建、获取、更新、关闭对话
- **消息处理**：发送和接收文本、富媒体消息
- **联系人管理**：同步和管理客户信息
- **标签系统**：自动标签分类和管理
- **团队分配**：智能分配对话给合适的团队或个人
- **优先级处理**：支持高优先级消息的特殊处理
- **实时webhook**：接收实时事件通知
- **搜索功能**：强大的对话和联系人搜索
- **工单转换**：对话转工单功能
- **AI Agent**：支持Intercom的Fin AI Agent

### 🌟 独特优势

- **企业级功能**：完整的客服系统解决方案
- **丰富的API**：RESTful API 2.13，功能完整
- **多区域支持**：美国、欧盟、澳洲三个区域
- **强大的分析**：详细的对话统计和分析
- **移动SDK**：原生iOS和Android支持

## 接入准备

### 1. Intercom账户设置

1. **创建Intercom账户**
   - 访问 [Intercom官网](https://www.intercom.com/)
   - 注册企业账户（推荐使用付费计划以获得完整功能）

2. **创建App**
   - 登录Intercom控制台
   - 进入 Settings > Developers > App Store
   - 点击 "New app" 创建新应用
   - 选择 "Internal integration" 类型

3. **获取认证信息**
   ```bash
   # 需要获取的信息：
   App ID: your_app_id_here
   Access Token: your_access_token_here  
   Secret Key: your_secret_key_here (用于webhook验证)
   Region: us/eu/au (根据数据存储区域选择)
   ```

### 2. API权限配置

确保您的App具有以下权限：

```json
{
  "permissions": [
    "read_conversations",
    "write_conversations", 
    "read_contacts",
    "write_contacts",
    "read_admins",
    "read_teams",
    "read_tags",
    "write_tags"
  ]
}
```

### 3. Webhook配置

1. **设置Webhook URL**
   ```
   https://your-domain.com/api/webhooks/intercom
   ```

2. **订阅事件**
   ```json
   {
     "webhook_topics": [
       "conversation.user.created",
       "conversation.user.replied", 
       "conversation.admin.replied",
       "conversation.admin.assigned",
       "conversation.admin.closed",
       "contact.created",
       "contact.signed_up"
     ]
   }
   ```

## 系统配置

### 1. 环境变量设置

在您的 `.env` 文件中添加：

```bash
# Intercom配置
INTERCOM_ACCESS_TOKEN=your_access_token_here
INTERCOM_APP_ID=your_app_id_here
INTERCOM_SECRET_KEY=your_secret_key_here
INTERCOM_REGION=us
INTERCOM_WEBHOOK_SECRET=your_webhook_secret_here
INTERCOM_DEFAULT_ADMIN_ID=your_admin_id_here
```

### 2. 数据库配置

运行数据库迁移：

```bash
# 执行Intercom迁移脚本
psql -d your_database -f database/migrations/003_add_intercom_support.sql
```

### 3. Bot配置

在管理后台中创建Intercom Bot配置：

```json
{
  "name": "Intercom客服Bot",
  "platform": "intercom",
  "access_token": "your_access_token_here",
  "app_id": "your_app_id_here", 
  "secret_key": "your_secret_key_here",
  "region": "us",
  "webhook_url": "https://your-domain.com/api/webhooks/intercom",
  "webhook_secret": "your_webhook_secret",
  "process_admin_replies": false,
  "default_admin_id": "your_admin_id",
  "is_active": true,
  "settings": {
    "auto_reply": true,
    "ai_enabled": true,
    "language": "zh",
    "timezone": "Asia/Shanghai",
    "business_hours": {
      "enabled": true,
      "monday": {"start": "09:00", "end": "18:00"},
      "tuesday": {"start": "09:00", "end": "18:00"},
      "wednesday": {"start": "09:00", "end": "18:00"},
      "thursday": {"start": "09:00", "end": "18:00"},
      "friday": {"start": "09:00", "end": "18:00"},
      "saturday": {"start": "10:00", "end": "16:00"},
      "sunday": {"start": "10:00", "end": "16:00"}
    },
    "features": {
      "conversation_management": true,
      "contact_sync": true,
      "tag_management": true,
      "team_assignment": true,
      "priority_handling": true,
      "rich_messages": true,
      "file_uploads": true,
      "conversation_search": true,
      "analytics": true
    }
  }
}
```

## API使用示例

### 1. 发送消息

```javascript
const intercomBot = new IntercomBot(config);

// 发送简单文本消息
const result = await intercomBot.sendMessage(
  'conversation_id',
  { 
    text: '您好！我是客服小助手，有什么可以帮助您的吗？' 
  },
  { adminId: 'admin_123' }
);

// 发送带附件的消息
const resultWithAttachment = await intercomBot.sendMessage(
  'conversation_id',
  { 
    text: '这里是您需要的文档',
    attachments: [
      { type: 'file', url: 'https://example.com/document.pdf' }
    ]
  }
);
```

### 2. 创建对话

```javascript
// 创建新对话
const conversation = await intercomBot.createConversation(
  'contact_id_123',
  { text: '欢迎使用我们的服务！' },
  { contactType: 'user' }
);
```

### 3. 管理对话

```javascript
// 关闭对话
await intercomBot.manageConversation(
  'conversation_id',
  'close',
  { 
    adminId: 'admin_123',
    message: '问题已解决，对话关闭。如有其他问题请随时联系我们。'
  }
);

// 分配对话
await intercomBot.manageConversation(
  'conversation_id', 
  'assign',
  { 
    adminId: 'admin_123',
    assignee_id: 'admin_456'
  }
);

// 暂停对话
await intercomBot.manageConversation(
  'conversation_id',
  'snooze',
  { 
    adminId: 'admin_123',
    snoozed_until: Date.now() + 3600000 // 1小时后
  }
);
```

### 4. 搜索对话

```javascript
// 搜索对话
const searchResult = await intercomBot.searchConversations({
  operator: 'AND',
  value: [
    { field: 'state', operator: '=', value: 'open' },
    { field: 'priority', operator: '=', value: 'priority' }
  ]
});
```

### 5. 联系人管理

```javascript
// 获取或创建联系人
const contact = await intercomBot.getOrCreateContact(
  { email: 'customer@example.com' },
  { 
    name: '张三',
    phone: '+86-138-0013-8000',
    custom_attributes: { vip_level: 'gold' }
  }
);
```

## Webhook事件处理

### 支持的事件类型

| 事件类型 | 描述 | 处理方式 |
|---------|------|----------|
| `conversation.user.created` | 用户创建新对话 | 自动处理，触发AI分类 |
| `conversation.user.replied` | 用户回复消息 | 自动处理，触发AI分类 |
| `conversation.admin.replied` | 管理员回复 | 可选处理 |
| `conversation.admin.assigned` | 对话被分配 | 记录分配信息 |
| `conversation.admin.closed` | 对话被关闭 | 触发后续工作流 |
| `contact.created` | 新联系人创建 | 同步到系统 |
| `contact.signed_up` | 联系人注册 | 触发欢迎流程 |

### 事件处理示例

```javascript
// webhook接收示例
app.post('/api/webhooks/intercom', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const webhook = req.body;
  
  // 验证签名
  if (!verifySignature(JSON.stringify(webhook), signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // 处理事件
  switch (webhook.topic) {
    case 'conversation.user.replied':
      await handleUserMessage(webhook.data);
      break;
    case 'conversation.admin.assigned':
      await handleAssignment(webhook.data);
      break;
    // ... 其他事件处理
  }
  
  res.json({ status: 'ok' });
});
```

## AI分类集成

### 自动分类配置

```javascript
// AI分类配置示例
const classificationConfig = {
  categories: [
    { name: '技术支持', keywords: ['bug', '错误', '故障', '问题'] },
    { name: '账单咨询', keywords: ['账单', '付费', '价格', '费用'] },
    { name: '产品咨询', keywords: ['功能', '特性', '使用方法'] },
    { name: '投诉建议', keywords: ['投诉', '建议', '不满意'] }
  ],
  priority_keywords: ['紧急', '严重', '立即', '马上'],
  auto_assign_rules: {
    '技术支持': 'tech_team_id',
    '账单咨询': 'billing_team_id',
    '产品咨询': 'product_team_id',
    '投诉建议': 'management_team_id'
  }
};
```

### 智能标签

```javascript
// 自动标签示例
const autoTagging = {
  vip_customers: {
    condition: (contact) => contact.custom_attributes?.vip_level === 'gold',
    tags: ['VIP', '高优先级']
  },
  urgent_keywords: {
    condition: (message) => /紧急|urgent|asap/i.test(message.content),
    tags: ['紧急', '高优先级']
  },
  new_users: {
    condition: (contact) => {
      const signupTime = contact.signed_up_at;
      const daysSinceSignup = (Date.now() - signupTime * 1000) / (1000 * 60 * 60 * 24);
      return daysSinceSignup <= 7;
    },
    tags: ['新用户', '需要关注']
  }
};
```

## 最佳实践

### 1. 消息处理策略

```javascript
// 消息优先级处理
const messagePriorityHandler = {
  // VIP客户消息立即处理
  vip: (message) => {
    return processImmediately(message);
  },
  
  // 紧急消息优先处理
  urgent: (message) => {
    return processWithHighPriority(message);
  },
  
  // 普通消息正常队列处理
  normal: (message) => {
    return processInQueue(message);
  }
};
```

### 2. 工作时间处理

```javascript
// 工作时间外自动回复
const businessHoursHandler = {
  isBusinessHours: () => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // 周一到周五 9:00-18:00
    if (day >= 1 && day <= 5) {
      return hour >= 9 && hour < 18;
    }
    
    // 周末 10:00-16:00  
    if (day === 0 || day === 6) {
      return hour >= 10 && hour < 16;
    }
    
    return false;
  },
  
  handleOutOfHours: async (conversationId) => {
    await intercomBot.sendMessage(conversationId, {
      text: '感谢您的咨询！我们的客服团队将在工作时间内（周一至周五 9:00-18:00，周末 10:00-16:00）尽快回复您。紧急问题请拨打客服热线：400-xxx-xxxx'
    });
  }
};
```

### 3. 错误处理和重试

```javascript
// 错误处理策略
const errorHandler = {
  retryableErrors: [429, 500, 502, 503, 504],
  
  async handleError(error, operation, retryCount = 0) {
    const maxRetries = 3;
    
    if (this.retryableErrors.includes(error.status) && retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 1000; // 指数退避
      await new Promise(resolve => setTimeout(resolve, delay));
      return operation(retryCount + 1);
    }
    
    logger.error('Intercom operation failed', {
      error: error.message,
      status: error.status,
      retryCount
    });
    
    throw error;
  }
};
```

## 监控和分析

### 1. 关键指标监控

```javascript
// 性能指标监控
const metricsCollector = {
  // 响应时间监控
  responseTime: new Map(),
  
  // 成功率监控  
  successRate: {
    total: 0,
    success: 0,
    getRate: () => this.success / this.total * 100
  },
  
  // 消息量统计
  messageStats: {
    hourly: new Map(),
    daily: new Map(),
    weekly: new Map()
  },
  
  // 错误统计
  errorStats: new Map()
};
```

### 2. 分析报表

```sql
-- 对话分析报表
SELECT 
  DATE_TRUNC('day', created_at) as date,
  state,
  priority,
  COUNT(*) as conversation_count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) as avg_duration_hours
FROM intercom_conversations 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY date, state, priority
ORDER BY date DESC;

-- 联系人增长报表
SELECT 
  DATE_TRUNC('week', created_at) as week,
  COUNT(*) as new_contacts,
  COUNT(*) FILTER (WHERE role = 'user') as new_users,
  COUNT(*) FILTER (WHERE role = 'lead') as new_leads
FROM intercom_contacts
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY week
ORDER BY week DESC;
```

## 故障排除

### 常见问题

1. **Webhook接收失败**
   ```bash
   # 检查webhook配置
   curl -X GET "https://api.intercom.io/subscriptions" \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```

2. **API调用超时**
   ```javascript
   // 增加超时时间
   const client = axios.create({
     timeout: 30000,
     retries: 3
   });
   ```

3. **权限错误**
   - 检查Access Token是否有效
   - 确认App权限配置正确
   - 验证区域设置是否匹配

4. **消息发送失败**
   - 确认对话ID有效
   - 检查消息格式是否正确
   - 验证管理员ID是否存在

### 日志分析

```bash
# 查看Intercom相关日志
grep "intercom" /var/log/octopus-messenger/gateway.log | tail -100

# 查看webhook事件日志
grep "Intercom webhook" /var/log/octopus-messenger/gateway.log | tail -50

# 查看错误日志
grep "ERROR.*intercom" /var/log/octopus-messenger/gateway.log
```

## 总结

Intercom是一个功能强大的客户服务平台，通过本指南的配置可以实现：

1. **完整的对话管理**：支持所有Intercom对话功能
2. **智能消息处理**：结合AI分类和优先级处理
3. **实时事件处理**：通过webhook获取实时更新
4. **企业级特性**：团队管理、标签系统、分析报表
5. **高可用性**：错误处理、重试机制、监控告警

通过集成Intercom，您的客服系统将获得企业级的客户服务能力，为客户提供更好的服务体验。

## 相关资源

- [Intercom API文档](https://developers.intercom.com/docs/references/rest-api/)
- [Intercom Webhook文档](https://developers.intercom.com/docs/references/webhooks/)
- [Intercom开发者中心](https://developers.intercom.com/)
- [Octopus Messenger架构文档](./GATEWAY_AI_INTEGRATION.md) 