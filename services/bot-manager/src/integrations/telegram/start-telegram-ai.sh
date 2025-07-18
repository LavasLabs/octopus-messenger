#!/bin/bash

echo "🚀 启动 Z-Bot Telegram AI助手..."

# 检查依赖
if ! command -v node &> /dev/null; then
    echo "❌ 需要安装 Node.js"
    exit 1
fi

if ! command -v ngrok &> /dev/null; then
    echo "❌ 需要安装 ngrok: https://ngrok.com/download"
    exit 1
fi

# 进入项目根目录 (从telegram目录返回到根目录)
cd "$(dirname "$0")/../../../../.."

# 检查并安装依赖
if [ ! -d "node_modules" ] || [ ! -f "node_modules/express/package.json" ] || [ ! -f "node_modules/axios/package.json" ] || [ ! -f "node_modules/openai/package.json" ]; then
echo "📦 安装依赖..."
npm install express axios openai > /dev/null 2>&1
else
    echo "✅ 依赖已安装，跳过安装步骤"
fi

# 彻底清理旧进程
echo "🧹 清理旧进程..."
pkill -f "ai-webhook-bot.js" > /dev/null 2>&1
pkill -f "simple-bot.js" > /dev/null 2>&1
pkill -f "ngrok" > /dev/null 2>&1

# 检查并清理端口占用
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "🔧 清理端口3000占用..."
    kill -9 $(lsof -ti:3000) > /dev/null 2>&1
fi

if lsof -ti:4040 > /dev/null 2>&1; then
    echo "🔧 清理端口4040占用..."
    kill -9 $(lsof -ti:4040) > /dev/null 2>&1
fi

sleep 3

# 启动AI服务器
echo "🤖 启动AI服务器..."
node services/bot-manager/src/integrations/telegram/ai-webhook-bot.js &
sleep 5

# 验证AI服务器启动
echo "🔍 验证AI服务器状态..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ AI服务器启动成功"
else
    echo "❌ AI服务器启动失败"
    exit 1
fi

# 启动ngrok
echo "🌐 启动ngrok隧道..."
ngrok http 127.0.0.1:3000 &
sleep 8

# 获取ngrok URL
echo "🔍 获取ngrok URL..."
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | cut -d'"' -f4 | head -1)

if [ ! -z "$NGROK_URL" ]; then
    echo ""
    echo "✅ 启动成功!"
    echo "🔗 Webhook URL: ${NGROK_URL}/webhook"
    
    # 自动配置webhook
    echo "🔧 自动配置Telegram webhook..."
    WEBHOOK_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot8191216674:AAGSJmNEay6T4F266SyjpLAiTE2GfpWn_5M/setWebhook" \
      -H "Content-Type: application/json" \
      -d "{\"url\": \"${NGROK_URL}/webhook\"}")
    
    if echo "$WEBHOOK_RESPONSE" | grep -q '"ok":true'; then
        echo "✅ Webhook配置成功!"
    else
        echo "❌ Webhook配置失败: $WEBHOOK_RESPONSE"
    fi
    
    echo ""
    echo "🤖 机器人: @Lavas_z_bot"
    echo "🔗 ngrok管理界面: http://localhost:4040"
    echo "💚 健康检查: http://localhost:3000/health"
    echo "⏹️  停止服务: pkill -f 'ai-webhook-bot.js' && pkill -f 'ngrok'"
    echo ""
    echo "🎉 现在可以在Telegram中测试机器人了!"
else
    echo "❌ ngrok启动失败，无法获取公网URL"
    echo "🔍 请检查ngrok是否正确安装和配置"
    exit 1
fi 