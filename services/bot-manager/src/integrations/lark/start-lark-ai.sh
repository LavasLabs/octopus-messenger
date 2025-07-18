#!/bin/bash

echo "🚀 启动Lark AI Bot..."

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js未安装，请先安装Node.js"
    exit 1
fi

# 检查ngrok
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok未安装，请先安装ngrok"
    echo "   可以访问 https://ngrok.com/download 下载"
    exit 1
fi

# 检查并安装依赖
if [ ! -d "node_modules" ] || [ ! -f "node_modules/express/package.json" ] || [ ! -f "node_modules/axios/package.json" ] || [ ! -f "node_modules/openai/package.json" ]; then
    echo "📦 安装依赖包..."
    npm install
else
    echo "✅ 依赖已安装，跳过安装步骤"
fi

# 停止可能运行的旧进程
echo "🧹 清理旧进程..."
pkill -f "ai-webhook-bot.js" 2>/dev/null || true
pkill -f "ngrok.*3001" 2>/dev/null || true
sleep 2

# 启动AI Bot服务
echo "🤖 启动Lark AI Bot服务..."
node ai-webhook-bot.js &
AI_PID=$!

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 3

# 检查服务是否启动成功
if curl -s http://127.0.0.1:3001/health > /dev/null; then
    echo "✅ AI Bot服务启动成功"
else
    echo "❌ AI Bot服务启动失败"
    kill $AI_PID 2>/dev/null
    exit 1
fi

# 启动ngrok
echo "🌐 启动ngrok隧道..."
ngrok http 3001 &
NGROK_PID=$!

# 等待ngrok启动
echo "⏳ 等待ngrok启动..."
sleep 8

# 获取ngrok URL
echo "📡 获取公网地址..."
NGROK_URL=""
for i in {1..15}; do
    # 先检查ngrok进程是否还在运行
    if ! kill -0 $NGROK_PID 2>/dev/null; then
        echo "❌ ngrok进程异常退出"
        break
    fi
    
    # 尝试获取API数据
    API_RESPONSE=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null)
    if [ $? -eq 0 ] && [ ! -z "$API_RESPONSE" ]; then
        NGROK_URL=$(echo "$API_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('tunnels') and len(data['tunnels']) > 0:
        print(data['tunnels'][0]['public_url'])
    else:
        print('')
except Exception as e:
    print('')
" 2>/dev/null)
        
        if [ ! -z "$NGROK_URL" ] && [[ "$NGROK_URL" == https://* ]]; then
            break
        fi
    fi
    
    echo "   尝试 $i/15 (等待ngrok API就绪)..."
    sleep 3
done

if [ -z "$NGROK_URL" ]; then
    echo "❌ 无法获取ngrok地址"
    kill $AI_PID $NGROK_PID 2>/dev/null
    exit 1
fi

echo ""
echo "🎉 服务启动成功！"
echo "=================================="
echo "📱 AI Bot服务: http://127.0.0.1:3001"
echo "🌐 公网地址: $NGROK_URL"
echo "📡 Webhook URL: $NGROK_URL/webhook"
echo "=================================="
echo ""
echo "📋 在Lark开发者平台配置以下信息："
echo "   事件订阅 URL: $NGROK_URL/webhook"
echo ""
echo "💡 服务正在运行，按 Ctrl+C 停止服务"

# 创建清理函数
cleanup() {
    echo ""
    echo "🛑 正在停止服务..."
    kill $AI_PID $NGROK_PID 2>/dev/null
    echo "✅ 服务已停止"
    exit 0
}

# 设置信号处理
trap cleanup SIGINT SIGTERM

# 保持脚本运行
wait 