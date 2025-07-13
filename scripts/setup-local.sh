#!/bin/bash

# Octopus Messenger 本地开发环境设置脚本

set -e

echo "🐙 Octopus Messenger 本地环境设置"
echo "=================================="

# 检查必要的工具
check_requirements() {
    echo "📋 检查系统要求..."
    
    # 检查Docker
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    # 检查Docker Compose
    if ! docker compose version &> /dev/null; then
        echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js 未安装，请先安装 Node.js 18+"
        exit 1
    fi
    
    # 检查npm
    if ! command -v npm &> /dev/null; then
        echo "❌ npm 未安装，请先安装 npm"
        exit 1
    fi
    
    echo "✅ 系统要求检查通过"
}

# 创建环境变量文件
setup_env() {
    echo "⚙️  设置环境变量..."
    
    if [ ! -f .env ]; then
        echo "📄 创建 .env 文件..."
        cp docs/env-template.env .env
        
        # 生成随机密钥
        JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "your-super-secret-jwt-key-change-this-in-production")
        SESSION_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "your-session-secret-change-this-in-production")
        ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32 2>/dev/null || echo "your-encryption-key-32-chars-long")
        
        # 替换默认值
        sed -i.bak "s/your-super-secret-jwt-key-change-this-in-production/$JWT_SECRET/" .env
        sed -i.bak "s/your-session-secret-change-this-in-production/$SESSION_SECRET/" .env
        sed -i.bak "s/your-encryption-key-32-characters-long/$ENCRYPTION_KEY/" .env
        
        rm .env.bak 2>/dev/null || true
        
        echo "✅ .env 文件已创建，请根据需要修改配置"
    else
        echo "📄 .env 文件已存在"
    fi
}

# 创建必要的目录
create_directories() {
    echo "📁 创建必要的目录..."
    
    mkdir -p logs
    mkdir -p uploads
    mkdir -p ssl
    mkdir -p monitoring/grafana/provisioning/dashboards
    mkdir -p monitoring/grafana/provisioning/datasources
    
    echo "✅ 目录创建完成"
}

# 安装依赖
install_dependencies() {
    echo "📦 安装项目依赖..."
    
    # 安装根目录依赖
    npm install
    
    # 安装各个服务的依赖
    services=("gateway" "message-processor" "ai-service" "bot-manager" "admin-panel")
    
    for service in "${services[@]}"; do
        if [ -f "services/$service/package.json" ]; then
            echo "📦 安装 $service 服务依赖..."
            cd "services/$service"
            npm install
            cd "../.."
        fi
    done
    
    # 跳过 task-service 的依赖安装，因为存在版本问题
    echo "⚠️  跳过 task-service 依赖安装（存在版本冲突）"
    
    echo "✅ 依赖安装完成"
}

# 启动数据库服务
start_databases() {
    echo "🗄️  启动数据库服务..."
    
    # 只启动数据库相关服务
    docker compose up -d postgres redis mongodb
    
    echo "⏳ 等待数据库启动..."
    sleep 10
    
    echo "✅ 数据库服务启动完成"
}

# 初始化数据库
init_database() {
    echo "🗃️  初始化数据库..."
    
    # 等待PostgreSQL启动
    echo "⏳ 等待 PostgreSQL 准备就绪..."
    until docker compose exec postgres pg_isready -U postgres; do
        sleep 2
    done
    
    # 运行数据库迁移
    echo "🔄 运行数据库迁移..."
    docker compose exec postgres psql -U postgres -d octopus_messenger -f /docker-entrypoint-initdb.d/001_initial_schema.sql
    
    # 插入初始数据
    echo "🌱 插入初始数据..."
    docker compose exec postgres psql -U postgres -d octopus_messenger -f /docker-entrypoint-initdb.d/../seeds/initial_data.sql
    
    echo "✅ 数据库初始化完成"
}

# 启动所有服务
start_services() {
    echo "🚀 启动所有服务..."
    
    # 启动所有服务
    docker compose up -d
    
    echo "⏳ 等待服务启动..."
    sleep 15
    
    echo "✅ 所有服务启动完成"
}

# 显示服务状态
show_status() {
    echo ""
    echo "📊 服务状态："
    echo "=============="
    
    services=(
        "gateway:3000"
        "message-processor:3001"
        "ai-service:3002"
        "task-service:3003"
        "bot-manager:3004"
        "admin-panel:3005"
        "postgres:5432"
        "redis:6379"
        "mongodb:27017"
        "nginx:80"
        "prometheus:9090"
        "grafana:3001"
    )
    
    for service_port in "${services[@]}"; do
        service=$(echo $service_port | cut -d: -f1)
        port=$(echo $service_port | cut -d: -f2)
        
        if docker compose ps $service | grep -q "Up"; then
            echo "✅ $service (端口 $port) - 运行中"
        else
            echo "❌ $service (端口 $port) - 停止"
        fi
    done
    
    echo ""
    echo "🌐 访问地址："
    echo "============="
    echo "• 主页/管理面板: http://localhost"
    echo "• API网关: http://localhost/api"
    echo "• API文档: http://localhost/api/docs"
    echo "• Grafana监控: http://localhost:3001 (admin/admin)"
    echo "• Prometheus: http://localhost:9090"
    echo ""
    echo "🔐 默认管理员账户："
    echo "=================="
    echo "• 邮箱: admin@octopus-messenger.com"
    echo "• 用户名: admin"
    echo "• 密码: admin123"
    echo ""
}

# 主函数
main() {
    echo "开始设置 Octopus Messenger 本地开发环境..."
    
    check_requirements
    setup_env
    create_directories
    install_dependencies
    start_databases
    init_database
    start_services
    show_status
    
    echo "🎉 本地开发环境设置完成！"
    echo ""
    echo "💡 有用的命令："
    echo "• 查看日志: docker compose logs -f [服务名]"
    echo "• 停止所有服务: docker compose down"
    echo "• 重启服务: docker compose restart [服务名]"
    echo "• 清理并重新构建: docker compose down -v && docker compose up --build -d"
    echo ""
    echo "📚 更多信息请查看 docs/ 目录中的文档"
}

# 运行主函数
main "$@" 