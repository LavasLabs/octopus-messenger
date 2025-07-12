#!/bin/bash

# Octopus Messenger 快速启动脚本
# 用于快速部署 Discord/Telegram Bot

set -e

echo "🐙 Octopus Messenger 快速启动向导"
echo "=================================="

# 检查环境
check_requirements() {
    echo "📋 检查系统环境..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ 需要安装 Node.js (版本 >= 16)"
        echo "请访问: https://nodejs.org"
        exit 1
    fi
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        echo "❌ 需要安装 Docker"
        echo "请访问: https://docker.com"
        exit 1
    fi
    
    # 检查 PostgreSQL
    if ! command -v psql &> /dev/null; then
        echo "⚠️  建议安装 PostgreSQL 客户端"
    fi
    
    echo "✅ 环境检查通过"
}

# 交互式配置
interactive_setup() {
    echo ""
    echo "🔧 Bot配置向导"
    echo "=============="
    
    # 选择平台
    echo "请选择要部署的平台:"
    echo "1) Telegram"
    echo "2) Discord" 
    echo "3) 两者都部署"
    read -p "选择 (1-3): " platform_choice
    
    case $platform_choice in
        1) PLATFORMS="telegram" ;;
        2) PLATFORMS="discord" ;;
        3) PLATFORMS="telegram discord" ;;
        *) echo "❌ 无效选择"; exit 1 ;;
    esac
    
    # Telegram 配置
    if [[ $PLATFORMS == *"telegram"* ]]; then
        echo ""
        echo "📱 Telegram Bot 配置"
        echo "==================="
        echo "1. 在 Telegram 中找到 @BotFather"
        echo "2. 发送 /newbot 创建新Bot"
        echo "3. 按提示设置Bot名称和用户名"
        echo "4. 复制获得的 Bot Token"
        echo ""
        read -p "请输入 Telegram Bot Token: " TELEGRAM_BOT_TOKEN
        
        if [[ -z "$TELEGRAM_BOT_TOKEN" ]]; then
            echo "❌ Telegram Bot Token 不能为空"
            exit 1
        fi
    fi
    
    # Discord 配置
    if [[ $PLATFORMS == *"discord"* ]]; then
        echo ""
        echo "🎮 Discord Bot 配置"
        echo "==================="
        echo "1. 访问 https://discord.com/developers/applications"
        echo "2. 点击 'New Application' 创建应用"
        echo "3. 在左侧菜单选择 'Bot'"
        echo "4. 点击 'Add Bot'"
        echo "5. 复制 Bot Token"
        echo ""
        read -p "请输入 Discord Bot Token: " DISCORD_BOT_TOKEN
        read -p "请输入 Discord Client ID: " DISCORD_CLIENT_ID
        read -p "请输入 Discord Public Key: " DISCORD_PUBLIC_KEY
        
        if [[ -z "$DISCORD_BOT_TOKEN" || -z "$DISCORD_CLIENT_ID" ]]; then
            echo "❌ Discord 配置信息不能为空"
            exit 1
        fi
    fi
    
    # 基础配置
    echo ""
    echo "⚙️  基础配置"
    echo "==========="
    read -p "域名 (如: your-domain.com): " DOMAIN
    read -p "管理员邮箱: " ADMIN_EMAIL
    
    # JWT Secret
    JWT_SECRET=$(openssl rand -base64 32)
    
    # 数据库配置
    echo ""
    echo "🗄️  数据库配置"
    echo "============="
    echo "选择数据库部署方式:"
    echo "1) 使用 Docker (推荐)"
    echo "2) 使用现有 PostgreSQL"
    read -p "选择 (1-2): " db_choice
    
    case $db_choice in
        1) 
            DB_HOST="localhost"
            DB_PORT="5432"
            DB_NAME="octopus_messenger"
            DB_USER="octopus"
            DB_PASSWORD=$(openssl rand -base64 16)
            USE_DOCKER_DB=true
            ;;
        2)
            read -p "数据库主机: " DB_HOST
            read -p "数据库端口 [5432]: " DB_PORT
            DB_PORT=${DB_PORT:-5432}
            read -p "数据库名称: " DB_NAME
            read -p "数据库用户: " DB_USER
            read -s -p "数据库密码: " DB_PASSWORD
            echo ""
            USE_DOCKER_DB=false
            ;;
    esac
}

# 生成配置文件
generate_config() {
    echo ""
    echo "📝 生成配置文件..."
    
    # 创建 .env 文件
    cat > .env << EOF
# Octopus Messenger 配置
NODE_ENV=production
PORT=3000

# 域名配置
DOMAIN=$DOMAIN
BASE_URL=https://$DOMAIN
ADMIN_URL=https://$DOMAIN/admin
DOCS_URL=https://$DOMAIN/docs

# JWT 配置
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# 数据库配置
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_SSL=false

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Telegram 配置
EOF

    if [[ $PLATFORMS == *"telegram"* ]]; then
        cat >> .env << EOF
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_URL=https://$DOMAIN/api/webhooks/telegram
EOF
    fi

    if [[ $PLATFORMS == *"discord"* ]]; then
        cat >> .env << EOF

# Discord 配置
DISCORD_ENABLED=true
DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID
DISCORD_PUBLIC_KEY=$DISCORD_PUBLIC_KEY
DISCORD_WEBHOOK_URL=https://$DOMAIN/api/webhooks/discord
EOF
    fi

    cat >> .env << EOF

# 邮件配置 (可选)
EMAIL_ENABLED=false
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
FROM_EMAIL=$ADMIN_EMAIL

# 对话式注册配置
AUTO_REGISTRATION_ENABLED=true
TRIAL_DAYS=7
TRIAL_MESSAGE_QUOTA=1000
DEFAULT_MAX_BOTS=3

# 支付配置 (可选)
STRIPE_ENABLED=false
STRIPE_PUBLIC_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EOF

    echo "✅ 配置文件已生成: .env"
}

