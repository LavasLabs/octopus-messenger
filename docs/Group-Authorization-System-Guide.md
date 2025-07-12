# 群组权限系统指南

## 概述

群组权限系统是Octopus Messenger的核心安全功能，为商户提供完整的群组访问控制能力。系统支持多种权限策略，确保Bot只在授权的群组中提供服务，有效防止滥用和保护商户资源。

## 🔐 核心功能

### 权限策略类型

| 策略类型 | 说明 | 适用场景 |
|---------|------|----------|
| **开放模式** (open) | 任何群组都可以使用 | 公开服务、营销推广 |
| **白名单模式** (whitelist) | 只有预设群组可以使用 | 内部服务、VIP客户 |
| **黑名单模式** (blacklist) | 禁止特定群组使用 | 排除问题群组 |
| **审批模式** (approval) | 需要管理员审批 | 企业客户、付费服务 |

### 权限控制维度

#### 1. 群组限制
- **最大群组数** - 限制Bot可以加入的群组总数
- **群组类型** - 限制允许的群组类型（普通群组、频道、超级群组等）
- **成员数限制** - 限制群组最大成员数
- **地域限制** - 限制特定地区的群组

#### 2. 使用配额
- **消息配额** - 每个群组的消息发送限制
- **配额周期** - 配额重置周期（日、周、月）
- **配额预警** - 配额使用率达到90%时发送警告

#### 3. 时间限制
- **服务时间** - 限制Bot的工作时间
- **时区支持** - 支持不同时区的时间设置

## 🚀 快速开始

### 1. 设置Bot权限策略

```bash
# 通过API设置权限策略
curl -X PUT "/api/groups/policies/{botConfigId}" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "policy_type": "approval",
    "auto_approve": false,
    "max_groups": 100,
    "max_members_per_group": 500,
    "default_message_quota": 1000,
    "quota_reset_period": "monthly",
    "require_admin_invite": true
  }'
```

### 2. 配置权限规则

```javascript
// 添加关键词过滤规则
const keywordRule = {
  rule_name: "禁止测试群组",
  rule_type: "keyword",
  conditions: {
    keywords: ["test", "测试", "demo"],
    match_type: "contains"
  },
  action: "deny",
  priority: 10
};

// 添加成员数限制规则
const memberCountRule = {
  rule_name: "小群组优先",
  rule_type: "member_count",
  conditions: {
    max_members: 100
  },
  action: "allow",
  priority: 5
};
```

### 3. 监控群组状态

