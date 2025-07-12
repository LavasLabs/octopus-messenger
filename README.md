# Octopus Messenger

一个多平台消息处理和任务管理系统，支持Telegram、WhatsApp、Slack等平台的机器人集成，通过AI智能分类客户意见并自动在Lark中创建任务。

## 功能特性

- 🤖 多平台Bot支持（Telegram、WhatsApp、Slack、Discord）
- 🧠 AI智能分类和过滤（Claude、OpenAI）
- 📝 多CRM系统集成（16+主流CRM支持）
- 🏗️ 微服务架构设计
- 🔧 Docker容器化部署
- 📊 实时监控和日志
- 🔐 多租户SAAS架构

## 系统架构

以下是Octopus Messenger的多CRM集成架构图：

```mermaid
graph TD
    %% 外部平台
    TG[Telegram Bot]
    WA[WhatsApp Bot]  
    SL[Slack Bot]
    
    %% 网关层
    GW[Gateway API<br/>Port: 3000]
    
    %% 微服务层
    MP[Message Processor<br/>Port: 3001]
    AI[AI Service<br/>Port: 3002]
    TS[Task Service<br/>Port: 3003]
    BM[Bot Manager<br/>Port: 3004]
    AP[Admin Panel<br/>Port: 3005]
    
    %% 数据存储层
    PG[(PostgreSQL<br/>关系型数据)]
    RD[(Redis<br/>缓存/队列)]
    MG[(MongoDB<br/>文档存储)]
    
    %% 外部AI API
    OAI[OpenAI API]
    CL[Claude API]
    
    %% CRM系统 - 企业级
    SF[Salesforce]
    D365[Microsoft Dynamics 365]
    HS[HubSpot]
    
    %% CRM系统 - 中国本土
    DT[钉钉]
    WW[企业微信]
    LK[飞书]
    
    %% CRM系统 - 现代化工具
    NT[Notion]
    AT[Airtable]
    MD[Monday.com]
    
    %% CRM系统 - 项目管理
    JR[Jira]
    AS[Asana]
    TR[Trello]
    
    %% 监控层
    PR[Prometheus<br/>Port: 9090]
    GF[Grafana<br/>Port: 3001]
    
    %% 负载均衡
    NX[Nginx<br/>Port: 80/443]
    
    %% 数据流
    TG -->|Webhook| GW
    WA -->|Webhook| GW
    SL -->|Webhook| GW
    
    NX --> GW
    
    GW -->|消息处理| MP
    GW -->|AI分析| AI
    GW -->|任务管理| TS
    GW -->|Bot配置| BM
    GW -->|管理界面| AP
    
    MP -->|存储消息| PG
    MP -->|缓存| RD
    MP -->|队列| RD
    MP -->|调用AI| AI
    
    AI -->|OpenAI| OAI
    AI -->|Claude| CL
    AI -->|分类结果| PG
    AI -->|创建任务| TS
    
    %% CRM集成路由
    TS -->|CRM Manager| CRM{CRM路由策略}
    
    %% 主备模式
    CRM -->|主CRM| SF
    CRM -->|备份CRM| HS
    
    %% 分类路由
    CRM -->|销售线索| SF
    CRM -->|技术支持| JR
    CRM -->|客户服务| DT
    CRM -->|产品反馈| NT
    
    %% 并行同步
    CRM -->|同步到| D365
    CRM -->|同步到| WW
    CRM -->|同步到| AS
    
    TS -->|任务数据| PG
    TS -->|缓存| RD
    
    BM -->|Bot配置| PG
    BM -->|状态缓存| RD
    
    AP -->|管理数据| PG
    AP -->|实时数据| RD
    AP -->|日志分析| MG
    
    %% 监控数据流
    GW -.->|指标| PR
    MP -.->|指标| PR
    AI -.->|指标| PR
    TS -.->|指标| PR
    BM -.->|指标| PR
    AP -.->|指标| PR
    
    PR -->|可视化| GF
    
    %% 样式定义
    classDef platform fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef service fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef database fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef ai fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef crm_enterprise fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef crm_china fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef crm_modern fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef crm_pm fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef monitoring fill:#fff8e1,stroke:#f57f17,stroke-width:2px
    classDef proxy fill:#f1f8e9,stroke:#33691e,stroke-width:2px
    classDef router fill:#ffebee,stroke:#c62828,stroke-width:3px
    
    class TG,WA,SL platform
    class GW,MP,AI,TS,BM,AP service
    class PG,RD,MG database
    class OAI,CL ai
    class SF,D365,HS crm_enterprise
    class DT,WW,LK crm_china
    class NT,AT,MD crm_modern
    class JR,AS,TR crm_pm
    class PR,GF monitoring
    class NX proxy
    class CRM router
```

