# Octopus Messenger 部署指南

## 环境要求

### 最低系统要求

- **操作系统**: Linux (Ubuntu 20.04+, CentOS 8+) 或 macOS
- **CPU**: 2核心以上
- **内存**: 4GB以上
- **存储**: 20GB以上可用空间
- **网络**: 公网IP和域名（用于webhook）

### 推荐生产环境

- **操作系统**: Ubuntu 22.04 LTS
- **CPU**: 4核心以上
- **内存**: 8GB以上
- **存储**: 50GB以上 SSD
- **网络**: 负载均衡器 + CDN

### 软件依赖

- **Docker**: 24.0+
- **Docker Compose**: 2.0+
- **Node.js**: 18.0+ (开发环境)
- **Git**: 2.0+

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-org/octopus-messenger.git
cd octopus-messenger
```

### 2. 环境配置

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要的环境变量：

```bash
# 基础配置
NODE_ENV=production
PORT=3000

# 数据库配置
DB_HOST=postgres
DB_PORT=5432
DB_NAME=octopus_messenger
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Redis配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT密钥
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# 第三方服务配置
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
SLACK_BOT_TOKEN=your_slack_bot_token
OPENAI_API_KEY=your_openai_api_key
CLAUDE_API_KEY=your_claude_api_key
LARK_APP_ID=your_lark_app_id
LARK_APP_SECRET=your_lark_app_secret
```

### 3. 启动服务

```bash
# 构建和启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 4. 初始化数据库

```bash
# 运行数据库迁移
docker-compose exec gateway npm run db:migrate

# 创建初始数据
docker-compose exec gateway npm run db:seed
```

### 5. 验证部署

访问以下地址验证服务是否正常：

- **API文档**: http://localhost:3000/api/docs
- **健康检查**: http://localhost:3000/health
- **管理面板**: http://localhost:3005
- **监控面板**: http://localhost:3001 (Grafana)

## 生产环境部署

### 1. 服务器准备

#### 更新系统

```bash
sudo apt update && sudo apt upgrade -y
```

#### 安装Docker

```bash
# 卸载旧版本
sudo apt remove docker docker-engine docker.io containerd runc

# 安装依赖
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# 添加Docker官方GPG密钥
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# 添加Docker APT仓库
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动Docker服务
sudo systemctl start docker
sudo systemctl enable docker

# 添加用户到docker组
sudo usermod -aG docker $USER
```

#### 安装Docker Compose

```bash
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. 域名和SSL配置

#### 配置域名

将以下子域名解析到服务器IP：

- `api.your-domain.com` - 主API
- `admin.your-domain.com` - 管理面板
- `monitor.your-domain.com` - 监控面板

#### 配置SSL证书

使用Let's Encrypt获取免费SSL证书：

```bash
# 安装certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d api.your-domain.com -d admin.your-domain.com -d monitor.your-domain.com

# 设置自动续期
sudo crontab -e
# 添加以下行
0 12 * * * /usr/bin/certbot renew --quiet
```

### 3. 生产环境配置

#### 创建生产环境配置

```bash
# 创建生产环境配置文件
cp docker-compose.yml docker-compose.prod.yml
```

编辑 `docker-compose.prod.yml`：

```yaml
version: '3.8'

services:
  # 添加资源限制
  gateway:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    restart: always
    
  # 配置外部数据库（推荐）
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: octopus_messenger
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
    restart: always
    
  # 配置Redis持久化
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    restart: always
```

#### 配置Nginx

创建 `nginx.conf`：

```nginx
events {
    worker_connections 1024;
}