```bash
# 获取群组列表
curl -X GET "/api/groups?status=pending" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 获取群组详情
curl -X GET "/api/groups/{groupId}" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 获取统计概览
curl -X GET "/api/groups/stats/overview" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📝 API 使用指南

### 权限检查API

#### 检查群组权限
```http
POST /api/groups/check-permission
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "botConfigId": "bot-123",
  "platformGroupId": "group-456",
  "groupName": "客户服务群",
  "groupType": "group",
  "memberCount": 50,
  "invitedByUserId": "user-789",
  "invitedByUsername": "admin",
  "platform": "telegram"
}
```

**响应示例：**
```json
{
  "allowed": true,
  "reason": "Group approved by policy",
  "requiresApproval": false,
  "pendingApproval": false
}
```

### 群组管理API

#### 获取群组列表
```http
GET /api/groups?page=1&limit=20&status=pending
Authorization: Bearer YOUR_TOKEN
```

#### 批准群组请求
```http
POST /api/groups/{groupId}/approve
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "reason": "经审核，该群组符合使用条件"
}
```

#### 拒绝群组请求
```http
POST /api/groups/{groupId}/reject
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "reason": "群组类型不符合要求"
}
```

#### 更新群组配额
```http
PUT /api/groups/{groupId}/quota
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "messageQuota": 2000,
  "resetUsage": true
}
```

### 策略管理API

#### 获取Bot权限策略
```http
GET /api/groups/policies/{botConfigId}
Authorization: Bearer YOUR_TOKEN
```

#### 更新Bot权限策略
```http
PUT /api/groups/policies/{botConfigId}
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "policy_type": "approval",
  "auto_approve": false,
  "max_groups": 100,
  "max_members_per_group": 500,
  "default_message_quota": 1000,
  "quota_reset_period": "monthly",
  "service_hours": {
    "enabled": true,
    "start": "09:00",
    "end": "18:00",
    "timezone": "Asia/Shanghai"
  },
  "notifications": {
    "new_group_request": true,
    "quota_warning": true,
    "policy_violation": true
  }
}
```

## 🔧 配置详解

### 权限策略配置

#### 开放模式配置
```json
{
  "policy_type": "open",
  "auto_approve": true,
  "max_groups": 1000,
  "max_members_per_group": 1000,
  "default_message_quota": 5000,
  "quota_reset_period": "monthly"
}
```

#### 白名单模式配置
```json
{
  "policy_type": "whitelist",
  "auto_approve": true,
  "max_groups": 50,
  "max_members_per_group": 200,
  "default_message_quota": 2000,
  "require_admin_invite": true
}
```

#### 审批模式配置
```json
{
  "policy_type": "approval",
  "auto_approve": false,
  "max_groups": 100,
  "max_members_per_group": 500,
  "default_message_quota": 1000,
  "require_admin_invite": true,
  "notifications": {
    "new_group_request": true,
    "quota_warning": true
  }
}
```

### 权限规则配置

#### 关键词规则
```json
{
  "rule_name": "禁止垃圾群组",
  "rule_type": "keyword",
  "conditions": {
    "keywords": ["spam", "垃圾", "广告"],
    "match_type": "contains"
  },
  "action": "deny",
  "priority": 10
}
```

#### 正则表达式规则
```json
{
  "rule_name": "允许公司群组",
  "rule_type": "regex",
  "conditions": {
    "patterns": ["^公司.*群$", "^.*部门.*$"]
  },
  "action": "allow",
  "priority": 8
}
```

#### 成员数规则
```json
{
  "rule_name": "中型群组",
  "rule_type": "member_count",
  "conditions": {
    "min_members": 10,
    "max_members": 100
  },
  "action": "allow",
  "priority": 5
}
```

## 📊 监控和分析

### 统计指标

#### 群组概览
```json
{
  "total_groups": 150,
  "approved_groups": 120,
  "pending_groups": 20,
  "rejected_groups": 8,
  "suspended_groups": 2,
  "active_groups": 95,
  "total_messages": 45000,
  "avg_members_per_group": 35.5
}
```

#### 平台分布
```json
{
  "platformStats": [
    {
      "platform": "telegram",
      "group_count": 80,
      "approved_count": 70,
      "total_messages": 25000
    },
    {
      "platform": "discord",
      "group_count": 45,
      "approved_count": 35,
      "total_messages": 15000
    }
  ]
}
```

#### 使用趋势
```json
{
  "activityTrends": [
    {
      "date": "2024-02-20",
      "message_count": 1500,
      "active_users": 245,
      "active_groups": 35
    }
  ]
}
```

### 告警配置

#### 配额告警
```json
{
  "quota_warning": {
    "enabled": true,
    "threshold": 90,
    "channels": ["email", "webhook"]
  }
}
```

#### 违规告警
```json
{
  "policy_violation": {
    "enabled": true,
    "severity": "high",
    "auto_suspend": false
  }
}
```

## 🎯 使用场景

### 1. 企业内部服务
```json
{
  "policy_type": "whitelist",
  "auto_approve": true,
  "require_admin_invite": true,
  "allowed_group_types": ["group", "supergroup"],
  "max_members_per_group": 200,
  "service_hours": {
    "enabled": true,
    "start": "09:00",
    "end": "18:00",
    "timezone": "Asia/Shanghai"
  }
}
```

### 2. 公开客服服务
```json
{
  "policy_type": "blacklist",
  "auto_approve": true,
  "max_groups": 1000,
  "max_members_per_group": 500,
  "default_message_quota": 2000,
  "content_filters": {
    "spam_detection": true,
    "adult_content": true
  }
}
```

### 3. 付费VIP服务
```json
{
  "policy_type": "approval",
  "auto_approve": false,
  "max_groups": 50,
  "max_members_per_group": 100,
  "default_message_quota": 5000,
  "require_admin_invite": true,
  "premium_features": {
    "priority_support": true,
    "custom_responses": true
  }
}
```

## 🛠️ 集成步骤

### 1. 数据库初始化
```bash
# 运行群组权限系统迁移
psql -d octopus_messenger -f database/migrations/005_add_group_authorization_system.sql
```

### 2. 环境变量配置
```bash
# 群组权限系统配置
GROUP_AUTH_ENABLED=true
GROUP_AUTH_DEFAULT_POLICY=approval
GROUP_AUTH_MAX_GROUPS=100
GROUP_AUTH_DEFAULT_QUOTA=1000
GROUP_AUTH_QUOTA_RESET_PERIOD=monthly

