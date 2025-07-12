# 用户标签系统指南

## 概述

用户标签系统是Octopus Messenger的核心分析功能，为商户提供强大的客户洞察能力。系统会自动分析用户行为、沟通特征和价值特性，生成智能标签，帮助商户更好地了解和服务客户。

## 核心功能

### 🏷️ 智能标签系统

#### 标签类型

| 分类 | 说明 | 示例标签 |
|------|------|----------|
| **行为特征** | 基于用户行为模式 | 重度用户、爱提问、快速回复 |
| **生命周期** | 用户状态和阶段 | 新用户、活跃用户、沉睡用户 |
| **价值特征** | 商业价值评估 | VIP用户、高价值、潜在客户 |
| **沟通特征** | 沟通风格和习惯 | 礼貌用户、表情达人、正式沟通 |
| **满意度** | 服务体验评价 | 满意客户、投诉用户、品牌拥护者 |
| **人口统计** | 用户基础信息 | 年龄段、性别、地域 |
| **技术特征** | 设备和平台使用 | 移动用户、多平台用户 |
| **自定义** | 商户个性化标签 | 根据业务需求自定义 |

#### 标签来源

- **AI自动生成** - 基于机器学习的智能标签
- **行为分析** - 基于用户行为模式的自动标签
- **手动添加** - 客服人员手动添加的标签
- **API导入** - 通过API批量导入的标签

### 📊 用户档案系统

#### 用户档案包含

```json
{
  "基础信息": {
    "user_identifier": "用户标识符",
    "display_name": "显示名称",
    "email": "邮箱",
    "phone": "电话"
  },
  "行为特征": {
    "total_messages": "总消息数",
    "total_conversations": "总对话数",
    "avg_response_time": "平均响应时间",
    "active_hours": "活跃时间段",
    "preferred_platforms": "偏好平台"
  },
  "沟通特征": {
    "communication_style": "沟通风格",
    "message_length_avg": "平均消息长度",
    "question_frequency": "问题频率",
    "politeness_score": "礼貌度评分"
  },
  "满意度指标": {
    "overall_sentiment": "整体情感倾向",
    "satisfaction_score": "满意度评分",
    "complaint_count": "投诉次数",
    "compliment_count": "表扬次数"
  },
  "价值特征": {
    "estimated_value_tier": "估计价值层级",
    "purchase_indicators": "购买意图指标",
    "support_cost_estimate": "支持成本估计"
  }
}
```

### 🔄 自动标签生成

#### 规则引擎

系统内置多种自动标签规则：

1. **阈值规则** - 基于数值阈值
   ```json
   {
     "rule_type": "threshold",
     "conditions": {
       "field": "total_messages",
       "operator": ">",
       "value": 100
     },
     "tag": "heavy_user",
     "confidence": 0.9
   }
   ```

2. **行为规则** - 基于行为模式
   ```json
   {
     "rule_type": "behavior",
     "conditions": {
       "conditions": [
         {"field": "question_frequency", "operator": ">", "value": 2.0},
         {"field": "politeness_score", "operator": ">", "value": 0.8}
       ],
       "logic": "AND"
     },
     "tag": "polite_questioner",
     "confidence": 0.85
   }
   ```

3. **关键词规则** - 基于消息内容
   ```json
   {
     "rule_type": "keyword",
     "conditions": {
       "keywords": ["投诉", "不满", "问题"],
       "threshold": 2,
       "window": "7_days"
     },
     "tag": "dissatisfied_customer",
     "confidence": 0.8
   }
   ```

## API 使用指南

### 获取用户档案列表

```bash
GET /api/user-analytics/profiles
```

**参数:**
- `page` - 页码（默认1）
- `limit` - 每页数量（默认20）
- `tag` - 按标签筛选
- `value_tier` - 按价值层级筛选（vip, high, medium, low）
- `activity` - 按活跃度筛选（active, dormant, new）
- `search` - 搜索关键词
- `sort_by` - 排序字段（last_seen_at, total_messages, satisfaction_score）
- `sort_order` - 排序方向（asc, desc）

