# 租户模型管理指南

## 概述

租户模型管理系统提供了完整的多租户AI模型隔离方案，确保每个租户的数据和模型完全分离，避免数据泄露（串稿）问题，同时支持本地模型训练。

## 🔒 租户隔离特性

### 1. 数据隔离
- **物理隔离**: 每个租户的模型文件存储在独立目录
- **数据库隔离**: 租户ID作为强制过滤条件
- **缓存隔离**: 使用租户前缀的缓存键
- **访问控制**: 严格的租户权限验证

### 2. 模型隔离
- **独立训练**: 每个租户使用自己的训练数据
- **版本管理**: 支持模型版本控制和回滚
- **性能隔离**: 租户间模型互不影响
- **存储隔离**: 模型文件完全分离

## 🚀 快速开始

### 1. 训练租户专用模型

```bash
# 训练规则引擎模型
POST /api/tenant/models/train
Authorization: Bearer <token>
Content-Type: application/json

{
  "modelType": "rule-engine",
  "examples": [
    {
      "text": "我需要技术支持",
      "category": "support"
    },
    {
      "text": "想了解产品价格",
      "category": "sales"
    },
    {
      "text": "对服务不满意",
      "category": "complaint"
    }
  ],
  "options": {
    "priority": "high",
    "description": "客服分类模型v1"
  }
}
```

### 2. 使用租户模型预测

```bash
# 单个预测
POST /api/tenant/models/rule-engine/predict
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "产品出现故障，需要维修"
}

# 响应
{
  "success": true,
  "prediction": {
    "category": "support",
    "confidence": 0.89,
    "rule": "tenant_rule_support_1234567890",
    "modelType": "rule-engine"
  },
  "predictionTime": 15,
  "tenantId": "tenant_001"
}
```

### 3. 批量预测

```bash
POST /api/tenant/models/rule-engine/predict/batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "texts": [
    "需要技术支持",
    "想购买产品",
    "服务很差"
  ]
}
```

## 📊 支持的模型类型

### 1. 规则引擎模型 (rule-engine)
基于关键词和模式匹配的分类器，适合快速部署和明确规则的场景。

**特点**:
- 🚀 训练速度快
- 🔍 可解释性强
- 📝 支持自定义规则
- 💡 适合业务逻辑明确的场景

**示例**:
```json
{
  "modelType": "rule-engine",
  "examples": [
    {"text": "退款申请", "category": "refund"},
    {"text": "账户登录问题", "category": "technical"},
    {"text": "产品咨询", "category": "sales"}
  ]
}
```

### 2. 朴素贝叶斯分类器 (local-classifier)
基于概率的文本分类器，适合中等规模的文本分类任务。

**特点**:
- 🎯 准确率较高
- 📊 支持概率输出
- 🔄 支持增量学习
- 💻 纯本地计算

**示例**:
```json
{
  "modelType": "local-classifier",
  "examples": [
    {"text": "账单有误，请核查", "category": "billing"},
    {"text": "网站打不开", "category": "technical"},
    {"text": "想要退订服务", "category": "cancellation"}
  ]
}
```

### 3. TF-IDF相似度模型 (embedding-model)
基于词频-逆文档频率的文本相似度匹配。

**特点**:
- 🔍 相似度匹配
- 📐 向量化表示
- 🎯 适合语义相似任务
- 🧠 支持语义理解

**示例**:
```json
{
  "modelType": "embedding-model",
  "examples": [
    {"text": "密码忘记了怎么办", "category": "password"},
    {"text": "无法登录账户", "category": "login"},
    {"text": "找回密码", "category": "password"}
  ]
}
```

## 🔧 高级功能

### 1. 增量训练

```bash
# 添加新的训练数据并重新训练
POST /api/tenant/models/rule-engine/incremental-train
Authorization: Bearer <token>
Content-Type: application/json

{
  "examples": [
    {"text": "发票申请", "category": "billing"},
    {"text": "合同咨询", "category": "legal"}
  ],
  "retrain": true
}
```

### 2. 模型比较

```bash
# 比较多个模型的预测结果
POST /api/tenant/models/compare
Authorization: Bearer <token>
Content-Type: application/json

{
  "modelTypes": ["rule-engine", "local-classifier", "embedding-model"],
  "text": "需要技术支持帮助"
}

# 响应
{
  "success": true,
  "comparisons": {
    "rule-engine": {
      "category": "support",
      "confidence": 0.89
    },
    "local-classifier": {
      "category": "support", 
      "confidence": 0.76
    },
    "embedding-model": {
      "category": "support",
      "confidence": 0.82
    }
  }
}
```

### 3. 模型评估

```bash
# 评估模型性能
POST /api/tenant/models/rule-engine/evaluate
Authorization: Bearer <token>
Content-Type: application/json

{
  "testData": [
    {"text": "网站崩溃了", "category": "technical"},
    {"text": "想买VIP会员", "category": "sales"},
    {"text": "服务态度差", "category": "complaint"}
  ]
}

# 响应
{
  "success": true,
  "evaluation": {
    "accuracy": 0.85,
    "correct": 17,
    "total": 20,
    "summary": {
      "byCategory": {
        "technical": {"accuracy": 0.9, "correct": 9, "total": 10},
        "sales": {"accuracy": 0.8, "correct": 4, "total": 5},
        "complaint": {"accuracy": 0.8, "correct": 4, "total": 5}
      }
    }
  }
}
```