# 通知配置
NOTIFICATION_EMAIL_ENABLED=true
NOTIFICATION_WEBHOOK_URL=https://your-webhook-url.com
```

### 3. Bot配置更新
```javascript
// 在Bot配置中启用群组权限检查
const botConfig = {
  // ... 其他配置
  groupAuthEnabled: true,
  gatewayUrl: 'https://your-gateway.com',
  authToken: 'your-auth-token'
};
```

### 4. 启动服务
```bash
# 启动Gateway服务
cd services/gateway
npm install
npm start

# 启动Bot Manager服务
cd services/bot-manager
npm install
npm start
```

## 🔍 故障排除

### 常见问题

#### 1. 权限检查失败
```json
{
  "error": "Permission check failed",
  "solution": "检查Gateway服务是否运行，网络连接是否正常"
}
```

#### 2. 配额超限
```json
{
  "error": "Message quota exceeded",
  "solution": "增加群组配额或等待配额重置"
}
```

#### 3. 权限规则冲突
```json
{
  "error": "Conflicting permission rules",
  "solution": "检查规则优先级，确保高优先级规则在前"
}
```

### 调试工具

#### 查看权限检查日志
```bash
# 查看Gateway日志
docker logs gateway-service | grep "group permission"

# 查看Bot Manager日志
docker logs bot-manager-service | grep "group auth"
```

#### 测试权限规则
```bash
# 使用API测试权限检查
curl -X POST "/api/groups/check-permission" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "botConfigId": "test-bot",
    "platformGroupId": "test-group",
    "groupName": "测试群组",
    "groupType": "group",
    "memberCount": 50
  }'
```

## 📚 最佳实践

### 1. 权限策略设计
- **渐进式开放** - 从严格的审批模式开始，逐步放宽限制
- **分层管理** - 不同Bot使用不同的权限策略
- **定期审查** - 定期检查和更新权限规则

### 2. 配额管理
- **合理设置** - 根据业务需求设置合理的配额
- **监控告警** - 设置配额使用率告警
- **弹性调整** - 根据使用情况动态调整配额

### 3. 安全防护
- **多重验证** - 结合多种规则类型进行验证
- **日志记录** - 详细记录所有权限相关操作
- **异常处理** - 对权限检查失败的情况进行适当处理

### 4. 用户体验
- **友好提示** - 权限被拒绝时提供清晰的说明
- **快速审批** - 建立高效的审批流程
- **透明沟通** - 让用户了解权限规则和限制

## 🔒 安全考虑

### 权限控制
- **最小权限原则** - 只授予必要的权限
- **定期审查** - 定期检查权限设置
- **访问日志** - 记录所有权限相关操作

### 数据保护
- **数据加密** - 敏感数据加密存储
- **访问控制** - 严格的数据访问权限
- **数据备份** - 定期备份权限配置数据

### 合规要求
- **隐私保护** - 遵守数据隐私法规
- **审计跟踪** - 完整的操作审计记录
- **数据保留** - 合理的数据保留策略

## 📞 技术支持

如有问题，请联系：
- 📧 Email: support@octopus-messenger.com
- 📚 文档: [技术文档](https://docs.octopus-messenger.com)
- 💬 社区: [开发者社区](https://community.octopus-messenger.com)

---

*该指南将持续更新，请关注最新版本以获取最新功能和最佳实践。* 