**响应示例:**
```json
{
  "users": [
    {
      "id": "user_123",
      "user_identifier": "user@example.com",
      "display_name": "张三",
      "estimated_value_tier": "vip",
      "total_messages": 156,
      "satisfaction_score": 0.92,
      "activity_status": "active",
      "days_since_last_seen": 1,
      "tags": [
        {
          "tag_name": "vip_user",
          "display_name": "VIP用户",
          "category": "value",
          "confidence": 0.95,
          "source": "auto_behavior"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 获取用户详细档案

```bash
GET /api/user-analytics/profiles/{profileId}
```

**响应示例:**
```json
{
  "profile": {
    "id": "user_123",
    "user_identifier": "user@example.com",
    "display_name": "张三",
    "total_messages": 156,
    "total_conversations": 23,
    "satisfaction_score": 0.92,
    "overall_sentiment": 0.65,
    "politeness_score": 0.88,
    "first_seen_at": "2024-01-15T10:00:00Z",
    "last_seen_at": "2024-02-20T15:30:00Z",
    "estimated_value_tier": "vip",
    "communication_style": "polite",
    "preferred_platforms": ["intercom", "wechat"]
  },
  "tags": [
    {
      "tag_name": "vip_user",
      "display_name": "VIP用户",
      "category": "value",
      "confidence": 0.95,
      "source": "auto_behavior",
      "created_at": "2024-02-10T12:00:00Z"
    }
  ],
  "recentEvents": [
    {
      "event_type": "message_sent",
      "event_category": "communication",
      "platform": "intercom",
      "sentiment_score": 0.8,
      "event_timestamp": "2024-02-20T15:30:00Z"
    }
  ]
}
```

### 生成分析报告

```bash
GET /api/user-analytics/reports/summary
```

**参数:**
- `period` - 报告周期（daily, weekly, monthly）
- `startDate` - 开始日期
- `endDate` - 结束日期

**响应示例:**
```json
{
  "period": "monthly",
  "startDate": "2024-01-20",
  "endDate": "2024-02-20",
  "summary": {
    "total_users": 1250,
    "new_users": 185,
    "active_last_7_days": 450,
    "active_last_30_days": 820,
    "vip_users": 65,
    "avg_messages_per_user": 23.5,
    "avg_satisfaction": 0.76,
    "avg_sentiment": 0.32,
    "active_rate_7_days": 0.36,
    "active_rate_30_days": 0.66
  },
  "platformDistribution": [
    {"platform": "intercom", "user_count": 450},
    {"platform": "wechat", "user_count": 380},
    {"platform": "slack", "user_count": 250}
  ],
  "topTags": [
    {
      "name": "active_user",
      "display_name": "活跃用户",
      "category": "behavior",
      "usage_count": 450
    }
  ],
  "recommendations": [
    {
      "type": "engagement",
      "priority": "high",
      "title": "用户活跃度偏低",
      "description": "当前7天活跃率仅为36%，建议制定用户激活策略",
      "actionItems": [
        "分析沉睡用户特征，制定唤醒策略",
        "优化产品体验，提高用户粘性"
      ]
    }
  ]
}
```

### 手动添加标签

```bash
POST /api/user-analytics/profiles/{profileId}/tags
```

**请求体:**
```json
{
  "tagId": "tag_def_123",
  "confidence": 0.9,
  "reason": "客服人员手动添加：该用户是重要客户"
}
```

### 获取标签统计

```bash
GET /api/user-analytics/tags
```

**响应示例:**
```json
{
  "tags": [
    {
      "id": "tag_123",
      "name": "vip_user",
      "display_name": "VIP用户",
      "category": "value",
      "usage_count": 65,
      "avg_confidence": 0.89,
      "ai_generated_count": 45,
      "manual_count": 20
    }
  ],
  "categories": [
    {
      "category": "value",
      "total_tags": 5,
      "total_usage": 185,
      "tags": [...]
    }
  ],
  "totalTags": 25,
  "totalUsage": 1250
}
```

## 集成步骤

### 1. 数据库初始化

```bash
# 运行数据库迁移
psql -h localhost -U postgres -d octopus_messenger -f database/migrations/004_add_user_tagging_system.sql
```

### 2. 配置AI服务

在`config/config.js`中添加用户标签配置：

```javascript
userTagging: {
  enabled: true,
  autoTagging: {
    enabled: true,
    minConfidence: 0.7,
    batchSize: 100
  },
  behaviorAnalysis: {
    enabled: true,
    analysisWindow: 30, // 天
    minEventCount: 5
  },
  privacy: {
    anonymizeUsers: true,
    dataRetentionDays: 365
  }
}
```

### 3. 启动服务

```bash
# 启动AI服务（包含用户标签服务）
cd services/ai-service
npm install
npm start

