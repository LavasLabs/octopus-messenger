#!/bin/bash

# Octopus Messenger 快速设置脚本
# 这个脚本会创建一个最小化的配置来快速启动系统

set -e

echo "🚀 Octopus Messenger 快速设置"
echo "============================="

# 检查系统要求
check_system() {
    echo "📋 检查系统要求..."
    
    # 检查Docker
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker 未安装，请先安装 Docker"
        echo "💡 访问 https://docs.docker.com/get-docker/ 获取安装说明"
        exit 1
    fi
    
    # 检查Docker Compose
    if ! docker compose version &> /dev/null; then
        echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
        echo "💡 Docker Desktop 包含 Docker Compose"
        exit 1
    fi
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js 未安装，请先安装 Node.js 18+"
        echo "💡 访问 https://nodejs.org/ 下载安装"
        exit 1
    fi
    
    echo "✅ 系统要求检查通过"
}

# 创建快速配置
create_quick_config() {
    echo "⚙️  创建快速配置..."
    
    # 创建基础目录
    mkdir -p logs uploads ssl
    
    # 创建快速环境配置
    cat > .env.quick << 'EOF'
# 快速启动配置
NODE_ENV=development
PORT=3000

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=octopus_messenger
DB_USER=postgres
DB_PASSWORD=quickstart123

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=quickstart123

# MongoDB配置
MONGODB_URL=mongodb://mongo:quickstart123@localhost:27017/octopus_messenger

# 安全配置
JWT_SECRET=quick-jwt-secret-change-in-production
SERVICE_TOKEN=quick-service-token-change-in-production

# 服务端口
GATEWAY_PORT=3000
MESSAGE_PROCESSOR_PORT=3001
AI_SERVICE_PORT=3002
TASK_SERVICE_PORT=3003
BOT_MANAGER_PORT=3004
ADMIN_PANEL_PORT=3005

# AI服务配置（可选）
OPENAI_API_KEY=sk-fake-key-for-testing
CLAUDE_API_KEY=fake-claude-key-for-testing

# 功能开关
TELEGRAM_ENABLED=false
DISCORD_ENABLED=false
SLACK_ENABLED=false
WHATSAPP_ENABLED=false
LARK_ENABLED=false
SALESFORCE_ENABLED=false
NOTION_ENABLED=false
JIRA_ENABLED=false

# 日志配置
LOG_LEVEL=info
LOG_FILE=logs/octopus.log

# CORS配置
CORS_ORIGINS=http://localhost:3000,http://localhost:3005
EOF
    
    # 复制为主配置文件
    cp .env.quick .env
    
    echo "✅ 快速配置创建完成"
}

# 创建简化的docker-compose文件
create_simple_compose() {
    echo "🐳 创建简化的Docker配置..."
    
    # 备份原始文件
    if [ -f docker-compose.yml ]; then
        cp docker-compose.yml docker-compose.yml.backup
    fi
    
    # 创建 docker-compose.yml
    cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  # PostgreSQL数据库
  postgres:
    image: postgres:15-alpine
    container_name: octopus-postgres-quick
    environment:
      POSTGRES_DB: octopus_messenger
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: quickstart123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # Redis缓存
  redis:
    image: redis:7-alpine
    container_name: octopus-redis-quick
    ports:
      - "6379:6379"
    command: redis-server --requirepass quickstart123
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "quickstart123", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # MongoDB文档数据库
  mongodb:
    image: mongo:6.0
    container_name: octopus-mongodb-quick
    environment:
      MONGO_INITDB_ROOT_USERNAME: mongo
      MONGO_INITDB_ROOT_PASSWORD: quickstart123
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  mongodb_data:
EOF
    
    echo "✅ Docker配置创建完成"
}

# 安装依赖
install_quick_dependencies() {
    echo "📦 安装核心依赖..."
    
    # 只安装根目录依赖
    npm install --production
    
    # 安装核心服务依赖
    core_services=("gateway" "ai-service" "admin-panel")
    
    for service in "${core_services[@]}"; do
        if [ -f "services/$service/package.json" ]; then
            echo "📦 安装 $service 依赖..."
            cd "services/$service"
            npm install --production
            cd "../.."
        fi
    done
    
    echo "✅ 核心依赖安装完成"
}

# 启动数据库
start_quick_databases() {
    echo "🗄️  启动数据库..."
    
    # 启动数据库服务
    docker compose up -d postgres
    
    echo "⏳ 等待数据库启动..."
    sleep 10
    
    # 等待PostgreSQL准备就绪
    echo "🔄 等待PostgreSQL..."
    until docker compose exec postgres pg_isready -U postgres; do
        sleep 2
    done
    
    echo "✅ 数据库启动完成"
}

# 初始化数据库
init_quick_database() {
    echo "🗃️  初始化数据库..."
    
    # 创建基础表结构
    docker compose exec postgres psql -U postgres -d octopus_messenger -c "
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        platform VARCHAR(20) NOT NULL,
        user_id VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        classification VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        priority VARCHAR(10) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    "
    
    # 插入默认管理员用户
    docker compose exec postgres psql -U postgres -d octopus_messenger -c "
    INSERT INTO users (username, email, password_hash) 
    VALUES ('admin', 'admin@octopus.com', '\$2b\$10\$dummy.hash.for.quick.start')
    ON CONFLICT (username) DO NOTHING;
    "
    
    echo "✅ 数据库初始化完成"
}

# 启动核心服务
start_quick_services() {
    echo "🚀 启动核心服务..."
    
    # 启动所有服务
    docker compose up -d
    
    echo "⏳ 等待服务启动..."
    sleep 15
    
    echo "✅ 核心服务启动完成"
}

# 显示快速启动信息
show_quick_info() {
    echo ""
    echo "🎉 快速启动完成！"
    echo "=================="
    echo ""
    echo "🌐 访问地址："
    echo "• 健康检查: http://localhost:3000/health"
    echo "• API文档: http://localhost:3000/api/docs"
    echo "• 管理面板: http://localhost:3005"
    echo ""
    echo "🔐 默认账户："
    echo "• 用户名: admin"
    echo "• 邮箱: admin@octopus.com"
    echo "• 密码: admin123"
    echo ""
    echo "🔧 管理命令："
    echo "• 查看状态: docker compose ps"
    echo "• 查看日志: docker compose logs -f"
    echo "• 停止服务: docker compose down"
    echo "• 重启服务: docker compose restart"
    echo ""
    echo "📚 下一步："
    echo "1. 访问管理面板配置Bot集成"
    echo "2. 设置AI服务API密钥"
    echo "3. 配置CRM系统集成"
    echo "4. 测试消息处理功能"
    echo ""
}

# 主函数
main() {
    check_system
    create_quick_config
    create_simple_compose
    install_quick_dependencies
    start_quick_databases
    init_quick_database
    start_quick_services
    show_quick_info
    
    echo "💡 提示: 这是快速启动配置，生产环境请使用完整配置"
    echo "📖 详细文档: docs/Local-Deployment-Guide.md"
}

# 运行主函数
main "$@" 