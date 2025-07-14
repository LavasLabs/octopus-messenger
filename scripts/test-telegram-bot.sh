#!/bin/bash

set -e

echo "🤖 Telegram Bot 连通性测试..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查环境变量
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo -e "${RED}❌ TELEGRAM_BOT_TOKEN 环境变量未设置${NC}"
    echo -e "${YELLOW}请设置: export TELEGRAM_BOT_TOKEN=\"your_bot_token\"${NC}"
    exit 1
fi

echo -e "${BLUE}📋 测试配置:${NC}"
echo -e "  - Bot Token: ${TELEGRAM_BOT_TOKEN:0:10}...${TELEGRAM_BOT_TOKEN: -10}"

# 1. 测试Bot基本信息
echo -e "\n${BLUE}🔍 1. 测试Bot基本信息...${NC}"
BOT_INFO=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe")
if echo "$BOT_INFO" | jq -e '.ok' > /dev/null 2>&1; then
    BOT_USERNAME=$(echo "$BOT_INFO" | jq -r '.result.username')
    BOT_NAME=$(echo "$BOT_INFO" | jq -r '.result.first_name')
    echo -e "${GREEN}✅ Bot信息获取成功${NC}"
    echo -e "  - Bot名称: $BOT_NAME"
    echo -e "  - Bot用户名: @$BOT_USERNAME"
else
    echo -e "${RED}❌ Bot信息获取失败${NC}"
    echo -e "${YELLOW}响应: $BOT_INFO${NC}"
    exit 1
fi

# 2. 测试Webhook状态
echo -e "\n${BLUE}🔗 2. 测试Webhook状态...${NC}"
WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo")
if echo "$WEBHOOK_INFO" | jq -e '.ok' > /dev/null 2>&1; then
    WEBHOOK_URL=$(echo "$WEBHOOK_INFO" | jq -r '.result.url')
    PENDING_COUNT=$(echo "$WEBHOOK_INFO" | jq -r '.result.pending_update_count')
    LAST_ERROR=$(echo "$WEBHOOK_INFO" | jq -r '.result.last_error_message')
    
    echo -e "${GREEN}✅ Webhook信息获取成功${NC}"
    echo -e "  - Webhook URL: $WEBHOOK_URL"
    echo -e "  - 待处理消息: $PENDING_COUNT"
    
    if [ "$LAST_ERROR" != "null" ] && [ -n "$LAST_ERROR" ]; then
        echo -e "${YELLOW}⚠️ 最后错误: $LAST_ERROR${NC}"
    else
        echo -e "${GREEN}✅ 无错误记录${NC}"
    fi
else
    echo -e "${RED}❌ Webhook信息获取失败${NC}"
    echo -e "${YELLOW}响应: $WEBHOOK_INFO${NC}"
fi

# 3. 测试本地服务状态
echo -e "\n${BLUE}🏥 3. 测试本地服务状态...${NC}"
HEALTH_CHECK=$(curl -s http://localhost:3000/health 2>/dev/null || echo "failed")
if echo "$HEALTH_CHECK" | jq -e '.status' > /dev/null 2>&1; then
    SERVICE_STATUS=$(echo "$HEALTH_CHECK" | jq -r '.status')
    SERVICE_NAME=$(echo "$HEALTH_CHECK" | jq -r '.service')
    echo -e "${GREEN}✅ 本地服务健康${NC}"
    echo -e "  - 服务: $SERVICE_NAME"
    echo -e "  - 状态: $SERVICE_STATUS"
else
    echo -e "${RED}❌ 本地服务异常${NC}"
    echo -e "${YELLOW}响应: $HEALTH_CHECK${NC}"
fi

# 4. 测试API状态
echo -e "\n${BLUE}📊 4. 测试API状态...${NC}"
API_STATUS=$(curl -s http://localhost:3000/api/status 2>/dev/null || echo "failed")
if echo "$API_STATUS" | jq -e '.message' > /dev/null 2>&1; then
    API_MESSAGE=$(echo "$API_STATUS" | jq -r '.message')
    BOT_CONFIGURED=$(echo "$API_STATUS" | jq -r '.telegram_bot_configured')
    echo -e "${GREEN}✅ API状态正常${NC}"
    echo -e "  - 消息: $API_MESSAGE"
    echo -e "  - Bot配置: $BOT_CONFIGURED"
else
    echo -e "${RED}❌ API状态异常${NC}"
    echo -e "${YELLOW}响应: $API_STATUS${NC}"
fi

# 5. 实时日志监控
echo -e "\n${BLUE}📝 5. 启动实时日志监控...${NC}"
echo -e "${YELLOW}现在请在Telegram中向Bot发送消息进行测试${NC}"
echo -e "${YELLOW}Bot用户名: @$BOT_USERNAME${NC}"
echo -e "${YELLOW}按 Ctrl+C 停止监控${NC}"
echo -e "\n${BLUE}=== 实时日志 ===${NC}"

# 检查项目目录
if [ -d ~/octopus-messenger ]; then
    cd ~/octopus-messenger
    
    # 启动日志监控
    timeout 60 docker-compose logs -f gateway 2>/dev/null || {
        echo -e "\n${YELLOW}⏰ 监控超时或手动停止${NC}"
    }
else
    echo -e "${RED}❌ 项目目录不存在${NC}"
fi

# 6. 测试总结
echo -e "\n${BLUE}📋 测试总结:${NC}"
echo -e "\n${YELLOW}🧪 手动测试步骤:${NC}"
echo -e "1. 打开Telegram，搜索: @$BOT_USERNAME"
echo -e "2. 点击 'Start' 或发送 /start"
echo -e "3. 发送任意消息，如: 'Hello Bot!'"
echo -e "4. 观察服务器日志是否收到消息"

echo -e "\n${YELLOW}🔧 调试命令:${NC}"
echo -e "# 查看实时日志"
echo -e "cd ~/octopus-messenger && docker-compose logs -f gateway"
echo -e ""
echo -e "# 检查服务状态"
echo -e "cd ~/octopus-messenger && docker-compose ps"
echo -e ""
echo -e "# 重启服务"
echo -e "cd ~/octopus-messenger && docker-compose restart gateway"

echo -e "\n${YELLOW}🌐 测试URL:${NC}"
echo -e "# 本地健康检查"
echo -e "curl http://localhost:3000/health"
echo -e ""
echo -e "# 外部访问（如果配置了域名或ngrok）"
echo -e "curl https://your-domain.com/health"

echo -e "\n${GREEN}✅ 测试脚本执行完成${NC}"
echo -e "${BLUE}如果发现问题，请查看上述调试命令进行排查${NC}" 