# Octopus Messenger Docker 部署指南

## 快速开始

### 1. 环境要求

- Docker Desktop 最新版本 (支持 `docker compose` 命令)
- 至少 4GB 可用内存
- 至少 10GB 可用磁盘空间

### 2. 检查Docker版本

```bash
# 检查Docker版本
docker --version

# 检查Docker Compose版本 (新版本命令)
docker compose version
```

**重要**: 新版本Docker使用 `docker compose` 命令，不再是 `docker-compose`。

### 3. 一键启动测试环境

```bash
# 快速启动测试环境
./scripts/quick-test.sh

# 或者使用完整启动脚本
./scripts/docker-start.sh
```

### 4. 手动启动步骤

```bash
# 1. 停止现有容器
docker compose down

# 2. 启动数据库服务
docker compose --env-file docker.env up -d postgres redis mongodb

# 3. 等待数据库启动 (约10-15秒)
sleep 15

# 4. 启动应用服务
docker compose --env-file docker.env up -d gateway message-processor ai-service task-service bot-manager admin-panel

# 5. 启动管理工具
docker compose --env-file docker.env up -d pgadmin redis-commander mongo-express

# 6. 查看服务状态
docker compose ps
```

## 服务访问

### 主要服务
- **网关服务**: http://localhost:3000
- **管理面板**: http://localhost:3005

### 数据库管理工具
- **pgAdmin**: http://localhost:5050
  - 用户名: admin@octopus.com
  - 密码: admin123
- **Redis Commander**: http://localhost:8081
- **Mongo Express**: http://localhost:8082
  - 用户名: admin
  - 密码: admin123

### 监控工具
- **Grafana**: http://localhost:3001
  - 用户名: admin
  - 密码: admin123
- **Prometheus**: http://localhost:9090

## 常用命令

### 服务管理
```bash
# 查看所有服务状态
docker compose ps

# 查看服务日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f gateway

# 重启服务
docker compose restart gateway

# 停止所有服务
docker compose down

# 停止并删除数据卷
docker compose down -v
```

### 数据库操作
```bash
# 连接PostgreSQL
docker compose exec postgres psql -U postgres -d octopus_messenger

# 连接Redis
docker compose exec redis redis-cli -a redis123

# 连接MongoDB
docker compose exec mongodb mongosh octopus_messenger
```

### 调试和开发
```bash
# 进入容器Shell
docker compose exec gateway /bin/sh

# 重新构建镜像
docker compose build --no-cache

# 查看容器资源使用
docker compose top

# 查看网络信息
docker network ls
```

## 配置说明

### 环境变量配置

项目使用 `docker.env` 文件配置环境变量，包含：

- **数据库配置**: PostgreSQL, Redis, MongoDB连接信息
- **服务配置**: 各微服务端口和认证信息
- **AI服务配置**: OpenAI, Claude API配置
- **Bot平台配置**: Telegram, Discord, Slack等配置
- **CRM集成配置**: Lark国际版, Salesforce等配置

### Lark国际版配置

```bash
# Lark国际版使用以下配置
LARK_ENABLED=false
LARK_BASE_URL=https://open.larksuite.com
LARK_APP_ID=your_app_id
LARK_APP_SECRET=your_app_secret
```

**注意**: 国际版Lark使用 `https://open.larksuite.com`，中国版使用 `https://open.feishu.cn`

### 数据库连接信息

```bash
# PostgreSQL
Host: localhost:5432
Database: octopus_messenger
Username: postgres
Password: Abc123123!

# Redis
Host: localhost:6379
Password: redis123

# MongoDB
Host: localhost:27017
Username: mongo
Password: mongo123
Database: octopus_messenger
```

## 故障排除

### 常见问题

1. **端口冲突**
   ```bash
   # 检查端口占用
   lsof -i :3000
   
   # 修改docker-compose.yml中的端口映射
   ```

2. **内存不足**
   ```bash
   # 增加Docker内存限制
   # 在Docker Desktop设置中调整内存分配
   ```

3. **数据库连接失败**
   ```bash
   # 检查数据库容器状态
   docker compose ps postgres
   
   # 查看数据库日志
   docker compose logs postgres
   
   # 重启数据库
   docker compose restart postgres
   ```

4. **服务启动失败**
   ```bash
   # 查看特定服务日志
   docker compose logs [service-name]
   
   # 重新构建镜像
   docker compose build --no-cache [service-name]
   ```

### 清理和重置

```bash
# 完全清理并重新启动
docker compose down -v
docker system prune -f
./scripts/quick-test.sh

# 清理未使用的镜像
docker image prune -f

# 清理未使用的卷
docker volume prune -f
```

## 生产环境部署

对于生产环境，请：

1. 修改 `docker.env` 中的默认密码
2. 使用 HTTPS 和 SSL 证书
3. 配置防火墙规则
4. 设置数据备份策略
5. 配置日志收集和监控

详细的生产环境部署指南请参考 `docs/AWS-Deployment-Guide.md`。

## 支持和帮助

如果遇到问题，请：

1. 查看服务日志: `docker compose logs -f`
2. 检查服务状态: `docker compose ps`
3. 查看健康检查: `curl http://localhost:3000/health`
4. 参考故障排除章节

更多信息请查看项目文档或提交Issue。 