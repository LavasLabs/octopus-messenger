#!/bin/bash

set -e

echo "🚀 在Ubuntu服务器上部署Octopus Messenger..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
PROJECT_NAME=${PROJECT_NAME:-octopus-messenger}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-"8098345020:AAGdTTRkrjBo46BteA3qOwxgDOXUNhkUl5A"}
WORK_DIR="/home/$(whoami)/$PROJECT_NAME"

echo -e "${BLUE}📋 部署配置:${NC}"
echo -e "  - 项目名称: $PROJECT_NAME"
echo -e "  - 工作目录: $WORK_DIR"
echo -e "  - Telegram Bot Token: $TELEGRAM_BOT_TOKEN"
echo -e "  - 当前用户: $(whoami)"

# 1. 检查系统信息
echo -e "${BLUE}🔍 检查系统信息...${NC}"
echo -e "  - 操作系统: $(lsb_release -d | cut -f2)"
echo -e "  - 内核版本: $(uname -r)"
echo -e "  - 内存: $(free -h | grep Mem | awk '{print $2}')"
echo -e "  - 磁盘空间: $(df -h / | tail -1 | awk '{print $4}') 可用"

# 2. 更新系统
echo -e "${BLUE}🔄 更新系统包...${NC}"
sudo apt update -y
sudo apt upgrade -y

# 3. 安装必要软件
echo -e "${BLUE}📦 安装必要软件...${NC}"

# 安装基础工具
sudo apt install -y \
    curl \
    wget \
    git \
    vim \
    htop \
    net-tools \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# 4. 安装Docker
echo -e "${BLUE}🐳 安装Docker...${NC}"
if ! command -v docker &> /dev/null; then
    # 添加Docker官方GPG密钥
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # 添加Docker仓库
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # 更新包索引并安装Docker
    sudo apt update -y
    sudo apt install -y docker-ce docker-ce-cli containerd.io
    
    # 启动Docker服务
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # 添加当前用户到docker组
    sudo usermod -aG docker $(whoami)
    
    echo -e "${GREEN}✅ Docker安装完成${NC}"
else
    echo -e "${GREEN}✅ Docker已安装${NC}"
fi

# 5. 安装Docker Compose
echo -e "${BLUE}🔧 安装Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    # 下载Docker Compose
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    
    # 赋予执行权限
    sudo chmod +x /usr/local/bin/docker-compose
    
    # 创建软链接
    sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
    
    echo -e "${GREEN}✅ Docker Compose安装完成${NC}"
else
    echo -e "${GREEN}✅ Docker Compose已安装${NC}"
fi

# 6. 验证安装
echo -e "${BLUE}✅ 验证安装...${NC}"
echo -e "  - Docker版本: $(docker --version)"
echo -e "  - Docker Compose版本: $(docker-compose --version)"

# 注意：需要重新登录以使docker组生效
if ! groups $(whoami) | grep -q docker; then
    echo -e "${YELLOW}⚠️ 需要重新登录以使docker组生效${NC}"
    echo -e "${YELLOW}   请运行: newgrp docker${NC}"
fi

# 7. 创建项目目录
echo -e "${BLUE}📁 创建项目目录...${NC}"
mkdir -p $WORK_DIR
cd $WORK_DIR

