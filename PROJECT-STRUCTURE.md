# Octopus Messenger 项目结构

## 项目概述

Octopus Messenger 是一个基于微服务架构的多平台消息处理和任务管理系统，支持 Telegram、WhatsApp、Slack 等平台的机器人集成，通过 AI 智能分类客户意见并自动在 Lark 中创建任务。

## 目录结构

```
octopus-messenger/
├── README.md                           # 项目说明文档
├── PROJECT-STRUCTURE.md               # 项目结构说明
├── package.json                       # 项目依赖和脚本
├── docker-compose.yml                 # Docker 容器编排
├── .env.example                       # 环境变量示例
├── .gitignore                         # Git 忽略文件
├── 
├── config/                            # 配置文件目录
│   └── config.js                      # 主配置文件
├── 
├── services/                          # 微服务目录
│   ├── gateway/                       # 网关服务 (Port: 3000)
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.js               # 服务入口
│   │       ├── middleware/            # 中间件
│   │       │   ├── auth.js           # 认证中间件
│   │       │   └── errorHandler.js   # 错误处理中间件
│   │       ├── routes/               # 路由定义
│   │       │   ├── auth.js           # 认证路由
│   │       │   ├── webhooks.js       # Webhook 路由
│   │       │   ├── users.js          # 用户管理路由
│   │       │   ├── bots.js           # Bot 管理路由
│   │       │   ├── messages.js       # 消息管理路由
│   │       │   ├── tasks.js          # 任务管理路由
│   │       │   └── classifications.js # 分类管理路由
│   │       ├── controllers/          # 控制器
│   │       ├── utils/                # 工具函数
│   │       │   └── logger.js         # 日志工具
│   │       └── docs/                 # Swagger 文档
│   │
│   ├── message-processor/            # 消息处理服务 (Port: 3001)
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.js
│   │       ├── processors/           # 消息处理器
│   │       │   ├── telegram.js
│   │       │   ├── whatsapp.js
│   │       │   └── slack.js
│   │       ├── queues/              # 队列处理
│   │       │   └── messageQueue.js
│   │       └── utils/
│   │
│   ├── ai-service/                   # AI 分类服务 (Port: 3002)
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.js
│   │       ├── classifiers/         # AI 分类器
│   │       │   ├── openai.js
│   │       │   ├── claude.js
│   │       │   └── ruleEngine.js
│   │       ├── models/              # 数据模型
│   │       └── utils/
│   │
│   ├── task-service/                # 任务管理服务 (Port: 3003)
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.js
│   │       ├── integrations/        # 外部集成
│   │       │   └── lark.js
│   │       ├── managers/            # 任务管理器
│   │       │   └── taskManager.js
│   │       └── utils/
│   │
│   ├── bot-manager/                 # Bot 管理服务 (Port: 3004)
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.js
│   │       ├── managers/            # Bot 管理器
│   │       │   ├── telegramBot.js
│   │       │   ├── whatsappBot.js
│   │       │   └── slackBot.js
│   │       └── utils/
│   │
│   └── admin-panel/                 # 管理面板 (Port: 3005)
│       ├── package.json
│       ├── Dockerfile
│       └── src/
│           ├── index.js
│           ├── public/              # 静态资源
│           ├── views/               # 页面模板
│           ├── components/          # 前端组件
│           └── utils/
│
├── database/                        # 数据库相关
│   ├── migrations/                  # 数据库迁移
│   │   └── 001_initial_schema.sql
│   ├── seeds/                       # 初始数据
│   │   └── initial_data.sql
│   └── package.json
│
├── docs/                           # 文档目录
│   ├── API-Documentation.md        # API 文档
│   ├── Deployment-Guide.md         # 部署指南
│   ├── User-Guide.md              # 用户指南
│   └── postman/                   # Postman 集合
│       └── octopus-messenger-api.json
│
├── tests/                          # 测试目录
│   ├── unit/                       # 单元测试
│   ├── integration/                # 集成测试
│   └── e2e/                        # 端到端测试
│
├── scripts/                        # 脚本目录
│   ├── setup.sh                    # 环境设置脚本
│   ├── deploy.sh                   # 部署脚本
│   ├── backup.sh                   # 备份脚本
│   └── health-check.sh             # 健康检查脚本
│
├── monitoring/                     # 监控配置
│   ├── prometheus.yml              # Prometheus 配置
│   └── grafana/                    # Grafana 配置
│       ├── dashboards/             # 仪表板
│       └── datasources/            # 数据源
│
├── docker/                         # Docker 配置
│   ├── Dockerfile.gateway
│   ├── Dockerfile.message-processor
│   ├── Dockerfile.ai-service
│   ├── Dockerfile.task-service
│   ├── Dockerfile.bot-manager
│   └── Dockerfile.admin-panel
│
├── nginx.conf                      # Nginx 配置
├── logs/                           # 日志目录
└── uploads/                        # 上传文件目录
```

## 服务架构

### 1. 网关服务 (Gateway)
- **端口**: 3000
- **功能**: API 网关、认证、限流、代理
- **技术栈**: Express.js, JWT, Redis
- **关键文件**:
  - `src/index.js` - 服务入口
  - `src/middleware/auth.js` - 认证中间件
  - `src/routes/webhooks.js` - Webhook 处理

