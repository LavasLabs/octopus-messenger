# 双模式AI系统使用指南

## 🎯 系统概述

我们的AI系统为客户提供两种模式选择，满足不同的隐私需求和服务期望：

### 🔒 普通模式 (Normal Mode)
- **隐私优先**：不存储任何聊天数据
- **即时响应**：使用通用AI模型，响应速度快
- **免费使用**：无需额外订阅费用
- **适用场景**：重视隐私、临时使用、简单咨询

### 📚 训练模式 (Training Mode)  
- **个性化服务**：存储聊天数据训练专属AI模型
- **智能学习**：AI会根据您的使用习惯不断优化
- **详细分析**：提供丰富的数据分析和洞察
- **适用场景**：频繁使用、需要个性化、企业级应用

## 🚀 快速开始

### 1. 查看当前模式

```bash
GET /api/mode/current
Authorization: Bearer <your-token>

# 响应
{
  "success": true,
  "mode": "normal",
  "config": {
    "dataRetention": false,
    "privacyMode": true
  }
}
```

### 2. 切换模式

```bash
# 切换到训练模式
POST /api/mode/switch
Authorization: Bearer <your-token>

{
  "mode": "training",
  "reason": "希望获得个性化AI服务"
}

# 切换到普通模式
POST /api/mode/switch
Authorization: Bearer <your-token>

{
  "mode": "normal", 
  "reason": "保护隐私，暂时使用通用模式"
}
```

### 3. 智能消息分类

```bash
POST /api/smart-classify/message
Authorization: Bearer <your-token>

{
  "message": {
    "content": "我的账户无法登录，需要技术支持",
    "platform": "discord",
    "userId": "user123"
  }
}

# 响应（训练模式）
{
  "success": true,
  "classification": {
    "category": "support",
    "confidence": 0.89,
    "mode": "training",
    "usedCustomModel": true,
    "classifier": "tenant-rule-engine"
  },
  "explanation": {
    "strategy": "使用您的专属AI模型进行分类"
  }
}

# 响应（普通模式）
{
  "success": true,
  "classification": {
    "category": "support", 
    "confidence": 0.82,
    "mode": "normal",
    "usedCustomModel": false,
    "classifier": "openai"
  },
  "explanation": {
    "strategy": "使用通用AI模型进行分类"
  }
}
```

## 📊 模式对比

| 功能特性 | 普通模式 | 训练模式 |
|---------|---------|---------|
| **数据存储** | ❌ 不存储 | ✅ 安全存储 |
| **AI模型** | 通用模型 | 专属定制模型 |
| **个性化** | ❌ 无 | ✅ 持续学习 |
| **隐私保护** | 🔒 完全保护 | 🛡️ 租户隔离 |
| **响应速度** | ⚡ 极快 | ⚡ 快速 |
| **准确性** | 📈 良好 | 📈 优秀（越用越准） |
| **费用** | 💰 免费 | 💰 订阅制 |
| **数据分析** | ❌ 无 | ✅ 详细报告 |

## 🔧 高级功能

### 1. 批量分类

```bash
POST /api/smart-classify/batch
Authorization: Bearer <your-token>

{
  "messages": [
    {
      "id": "msg1",
      "content": "账户登录问题",
      "platform": "discord"
    },
    {
      "id": "msg2", 
      "content": "想了解VIP价格",
      "platform": "slack"
    }
  ]
}
```

### 2. 模式预览（不存储数据）

```bash
POST /api/smart-classify/preview
Authorization: Bearer <your-token>

{
  "message": {
    "content": "测试消息，仅预览效果"
  },
  "mode": "training"  # 可选：测试特定模式
}

# 响应
{
  "preview": {
    "mode": "training",
    "customModel": {
      "available": true,
      "classification": {"category": "test", "confidence": 0.75}
    },
    "generalModel": {
      "classification": {"category": "test", "confidence": 0.68}
    },
    "recommended": "custom"
  },
  "message": "这是预览结果，不会存储任何数据"
}
```

### 3. 获取统计数据

```bash
GET /api/smart-classify/stats?timeRange=24h
Authorization: Bearer <your-token>

# 响应
{
  "stats": {
    "summary": {
      "training": {
        "totalClassifications": 150,
        "customModelUsage": 120,
        "generalModelUsage": 30,
        "avgConfidence": 0.85
      }
    }
  }
}
```

### 4. 获取模式建议