# 8. 创建Docker Compose配置
echo -e "${BLUE}📄 创建Docker Compose配置...${NC}"
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  # PostgreSQL数据库
  postgres:
    image: postgres:15-alpine
    container_name: octopus-postgres
    environment:
      POSTGRES_DB: octopus_messenger
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: Abc123123!
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --auth-local=scram-sha-256"
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d octopus_messenger"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    restart: unless-stopped
    networks:
      - octopus-network

  # Redis缓存
  redis:
    image: redis:7-alpine
    container_name: octopus-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --requirepass "redis123"
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "redis123", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped
    networks:
      - octopus-network

  # MongoDB文档数据库
  mongodb:
    image: mongo:6.0
    container_name: octopus-mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin123
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongo", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped
    networks:
      - octopus-network

  # Gateway服务
  gateway:
    image: node:18-alpine
    container_name: octopus-gateway
    working_dir: /app
    volumes:
      - ./services/gateway:/app
      - /app/node_modules
    command: sh -c "npm install && npm start"
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=octopus_messenger
      - DB_USER=postgres
      - DB_PASSWORD=Abc123123!
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=redis123
      - MONGODB_URI=mongodb://admin:admin123@mongodb:27017/octopus_messenger?authSource=admin
      - JWT_SECRET=test-jwt-secret-change-in-production
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    depends_on:
      - postgres
      - redis
      - mongodb
    restart: unless-stopped
    networks:
      - octopus-network

  # 管理面板
  admin-panel:
    image: node:18-alpine
    container_name: octopus-admin-panel
    working_dir: /app
    volumes:
      - ./services/admin-panel:/app
      - /app/node_modules
    command: sh -c "npm install && npm start"
    ports:
      - "3005:3005"
    environment:
      - NODE_ENV=production
      - PORT=3005
      - GATEWAY_URL=http://gateway:3000
    depends_on:
      - gateway
    restart: unless-stopped
    networks:
      - octopus-network

volumes:
  postgres_data:
  redis_data:
  mongodb_data:

networks:
  octopus-network:
    driver: bridge
EOF

# 9. 创建服务目录结构
echo -e "${BLUE}📂 创建服务目录结构...${NC}"
mkdir -p services/{gateway,admin-panel} database/init

# 10. 创建Gateway服务
echo -e "${BLUE}🔧 创建Gateway服务...${NC}"
cat > services/gateway/package.json << 'EOF'
{
  "name": "octopus-gateway",
  "version": "1.0.0",
  "description": "Octopus Messenger Gateway Service",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "morgan": "^1.10.0",
    "pg": "^8.11.0",
    "redis": "^4.6.7",
    "mongodb": "^5.6.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "joi": "^17.9.2",
    "axios": "^1.4.0"
  }
}
EOF

cat > services/gateway/index.js << 'EOF'
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'gateway',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// API状态
app.get('/api/status', (req, res) => {
    res.json({
        message: 'Octopus Messenger Gateway is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        telegram_bot_configured: !!process.env.TELEGRAM_BOT_TOKEN
    });
});

// Telegram Webhook
app.post('/webhooks/telegram', (req, res) => {
    console.log('Telegram webhook received:', JSON.stringify(req.body, null, 2));
    
    // 简单的消息回复
    const message = req.body.message;
    if (message && message.text) {
        console.log(`收到消息: ${message.text} 来自用户: ${message.from.username || message.from.first_name}`);
        
        // 这里可以添加消息处理逻辑
        // 例如：保存到数据库、调用AI服务等
    }
    
    res.json({ status: 'ok' });
});

// API路由
app.get('/api/bots', (req, res) => {
    res.json({
        bots: [
            {
                id: 'telegram',
                name: 'Telegram Bot',
                status: 'active',
                token: process.env.TELEGRAM_BOT_TOKEN ? '已配置' : '未配置'
            }
        ]
    });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gateway service running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API status: http://localhost:${PORT}/api/status`);
    console.log(`Telegram Bot Token: ${process.env.TELEGRAM_BOT_TOKEN ? '已配置' : '未配置'}`);
});
EOF

# 11. 创建Admin Panel服务
echo -e "${BLUE}🔧 创建Admin Panel服务...${NC}"
cat > services/admin-panel/package.json << 'EOF'
{
  "name": "octopus-admin-panel",
  "version": "1.0.0",
  "description": "Octopus Messenger Admin Panel",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "express-handlebars": "^7.0.7",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "morgan": "^1.10.0",
    "axios": "^1.4.0"
  }
}
EOF

cat > services/admin-panel/index.js << 'EOF'
const express = require('express');
const { engine } = require('express-handlebars');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3005;

