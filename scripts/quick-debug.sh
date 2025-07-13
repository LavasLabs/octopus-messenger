#!/bin/bash

# Octopus Messenger 快速调试启动脚本

set -e

echo "🐙 Octopus Messenger 快速调试启动"
echo "================================"

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

echo "✅ Docker 环境检查通过"

# 检查环境配置文件
if [ ! -f .env ]; then
    echo "⚙️  创建调试用 .env 文件..."
    cat > .env << 'EOF'
# 调试模式配置
NODE_ENV=development
LOG_LEVEL=debug

# 数据库配置
PG_PASSWORD=debug_password
REDIS_PASSWORD=

# 安全配置
JWT_SECRET=debug-jwt-secret-for-local-development-only
SERVICE_TOKEN=debug-service-token-for-local-development-only

# AI配置（请替换为真实的API Key）
OPENAI_API_KEY=sk-your-openai-key-here
CLAUDE_API_KEY=your-claude-key-here

# 服务端口
GATEWAY_PORT=3000
MESSAGE_PROCESSOR_PORT=3001
AI_SERVICE_PORT=3002
TASK_SERVICE_PORT=3003
BOT_MANAGER_PORT=3004
ADMIN_PANEL_PORT=3005

# 监控配置
GRAFANA_PASSWORD=admin
EOF
    echo "✅ 调试用 .env 文件已创建"
    echo "⚠️  请编辑 .env 文件，设置正确的 AI API Key"
else
    echo "📄 .env 文件已存在"
fi

# 停止现有服务
echo "🛑 停止现有服务..."
docker-compose down

# 启动数据库服务
echo "🗄️  启动数据库服务..."
docker-compose up -d postgres redis mongodb

# 等待数据库就绪
echo "⏳ 等待数据库服务就绪..."
sleep 10

# 检查数据库连接
echo "🔍 检查数据库连接..."
until docker-compose exec postgres pg_isready -U postgres; do
    echo "   等待 PostgreSQL..."
    sleep 2
done
echo "✅ PostgreSQL 就绪"

until docker-compose exec redis redis-cli ping; do
    echo "   等待 Redis..."
    sleep 2
done
echo "✅ Redis 就绪"

# 启动应用服务
echo "🚀 启动应用服务..."
docker-compose up -d gateway message-processor ai-service task-service bot-manager admin-panel

# 等待应用服务启动
echo "⏳ 等待应用服务启动..."
sleep 15

# 启动监控服务
echo "📊 启动监控服务..."
docker-compose up -d nginx prometheus grafana

# 显示服务状态
echo ""
echo "📊 服务状态："
echo "============"
docker-compose ps

echo ""
echo "🔍 健康检查："
echo "============"

# 检查核心服务
services=("gateway:3000" "message-processor:3001" "ai-service:3002" "task-service:3003" "bot-manager:3004" "admin-panel:3005")

for service_port in "${services[@]}"; do
    service=$(echo $service_port | cut -d: -f1)
    port=$(echo $service_port | cut -d: -f2)
    
    if curl -s http://localhost:$port/health > /dev/null 2>&1; then
        echo "✅ $service (端口 $port) - 健康"
    else
        echo "⚠️  $service (端口 $port) - 检查中..."
    fi
done

echo ""
echo "🌐 访问地址："
echo "============"
echo "• 主页: http://localhost"
echo "• API网关: http://localhost:3000"
echo "• 管理面板: http://localhost:3005"
echo "• 监控面板: http://localhost:3001 (admin/admin)"
echo "• API文档: http://localhost:3000/api/docs"

echo ""
echo "🔐 默认账户："
echo "============"
echo "• 管理员: admin@octopus-messenger.com / admin123"
echo "• Grafana: admin / admin"

echo ""
echo "💡 调试命令："
echo "============"
echo "• 查看日志: docker-compose logs -f"
echo "• 重启服务: docker-compose restart [服务名]"
echo "• 停止所有: docker-compose down"
echo "• 清理重启: docker-compose down -v && ./scripts/quick-debug.sh"

echo ""
echo "🎉 调试环境启动完成！"
echo ""
echo "⚠️  重要提醒："
echo "• 请确保已在 .env 文件中设置正确的 AI API Key"
echo "• 如需测试Bot功能，请配置相应的Bot Token"
echo "• 详细配置请查看 docs/Docker-Debug-Guide.md" 