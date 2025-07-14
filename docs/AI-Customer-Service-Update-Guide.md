# AI 客服系统更新指南

本文档描述了 Octopus Messenger AI Service 的客服功能更新，实现了完整的 AI 客服系统，支持多语言、对话管理、人工介入和模型微调数据收集。

## 🎯 更新概述

### 新增功能
1. **MongoDB 集成** - 对话记录和上下文管理
2. **对话管理器** - 完整的对话生命周期管理
3. **翻译服务** - 多语言检测和翻译
4. **人工介入系统** - 智能识别需要人工处理的场景
5. **训练数据导出** - 支持模型微调的 JSONL 格式导出
6. **客服知识库** - 常见问题和解答管理

### 更新的组件
1. **AI 分类器** - 更新为 Lava Assistant 角色，支持人工介入检测
2. **智能分类管理器** - 集成对话管理和人工介入逻辑
3. **数据库架构** - 新增多个表支持客服功能
4. **配置管理** - 添加翻译和对话管理配置

---

## 🏗️ 架构更新

### 新增服务组件

```
AI Service (Updated)
├── MongoDB Manager          # 对话数据管理
├── Conversation Manager     # 对话生命周期管理
├── Translation Service      # 多语言翻译
├── Customer Service Routes  # 客服 API 路由
└── Human Handoff Logic     # 人工介入逻辑
```

### 数据存储架构

```
PostgreSQL (关系型数据库)
├── messages                 # 消息表（扩展）
├── message_classifications  # 分类表（扩展）
├── ai_api_calls            # AI API 调用日志
├── human_handoff_sessions  # 人工介入会话
├── conversation_summaries  # 对话摘要
├── translation_cache       # 翻译缓存
└── customer_service_knowledge # 客服知识库

MongoDB (文档数据库)
├── ai_conversations        # 对话记录
├── context_summaries       # 上下文摘要
├── human_handoffs          # 人工介入记录
├── training_data           # 训练数据
└── ai_api_calls           # API 调用日志
```

---

## 🔧 配置更新

### 环境变量新增

```bash
# MongoDB 配置
MONGODB_URI=mongodb://localhost:27017/octopus_messenger

# 对话管理配置
CONVERSATION_MAX_CONTEXT_LENGTH=4000
CONVERSATION_SUMMARY_THRESHOLD=10
CONVERSATION_MAX_HISTORY_MESSAGES=20

# 翻译服务配置
TRANSLATION_ENABLED=true
TRANSLATION_DEFAULT_PROVIDER=openai
TRANSLATION_OPENAI_MODEL=gpt-3.5-turbo

# DeepL 翻译
DEEPL_API_KEY=your_deepl_api_key

# Google 翻译
GOOGLE_TRANSLATE_API_KEY=your_google_api_key

# 语言检测
LANGUAGE_DETECTION_ENABLED=true
LANGUAGE_DETECTION_PROVIDER=pattern
LANGUAGE_DETECTION_API_KEY=your_api_key
```

### 配置文件更新

`config/config.js` 新增：
- `conversation` - 对话管理配置
- `translation` - 翻译服务配置
- `database.mongodb` - MongoDB 连接配置

---

## 📡 新增 API 接口

### 客服对话接口

```javascript
POST /api/customer-service/chat
```
**功能**: 处理客服对话，包括分类、翻译、人工介入检测
**输入**: 消息内容、对话ID、用户ID、平台信息
**输出**: 分类结果、是否需要人工介入、AI回复或转接信息

### 对话历史接口

```javascript
GET /api/customer-service/conversation/{conversationId}/history
```
**功能**: 获取对话历史和上下文摘要
**输出**: 消息列表、对话摘要、统计信息

### 翻译接口

```javascript
POST /api/customer-service/translate
```
**功能**: 智能翻译，支持多种翻译提供商
**输入**: 待翻译文本、目标语言、源语言（可选）
**输出**: 翻译结果、置信度、语言检测信息

### 人工介入接口

```javascript
POST /api/customer-service/handoff/{conversationId}
```
**功能**: 手动触发人工介入
**输入**: 介入原因、升级类型、指定客服
**输出**: 介入记录ID、状态信息

### 训练数据导出接口

```javascript
GET /api/customer-service/training-data/export
```
**功能**: 导出训练数据用于模型微调
**输出**: JSONL 格式的训练数据文件

---

## 🤖 AI 分类器更新

### System Prompt 更新

**原有**: 通用消息分类助手
**更新**: "Lava Assistant" - 专业信用卡和支付领域客服专家

### 新增分类类别

- `billing` - 账单问题、费用查询
- `technical` - 技术故障、系统问题  
- `permission` - 需要特殊权限的操作
- `refund` - 退款申请、退费咨询

### 新增输出字段

- `escalate` - 是否需要人工介入
- `language` - 检测到的语言
- `urgency` - 紧急程度
- `suggested_action` - 建议处理方式

### 人工介入检测逻辑

- 置信度 < 0.3 的分类结果
- 特定类别（投诉、退款、权限相关）
- 关键词检测（投诉、退款、法律等）
- 强烈负面情绪检测

---

## 💾 数据库迁移

### 执行迁移

```bash
# 执行新的数据库迁移
psql -d octopus_messenger -f database/migrations/008_add_ai_customer_service.sql
```

### 主要变更

1. **扩展现有表**
   - `messages` 表新增对话ID、语言信息字段
   - `message_classifications` 表新增人工介入相关字段

2. **新增表**
   - `ai_api_calls` - AI API 调用日志
   - `human_handoff_sessions` - 人工介入会话
   - `conversation_summaries` - 对话摘要
   - `translation_cache` - 翻译缓存
   - `customer_service_knowledge` - 客服知识库

