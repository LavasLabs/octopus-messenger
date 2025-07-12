# Octopus Messenger 用户指南

## 快速开始

### 1. 账户注册

1. 访问管理面板：`https://admin.your-domain.com`
2. 点击"注册"按钮
3. 填写以下信息：
   - 用户名
   - 邮箱地址
   - 密码
   - 全名
   - 公司名称
   - 公司标识符（英文，用于子域名）

### 2. 登录系统

使用注册的邮箱和密码登录管理面板。

## Bot配置

### 配置流程概述

```mermaid
graph LR
    A[创建平台Bot] --> B[获取Token/密钥]
    B --> C[在系统中添加Bot]
    C --> D[配置Webhook]
    D --> E[测试连接]
    E --> F[开始使用]
```

### Telegram Bot配置

#### 1. 创建Telegram Bot

1. 打开Telegram，搜索 `@BotFather`
2. 发送 `/newbot` 创建新bot
3. 按提示设置bot名称和用户名
4. 保存获得的Bot Token

#### 2. 在系统中配置

1. 登录管理面板
2. 导航到 "Bot管理" → "添加Bot"
3. 填写配置信息：

```json
{
  "name": "我的客服Bot",
  "platform": "telegram",
  "botToken": "1234567890:ABCdefGHIjklMNOpqrSTUVwxyz",
  "settings": {
    "autoReply": true,
    "language": "zh-CN",
    "welcomeMessage": "您好！欢迎使用我们的客服服务！"
  }
}
```

### WhatsApp Bot配置

#### 1. 申请WhatsApp Business API

