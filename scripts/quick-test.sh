#!/bin/bash

# Octopus Messenger 快速测试脚本
# 使用新的 docker compose 命令

echo "🐙 Octopus Messenger 快速测试启动"
echo "=================================="

# 检查Docker Compose
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose 不可用，请确保使用最新版本的Docker"
    exit 1
fi

echo "✅ Docker Compose 检查通过"

# 停止现有容器
echo "🛑 停止现有容器..."
docker compose down

# 启动核心服务
echo "🚀 启动核心服务..."
docker compose --env-file docker.env up -d postgres redis mongodb

# 等待数据库就绪
echo "⏳ 等待数据库启动..."
sleep 10

# 启动应用服务
echo "🔧 启动应用服务..."
docker compose --env-file docker.env up -d gateway message-processor ai-service task-service bot-manager admin-panel

# 启动管理工具
echo "🛠️ 启动管理工具..."
docker compose --env-file docker.env up -d pgadmin redis-commander mongo-express

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 15

# 显示状态
echo "📊 服务状态:"
docker compose ps

echo ""
echo "🎉 启动完成！"
echo ""
echo "📱 访问地址:"
echo "  • 网关服务: http://localhost:3000"
echo "  • 管理面板: http://localhost:3005"
echo "  • pgAdmin:  http://localhost:5050 (admin@octopus.com/admin123)"
echo "  • Redis:    http://localhost:8081"
echo "  • MongoDB:  http://localhost:8082 (admin/admin123)"
echo ""
echo "🔧 常用命令:"
echo "  • 查看日志: docker compose logs -f"
echo "  • 停止服务: docker compose down"
echo "  • 重启服务: docker compose restart [服务名]"
echo ""

# 健康检查
echo "🏥 健康检查:"
sleep 5
curl -f http://localhost:3000/health 2>/dev/null && echo "✅ 网关服务正常" || echo "❌ 网关服务异常" 