http {
    upstream gateway {
        server gateway:3000;
    }
    
    upstream admin {
        server admin-panel:3005;
    }
    
    upstream monitor {
        server grafana:3000;
    }
    
    # API服务
    server {
        listen 80;
        server_name api.your-domain.com;
        
        location / {
            proxy_pass http://gateway;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
    
    # 管理面板
    server {
        listen 80;
        server_name admin.your-domain.com;
        
        location / {
            proxy_pass http://admin;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
    
    # 监控面板
    server {
        listen 80;
        server_name monitor.your-domain.com;
        
        location / {
            proxy_pass http://monitor;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### 4. 部署和启动

```bash
# 拉取最新代码
git pull origin main

# 构建生产镜像
docker-compose -f docker-compose.prod.yml build

# 启动生产服务
docker-compose -f docker-compose.prod.yml up -d

# 初始化数据库
docker-compose -f docker-compose.prod.yml exec gateway npm run db:migrate
```

## 监控和日志

### 1. 日志管理

#### 配置日志轮转

```bash
# 创建logrotate配置
sudo tee /etc/logrotate.d/octopus-messenger << EOF
/var/log/octopus-messenger/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
EOF
```

#### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f gateway

# 查看最近的错误日志
docker-compose logs --tail=100 gateway | grep ERROR
```

### 2. 监控设置

#### Prometheus配置

创建 `monitoring/prometheus.yml`：

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'octopus-services'
    static_configs:
      - targets: ['gateway:3000', 'message-processor:3001', 'ai-service:3002']
  
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']
  
  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
```

#### Grafana仪表板

导入预置仪表板：

1. 访问 http://monitor.your-domain.com
2. 使用默认凭据登录 (admin/admin)
3. 导入 `monitoring/grafana/dashboards/` 目录下的仪表板

### 3. 健康检查

#### 设置健康检查脚本

创建 `scripts/health-check.sh`：

```bash
#!/bin/bash

SERVICES=("gateway" "message-processor" "ai-service" "task-service" "bot-manager")
FAILED_SERVICES=()

for service in "${SERVICES[@]}"; do
    if ! curl -f http://localhost:3000/health >/dev/null 2>&1; then
        FAILED_SERVICES+=("$service")
    fi
done

if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
    echo "健康检查失败的服务: ${FAILED_SERVICES[*]}"
    exit 1
else
    echo "所有服务运行正常"
    exit 0
fi
```

#### 配置定时健康检查

```bash
# 添加cron任务
crontab -e

# 每5分钟检查一次
*/5 * * * * /path/to/octopus-messenger/scripts/health-check.sh
```

## 备份和恢复

### 1. 数据库备份

#### 自动备份脚本

创建 `scripts/backup.sh`：

```bash
#!/bin/bash

BACKUP_DIR="/var/backups/octopus-messenger"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份PostgreSQL
docker-compose exec postgres pg_dump -U postgres octopus_messenger > $BACKUP_DIR/postgres_$DATE.sql

# 备份Redis
docker-compose exec redis redis-cli --rdb $BACKUP_DIR/redis_$DATE.rdb

# 压缩备份
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz $BACKUP_DIR/*_$DATE.*

# 删除7天前的备份
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete

echo "备份完成: $BACKUP_DIR/backup_$DATE.tar.gz"
```

#### 设置自动备份

```bash
# 添加cron任务
crontab -e

# 每天凌晨2点备份
0 2 * * * /path/to/octopus-messenger/scripts/backup.sh
```

### 2. 数据恢复

```bash
# 恢复PostgreSQL数据
docker-compose exec postgres psql -U postgres -d octopus_messenger < backup_file.sql

# 恢复Redis数据
docker-compose exec redis redis-cli --rdb backup_file.rdb
```

## 扩展和优化

### 1. 水平扩展

#### 负载均衡配置

```yaml
# docker-compose.scale.yml
version: '3.8'

services:
  gateway:
    deploy:
      replicas: 3
      
  message-processor:
    deploy:
      replicas: 2
      
  ai-service:
    deploy:
      replicas: 2
```

```bash
# 启动多个实例
docker-compose -f docker-compose.prod.yml -f docker-compose.scale.yml up -d
```

### 2. 性能优化

#### 数据库优化

```sql
-- 创建索引
CREATE INDEX CONCURRENTLY idx_messages_tenant_received_at ON messages(tenant_id, received_at);
CREATE INDEX CONCURRENTLY idx_tasks_tenant_status_priority ON tasks(tenant_id, status, priority);

-- 启用连接池
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
```

#### Redis优化

```redis
# 配置内存策略
maxmemory 512mb
maxmemory-policy allkeys-lru

# 启用持久化
save 900 1
save 300 10
save 60 10000
```

## 故障排除

### 1. 常见问题

#### 服务无法启动

```bash
# 检查容器状态
docker-compose ps

# 查看容器日志
docker-compose logs service-name

# 检查端口占用
netstat -tlnp | grep :3000
```

#### 数据库连接失败

```bash
# 检查数据库状态
docker-compose exec postgres pg_isready -U postgres

# 测试连接
docker-compose exec gateway npm run db:test-connection
```

#### 内存不足

```bash
# 查看内存使用
docker stats

# 限制容器内存
docker-compose up -d --memory=1g gateway
```

### 2. 性能问题

#### 慢查询分析

```sql
-- 启用慢查询日志
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- 查看慢查询
SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
```

#### 应用性能监控

```bash
# 查看Node.js内存使用
docker-compose exec gateway node --inspect=0.0.0.0:9229 src/index.js

# 生成堆转储
docker-compose exec gateway kill -USR2 $(pgrep node)
```

## 安全配置

### 1. 网络安全

#### 防火墙配置

```bash
# 配置UFW防火墙
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp
sudo ufw enable
```

#### 限制访问

```nginx
# 限制管理面板访问
location /admin {
    allow 192.168.1.0/24;
    deny all;
    proxy_pass http://admin;
}
```

### 2. 应用安全

#### 环境变量加密

```bash
# 使用ansible-vault加密敏感配置
ansible-vault create secrets.yml
ansible-vault edit secrets.yml
```

#### 定期更新

```bash
# 创建更新脚本
#!/bin/bash
docker-compose pull
docker-compose up -d
docker image prune -f
```

## 维护计划

### 1. 定期维护任务

- **每日**: 检查日志、监控指标
- **每周**: 清理临时文件、更新镜像
- **每月**: 数据库优化、安全更新
- **每季度**: 性能测试、容量规划

### 2. 升级策略

#### 滚动升级

```bash
# 升级单个服务
docker-compose up -d --no-deps gateway

# 验证升级
curl -f http://localhost:3000/health
```

#### 回滚策略

```bash
# 回滚到之前版本
docker-compose down
docker-compose up -d --force-recreate
```

## 技术支持

如遇到部署问题，请参考：

- **文档**: https://docs.octopus-messenger.com
- **GitHub Issues**: https://github.com/your-org/octopus-messenger/issues
- **技术支持**: support@octopus-messenger.com
- **社区论坛**: https://community.octopus-messenger.com 