# Octopus Messenger Docker 本地调试指南

## 🐳 快速启动

### 1. 环境准备
```bash
# 检查Docker版本
docker --version
docker compose version

# 确保版本要求：
# Docker: 20.10.0+
# Docker Compose: 2.0.0+
```

### 2. 设置环境变量
```bash
# 复制环境模板
cp docs/env-template.txt .env

# 编辑 .env 文件，设置必要参数
vim .env
```

最小化配置（调试用）：
```bash
# 数据库配置
PG_PASSWORD=debug_password
REDIS_PASSWORD=

# 安全配置
JWT_SECRET=debug-jwt-secret-for-local-development-only
SERVICE_TOKEN=debug-service-token-for-local-development-only

# AI配置（至少配置一个）
OPENAI_API_KEY=sk-your-openai-key
# 或者
CLAUDE_API_KEY=your-claude-key

# 调试模式
NODE_ENV=development
LOG_LEVEL=debug
```

### 3. 启动所有服务
```bash
# 一键启动所有服务（包括数据库）
docker-compose up -d

# 查看启动状态
docker-compose ps
```

### 4. 等待服务就绪
```bash
# 查看服务日志
docker-compose logs -f

# 检查数据库连接
docker-compose exec postgres pg_isready -U postgres

# 检查Redis连接
docker-compose exec redis redis-cli ping
```

## 🗄️ 数据库详细配置

### PostgreSQL (主数据库)
```yaml
# docker-compose.yml 中的配置
postgres:
  image: postgres:15-alpine
  ports:
    - "5432:5432"
  environment:
    POSTGRES_DB: octopus_messenger
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: debug_password
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./database/migrations:/docker-entrypoint-initdb.d
```

**直接连接数据库:**
```bash
# 进入PostgreSQL容器
docker-compose exec postgres psql -U postgres -d octopus_messenger

# 或者从主机连接
psql -h localhost -p 5432 -U postgres -d octopus_messenger
```

### Redis (缓存/队列)
```yaml
# docker-compose.yml 中的配置
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  command: redis-server --appendonly yes
```

**直接连接Redis:**
```bash
# 进入Redis容器
docker-compose exec redis redis-cli

# 或者从主机连接
redis-cli -h localhost -p 6379
```

### MongoDB (文档存储)
```yaml
# docker-compose.yml 中的配置
mongodb:
  image: mongo:6.0
  ports:
    - "27017:27017"
  environment:
    MONGO_INITDB_DATABASE: octopus_messenger
```

**直接连接MongoDB:**
```bash
# 进入MongoDB容器
docker-compose exec mongodb mongosh octopus_messenger

# 或者从主机连接
mongosh mongodb://localhost:27017/octopus_messenger
```

## 🚀 调试模式启动

### 只启动数据库服务
```bash
# 如果只需要数据库进行本地开发
docker-compose up -d postgres redis mongodb

# 然后本地运行应用服务
npm install
npm run dev
```

### 启动特定服务
```bash
# 只启动核心服务
docker-compose up -d postgres redis gateway message-processor

# 逐个启动服务进行调试
docker-compose up -d postgres redis
docker-compose up -d gateway
docker-compose up -d message-processor
```

### 热重载模式
```bash
# 挂载源代码到容器，实现热重载
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## 🔧 调试工具

### 查看日志
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f gateway
docker-compose logs -f postgres
docker-compose logs -f redis

# 实时跟踪日志
docker-compose logs -f --tail=100 gateway
```

### 进入容器调试
```bash
# 进入网关服务容器
docker-compose exec gateway /bin/sh

# 进入数据库容器
docker-compose exec postgres /bin/bash

# 进入Redis容器
docker-compose exec redis /bin/sh
```

### 健康检查
```bash
# 检查所有服务状态
curl http://localhost:3000/health

# 检查具体服务健康状态
curl http://localhost:3000/api/health/database
curl http://localhost:3001/health  # message-processor
curl http://localhost:3002/health  # ai-service
curl http://localhost:3003/health  # task-service
curl http://localhost:3004/health  # bot-manager
curl http://localhost:3005/health  # admin-panel
```

## 🛠️ 常见调试场景

### 1. 数据库连接问题
```bash
# 检查数据库容器状态
docker-compose ps postgres

# 检查数据库日志
docker-compose logs postgres

# 测试连接
docker-compose exec postgres pg_isready -U postgres
```

### 2. 服务无法启动
```bash
# 查看服务构建过程
docker-compose build --no-cache gateway

# 查看详细启动日志
docker-compose up gateway
```

### 3. 端口冲突
```bash
# 检查端口占用
lsof -i :3000
lsof -i :5432
lsof -i :6379

# 修改端口映射
# 在docker-compose.yml中修改端口映射
```

### 4. 数据库数据重置
```bash
# 停止所有服务
docker-compose down

# 删除数据卷
docker-compose down -v

# 重新启动（会重新初始化数据库）
docker-compose up -d
```

## 🎯 开发工作流

### 1. 每日开发启动
```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志确认启动成功
docker-compose logs -f gateway
```

### 2. 代码修改后重启
```bash
# 重新构建并启动特定服务
docker-compose up -d --build gateway

# 或者重启现有服务
docker-compose restart gateway
```

### 3. 数据库操作
```bash
# 查看数据库表
docker-compose exec postgres psql -U postgres -d octopus_messenger -c "\dt"

# 查看表内容
docker-compose exec postgres psql -U postgres -d octopus_messenger -c "SELECT * FROM users LIMIT 10;"

# 执行SQL文件
docker-compose exec postgres psql -U postgres -d octopus_messenger -f /docker-entrypoint-initdb.d/new_migration.sql
```

### 4. 清理环境
```bash
# 停止所有服务
docker-compose down

# 删除所有数据（慎用）
docker-compose down -v

# 删除未使用的镜像
docker image prune -f
```

## 📱 访问地址

启动成功后，你可以通过以下地址访问：

- **主页/管理面板**: http://localhost
- **API网关**: http://localhost:3000
- **API文档**: http://localhost:3000/api/docs
- **管理面板**: http://localhost:3005
- **Grafana监控**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090

## 🔐 默认账户信息

- **管理员邮箱**: admin@octopus-messenger.com
- **用户名**: admin
- **密码**: admin123

## 💡 调试提示

1. **首次启动**: 数据库初始化需要时间，请耐心等待
2. **日志查看**: 使用 `docker-compose logs -f` 实时查看所有服务日志
3. **数据持久化**: 数据存储在Docker卷中，`docker-compose down` 不会删除数据
4. **完全重置**: 使用 `docker-compose down -v` 删除所有数据卷
5. **性能监控**: 访问Grafana进行服务性能监控

需要更多帮助，请查看 [本地部署指南](Local-Deployment-Guide.md) 或 [API文档](API-Documentation.md)。 