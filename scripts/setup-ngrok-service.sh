#!/bin/bash

set -e

echo "🔧 设置ngrok systemd服务..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查ngrok是否已安装
if ! command -v ngrok &> /dev/null; then
    echo -e "${RED}❌ ngrok未安装，请先安装ngrok${NC}"
    exit 1
fi

# 检查authtoken是否已配置
if ! ngrok config check &> /dev/null; then
    echo -e "${RED}❌ ngrok authtoken未配置${NC}"
    echo -e "${YELLOW}请先运行: ngrok config add-authtoken YOUR_TOKEN${NC}"
    exit 1
fi

# 获取当前用户
CURRENT_USER=$(whoami)
NGROK_PATH=$(which ngrok)

echo -e "${BLUE}📋 配置信息:${NC}"
echo -e "  - 用户: $CURRENT_USER"
echo -e "  - ngrok路径: $NGROK_PATH"

# 创建systemd服务文件
echo -e "${BLUE}📝 创建systemd服务文件...${NC}"
sudo tee /etc/systemd/system/ngrok.service << EOF
[Unit]
Description=ngrok HTTP tunnel
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=/home/$CURRENT_USER
ExecStart=$NGROK_PATH http 3000 --log=stdout
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 重新加载systemd
echo -e "${BLUE}🔄 重新加载systemd...${NC}"
sudo systemctl daemon-reload

# 启用服务
echo -e "${BLUE}✅ 启用ngrok服务...${NC}"
sudo systemctl enable ngrok

# 启动服务
echo -e "${BLUE}🚀 启动ngrok服务...${NC}"
sudo systemctl start ngrok

# 等待服务启动
sleep 5

# 检查服务状态
echo -e "${BLUE}📊 检查服务状态...${NC}"
if sudo systemctl is-active --quiet ngrok; then
    echo -e "${GREEN}✅ ngrok服务运行正常${NC}"
else
    echo -e "${RED}❌ ngrok服务启动失败${NC}"
    echo -e "${YELLOW}查看日志: sudo journalctl -u ngrok -f${NC}"
    exit 1
fi

# 获取ngrok URL
echo -e "${BLUE}🔗 获取ngrok URL...${NC}"
sleep 3

# 尝试从ngrok API获取URL
NGROK_URL=""
for i in {1..10}; do
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url' 2>/dev/null || echo "")
    if [ -n "$NGROK_URL" ] && [ "$NGROK_URL" != "null" ]; then
        break
    fi
    echo -e "${YELLOW}等待ngrok启动... ($i/10)${NC}"
    sleep 2
done

if [ -n "$NGROK_URL" ] && [ "$NGROK_URL" != "null" ]; then
    echo -e "${GREEN}🎉 ngrok隧道创建成功!${NC}"
    echo -e "${BLUE}📋 访问信息:${NC}"
    echo -e "  - 公网URL: $NGROK_URL"
    echo -e "  - 本地地址: http://localhost:3000"
    echo -e "  - Web界面: http://localhost:4040"
    
    echo -e "\n${YELLOW}🔧 设置Telegram Webhook:${NC}"
    echo -e "curl -X POST \"https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/setWebhook\" \\"
    echo -e "     -H \"Content-Type: application/json\" \\"
    echo -e "     -d '{\"url\": \"$NGROK_URL/webhooks/telegram\"}'"
else
    echo -e "${RED}❌ 无法获取ngrok URL${NC}"
    echo -e "${YELLOW}请手动检查: http://localhost:4040${NC}"
fi

echo -e "\n${BLUE}🛠️ 管理命令:${NC}"
echo -e "  - 查看状态: sudo systemctl status ngrok"
echo -e "  - 查看日志: sudo journalctl -u ngrok -f"
echo -e "  - 重启服务: sudo systemctl restart ngrok"
echo -e "  - 停止服务: sudo systemctl stop ngrok"
echo -e "  - 禁用服务: sudo systemctl disable ngrok"

echo -e "\n${BLUE}🌐 Web界面:${NC}"
echo -e "  - ngrok控制台: http://localhost:4040"
echo -e "  - 查看隧道状态和流量"

echo -e "\n${GREEN}✅ ngrok服务设置完成!${NC}" 