# 启动Gateway
cd services/gateway
npm install
npm start
```

### 4. 集成消息处理

在消息处理流程中添加用户分析：

```javascript
// 在消息处理器中
const UserTaggingService = require('./services/UserTaggingService');
const taggingService = new UserTaggingService(dbManager);

// 处理新消息时
await taggingService.analyzeUserMessage({
  tenantId: message.tenantId,
  senderId: message.senderId,
  senderName: message.senderName,
  content: message.content,
  platform: message.platform,
  conversationId: message.conversationId,
  timestamp: message.timestamp
});
```

## 最佳实践

### 1. 标签管理

- **避免标签泛滥** - 控制标签数量，聚焦核心特征
- **定期审查标签** - 清理无效或过时的标签
- **统一命名规范** - 使用清晰、一致的标签命名
- **设置权限管理** - 控制标签的创建和修改权限

### 2. 隐私保护

- **数据最小化** - 只收集必要的用户信息
- **匿名化处理** - 对敏感信息进行脱敏处理
- **用户同意** - 在收集数据前获取用户同意
- **数据保留政策** - 设置合理的数据保留期限

### 3. 性能优化

- **批量处理** - 使用批量处理提高效率
- **异步分析** - 将重计算任务放在后台处理
- **缓存策略** - 缓存常用的分析结果
- **数据分区** - 对大数据表进行分区管理

### 4. 监控和告警

- **标签质量监控** - 监控标签的准确性和有效性
- **性能监控** - 监控系统响应时间和资源使用
- **异常检测** - 识别异常的用户行为模式
- **定期报告** - 生成定期的分析报告

## 业务价值

### 1. 客户洞察

- **360度用户画像** - 全面了解用户特征和行为
- **细分用户群体** - 基于标签进行精准用户分群
- **预测用户需求** - 基于历史行为预测未来需求
- **个性化服务** - 根据用户特征提供个性化服务

### 2. 运营优化

- **提升客服效率** - 通过用户标签优化客服分配
- **降低服务成本** - 识别高成本用户并优化服务策略
- **提高满意度** - 基于用户反馈优化服务质量
- **增强用户粘性** - 通过个性化体验提高用户留存

### 3. 商业决策

- **市场分析** - 了解用户群体特征和市场趋势
- **产品优化** - 基于用户反馈优化产品功能
- **营销策略** - 制定精准的营销和推广策略
- **风险管理** - 识别潜在的客户流失风险

## 常见问题

### Q: 如何确保标签的准确性？
A: 系统提供多种机制保证标签准确性：
- **置信度评分** - 每个标签都有置信度分数
- **多源验证** - 结合AI和人工验证
- **反馈机制** - 支持人工修正和验证
- **持续学习** - 系统会根据反馈不断优化

### Q: 如何处理用户隐私？
A: 系统内置多层隐私保护：
- **数据脱敏** - 自动对敏感信息进行脱敏处理
- **权限控制** - 严格的数据访问权限管理
- **数据加密** - 存储和传输时进行加密
- **合规支持** - 支持GDPR等隐私法规要求

### Q: 系统性能如何？
A: 系统经过优化，具有良好的性能：
- **实时处理** - 支持实时的用户行为分析
- **批量处理** - 支持大量用户的批量分析
- **横向扩展** - 支持分布式部署和横向扩展
- **缓存优化** - 多级缓存提高响应速度

### Q: 如何自定义标签？
A: 系统提供灵活的标签自定义功能：
- **标签定义** - 可以创建自定义标签类型
- **规则配置** - 可以配置自动标签应用规则
- **API支持** - 支持通过API批量管理标签
- **权限管理** - 支持细粒度的标签管理权限

## 技术支持

如有技术问题，请联系：
- 📧 Email: support@octopus-messenger.com
- 📚 文档: [技术文档](https://docs.octopus-messenger.com)
- 💬 社区: [开发者社区](https://community.octopus-messenger.com)

---

*该指南将持续更新，请关注最新版本以获取最新功能和最佳实践。* 