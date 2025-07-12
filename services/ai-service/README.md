# Octopus AI Service

## 简介

Octopus AI Service 是一个专门用于智能消息分类和自然语言处理的微服务。它支持多种AI模型和分类策略，为客服消息提供智能分类、情感分析、关键词提取等功能。

## 功能特性

### 🤖 智能分类
- **多模型支持**: OpenAI GPT、Claude、规则引擎
- **分类策略**: 置信度加权、多数投票、最高置信度、集成策略
- **批量处理**: 支持批量消息分类
- **缓存机制**: Redis缓存提高响应速度

### 📊 自然语言处理
- **情感分析**: 检测消息的情感倾向（积极/消极/中性）
- **关键词提取**: 提取消息中的重要关键词
- **实体识别**: 识别电话、邮箱、URL等实体
- **紧急程度分析**: 评估消息的紧急程度
- **文本复杂度**: 分析文本的复杂度和可读性

### 🔐 安全认证
- **JWT认证**: 支持JWT令牌认证
- **API Key认证**: 支持API密钥认证
- **租户隔离**: 多租户数据隔离
- **权限控制**: 细粒度权限管理

### 📈 分析统计
- **分类统计**: 分类趋势分析
- **性能监控**: 分类器性能分析
- **API使用统计**: API调用统计
- **准确性分析**: 分类准确性评估

## 架构设计

```
AI Service
├── 中间件层 (Middleware)
│   ├── 认证中间件 (Authentication)
│   ├── 错误处理 (Error Handling)
│   └── 日志记录 (Logging)
├── 分类器层 (Classifiers)
│   ├── OpenAI 分类器
│   ├── Claude 分类器
│   └── 规则引擎分类器
├── 管理层 (Managers)
│   └── 分类管理器 (Classification Manager)
├── 处理器层 (Processors)
│   └── NLP 处理器
├── 路由层 (Routes)
│   ├── 分类路由 (/api/classify)
│   ├── 模型路由 (/api/models)
│   └── 分析路由 (/api/analytics)
└── 工具层 (Utils)
    ├── 数据库管理器
    ├── 缓存管理器
    └── 日志工具
```

## 快速开始

### 环境要求
- Node.js 16+
- PostgreSQL 12+
- Redis 6+

### 安装依赖
```bash
cd services/ai-service
npm install
```

### 环境配置
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
vim .env
```

### 启动服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## API 文档

### 分类接口

#### 单消息分类
```bash
POST /api/classify
Content-Type: application/json
Authorization: Bearer <token>

{
  "message": {
    "id": "msg_001",
    "content": "我的产品有问题，需要帮助",
    "platform": "wechat",
    "sender_name": "张三"
  },
  "options": {
    "classifier": "openai",
    "categories": ["support", "sales", "complaint"]
  }
}
```

#### 批量分类
```bash
POST /api/classify/batch
Content-Type: application/json
Authorization: Bearer <token>

{
  "messages": [
    {
      "id": "msg_001",
      "content": "我想了解产品价格",
      "platform": "wechat"
    },
    {
      "id": "msg_002", 
      "content": "产品出现故障",
      "platform": "telegram"
    }
  ]
}
```

### 分析接口

#### NLP 分析
```bash
POST /api/analytics/nlp
Content-Type: application/json
Authorization: Bearer <token>

{
  "text": "我对这个产品很满意，服务很好",
  "features": ["sentiment", "entities", "keywords"]
}
```

#### 情感分析
```bash
POST /api/analytics/sentiment
Content-Type: application/json
Authorization: Bearer <token>

{
  "text": "这个产品太差了，我要退款"
}
```

### 模型管理

#### 训练模型
```bash
POST /api/models/train
Content-Type: application/json
Authorization: Bearer <token>

{
  "modelType": "rule-engine",
  "examples": [
    {
      "text": "产品坏了需要维修",
      "category": "support"
    },
    {
      "text": "想购买这个产品",
      "category": "sales"
    }
  ]
}
```

## 配置说明

### AI 模型配置
```javascript
// config/ai.js
module.exports = {
  enabled: {
    openai: true,
    claude: true,
    ruleEngine: true
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo',
    maxTokens: 1000,
    temperature: 0.3
  },
  claude: {
    apiKey: process.env.CLAUDE_API_KEY,
    model: 'claude-3-haiku-20240307',
    maxTokens: 1000,
    temperature: 0.3
  }
};
```

### 数据库配置
```javascript
// config/database.js
module.exports = {
  postgres: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true'
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0
  }
};
```

## 性能特性

### 缓存策略
- **分类结果缓存**: 24小时
- **模型缓存**: 2小时
- **NLP结果缓存**: 2小时
- **统计数据缓存**: 30分钟

### 限流设置
- **全局限流**: 每IP每分钟100次请求
- **用户限流**: 每用户每分钟50次请求
- **批量处理**: 每批次最多100条消息

### 监控指标
- **响应时间**: 平均响应时间 < 500ms
- **准确率**: 分类准确率 > 85%
- **可用性**: 服务可用性 > 99.9%

## 错误处理

### 错误码说明
- `400`: 请求参数错误
- `401`: 认证失败
- `403`: 权限不足
- `404`: 资源不存在
- `429`: 请求过于频繁
- `500`: 服务器内部错误
- `503`: 服务不可用

### 错误响应格式
```json
{
  "success": false,
  "error": {
    "message": "错误描述",
    "type": "error_type",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_123456"
  }
}
```

## 部署说明

### Docker 部署
```bash
# 构建镜像
docker build -t octopus-ai-service .

# 运行容器
docker run -d \
  --name ai-service \
  -p 3002:3002 \
  -e NODE_ENV=production \
  octopus-ai-service
```

### 健康检查
```bash
# 基础健康检查
curl http://localhost:3002/health

# 详细状态检查
curl http://localhost:3002/status
```

## 维护指南

### 日志管理
- 日志文件位置: `logs/`
- 日志级别: ERROR, WARN, INFO, DEBUG
- 日志轮转: 5MB per file, 保留5个文件

### 数据备份
- 定期备份PostgreSQL数据库
- 备份Redis配置和数据
- 备份模型训练数据

### 性能优化
- 定期清理过期缓存
- 监控内存使用情况
- 优化数据库查询

## 开发指南

### 添加新分类器
1. 创建分类器类文件
2. 实现必需的接口方法
3. 在ClassificationManager中注册
4. 添加配置和测试

### 扩展NLP功能
1. 在NLPProcessor中添加新方法
2. 更新分析路由
3. 添加相应的测试用例

## 故障排除

### 常见问题
1. **API Key无效**: 检查环境变量配置
2. **数据库连接失败**: 检查数据库配置和网络
3. **Redis连接失败**: 检查Redis服务状态
4. **分类准确率低**: 检查训练数据质量

### 调试技巧
- 启用DEBUG日志级别
- 检查健康检查接口
- 查看详细错误堆栈
- 使用Postman测试API

## 许可证
MIT License

## 贡献指南
欢迎提交Issue和Pull Request来改进这个项目。 