#!/bin/bash

set -e

echo "🔄 更新Octopus Messenger代码并重新部署..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
PROJECT_NAME=${PROJECT_NAME:-octopus-messenger}
WORK_DIR="/home/$(whoami)/$PROJECT_NAME"
BACKUP_DIR="/home/$(whoami)/${PROJECT_NAME}_backup_$(date +%Y%m%d_%H%M%S)"
UPDATE_METHOD=${UPDATE_METHOD:-"local"}  # local, git, upload

echo -e "${BLUE}📋 更新配置:${NC}"
echo -e "  - 项目目录: $WORK_DIR"
echo -e "  - 备份目录: $BACKUP_DIR"
echo -e "  - 更新方式: $UPDATE_METHOD"
echo -e "  - 当前用户: $(whoami)"

# 检查项目目录是否存在
if [ ! -d "$WORK_DIR" ]; then
    echo -e "${RED}❌ 项目目录不存在: $WORK_DIR${NC}"
    echo -e "${YELLOW}请先运行初始部署脚本${NC}"
    exit 1
fi

cd $WORK_DIR

# 1. 显示当前状态
echo -e "${BLUE}📊 当前服务状态:${NC}"
docker-compose ps

# 2. 备份当前版本
echo -e "${BLUE}💾 备份当前版本...${NC}"
cp -r $WORK_DIR $BACKUP_DIR
echo -e "${GREEN}✅ 备份完成: $BACKUP_DIR${NC}"

# 3. 根据更新方式处理代码
case $UPDATE_METHOD in
    "git")
        echo -e "${BLUE}🔄 从Git仓库拉取最新代码...${NC}"
        if [ -d ".git" ]; then
            # 保存本地修改
            git stash push -m "Auto stash before update $(date)"
            
            # 拉取最新代码
            git pull origin main
            
            # 显示更新信息
            echo -e "${GREEN}✅ 代码更新完成${NC}"
            git log --oneline -5
        else
            echo -e "${YELLOW}⚠️ 不是Git仓库，请使用其他更新方式${NC}"
            exit 1
        fi
        ;;
    
    "local")
        echo -e "${BLUE}📁 使用本地代码更新...${NC}"
        echo -e "${YELLOW}请确保您已经将新代码复制到项目目录${NC}"
        echo -e "${YELLOW}如果需要上传新代码，请使用以下命令:${NC}"
        echo -e "  scp -r ./local_code/* user@server:$WORK_DIR/"
        
        read -p "代码已更新完成，继续部署? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}❌ 更新已取消${NC}"
            exit 1
        fi
        ;;
    
    "upload")
        echo -e "${BLUE}📤 等待代码上传...${NC}"
        echo -e "${YELLOW}请使用以下命令上传代码:${NC}"
        echo -e "  # 上传整个项目"
        echo -e "  scp -r ./your_project/* $(whoami)@$(hostname -I | awk '{print $1}'):$WORK_DIR/"
        echo -e ""
        echo -e "  # 或者只上传服务代码"
        echo -e "  scp -r ./services/* $(whoami)@$(hostname -I | awk '{print $1}'):$WORK_DIR/services/"
        echo -e ""
        
        read -p "代码上传完成，继续部署? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}❌ 更新已取消${NC}"
            exit 1
        fi
        ;;
    
    *)
        echo -e "${RED}❌ 不支持的更新方式: $UPDATE_METHOD${NC}"
        exit 1
        ;;
esac

# 4. 检查代码变更
echo -e "${BLUE}🔍 检查代码变更...${NC}"
if [ -f "services/gateway/package.json" ]; then
    echo -e "${GREEN}✅ Gateway服务代码存在${NC}"
else
    echo -e "${YELLOW}⚠️ Gateway服务代码不存在，使用备份版本${NC}"
    cp -r $BACKUP_DIR/services/gateway ./services/
fi

