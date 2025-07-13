# Octopus Messenger

A multi-platform messaging and task management system that supports bot integration across Telegram, WhatsApp, Slack, and other platforms, intelligently categorizing customer feedback through AI and automatically creating tasks in Lark.

## Features

- 🤖 Multi-platform bot support (Telegram, WhatsApp, Slack, Discord, Line, WeWork)
- 🧠 AI-powered classification and filtering (Claude, OpenAI)
- 📝 Multi-CRM system integration (16+ mainstream CRM support)
- 🏗️ Microservices architecture design
- 🔧 Docker containerized deployment
- 📊 Real-time monitoring and logging
- 🔐 Multi-tenant SaaS architecture

## System Architecture

The following diagram shows the multi-CRM integration architecture of Octopus Messenger:

```mermaid
graph TD
    %% External Platforms
    TG[Telegram Bot]
    WA[WhatsApp Bot]  
    SL[Slack Bot]
    DS[Discord Bot]
    LN[Line Bot]
    WW[WeWork Bot]
    
    %% Gateway Layer
    GW[Gateway API<br/>Port: 3000]
    
    %% Microservices Layer
    MP[Message Processor<br/>Port: 3001]
    AI[AI Service<br/>Port: 3002]
    TS[Task Service<br/>Port: 3003]
    BM[Bot Manager<br/>Port: 3004]
    AP[Admin Panel<br/>Port: 3005]
    
    %% Data Storage Layer
    PG[(PostgreSQL<br/>Relational Data)]
    RD[(Redis<br/>Cache/Queue)]
    MG[(MongoDB<br/>Document Storage)]
    
    %% External AI APIs
    OAI[OpenAI API]
    CL[Claude API]
    
    %% CRM Systems - Enterprise
    SF[Salesforce]
    D365[Microsoft Dynamics 365]
    HS[HubSpot]
    
    %% CRM Systems - China Local
    DT[DingTalk]
    WW[WeWork]
    LK[Feishu]
    
    %% CRM Systems - Modern Tools
    NT[Notion]
    AT[Airtable]
    MD[Monday.com]
    
    %% CRM Systems - Project Management
    JR[Jira]
    AS[Asana]
    TR[Trello]
    
    %% Monitoring Layer
    PR[Prometheus<br/>Port: 9090]
    GF[Grafana<br/>Port: 3001]
    
    %% Load Balancer
    NX[Nginx<br/>Port: 80/443]
    
    %% Data Flow
    TG -->|Webhook| GW
    WA -->|Webhook| GW
    SL -->|Webhook| GW
    DS -->|Webhook| GW
    LN -->|Webhook| GW
    WW -->|Webhook| GW
    
    NX --> GW
    
    GW -->|Message Processing| MP
    GW -->|AI Analysis| AI
    GW -->|Task Management| TS
    GW -->|Bot Configuration| BM
    GW -->|Admin Interface| AP
    
    MP -->|Store Messages| PG
    MP -->|Cache| RD
    MP -->|Queue| RD
    MP -->|Call AI| AI
    
    AI -->|OpenAI| OAI
    AI -->|Claude| CL
    AI -->|Classification Results| PG
    AI -->|Create Tasks| TS
    
    %% CRM Integration Routing
    TS -->|CRM Manager| CRM{CRM Routing Strategy}
    
    %% Primary-Backup Mode
    CRM -->|Primary CRM| SF
    CRM -->|Backup CRM| HS
    
    %% Classification Routing
    CRM -->|Sales Leads| SF
    CRM -->|Technical Support| JR
    CRM -->|Customer Service| DT
    CRM -->|Product Feedback| NT
    
    %% Parallel Synchronization
    CRM -->|Sync to| D365
    CRM -->|Sync to| WW
    CRM -->|Sync to| AS
    
    TS -->|Task Data| PG
    TS -->|Cache| RD
    
    BM -->|Bot Configuration| PG
    BM -->|Status Cache| RD
    
    AP -->|Management Data| PG
    AP -->|Real-time Data| RD
    AP -->|Log Analysis| MG
    
    %% Monitoring Data Flow
    GW -.->|Metrics| PR
    MP -.->|Metrics| PR
    AI -.->|Metrics| PR
    TS -.->|Metrics| PR
    BM -.->|Metrics| PR
    AP -.->|Metrics| PR
    
    PR -->|Visualization| GF
    
    %% Style Definitions
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
    
    class TG,WA,SL,DS,LN,WW platform
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

### Multi-CRM Integration Strategy

1. **Primary-Backup Mode**: Automatically switches to backup CRM when primary CRM fails
2. **Classification Routing**: Routes messages to different CRM systems based on classification
3. **Parallel Synchronization**: Synchronizes to multiple CRM systems simultaneously to ensure data consistency

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Python 3.9+
- PostgreSQL 14+
- Redis 7+

### One-Click Installation & Deployment

#### 🚀 Automated Configuration Script (Recommended)
```bash
# Clone the repository
git clone https://github.com/LavasLabs/octopus-messenger.git
cd octopus-messenger

