#!/bin/bash

# Octopus Messenger 快速启动脚本（仅核心服务）

set -e

echo "⚡ Octopus Messenger 快速启动"
echo "============================"

# 检查Docker
check_docker() {
    if ! docker compose version &> /dev/null; then
        echo "❌ Docker Compose 未安装"
        exit 1
    fi
    echo "✅ Docker 检查通过"
}

# 创建最小环境配置
create_minimal_env() {
    if [ ! -f .env ]; then
        echo "⚙️  创建最小环境配置..."
        cat > .env << 'EOF'
# 最小启动配置
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

# 安全配置
JWT_SECRET=quick-jwt-secret-for-dev-only
SERVICE_TOKEN=quick-service-token-for-dev-only

# 服务端口
GATEWAY_PORT=3000
AI_SERVICE_PORT=3002
ADMIN_PANEL_PORT=3005

# AI服务配置（可选）
OPENAI_API_KEY=sk-fake-key-for-testing
CLAUDE_API_KEY=fake-claude-key-for-testing

# 功能开关（禁用复杂功能）
TELEGRAM_ENABLED=false
DISCORD_ENABLED=false
SLACK_ENABLED=false
WHATSAPP_ENABLED=false
PUPPETEER_ENABLED=false

# 日志配置
LOG_LEVEL=info
EOF
        echo "✅ 环境配置创建完成"
    fi
}

# 启动核心服务
start_core_services() {
    echo "🚀 启动核心服务..."
    
    # 只启动数据库和核心服务
    docker compose up -d postgres redis
    
    echo "⏳ 等待数据库启动..."
    sleep 10
    
    # 等待数据库就绪
    until docker compose exec postgres pg_isready -U postgres; do
        sleep 2
    done
    
    # 启动核心应用服务（跳过 bot-manager 和 task-service）
    docker compose up -d gateway ai-service admin-panel
    
    echo "✅ 核心服务启动完成"
}

# 显示状态
show_status() {
    echo ""
    echo "🎉 快速启动完成！"
    echo "=================="
    echo ""
    echo "🌐 可用服务："
    echo "• API 网关: http://localhost:3000"
    echo "• 健康检查: http://localhost:3000/health"
    echo "• AI 服务: http://localhost:3002"
    echo "• 管理面板: http://localhost:3005"
    echo ""
    echo "📊 服务状态："
    docker compose ps
    echo ""
    echo "💡 提示："
    echo "• 这是最小化启动，跳过了复杂的 Bot 功能"
    echo "• 如需完整功能，请手动安装 bot-manager 依赖"
    echo "• 查看日志: docker compose logs -f"
    echo "• 停止服务: docker compose down"
}

# 主函数
main() {
    check_docker
    create_minimal_env
    start_core_services
    show_status
}

# 运行主函数
main "$@" 