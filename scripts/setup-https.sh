#!/bin/bash

set -e

echo "🔒 设置HTTPS访问..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}选择HTTPS设置方案:${NC}"
echo -e "1. ngrok隧道（最快，无需域名）"
echo -e "2. 域名+Let's Encrypt SSL（推荐，需要域名）"
echo -e "3. Cloudflare Tunnel（免费，无需域名）"
echo -e "4. 跳过，手动配置"

read -p "请选择方案 (1-4): " choice

case $choice in
    1)
        echo -e "${BLUE}🔗 设置ngrok隧道...${NC}"
        
        # 检查ngrok是否已安装
        if ! command -v ngrok &> /dev/null; then
            echo -e "${BLUE}📥 下载并安装ngrok...${NC}"
            wget -q https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
            tar xzf ngrok-v3-stable-linux-amd64.tgz
            sudo mv ngrok /usr/local/bin/
            rm ngrok-v3-stable-linux-amd64.tgz
            echo -e "${GREEN}✅ ngrok安装完成${NC}"
        fi

        echo -e "${YELLOW}🔐 请访问 https://dashboard.ngrok.com/get-started/your-authtoken 获取您的authtoken${NC}"
        read -p "请输入您的ngrok authtoken: " AUTHTOKEN

        if [ -n "$AUTHTOKEN" ]; then
            ngrok config add-authtoken $AUTHTOKEN
            echo -e "${GREEN}✅ ngrok配置完成${NC}"
            
            # 创建ngrok启动脚本
            cat > ~/start-ngrok.sh << 'EOF'
#!/bin/bash
echo "🚀 启动ngrok隧道..."
echo "⚠️  请保持此终端窗口打开"
echo "📋 ngrok将显示您的HTTPS URL"
echo ""
ngrok http 3000
EOF
            chmod +x ~/start-ngrok.sh
            
            echo -e "${BLUE}📋 使用说明:${NC}"
            echo -e "1. 运行: ~/start-ngrok.sh"
            echo -e "2. 复制显示的HTTPS URL (如: https://abc123.ngrok.io)"
            echo -e "3. 使用该URL设置Telegram Webhook"
            echo -e ""
            echo -e "${YELLOW}设置Webhook命令模板:${NC}"
            echo -e "curl -X POST \"https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/setWebhook\" \\"
            echo -e "     -H \"Content-Type: application/json\" \\"
            echo -e "     -d '{\"url\": \"https://YOUR_NGROK_URL/webhooks/telegram\"}'"
        else
            echo -e "${RED}❌ 未提供authtoken${NC}"
            exit 1
        fi
        ;;
        
    2)
        echo -e "${BLUE}🌐 设置域名+SSL...${NC}"
        
        read -p "请输入您的域名 (如: bot.example.com): " DOMAIN
        
        if [ -z "$DOMAIN" ]; then
            echo -e "${RED}❌ 未提供域名${NC}"
            exit 1
        fi
        
        echo -e "${BLUE}📦 安装Nginx和Certbot...${NC}"
        sudo apt update
        sudo apt install nginx certbot python3-certbot-nginx -y
        
        echo -e "${BLUE}⚙️ 配置Nginx...${NC}"
        sudo tee /etc/nginx/sites-available/octopus-messenger << EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    location /admin {
        proxy_pass http://localhost:3005;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
        
        # 启用站点
        sudo ln -sf /etc/nginx/sites-available/octopus-messenger /etc/nginx/sites-enabled/
        sudo nginx -t
        sudo systemctl restart nginx
        
        echo -e "${BLUE}🔒 获取SSL证书...${NC}"
        sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN
        
        echo -e "${GREEN}✅ HTTPS设置完成${NC}"
        echo -e "${BLUE}📋 访问地址:${NC}"
        echo -e "  - Gateway API: https://$DOMAIN"
        echo -e "  - 管理面板: https://$DOMAIN/admin"
        echo -e ""
        echo -e "${YELLOW}设置Telegram Webhook:${NC}"
        echo -e "curl -X POST \"https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/setWebhook\" \\"
        echo -e "     -H \"Content-Type: application/json\" \\"
        echo -e "     -d '{\"url\": \"https://$DOMAIN/webhooks/telegram\"}'"
        ;;
        
    3)
        echo -e "${BLUE}☁️ 设置Cloudflare Tunnel...${NC}"
        
        # 安装cloudflared
        if ! command -v cloudflared &> /dev/null; then
            echo -e "${BLUE}📥 安装Cloudflare Tunnel...${NC}"
            wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
            sudo dpkg -i cloudflared-linux-amd64.deb
            rm cloudflared-linux-amd64.deb
        fi
        
        echo -e "${YELLOW}🔐 请访问 https://dash.cloudflare.com/ 并创建一个Tunnel${NC}"
        echo -e "${YELLOW}然后复制tunnel token${NC}"
        read -p "请输入Cloudflare Tunnel token: " CF_TOKEN
        
        if [ -n "$CF_TOKEN" ]; then
            # 创建systemd服务
            sudo tee /etc/systemd/system/cloudflared.service << EOF
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=cloudflared
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate run --token $CF_TOKEN
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
            
            sudo systemctl enable cloudflared
            sudo systemctl start cloudflared
            
            echo -e "${GREEN}✅ Cloudflare Tunnel设置完成${NC}"
            echo -e "${YELLOW}请在Cloudflare Dashboard中配置域名指向localhost:3000${NC}"
        else
            echo -e "${RED}❌ 未提供Tunnel token${NC}"
            exit 1
        fi
        ;;
        
    4)
        echo -e "${YELLOW}⏭️ 跳过自动配置${NC}"
        echo -e "${BLUE}📋 手动配置说明:${NC}"
        echo -e "1. 配置域名解析到您的服务器IP"
        echo -e "2. 安装SSL证书（Let's Encrypt或其他）"
        echo -e "3. 配置反向代理（Nginx或Apache）"
        echo -e "4. 使用HTTPS URL设置Telegram Webhook"
        ;;
        
    *)
        echo -e "${RED}❌ 无效选择${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}�� HTTPS设置完成！${NC}" 