3. **新增视图**
   - `customer_service_workload` - 客服工作负载统计
   - `ai_usage_costs` - AI 使用成本统计
   - `conversation_quality_stats` - 对话质量统计

---

## 🌐 多语言支持

### 支持的语言

- 中文 (zh) - 简体中文
- 英文 (en)
- 日文 (ja)
- 韩文 (ko)
- 俄文 (ru)
- 法文 (fr)
- 德文 (de)
- 西班牙文 (es)
- 意大利文 (it)
- 葡萄牙文 (pt)
- 阿拉伯文 (ar)
- 泰文 (th)
- 越南文 (vi)

### 翻译提供商

1. **OpenAI** - 使用 GPT 模型进行翻译
2. **DeepL** - 专业翻译服务
3. **Google Translate** - Google 翻译 API

### 语言检测

1. **模式匹配** - 基于 Unicode 字符范围
2. **API 检测** - Google 语言检测 API
3. **智能回退** - 检测失败时默认中文

---

## 🔄 对话管理

### 对话生命周期

1. **消息接收** - 保存用户消息到 MongoDB
2. **语言检测** - 自动检测消息语言
3. **上下文构建** - 获取历史消息和摘要
4. **AI 分类** - 智能分类和人工介入检测
5. **回复生成** - AI 回复或人工转接
6. **对话更新** - 更新对话状态和摘要

### 上下文管理

- **滑动窗口** - 保留最近 N 条消息
- **智能摘要** - 超过阈值自动生成摘要
- **记忆保持** - 长期对话的上下文保持
- **多轮对话** - 支持复杂的多轮交互

---

## 🤝 人工介入系统

### 触发条件

1. **AI 分类器判断**
   - 置信度过低
   - 特定敏感类别
   - 复杂问题超出 AI 能力

2. **关键词检测**
   - 投诉、退款、法律纠纷
   - 权限相关操作
   - 威胁性语言

3. **手动触发**
   - 客服主动转接
   - 用户要求人工服务

### 介入流程

1. **检测触发** - 自动或手动触发
2. **创建会话** - 记录介入原因和类型
3. **分配客服** - 自动或手动分配
4. **状态跟踪** - 全程状态监控
5. **质量评估** - 满意度和效果评估

---

## 📊 数据收集与分析

### 训练数据收集

- **对话记录** - 完整的用户-AI对话
- **分类结果** - AI分类的准确性数据
- **人工介入** - 需要人工处理的场景
- **用户反馈** - 满意度和质量评分

### 数据导出格式

```json
{"prompt": "用户: 我什么时候会收到账单？\n客服:", "completion": "您的账单将在7月20日生成。"}
```

### 统计分析

- **API 使用统计** - 调用量、成本、成功率
- **客服工作负载** - 每个客服的工作量和绩效
- **对话质量分析** - 满意度、解决率、平均时长

---

## 🚀 部署说明

### 依赖更新

```bash
cd services/ai-service
npm install mongodb@^6.3.0
```

### 服务启动

```bash
# 确保 MongoDB 正在运行
sudo systemctl start mongod

# 执行数据库迁移
psql -d octopus_messenger -f database/migrations/008_add_ai_customer_service.sql

# 启动 AI Service
cd services/ai-service
npm start
```

### 健康检查

```bash
# 检查 AI Service 状态
curl http://localhost:3001/health

# 检查 MongoDB 连接
curl http://localhost:3001/health/mongodb

# 检查翻译服务
curl -X POST http://localhost:3001/api/customer-service/translate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token" \
  -d '{"text": "Hello", "targetLanguage": "zh"}'
```

---

## 📝 使用示例

### 客服对话处理

```javascript
const response = await fetch('/api/customer-service/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your_token'
  },
  body: JSON.stringify({
    message: "我的信用卡账单有问题，需要调整额度",
    conversationId: "conv_12345",
    userId: "user_67890",
    platform: "telegram",
    channel: "private"
  })
});

const result = await response.json();
// 结果包含分类、是否需要人工介入、AI回复等
```

### 导出训练数据

```javascript
const response = await fetch('/api/customer-service/training-data/export?format=jsonl&limit=1000', {
  headers: {
    'Authorization': 'Bearer your_token'
  }
});

const jsonlData = await response.text();
// 直接用于 OpenAI Fine-tuning
```

---

## 🔮 后续扩展

### 计划功能

1. **实时翻译** - WebSocket 支持的实时对话翻译
2. **情感分析** - 更精细的情感检测和响应
3. **知识图谱** - 基于图数据库的知识管理
4. **语音支持** - 语音识别和合成集成
5. **多模态** - 图片、文档等多媒体内容处理

### 优化方向

1. **性能优化** - 缓存策略、并发处理优化
2. **成本控制** - AI API 使用成本监控和优化
3. **质量提升** - 分类准确率和用户满意度提升
4. **安全加强** - 数据隐私保护和访问控制

---

## ⚠️ 注意事项

### 隐私保护

- 所有敏感数据在存储前进行脱敏
- 翻译 API 调用结果缓存以减少重复调用
- 支持数据保留期限设置和自动清理

### 成本管理

- AI API 调用日志记录，便于成本分析
- 翻译缓存避免重复翻译
- 可配置的 API 调用频率限制

### 监控告警

- API 调用成功率监控
- 响应时间性能监控
- 人工介入率异常告警
- 数据存储使用量监控

这次更新为 Octopus Messenger 添加了完整的 AI 客服能力，支持多语言、智能分类、人工介入和持续学习，为构建高质量的客服系统奠定了坚实基础。 