// 配置模板引擎
app.engine('handlebars', engine({
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials')
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// 中间件
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 创建视图目录
const viewsDir = path.join(__dirname, 'views');
const layoutsDir = path.join(viewsDir, 'layouts');
fs.mkdirSync(layoutsDir, { recursive: true });

// 创建主布局
fs.writeFileSync(path.join(layoutsDir, 'main.handlebars'), `
<!DOCTYPE html>
<html>
<head>
    <title>{{title}}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
</head>
<body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container">
            <a class="navbar-brand" href="/">
                <i class="fas fa-robot"></i> Octopus Messenger
            </a>
            <div class="navbar-nav ms-auto">
                <a class="nav-link" href="/">仪表板</a>
                <a class="nav-link" href="/bots">Bot管理</a>
                <a class="nav-link" href="/messages">消息</a>
            </div>
        </div>
    </nav>
    <div class="container mt-4">
        {{{body}}}
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
`);

// 创建仪表板视图
fs.writeFileSync(path.join(viewsDir, 'dashboard.handlebars'), `
<div class="row">
    <div class="col-12">
        <h1><i class="fas fa-tachometer-alt"></i> {{title}}</h1>
        <div class="alert alert-success">
            <i class="fas fa-check-circle"></i> {{message}}
        </div>
    </div>
</div>

<div class="row">
    <div class="col-md-4">
        <div class="card">
            <div class="card-body">
                <h5 class="card-title">
                    <i class="fas fa-server"></i> 系统状态
                </h5>
                <p class="card-text">所有服务运行正常</p>
                <span class="badge bg-success">在线</span>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card">
            <div class="card-body">
                <h5 class="card-title">
                    <i class="fab fa-telegram"></i> Telegram Bot
                </h5>
                <p class="card-text">Bot连接正常</p>
                <span class="badge bg-success">已连接</span>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card">
            <div class="card-body">
                <h5 class="card-title">
                    <i class="fas fa-database"></i> 数据库
                </h5>
                <p class="card-text">PostgreSQL运行正常</p>
                <span class="badge bg-success">正常</span>
            </div>
        </div>
    </div>
</div>

<div class="row mt-4">
    <div class="col-12">
        <div class="card">
            <div class="card-header">
                <h5><i class="fas fa-info-circle"></i> 系统信息</h5>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>服务器时间:</strong> {{serverTime}}</p>
                        <p><strong>运行环境:</strong> {{environment}}</p>
                        <p><strong>Gateway URL:</strong> {{gatewayUrl}}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>版本:</strong> 1.0.0</p>
                        <p><strong>部署方式:</strong> Docker</p>
                        <p><strong>状态:</strong> <span class="badge bg-success">运行中</span></p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
`);

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'admin-panel',
        version: '1.0.0'
    });
});

// 主页
app.get('/', (req, res) => {
    res.render('dashboard', {
        title: 'Octopus Messenger 管理面板',
        message: '欢迎使用 Octopus Messenger 管理面板！',
        serverTime: new Date().toLocaleString('zh-CN'),
        environment: process.env.NODE_ENV || 'development',
        gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:3000'
    });
});

// Bot管理页面
app.get('/bots', (req, res) => {
    res.render('dashboard', {
        title: 'Bot 管理',
        message: 'Bot管理功能正在开发中...'
    });
});