# Run automated setup script
./scripts/setup-local.sh
```

#### 📝 Manual Configuration
1. Clone the repository
```bash
git clone https://github.com/LavasLabs/octopus-messenger.git
cd octopus-messenger
```

2. Configure environment variables
```bash
cp docs/env-template.txt .env
# Edit .env file and fill in relevant API keys
```

3. Start services
```bash
# Using Docker (Recommended)
docker compose up -d

# Or manual startup
npm install
npm run db:migrate
npm run dev
```

**💡 Tip**: For detailed configuration instructions, please check the [Local Deployment Guide](docs/Local-Deployment-Guide.md)

## Service Components

| Service | Port | Description |
|---------|------|-------------|
| Gateway API | 3000 | Main API Gateway |
| Message Processor | 3001 | Message Processing Service |
| AI Service | 3002 | AI Classification Service |
| Task Service | 3003 | Task Management Service |
| Bot Manager | 3004 | Bot Management Service |
| Admin Panel | 3005 | Administration Panel |

## Supported CRM Systems

### 🏢 Enterprise CRM
- **Salesforce** - World's largest CRM platform
- **Microsoft Dynamics 365** - Microsoft enterprise solution  
- **HubSpot** - Inbound marketing CRM

### 📱 China Local CRM
- **DingTalk** - Alibaba enterprise collaboration platform
- **WeWork** - Tencent enterprise communication solution
- **Feishu** - ByteDance collaboration platform

### 🚀 Modern Tools
- **Notion** - All-in-one workspace
- **Airtable** - Visual database
- **Monday.com** - Work operating system

### 📋 Project Management Tools
- **Jira** - Atlassian project management
- **Asana** - Team collaboration platform
- **ClickUp** - All-in-one productivity platform
- **Linear** - Modern issue tracking
- **Trello** - Kanban-style project management

### 💼 Other Professional Tools
- **Zoho CRM** - All-in-one business suite
- **Pipedrive** - Sales pipeline CRM

## Development

### Local Development

```bash
# Install dependencies
npm install

# Start development environment
npm run dev

# Run tests
npm run test

# Build for production
npm run build
```

### API Documentation

Visit `http://localhost:3000/api/docs` to view complete API documentation

## 📖 Documentation

- [Quick Start](docs/Quick-Start.md) - 5-minute quick system experience
- [Local Deployment Guide](docs/Local-Deployment-Guide.md) - Local development environment setup
- [Bot Configuration Guide](docs/Bot-Configuration-Guide.md) - Detailed bot configuration steps
- [CRM Integration Guide](docs/CRM-Integration-Guide.md) - Multi-CRM system integration configuration
- [User Guide](docs/User-Guide.md) - Complete user manual
- [API Documentation](docs/API-Documentation.md) - REST API interface documentation
- [Deployment Guide](docs/Deployment-Guide.md) - Production environment deployment and operations guide
- [Project Structure](PROJECT-STRUCTURE.md) - Project structure description

## Contributing

Issues and Pull Requests are welcome!

## License

MIT License 