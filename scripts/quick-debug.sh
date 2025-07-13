#!/bin/bash

# 快速调试脚本 - 用于快速启动和调试服务

set -e

echo "🔧 Octopus Messenger 快速调试模式"
echo "================================="

# 检查Docker和Docker Compose
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker 未安装"
        exit 1
    fi
    
    if ! docker compose version &> /dev/null; then
        echo "❌ Docker Compose 未安装"
        exit 1
    fi
    
    echo "✅ Docker 环境检查通过"
}

# 创建调试环境配置
create_debug_env() {
    echo "⚙️  创建调试环境配置..."
    
    if [ ! -f .env.debug ]; then
        cat > .env.debug << 'EOF'
# 调试模式配置
NODE_ENV=development
DEBUG=*
LOG_LEVEL=debug

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=octopus_messenger_debug
DB_USER=postgres
DB_PASSWORD=debug123

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=debug123

# 服务端口
GATEWAY_PORT=3000
MESSAGE_PROCESSOR_PORT=3001
AI_SERVICE_PORT=3002
TASK_SERVICE_PORT=3003
BOT_MANAGER_PORT=3004
ADMIN_PANEL_PORT=3005

# 安全配置
JWT_SECRET=debug-jwt-secret-not-for-production
SERVICE_TOKEN=debug-service-token
EOF
        echo "✅ 调试配置文件已创建"
    else
        echo "📄 调试配置文件已存在"
    fi
}

# 清理旧容器
cleanup_containers() {
    echo "🧹 清理旧容器..."
    docker compose down
}

# 启动基础服务
start_base_services() {
    echo "🗄️  启动基础服务（数据库）..."
    docker compose up -d postgres redis mongodb
    
    echo "⏳ 等待数据库启动..."
    sleep 5
    
    # 等待PostgreSQL
    echo "🔄 等待PostgreSQL..."
    until docker compose exec postgres pg_isready -U postgres; do
        sleep 2
    done
    
    # 等待Redis
    echo "🔄 等待Redis..."
    until docker compose exec redis redis-cli ping; do
        sleep 2
    done
    
    echo "✅ 基础服务启动完成"
}

# 启动应用服务
start_app_services() {
    echo "🚀 启动应用服务..."
    docker compose up -d gateway message-processor ai-service task-service bot-manager admin-panel
    
    echo "⏳ 等待应用服务启动..."
    sleep 10
}

# 启动监控服务
start_monitoring() {
    echo "📊 启动监控服务..."
    docker compose up -d nginx prometheus grafana
    
    echo "✅ 监控服务启动完成"
}

# 显示服务状态
show_debug_info() {
    echo ""
    echo "📊 服务状态："
    docker compose ps
    
    echo ""
    echo "🔍 调试信息："
    echo "============="
    echo "• 查看所有日志: docker compose logs -f"
    echo "• 查看特定服务: docker compose logs -f [服务名]"
    echo "• 进入容器: docker compose exec [服务名] /bin/bash"
    echo "• 重启服务: docker compose restart [服务名]"
    echo "• 停止所有: docker compose down"
    echo ""
    echo "🌐 调试端点："
    echo "============="
    echo "• 健康检查: curl http://localhost:3000/health"
    echo "• 服务状态: curl http://localhost:3000/api/status"
    echo "• AI分类测试: curl -X POST http://localhost:3002/api/classify -H 'Content-Type: application/json' -d '{\"content\":\"测试消息\"}'"
    echo ""
    echo "📱 管理界面："
    echo "============="
    echo "• 管理面板: http://localhost:3005"
    echo "• Grafana: http://localhost:3001 (admin/admin123)"
    echo "• Prometheus: http://localhost:9090"
    echo ""
}

# 主函数
main() {
    check_docker
    create_debug_env
    cleanup_containers
    start_base_services
    start_app_services
    start_monitoring
    show_debug_info
    
    echo "🎉 调试环境启动完成！"
    echo ""
    echo "💡 有用的调试命令："
    echo "• 查看日志: docker compose logs -f"
    echo "• 重启服务: docker compose restart [服务名]"
    echo "• 停止所有: docker compose down"
    echo "• 清理重启: docker compose down -v && ./scripts/quick-debug.sh"
}

# 运行主函数
main "$@" 