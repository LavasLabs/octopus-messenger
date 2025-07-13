#!/bin/bash

# =================================================================
# Octopus Messenger 数据库初始化脚本
# =================================================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
DB_NAME=${1:-"octopus_messenger"}
DB_USER=${2:-"postgres"}
DB_HOST=${3:-"localhost"}
DB_PORT=${4:-"5432"}

echo -e "${BLUE}🐙 Octopus Messenger 数据库初始化${NC}"
echo "=================================="

echo -e "${YELLOW}📋 配置信息:${NC}"
echo "数据库名称: $DB_NAME"
echo "数据库用户: $DB_USER" 
echo "数据库地址: $DB_HOST:$DB_PORT"
echo

# 检查PostgreSQL连接
echo -e "${BLUE}🔍 检查数据库连接...${NC}"
if ! psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c '\l' > /dev/null 2>&1; then
    echo -e "${RED}❌ 无法连接到PostgreSQL数据库${NC}"
    echo "请确保："
    echo "1. PostgreSQL服务已启动"
    echo "2. 数据库连接信息正确"
    echo "3. 当前用户有数据库访问权限"
    exit 1
fi
echo -e "${GREEN}✅ 数据库连接成功${NC}"

# 创建数据库（如果不存在）
echo -e "${BLUE}🏗️ 创建数据库...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo "数据库 $DB_NAME 已存在"

# 运行初始化脚本
echo -e "${BLUE}📊 执行数据库初始化...${NC}"
if [ -f "database/init.sql" ]; then
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f database/init.sql
    echo -e "${GREEN}✅ 数据库初始化完成${NC}"
else
    echo -e "${RED}❌ 找不到 database/init.sql 文件${NC}"
    exit 1
fi

# 验证数据库表
echo -e "${BLUE}🔍 验证数据库表...${NC}"
TABLE_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "创建的表数量: $TABLE_COUNT"

if [ $TABLE_COUNT -gt 20 ]; then
    echo -e "${GREEN}✅ 数据库表创建成功${NC}"
else
    echo -e "${YELLOW}⚠️ 创建的表数量较少，请检查初始化脚本${NC}"
fi

echo
echo -e "${GREEN}🎉 Octopus Messenger 数据库初始化成功！${NC}"
echo
echo -e "${YELLOW}📚 下一步操作:${NC}"
echo "1. 配置环境变量 (复制 docs/env-template.env)"
echo "2. 启动服务: npm run start"
echo "3. 访问管理面板: http://localhost:3005"
echo "4. 查看API文档: http://localhost:3000/api/docs"
echo
echo -e "${BLUE}🏪 商户系统功能:${NC}"
echo "• 创建商户: POST /api/merchants"
echo "• 生成邀请码: POST /api/merchants/{id}/invite-codes"  
echo "• 绑定Bot: POST /api/bots (使用merchantId或inviteCode)"
echo "• 跨平台数据同步: 自动完成"
echo
echo -e "${GREEN}🚀 开始使用 Octopus Messenger！${NC}" 