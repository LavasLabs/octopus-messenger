# Gateway AI集成升级指南

## 🎯 升级概述

Gateway已全面集成双模式AI分类系统，为所有平台消息提供统一的智能分类服务。

## 🚀 新增功能

### ✨ 智能消息分类
- **自动AI分类**：所有消息自动进行AI分类
- **双模式支持**：根据租户模式选择分类策略
- **回退机制**：AI服务失败时自动回退到基础分类
- **批量处理**：支持消息批量分类

### 🧠 AI服务集成
- **统一客户端**：`AIServiceClient`提供标准化API调用
- **智能路由**：`/api/ai/*` 路径提供完整AI功能
- **消息处理器**：集成AI分类的消息处理中间件
- **配置管理**：完整的AI服务配置系统

### 🛡️ 增强的Webhook处理
- **实时分类**：消息接收时立即进行AI分类
- **优先级检测**：自动识别紧急消息并优先处理
- **频率限制**：防止消息轰炸，保护系统稳定性
- **错误恢复**：AI分类失败时的优雅降级

## 🏗️ 架构更新

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Bot Platforms │    │     Gateway     │    │   AI Service    │
│                 │    │                 │    │                 │
│ • Telegram      │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ • Discord       │───▶│ │  Webhooks   │ │    │ │ Smart       │ │
│ • WhatsApp      │    │ │  Handler    │ │───▶│ │ Classifier  │ │
│ • Slack         │    │ └─────────────┘ │    │ └─────────────┘ │
│ • Line          │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ • WeWork        │    │ │ Message     │ │    │ │ Tenant      │ │
└─────────────────┘    │ │ Processor   │ │───▶│ │ Models      │ │
                       │ └─────────────┘ │    │ └─────────────┘ │
                       │ ┌─────────────┐ │    │ ┌─────────────┐ │
                       │ │ AI Client   │ │    │ │ Mode        │ │
                       │ │ & Routes    │ │───▶│ │ Manager     │ │
                       │ └─────────────┘ │    │ └─────────────┘ │
                       └─────────────────┘    └─────────────────┘
```

## 📝 API接口

### 智能分类API

```bash
# 单消息智能分类
POST /api/ai/classify
Authorization: Bearer <token>
{
  "message": {
    "content": "我需要技术支持",
    "platform": "discord",
    "userId": "user123"
  }
}

# 响应
{
  "success": true,
  "classification": {
    "category": "support",
    "confidence": 0.89,
    "mode": "training",
    "usedCustomModel": true,
    "classifier": "tenant-rule-engine"
  },
  "processingTime": 156,
  "explanation": {
    "strategy": "使用您的专属AI模型进行分类"
  }
}
```

```bash
# 批量消息分类
POST /api/ai/classify/batch
Authorization: Bearer <token>
{
  "messages": [
    {"content": "账户登录问题", "platform": "slack"},
    {"content": "产品价格咨询", "platform": "telegram"}
  ]
}
```

### 模式管理API

```bash
# 查看当前AI模式
GET /api/ai/mode
Authorization: Bearer <token>

# 切换AI模式
POST /api/ai/mode
Authorization: Bearer <token>
{
  "mode": "training",
  "reason": "希望获得个性化AI服务"
}

# 获取模式推荐
GET /api/ai/mode/recommend
Authorization: Bearer <token>
```

### 租户模型API

```bash
# 训练专属模型
POST /api/ai/models/train
Authorization: Bearer <token>
{
  "modelType": "rule-engine",
  "examples": [
    {"text": "网站无法访问", "category": "technical"},
    {"text": "想购买VIP", "category": "sales"}
  ]
}

# 查看模型列表
GET /api/ai/models
Authorization: Bearer <token>

# 获取统计信息
GET /api/ai/stats?timeRange=24h
Authorization: Bearer <token>
```

## 🔧 配置说明

### Gateway环境变量
```bash
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
AI_RESULT_CACHE_ENABLED=true
AI_RESULT_CACHE_TTL=300
```

### AI服务配置
```javascript
// services/gateway/src/config/aiService.js
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

## 🚀 部署更新

### 1. 更新Gateway代码
```bash
cd services/gateway
npm install
```

### 2. 启动服务
```bash
# 开发环境
npm run dev

# 生产环境
npm start
```

### 3. 验证集成
```bash
# 健康检查
curl http://localhost:3000/health

# AI服务连通性
curl -H "Authorization: Bearer <token>" \
     http://localhost:3000/api/ai/mode

# 测试分类
curl -X POST \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"message":{"content":"测试消息","platform":"test"}}' \
     http://localhost:3000/api/ai/classify
```

## 📊 消息处理流程

### 增强的Webhook处理

```javascript
// 原来的流程
webhook → 保存消息 → 发送到处理器

// 现在的流程  
webhook → 保存消息 → AI分类 → 紧急检测 → 发送到处理器
```

### 消息处理步骤

1. **接收消息**：平台webhook发送消息到Gateway
2. **频率检查**：验证发送频率，防止滥用
3. **保存消息**：将消息保存到数据库
4. **AI分类**：调用智能分类服务
5. **优先级判断**：检测是否为紧急消息
6. **数据增强**：添加分类和优先级信息
7. **转发处理**：发送到消息处理器

### 错误处理和回退

```javascript
// AI分类失败时的回退策略
try {
  classification = await aiClient.classifyMessage(message);
} catch (error) {
  // 回退到基础分类
  classification = {
    category: 'unclassified',
    confidence: 0,
    classifier: 'fallback'
  };
}
```

## 🔍 监控和日志

### 关键指标
- **分类准确率**：AI分类的准确性
- **响应时间**：分类处理时间
- **成功率**：AI服务可用性
- **模式使用率**：训练模式vs普通模式使用比例

### 日志示例
```json
{
  "level": "info",
  "message": "AI classification completed",
  "messageId": "msg_12345",
  "tenantId": "tenant_001",
  "category": "support",
  "confidence": 0.89,
  "usedCustomModel": true,
  "mode": "training",
  "processingTime": 156
}
```

## 🚨 故障排除

### 常见问题

1. **AI服务连接失败**
   ```bash
   # 检查AI服务状态
   curl http://localhost:3002/health
   
   # 检查网络连接
   telnet localhost 3002
   ```

2. **分类准确率低**
   - 检查训练数据质量
   - 验证模型配置
   - 考虑切换模式

3. **响应时间过长**
   - 调整超时配置
   - 检查批量处理设置
   - 优化缓存策略

### 调试命令
```bash
# 查看Gateway日志
tail -f logs/gateway.log

# 检查AI服务健康状态
curl http://localhost:3000/api/ai/health

# 验证配置
node -e "console.log(require('./src/config/aiService').aiServiceConfig)"
```

## 🎯 使用建议

### 开发阶段
1. 启用详细日志记录
2. 使用预览模式测试分类
3. 关注错误率和响应时间

### 生产部署
1. 配置监控告警
2. 设置合理的超时时间
3. 启用缓存优化性能
4. 定期检查AI服务健康状态

### 性能优化
1. **批量处理**：对于大量消息使用批量API
2. **结果缓存**：启用分类结果缓存
3. **连接池**：配置合适的连接池大小
4. **异步处理**：使用异步方式处理非紧急消息

---

通过这次升级，Gateway现在提供了完整的AI驱动消息处理能力，支持双模式切换，确保在隐私保护和个性化服务之间找到最佳平衡。🚀 