```bash
GET /api/mode/recommend
Authorization: Bearer <your-token>

# 响应
{
  "recommendation": {
    "currentMode": "normal",
    "recommendedMode": "training", 
    "reason": "基于您的高使用频率，训练模式可以提供更个性化的AI回复",
    "benefits": [
      "个性化AI模型训练",
      "提高回复准确性",
      "详细使用分析"
    ]
  }
}
```

## 🛡️ 隐私和安全

### 普通模式隐私保护
- ✅ 消息内容不存储
- ✅ 分类结果不关联用户
- ✅ 仅使用通用AI模型
- ✅ 符合最严格的隐私要求

### 训练模式数据安全
- 🔒 租户级别完全隔离
- 🔒 数据加密存储
- 🔒 定期自动清理过期数据
- 🔒 符合GDPR和数据保护法规

### 数据隔离机制

```javascript
// 数据库查询都包含租户ID过滤
SELECT * FROM tenant_messages WHERE tenant_id = 'your_tenant_id';

// 文件系统物理隔离
/models/
  ├── tenant_001/
  │   └── rule-engine/v1/model.json
  └── tenant_002/
      └── local-classifier/v1/model.json

// 缓存键包含租户前缀
ai:model:tenant_001:rule-engine
ai:training:tenant_001:local-classifier
```

## 📈 使用场景推荐

### 适合普通模式的场景
1. **临时咨询**：偶尔使用，不需要记住历史
2. **隐私敏感**：处理敏感信息，要求零存储
3. **合规要求**：严格的数据保护政策
4. **成本控制**：预算有限，免费方案足够

### 适合训练模式的场景
1. **频繁使用**：每日大量消息处理
2. **个性化需求**：希望AI理解业务特点
3. **企业应用**：需要定制化AI解决方案
4. **数据分析**：需要详细的使用报告和洞察

## 🔄 模式切换最佳实践

### 切换时机
1. **使用频率变化**：从偶尔使用到频繁使用
2. **隐私需求变化**：隐私要求降低或提高
3. **业务需求变化**：从简单到复杂的AI需求
4. **预算情况变化**：订阅计划升级或降级

### 切换注意事项
```bash
# 1. 切换前查看当前统计
GET /api/smart-classify/stats

# 2. 了解两种模式差异
GET /api/mode/compare

# 3. 获取个性化建议
GET /api/mode/recommend

# 4. 执行模式切换
POST /api/mode/switch

# 5. 验证切换结果
GET /api/mode/current
```

## 🎯 训练模式优化指南

### 提高模型效果
1. **提供多样化数据**：不同类型的消息样本
2. **保证数据质量**：准确的分类标签
3. **定期模型评估**：监控准确率变化
4. **增量训练**：持续添加新的训练数据

### 自动训练配置
```bash
# 配置自动训练参数
POST /api/mode/config
Authorization: Bearer <your-token>

{
  "config": {
    "autoTraining": true,
    "minTrainingExamples": 50,
    "trainingInterval": 86400000,  // 24小时
    "dataRetentionDays": 90
  }
}
```

### 模型性能监控
```bash
# 评估模型性能
POST /api/tenant/models/rule-engine/evaluate
Authorization: Bearer <your-token>

{
  "testData": [
    {"text": "账户问题", "category": "support"},
    {"text": "产品咨询", "category": "sales"}
  ]
}

# 响应
{
  "evaluation": {
    "accuracy": 0.85,
    "correct": 17,
    "total": 20,
    "summary": {
      "byCategory": {
        "support": {"accuracy": 0.9},
        "sales": {"accuracy": 0.8}
      }
    }
  }
}
```

## 🚨 故障排除

### 常见问题

1. **无法切换到训练模式**
   - 检查订阅计划是否支持训练功能
   - 验证租户权限配置

2. **自定义模型效果不佳**
   - 增加训练数据数量
   - 检查训练数据质量
   - 考虑重新训练模型

3. **分类准确率下降**
   - 查看最近的数据质量
   - 检查是否需要模型更新
   - 分析错误分类案例

### 调试命令
```bash
# 检查系统健康状态
GET /api/smart-classify/health

# 查看模式切换历史
GET /api/mode/history

# 获取分类策略信息
GET /api/smart-classify/strategy

# 获取改进建议
GET /api/smart-classify/suggestions
```

## 📞 技术支持

如果在使用过程中遇到问题，请联系我们的技术支持团队：

- 📧 Email: support@example.com
- 💬 在线客服：[客服链接]
- 📚 技术文档：[文档链接]
- 🎫 提交工单：[工单系统]

---

通过合理使用双模式AI系统，您可以在隐私保护和个性化服务之间找到最佳平衡点，获得最符合需求的AI体验。 