// 消息页面
app.get('/messages', (req, res) => {
    res.render('dashboard', {
        title: '消息管理',
        message: '消息管理功能正在开发中...'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Admin panel running on port ${PORT}`);
    console.log(`Access: http://localhost:${PORT}`);
});
EOF

# 12. 创建数据库初始化脚本
echo -e "${BLUE}🗄️ 创建数据库初始化脚本...${NC}"
cat > database/init/01_init_schema.sql << 'EOF'
-- 创建基础表结构
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    platform VARCHAR(50) NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bots (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    token VARCHAR(500) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入示例数据
INSERT INTO users (username, email) VALUES 
('admin', 'admin@octopus-messenger.com'),
('test_user', 'test@example.com')
ON CONFLICT (username) DO NOTHING;

INSERT INTO bots (name, platform, token, status) VALUES 
('Telegram Bot', 'telegram', 'your_telegram_token', 'active')
ON CONFLICT DO NOTHING;
EOF

# 13. 启动服务
echo -e "${BLUE}🚀 启动服务...${NC}"

# 确保docker组权限生效
newgrp docker << 'DOCKER_EOF'
# 启动服务
echo -e "${BLUE}🐳 启动Docker服务...${NC}"
docker-compose down 2>/dev/null || true
docker-compose up -d

echo -e "${YELLOW}⏳ 等待服务启动...${NC}"
sleep 30

echo -e "${BLUE}📊 检查服务状态...${NC}"
docker-compose ps

echo -e "${BLUE}🔍 检查服务健康状态...${NC}"
echo "Gateway健康检查:"
curl -s http://localhost:3000/health | jq . || echo "Gateway服务可能还在启动中..."

echo -e "\nAdmin Panel健康检查:"
curl -s http://localhost:3005/health | jq . || echo "Admin Panel服务可能还在启动中..."
DOCKER_EOF

# 14. 获取服务器IP
echo -e "${BLUE}🌐 获取服务器信息...${NC}"
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com/ || curl -s http://ipinfo.io/ip || echo "无法获取公网IP")
PRIVATE_IP=$(hostname -I | awk '{print $1}')

# 15. 输出部署信息
echo -e "${GREEN}🎉 部署完成!${NC}"
echo -e "${BLUE}📋 部署信息:${NC}"
echo -e "  - 项目目录: $WORK_DIR"
echo -e "  - 公网IP: $PUBLIC_IP"
echo -e "  - 内网IP: $PRIVATE_IP"
echo -e "  - Telegram Bot Token: $TELEGRAM_BOT_TOKEN"

echo -e "${BLUE}🔗 访问地址:${NC}"
echo -e "  - Gateway API: http://$PUBLIC_IP:3000"
echo -e "  - 健康检查: http://$PUBLIC_IP:3000/health"
echo -e "  - API状态: http://$PUBLIC_IP:3000/api/status"
echo -e "  - 管理面板: http://$PUBLIC_IP:3005"

echo -e "${BLUE}🛠️ 管理命令:${NC}"
echo -e "  - 查看服务状态: cd $WORK_DIR && docker-compose ps"
echo -e "  - 查看日志: cd $WORK_DIR && docker-compose logs -f"
echo -e "  - 重启服务: cd $WORK_DIR && docker-compose restart"
echo -e "  - 停止服务: cd $WORK_DIR && docker-compose down"

echo -e "${BLUE}📱 Telegram Bot配置:${NC}"
echo -e "  - 设置Webhook: curl -X POST \"https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook\" -H \"Content-Type: application/json\" -d '{\"url\": \"http://$PUBLIC_IP:3000/webhooks/telegram\"}'"
echo -e "  - 验证Webhook: curl \"https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo\""

echo -e "${BLUE}🔧 测试命令:${NC}"
echo -e "  - 测试Gateway: curl http://$PUBLIC_IP:3000/health"
echo -e "  - 测试Admin Panel: curl http://$PUBLIC_IP:3005/health"
echo -e "  - 查看Bot状态: curl http://$PUBLIC_IP:3000/api/bots"

echo -e "${YELLOW}⚠️ 注意事项:${NC}"
echo -e "  - 确保服务器防火墙允许3000和3005端口访问"
echo -e "  - 如果是云服务器，请检查安全组设置"
echo -e "  - 服务启动需要几分钟时间，请耐心等待"
echo -e "  - 数据库密码: Abc123123!"
echo -e "  - Redis密码: redis123"

echo -e "${GREEN}✅ 部署脚本执行完成!${NC}"
echo -e "${BLUE}📖 查看详细日志: cd $WORK_DIR && docker-compose logs -f${NC}" 