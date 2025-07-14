#!/bin/bash

echo "🔗 获取ngrok URL..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查ngrok是否在运行
if ! pgrep -f "ngrok" > /dev/null; then
    echo -e "${RED}❌ ngrok未运行${NC}"
    echo -e "${YELLOW}启动方法:${NC}"
    echo -e "  1. 后台运行: nohup ngrok http 3000 > ~/ngrok.log 2>&1 &"
    echo -e "  2. systemd服务: sudo systemctl start ngrok"
    echo -e "  3. screen会话: screen -S ngrok 然后运行 ngrok http 3000"
    exit 1
fi

echo -e "${GREEN}✅ ngrok正在运行${NC}"

# 尝试从API获取URL
echo -e "${BLUE}🔍 从ngrok API获取URL...${NC}"
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url' 2>/dev/null || echo "")

if [ -n "$NGROK_URL" ] && [ "$NGROK_URL" != "null" ]; then
    echo -e "${GREEN}🎉 ngrok URL获取成功!${NC}"
    echo -e "${BLUE}📋 访问信息:${NC}"
    echo -e "  - 公网URL: $NGROK_URL"
    echo -e "  - 本地地址: http://localhost:3000"
    echo -e "  - Web界面: http://localhost:4040"
    
    echo -e "\n${YELLOW}🔧 设置Telegram Webhook命令:${NC}"
    echo -e "curl -X POST \"https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/setWebhook\" \\"
    echo -e "     -H \"Content-Type: application/json\" \\"
    echo -e "     -d '{\"url\": \"$NGROK_URL/webhooks/telegram\"}'"
    
    echo -e "\n${YELLOW}📋 复制以下URL用于Webhook设置:${NC}"
    echo -e "${GREEN}$NGROK_URL/webhooks/telegram${NC}"
    
    # 自动设置Webhook（如果提供了Token）
    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
        echo -e "\n${BLUE}🤖 自动设置Telegram Webhook...${NC}"
        WEBHOOK_RESULT=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
             -H "Content-Type: application/json" \
             -d "{\"url\": \"$NGROK_URL/webhooks/telegram\"}")
        
        if echo "$WEBHOOK_RESULT" | jq -e '.ok' > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Webhook设置成功!${NC}"
        else
            echo -e "${RED}❌ Webhook设置失败${NC}"
            echo -e "${YELLOW}响应: $WEBHOOK_RESULT${NC}"
        fi
    else
        echo -e "\n${YELLOW}💡 提示: 设置环境变量TELEGRAM_BOT_TOKEN可自动配置Webhook${NC}"
    fi
    
else
    echo -e "${RED}❌ 无法获取ngrok URL${NC}"
    echo -e "${YELLOW}请检查:${NC}"
    echo -e "  1. ngrok是否正常运行: ps aux | grep ngrok"
    echo -e "  2. API接口是否可访问: curl http://localhost:4040/api/tunnels"
    echo -e "  3. 手动查看Web界面: http://localhost:4040"
fi

echo -e "\n${BLUE}🛠️ 其他有用命令:${NC}"
echo -e "  - 查看ngrok进程: ps aux | grep ngrok"
echo -e "  - 查看ngrok日志: cat ~/ngrok.log"
echo -e "  - 停止ngrok: pkill -f ngrok"
echo -e "  - 重启ngrok: pkill -f ngrok && nohup ngrok http 3000 > ~/ngrok.log 2>&1 &" 