1. 访问 [Meta for Developers](https://developers.facebook.com/)
2. 创建Business类型应用
3. 添加WhatsApp产品
4. 完成电话号码验证

#### 2. 在系统中配置

```json
{
  "name": "WhatsApp客服",
  "platform": "whatsapp",
  "botToken": "your-access-token",
  "phoneNumberId": "your-phone-number-id",
  "settings": {
    "businessHours": {
      "enabled": true,
      "start": "09:00",
      "end": "18:00"
    }
  }
}
```

### Slack Bot配置

#### 1. 创建Slack应用

1. 访问 [Slack API](https://api.slack.com/apps)
2. 创建新应用
3. 配置Bot权限
4. 安装到工作区

#### 2. 在系统中配置

```json
{
  "name": "Slack助手",
  "platform": "slack",
  "botToken": "xoxb-your-bot-token",
  "settings": {
    "channels": ["general", "support"],
    "dmEnabled": true
  }
}
```

## 消息管理

### 查看消息

1. 导航到 "消息管理"
2. 可以按以下条件筛选：
   - 平台（Telegram、WhatsApp、Slack）
   - 消息类型（文本、图片、文档等）
   - 时间范围
   - 分类状态

### 消息分类

系统会自动使用AI对收到的消息进行分类：

- **技术支持**：包含bug、错误、故障等关键词
- **销售咨询**：包含价格、购买、方案等关键词
- **投诉建议**：包含投诉、建议、不满等关键词
- **其他**：无法自动分类的消息

### 手动重新分类

1. 选择要重新分类的消息
2. 点击"重新分类"按钮
3. 选择AI模型（GPT-4或Claude）
4. 确认分类结果

## 任务管理

### 自动任务创建

当消息被分类后，系统会自动：

1. 根据分类规则创建相应任务
2. 分配给指定负责人
3. 设置优先级和截止时间
4. 在Lark中同步创建任务

### 任务状态

- **待处理**：新创建的任务
- **处理中**：已分配并开始处理
- **已完成**：任务处理完成
- **已取消**：任务被取消

### 管理任务

#### 查看任务列表

1. 导航到 "任务管理"
2. 可以按状态、优先级、负责人筛选

#### 更新任务状态

1. 点击任务查看详情
2. 更新状态、添加备注
3. 保存更改

#### 任务分配

1. 选择任务
2. 点击"分配"按钮
3. 选择负责人
4. 设置截止时间

## 分类规则管理

### 创建分类规则

1. 导航到 "分类规则"
2. 点击"添加规则"
3. 设置规则参数：

```json
{
  "name": "技术支持规则",
  "keywords": ["bug", "错误", "故障", "无法使用"],
  "category": "技术支持",
  "priority": "high",
  "autoAssignTo": "tech-team@company.com"
}
```

### 规则优先级

规则按优先级顺序执行，数字越小优先级越高。

### 测试规则

可以使用历史消息测试规则的准确性。

## 统计和报告

### 数据仪表板

管理面板提供以下统计信息：

- **消息统计**：总数、各平台分布、类型分布
- **任务统计**：创建数量、完成率、平均处理时间
- **性能指标**：响应时间、分类准确率
- **用户活跃度**：活跃用户数、交互频率

### 导出报告

1. 选择时间范围
2. 选择报告类型
3. 点击"导出"按钮
4. 支持PDF、Excel格式

## 用户管理

### 邀请用户

1. 导航到 "用户管理"
2. 点击"邀请用户"
3. 填写邮箱和角色
4. 发送邀请

### 用户角色

- **管理员**：完全访问权限
- **管理者**：可管理Bot和规则
- **操作员**：可处理消息和任务
- **查看者**：只读权限

### 权限管理

可以为用户设置细粒度权限：

- Bot管理权限
- 消息查看权限
- 任务处理权限
- 统计查看权限

## 设置和配置

### 系统设置

#### 工作时间设置

```json
{
  "workingHours": {
    "enabled": true,
    "timezone": "Asia/Shanghai",
    "schedule": {
      "monday": {"start": "09:00", "end": "18:00"},
      "tuesday": {"start": "09:00", "end": "18:00"},
      "wednesday": {"start": "09:00", "end": "18:00"},
      "thursday": {"start": "09:00", "end": "18:00"},
      "friday": {"start": "09:00", "end": "18:00"},
      "saturday": {"enabled": false},
      "sunday": {"enabled": false}
    }
  }
}
```

#### 自动回复设置

```json
{
  "autoReplies": [
    {
      "condition": "outside_business_hours",
      "message": "感谢您的咨询！我们的工作时间是周一至周五9:00-18:00。"
    },
    {
      "condition": "first_message",
      "message": "您好！我是智能客服助手，很高兴为您服务！"
    }
  ]
}
```

### Lark集成配置

1. 在Lark开放平台创建应用
2. 获取App ID和App Secret
3. 在系统设置中配置：

```json
{
  "larkIntegration": {
    "appId": "your-app-id",
    "appSecret": "your-app-secret",
    "defaultProject": "customer-service"
  }
}
```

## 故障排除

### 常见问题

#### Bot无法接收消息

1. 检查Bot Token是否正确
2. 验证Webhook URL是否可访问
3. 查看错误日志

#### 消息分类不准确

1. 检查分类规则设置
2. 调整关键词列表
3. 增加训练数据

#### 任务同步失败

1. 检查Lark API配置
2. 验证网络连接
3. 查看API调用日志

### 获取帮助

1. 查看在线文档
2. 联系技术支持：support@octopus-messenger.com
3. 提交GitHub Issue

## 最佳实践

### Bot配置建议

1. **设置友好的欢迎消息**
2. **配置合理的工作时间**
3. **定期更新Bot命令和描述**
4. **监控Bot性能指标**

### 分类规则优化

1. **从简单规则开始**
2. **定期审查和调整**
3. **使用历史数据验证**
4. **避免规则冲突**

### 任务管理流程

1. **及时处理高优先级任务**
2. **保持任务状态更新**
3. **定期清理已完成任务**
4. **收集用户反馈**

### 安全建议

1. **定期更换API密钥**
2. **限制用户访问权限**
3. **监控异常活动**
4. **备份重要数据**

## 更新日志

### v1.0.0
- 初始版本发布
- 支持Telegram、WhatsApp、Slack
- AI消息分类
- Lark任务同步
- 基础统计功能

### 后续计划

- 支持更多平台（Discord、Teams）
- 增强AI分类能力
- 添加语音消息处理
- 实时通知功能 