### 多CRM集成策略

1. **主备模式**: 主CRM失败时自动切换到备用CRM
2. **分类路由**: 根据消息分类路由到不同的CRM系统
3. **并行同步**: 同时同步到多个CRM系统以确保数据一致性

## 快速开始

### 环境要求

- Docker & Docker Compose
- Node.js 18+
- Python 3.9+
- PostgreSQL 14+
- Redis 7+

### 一键安装部署

#### 🚀 自动配置脚本（推荐）
```bash
# 克隆项目
git clone https://github.com/LavasLabs/octopus-messenger.git
cd octopus-messenger

# 运行自动配置脚本
./scripts/setup-local.sh
```

#### 📝 手动配置
1. 克隆项目
```bash
git clone https://github.com/LavasLabs/octopus-messenger.git
cd octopus-messenger
```

2. 配置环境变量
```bash
cp docs/env-template.txt .env
# 编辑.env文件，填入相关API密钥
```

3. 启动服务
```bash
# 使用Docker（推荐）
docker-compose up -d

# 或手动启动
npm install
npm run db:migrate
npm run dev
```

**💡 提示**: 详细配置说明请查看[本地部署指南](docs/Local-Deployment-Guide.md)

## 服务组件

| 服务 | 端口 | 描述 |
|------|------|------|
| Gateway API | 3000 | 主API网关 |
| Message Processor | 3001 | 消息处理服务 |
| AI Service | 3002 | AI分类服务 |
| Task Service | 3003 | 任务管理服务 |
| Bot Manager | 3004 | Bot管理服务 |
| Admin Panel | 3005 | 管理面板 |

## 支持的CRM系统

### 🏢 企业级CRM
- **Salesforce** - 全球最大的CRM平台
- **Microsoft Dynamics 365** - 微软企业解决方案  
- **HubSpot** - 入站营销CRM

### 📱 中国本土CRM
- **钉钉** - 阿里巴巴企业协作平台
- **企业微信** - 腾讯企业通讯解决方案
- **飞书** - 字节跳动协作平台

### 🚀 现代化工具
- **Notion** - 全能工作空间
- **Airtable** - 可视化数据库
- **Monday.com** - 工作操作系统

### 📋 项目管理工具
- **Jira** - Atlassian项目管理
- **Asana** - 团队协作平台
- **ClickUp** - 全功能生产力平台
- **Linear** - 现代化问题跟踪
- **Trello** - 看板式项目管理

### 💼 其他专业工具
- **Zoho CRM** - 一体化业务套件
- **Pipedrive** - 销售管道CRM

## 开发

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发环境
npm run dev

# 运行测试
npm run test

# 构建生产版本
npm run build
```

### API文档

访问 `http://localhost:3000/api/docs` 查看完整API文档

## 📖 文档

- [快速开始](docs/Quick-Start.md) - 5分钟快速体验系统
- [本地部署指南](docs/Local-Deployment-Guide.md) - 本地开发环境配置
- [Bot配置指南](docs/Bot-Configuration-Guide.md) - 详细的Bot配置步骤
- [CRM集成指南](docs/CRM-Integration-Guide.md) - 多CRM系统集成配置
- [用户使用指南](docs/User-Guide.md) - 完整的用户手册
- [API文档](docs/API-Documentation.md) - REST API接口文档
- [部署指南](docs/Deployment-Guide.md) - 生产环境部署和运维指南
- [项目架构](PROJECT-STRUCTURE.md) - 项目结构说明

## 贡献

欢迎提交Issue和Pull Request！

## 许可证

MIT License 