### 4. 模型导出导入

```bash
# 导出模型
GET /api/tenant/models/rule-engine/export
Authorization: Bearer <token>

# 导入模型
POST /api/tenant/models/rule-engine/import
Authorization: Bearer <token>
Content-Type: application/json

{
  "modelData": {
    "tenantId": "tenant_source",
    "model": {...},
    "metadata": {...}
  }
}
```

## 📈 模型管理

### 1. 查看模型列表

```bash
GET /api/tenant/models
Authorization: Bearer <token>

# 响应
{
  "success": true,
  "models": [
    {
      "modelType": "rule-engine",
      "version": 2,
      "metrics": {
        "accuracy": 0.85,
        "trainingTime": 1500
      },
      "createdAt": "2024-01-01T10:00:00Z"
    }
  ]
}
```

### 2. 获取训练数据

```bash
GET /api/tenant/training-data/rule-engine?limit=50&offset=0
Authorization: Bearer <token>

# 响应
{
  "success": true,
  "trainingData": [...],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

### 3. 租户统计

```bash
GET /api/tenant/stats
Authorization: Bearer <token>

# 响应
{
  "success": true,
  "stats": {
    "models": {
      "total": 3,
      "byType": {
        "rule-engine": 1,
        "local-classifier": 1,
        "embedding-model": 1
      }
    },
    "training": {
      "totalExamples": 250,
      "sessions": 5
    },
    "predictions": {
      "total_predictions": 1000,
      "avg_confidence": 0.78
    }
  }
}
```

## 🛡️ 安全和隔离

### 租户数据隔离机制

1. **数据库级隔离**
   ```sql
   -- 所有查询都包含租户ID过滤
   SELECT * FROM tenant_models WHERE tenant_id = 'tenant_001';
   SELECT * FROM tenant_training_data WHERE tenant_id = 'tenant_001';
   ```

2. **文件系统隔离**
   ```
   models/
   ├── tenant_001/
   │   ├── rule-engine/
   │   │   └── v1/model.json
   │   └── local-classifier/
   │       └── v1/model.json
   └── tenant_002/
       ├── rule-engine/
       │   └── v1/model.json
       └── embedding-model/
           └── v1/model.json
   ```

3. **缓存隔离**
   ```javascript
   // 缓存键包含租户ID
   const cacheKey = `ai:model:${tenantId}:${modelType}`;
   const trainingKey = `ai:training:${tenantId}:${modelType}`;
   ```

4. **API访问控制**
   ```javascript
   // 中间件强制验证租户权限
   requireTenant(req, res, next) {
     if (!req.user.tenantId) {
       return res.status(400).json({error: 'Tenant ID required'});
     }
     req.tenantId = req.user.tenantId;
   }
   ```

## 🔄 最佳实践

### 1. 训练数据管理
- **数据质量**: 确保训练数据质量和标注准确性
- **数据平衡**: 各类别样本数量相对均衡
- **增量更新**: 定期添加新的训练数据
- **版本控制**: 保留训练数据的版本历史

### 2. 模型选择指南
- **规则引擎**: 适用于规则明确、需要快速部署的场景
- **朴素贝叶斯**: 适用于中等规模、需要概率输出的场景
- **TF-IDF**: 适用于语义相似度匹配的场景

### 3. 性能优化
- **缓存策略**: 合理设置缓存过期时间
- **批量处理**: 使用批量预测提高效率
- **模型评估**: 定期评估模型性能
- **清理策略**: 定期清理旧版本模型

### 4. 监控告警
- **准确率监控**: 监控模型预测准确率
- **性能监控**: 监控预测响应时间
- **存储监控**: 监控模型文件存储使用情况
- **错误监控**: 监控训练和预测错误

## 🚀 部署和运维

### 1. 环境配置
```bash
# 环境变量配置
AI_MODELS_PATH=/app/models
AI_CACHE_TTL=3600
AI_MAX_TRAINING_EXAMPLES=10000
```

### 2. 数据库迁移
```bash
# 执行租户模型相关的数据库迁移
psql -d your_database -f database/migrations/003_add_tenant_models.sql
```

### 3. 定期维护
```sql
-- 清理旧模型（保留30天）
SELECT cleanup_old_tenant_models(30);

-- 查看租户模型统计
SELECT * FROM tenant_model_stats WHERE tenant_id = 'your_tenant_id';
```

## 🔍 故障排除

### 常见问题

1. **模型训练失败**
   - 检查训练数据格式
   - 验证类别数量（至少2个）
   - 确保每个类别至少3个样本

2. **预测结果不准确**
   - 增加训练数据
   - 检查数据质量
   - 考虑使用不同的模型类型

3. **租户数据混淆**
   - 检查JWT令牌中的租户ID
   - 验证API调用的认证头
   - 检查数据库查询的租户过滤条件

4. **性能问题**
   - 启用缓存
   - 优化训练数据大小
   - 使用批量预测接口

通过这个租户模型管理系统，您可以实现完全的多租户AI模型隔离，确保数据安全的同时提供强大的本地训练能力。 