if [ -f "services/admin-panel/package.json" ]; then
    echo -e "${GREEN}✅ Admin Panel服务代码存在${NC}"
else
    echo -e "${YELLOW}⚠️ Admin Panel服务代码不存在，使用备份版本${NC}"
    cp -r $BACKUP_DIR/services/admin-panel ./services/
fi

# 5. 停止当前服务
echo -e "${BLUE}🛑 停止当前服务...${NC}"
docker-compose down

# 6. 清理旧的容器和镜像（可选）
read -p "是否清理旧的Docker镜像以节省空间? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🧹 清理Docker镜像...${NC}"
    docker system prune -f
    docker images | grep node | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true
fi

# 7. 重新构建和启动服务
echo -e "${BLUE}🔨 重新构建服务...${NC}"
docker-compose build --no-cache

echo -e "${BLUE}🚀 启动服务...${NC}"
docker-compose up -d

# 8. 等待服务启动
echo -e "${YELLOW}⏳ 等待服务启动...${NC}"
sleep 30

# 9. 健康检查
echo -e "${BLUE}🏥 服务健康检查...${NC}"
GATEWAY_HEALTH=$(curl -s http://localhost:3000/health || echo "failed")
ADMIN_HEALTH=$(curl -s http://localhost:3005/health || echo "failed")

if echo "$GATEWAY_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Gateway服务健康${NC}"
else
    echo -e "${RED}❌ Gateway服务异常${NC}"
    echo -e "${YELLOW}查看日志: docker-compose logs gateway${NC}"
fi

if echo "$ADMIN_HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Admin Panel服务健康${NC}"
else
    echo -e "${RED}❌ Admin Panel服务异常${NC}"
    echo -e "${YELLOW}查看日志: docker-compose logs admin-panel${NC}"
fi

# 10. 显示服务状态
echo -e "${BLUE}📊 更新后服务状态:${NC}"
docker-compose ps

# 11. 获取访问信息
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com/ || curl -s http://ipinfo.io/ip || echo "无法获取公网IP")
PRIVATE_IP=$(hostname -I | awk '{print $1}')

echo -e "${GREEN}🎉 代码更新完成!${NC}"
echo -e "${BLUE}📋 服务信息:${NC}"
echo -e "  - 公网IP: $PUBLIC_IP"
echo -e "  - 内网IP: $PRIVATE_IP"
echo -e "  - 备份位置: $BACKUP_DIR"

echo -e "${BLUE}🔗 访问地址:${NC}"
echo -e "  - Gateway API: http://$PUBLIC_IP:3000"
echo -e "  - 健康检查: http://$PUBLIC_IP:3000/health"
echo -e "  - 管理面板: http://$PUBLIC_IP:3005"

echo -e "${BLUE}🛠️ 管理命令:${NC}"
echo -e "  - 查看日志: docker-compose logs -f"
echo -e "  - 重启服务: docker-compose restart"
echo -e "  - 查看状态: docker-compose ps"

echo -e "${BLUE}🔄 回滚命令:${NC}"
echo -e "  - 如果更新有问题，可以回滚到备份版本:"
echo -e "  - cd $WORK_DIR && docker-compose down"
echo -e "  - rm -rf $WORK_DIR && mv $BACKUP_DIR $WORK_DIR"
echo -e "  - cd $WORK_DIR && docker-compose up -d"

# 12. 测试建议
echo -e "${BLUE}🧪 测试建议:${NC}"
echo -e "  1. 访问健康检查接口验证服务状态"
echo -e "  2. 测试Telegram Bot功能"
echo -e "  3. 检查管理面板功能"
echo -e "  4. 查看日志确认无错误"

echo -e "${YELLOW}⚠️ 注意事项:${NC}"
echo -e "  - 备份文件位于: $BACKUP_DIR"
echo -e "  - 如果服务异常，请查看日志排查问题"
echo -e "  - 可以使用备份快速回滚"

echo -e "${GREEN}✅ 更新脚本执行完成!${NC}" 