### 2. 消息处理服务 (Message Processor)
- **端口**: 3001
- **功能**: 消息解析、格式化、队列处理
- **技术栈**: Node.js, Bull Queue, Redis
- **关键组件**:
  - 多平台消息适配器
  - 消息队列处理
  - 数据标准化

### 3. AI 分类服务 (AI Service)
- **端口**: 3002
- **功能**: 消息分类、情感分析、优先级判断
- **技术栈**: OpenAI API, Claude API, Node.js
- **关键组件**:
  - AI 模型集成
  - 规则引擎
  - 分类结果缓存

### 4. 任务管理服务 (Task Service)
- **端口**: 3003
- **功能**: 任务创建、分配、跟踪
- **技术栈**: Node.js, PostgreSQL, Lark API
- **关键组件**:
  - 任务生命周期管理
  - Lark 集成
  - 任务分配逻辑

### 5. Bot 管理服务 (Bot Manager)
- **端口**: 3004
- **功能**: Bot 配置、状态监控、消息发送
- **技术栈**: Node.js, 各平台 API
- **关键组件**:
  - 多平台 Bot 管理
  - 消息发送队列
  - 状态监控

### 6. 管理面板 (Admin Panel)
- **端口**: 3005
- **功能**: 系统管理、数据可视化、配置管理
- **技术栈**: React.js, Express.js, Chart.js
- **关键组件**:
  - 用户管理界面
  - 数据统计图表
  - 系统配置界面

## 数据存储

### 1. PostgreSQL (关系型数据库)
- **用途**: 用户数据、消息记录、任务信息
- **关键表**:
  - `tenants` - 租户表
  - `users` - 用户表
  - `messages` - 消息表
  - `tasks` - 任务表
  - `bot_configs` - Bot 配置表

### 2. Redis (缓存和队列)
- **用途**: 会话缓存、消息队列、实时数据
- **关键用途**:
  - JWT Token 黑名单
  - 消息处理队列
  - 实时统计数据

### 3. MongoDB (文档存储)
- **用途**: 日志存储、原始消息数据
- **关键集合**:
  - `system_logs` - 系统日志
  - `raw_messages` - 原始消息数据

## 外部集成

### 1. 消息平台
- **Telegram**: Bot API, Webhook
- **WhatsApp**: Business API, Webhook
- **Slack**: Bot API, Events API

### 2. AI 服务
- **OpenAI**: GPT-4 API
- **Claude**: Anthropic API

### 3. 任务管理
- **Lark**: 开放平台 API

## 部署和运维

### 1. 容器化
- **Docker**: 服务容器化
- **Docker Compose**: 本地开发环境
- **Kubernetes**: 生产环境编排

### 2. 监控
- **Prometheus**: 指标收集
- **Grafana**: 数据可视化
- **健康检查**: 服务状态监控

### 3. 日志
- **Winston**: 应用日志
- **ELK Stack**: 日志收集分析
- **日志轮转**: 日志管理

## 开发工作流

### 1. 代码管理
- **Git**: 版本控制
- **GitHub**: 代码仓库
- **Pull Request**: 代码审查

### 2. 质量保证
- **ESLint**: 代码规范
- **Jest**: 单元测试
- **Swagger**: API 文档

### 3. 部署流程
- **CI/CD**: 自动化部署
- **环境隔离**: 开发/测试/生产
- **滚动更新**: 零停机部署

## 安全措施

### 1. 认证和授权
- **JWT Token**: 用户认证
- **RBAC**: 基于角色的访问控制
- **多租户隔离**: 数据隔离

### 2. 数据安全
- **HTTPS**: 传输加密
- **数据库加密**: 敏感数据加密
- **备份策略**: 定期备份

### 3. 网络安全
- **防火墙**: 网络访问控制
- **限流**: API 访问限制
- **监控**: 异常行为检测

## 扩展性设计

### 1. 水平扩展
- **微服务架构**: 独立扩展
- **负载均衡**: 流量分发
- **数据库分片**: 数据分布

### 2. 高可用性
- **多实例部署**: 服务冗余
- **故障转移**: 自动恢复
- **监控告警**: 及时响应

### 3. 性能优化
- **缓存策略**: 减少数据库负载
- **异步处理**: 消息队列
- **CDN**: 静态资源优化

## 技术栈总结

### 后端技术
- **Node.js**: 主要运行时
- **Express.js**: Web 框架
- **PostgreSQL**: 关系型数据库
- **Redis**: 缓存和队列
- **MongoDB**: 文档数据库

### 前端技术
- **React.js**: 用户界面
- **Chart.js**: 数据可视化
- **Tailwind CSS**: 样式框架

### 运维技术
- **Docker**: 容器化
- **Nginx**: 反向代理
- **Prometheus**: 监控指标
- **Grafana**: 数据可视化

### 外部服务
- **OpenAI/Claude**: AI 分类
- **Lark**: 任务管理
- **各平台 API**: 消息集成

## 开发和部署指南

详细的开发和部署指南请参考：
- [API 文档](docs/API-Documentation.md)
- [部署指南](docs/Deployment-Guide.md)
- [用户指南](docs/User-Guide.md) 