# 创建 docker-compose.yml
generate_docker_compose() {
    echo "🐳 生成 Docker 配置..."
    
    cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  # 数据库
  postgres:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/migrations:/docker-entrypoint-initdb.d
    networks:
      - octopus-network

  # Redis
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    networks:
      - octopus-network

  # Gateway 服务
  gateway:
    build:
      context: .
      dockerfile: services/gateway/Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    networks:
      - octopus-network

  # Bot Manager 服务
  bot-manager:
    build:
      context: .
      dockerfile: services/bot-manager/Dockerfile
    restart: unless-stopped
    ports:
      - "3001:3001"
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
      - gateway
    networks:
      - octopus-network

  # AI 服务
  ai-service:
    build:
      context: .
      dockerfile: services/ai-service/Dockerfile
    restart: unless-stopped
    ports:
      - "3002:3002"
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    networks:
      - octopus-network

  # 消息处理服务
  message-processor:
    build:
      context: .
      dockerfile: services/message-processor/Dockerfile
    restart: unless-stopped
    ports:
      - "3003:3003"
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    networks:
      - octopus-network

volumes:
  postgres_data:

networks:
  octopus-network:
    driver: bridge
EOF

    echo "✅ Docker Compose 配置已生成"
}

# 初始化数据库
init_database() {
    echo ""
    echo "🗄️  初始化数据库..."
    
    if [[ $USE_DOCKER_DB == true ]]; then
        echo "启动数据库容器..."
        docker-compose up -d postgres
        
        # 等待数据库启动
        echo "等待数据库启动..."
        sleep 10
    fi
    
    # 运行数据库迁移
    echo "运行数据库迁移..."
    npm run db:migrate
    
    echo "✅ 数据库初始化完成"
}

# 启动服务
start_services() {
    echo ""
    echo "🚀 启动服务..."
    
    # 安装依赖
    echo "安装 Node.js 依赖..."
    npm install
    
    # 构建和启动所有服务
    echo "构建并启动服务..."
    docker-compose up -d
    
    # 等待服务启动
    echo "等待服务启动..."
    sleep 20
    
    # 检查服务状态
    echo "检查服务状态..."
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ Gateway 服务运行正常"
    else
        echo "❌ Gateway 服务启动失败"
    fi
    
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Bot Manager 服务运行正常"
    else
        echo "❌ Bot Manager 服务启动失败"
    fi
}

# 设置 Webhook
setup_webhooks() {
    echo ""
    echo "🔗 设置 Webhook..."
    
    # Telegram Webhook
    if [[ $PLATFORMS == *"telegram"* ]]; then
        echo "设置 Telegram Webhook..."
        curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
             -H "Content-Type: application/json" \
             -d "{\"url\": \"https://$DOMAIN/api/webhooks/telegram\"}"
        echo "✅ Telegram Webhook 设置完成"
    fi
    
    # Discord Webhook 需要在开发者门户手动设置
    if [[ $PLATFORMS == *"discord"* ]]; then
        echo "⚠️  Discord Webhook 需要手动设置:"
        echo "1. 访问 https://discord.com/developers/applications"
        echo "2. 选择您的应用 -> General Information"
        echo "3. 在 Interactions Endpoint URL 中填入:"
        echo "   https://$DOMAIN/api/webhooks/discord"
        echo ""
        read -p "按回车键继续..."
    fi
}

# 显示完成信息
show_completion_info() {
    echo ""
    echo "🎉 部署完成！"
    echo "============="
    echo ""
    echo "📊 服务信息:"
    echo "• Gateway API: https://$DOMAIN"
    echo "• 管理后台: https://$DOMAIN/admin"
    echo "• API 文档: https://$DOMAIN/api/docs"
    echo "• 健康检查: https://$DOMAIN/health"
    echo ""
    
    if [[ $PLATFORMS == *"telegram"* ]]; then
        echo "📱 Telegram Bot:"
        echo "• Bot Token: $TELEGRAM_BOT_TOKEN"
        echo "• Webhook: https://$DOMAIN/api/webhooks/telegram"
        echo ""
    fi
    
    if [[ $PLATFORMS == *"discord"* ]]; then
        echo "🎮 Discord Bot:"
        echo "• 邀请链接: https://discord.com/api/oauth2/authorize?client_id=$DISCORD_CLIENT_ID&permissions=2147484672&scope=bot%20applications.commands"
        echo "• Webhook: https://$DOMAIN/api/webhooks/discord"
        echo ""
    fi
    
    echo "🔧 下一步操作:"
    echo "1. 将Bot添加到您的群组"
    echo "2. 发送消息触发注册流程"
    echo "3. 按照Bot指引完成设置"
    echo ""
    echo "📚 文档和支持:"
    echo "• 使用文档: https://$DOMAIN/docs"
    echo "• GitHub: https://github.com/your-org/octopus-messenger"
    echo "• 技术支持: $ADMIN_EMAIL"
    echo ""
    echo "🎯 测试命令:"
    echo "curl https://$DOMAIN/health"
    echo ""
}

# 主函数
main() {
    echo "开始 Octopus Messenger 快速部署..."
    
    check_requirements
    interactive_setup
    generate_config
    
    if [[ $USE_DOCKER_DB == true ]]; then
        generate_docker_compose
    fi
    
    init_database
    start_services
    setup_webhooks
    show_completion_info
    
    echo "🎉 恭喜！您的 Octopus Messenger 已成功部署！"
}

# 如果脚本被直接执行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi 