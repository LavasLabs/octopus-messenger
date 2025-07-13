#!/bin/bash

# Octopus Messenger Docker 一键启动脚本
# 适配新版本 Docker Compose (docker compose)

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查Docker和Docker Compose
check_prerequisites() {
    log_info "检查系统环境..."
    
    # 检查Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    # 检查Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose 不可用，请确保使用 Docker Desktop 或安装 Docker Compose Plugin"
        exit 1
    fi
    
    log_success "Docker 和 Docker Compose 检查通过"
}

# 创建必要的目录
create_directories() {
    log_info "创建必要的目录..."
    
    mkdir -p logs
    mkdir -p database/init
    mkdir -p nginx/ssl
    mkdir -p monitoring/grafana/provisioning
    
    log_success "目录创建完成"
}

# 停止现有容器
stop_containers() {
    log_info "停止现有容器..."
    
    if docker compose ps | grep -q "Up"; then
        docker compose down
        log_success "现有容器已停止"
    else
        log_info "没有运行中的容器"
    fi
}

# 清理数据卷（可选）
cleanup_volumes() {
    if [ "$1" = "--clean" ]; then
        log_warning "清理数据卷..."
        docker compose down -v
        log_success "数据卷已清理"
    fi
}

# 构建镜像
build_images() {
    log_info "构建Docker镜像..."
    
    docker compose build --no-cache
    log_success "镜像构建完成"
}

# 启动数据库服务
start_databases() {
    log_info "启动数据库服务..."
    
    # 使用环境变量文件
    if [ -f "docker.env" ]; then
        docker compose --env-file docker.env up -d postgres redis mongodb
    else
        docker compose up -d postgres redis mongodb
    fi
    
    log_info "等待数据库启动..."
    
    # 等待PostgreSQL
    log_info "等待 PostgreSQL 启动..."
    until docker compose exec postgres pg_isready -U postgres -d octopus_messenger; do
        sleep 2
    done
    log_success "PostgreSQL 已就绪"
    
    # 等待Redis
    log_info "等待 Redis 启动..."
    until docker compose exec redis redis-cli -a redis123 ping; do
        sleep 2
    done
    log_success "Redis 已就绪"
    
    # 等待MongoDB
    log_info "等待 MongoDB 启动..."
    until docker compose exec mongodb mongosh --eval "db.adminCommand('ping')" --quiet; do
        sleep 2
    done
    log_success "MongoDB 已就绪"
}

# 启动应用服务
start_services() {
    log_info "启动应用服务..."
    
    if [ -f "docker.env" ]; then
        docker compose --env-file docker.env up -d gateway message-processor ai-service task-service bot-manager admin-panel
    else
        docker compose up -d gateway message-processor ai-service task-service bot-manager admin-panel
    fi
    
    log_success "应用服务已启动"
}

# 启动监控和代理服务
start_monitoring() {
    log_info "启动监控和代理服务..."
    
    if [ -f "docker.env" ]; then
        docker compose --env-file docker.env up -d nginx prometheus grafana
    else
        docker compose up -d nginx prometheus grafana
    fi
    
    log_success "监控和代理服务已启动"
}

# 启动管理工具
start_management_tools() {
    log_info "启动数据库管理工具..."
    
    if [ -f "docker.env" ]; then
        docker compose --env-file docker.env up -d pgadmin redis-commander mongo-express
    else
        docker compose up -d pgadmin redis-commander mongo-express
    fi
    
    log_success "管理工具已启动"
}

# 检查服务状态
check_services() {
    log_info "检查服务状态..."
    
    echo ""
    docker compose ps
    echo ""
    
    # 检查关键服务的健康状态
    services=("postgres" "redis" "mongodb" "gateway" "message-processor" "ai-service" "task-service" "bot-manager" "admin-panel")
    
    for service in "${services[@]}"; do
        if docker compose ps "$service" | grep -q "Up"; then
            log_success "$service 服务运行正常"
        else
            log_error "$service 服务启动失败"
        fi
    done
}

# 显示访问信息
show_access_info() {
    log_info "服务访问信息:"
    echo ""
    echo "🌐 主要服务:"
    echo "  • 网关服务:      http://localhost:3000"
    echo "  • 管理面板:      http://localhost:3005"
    echo "  • Nginx代理:     http://localhost:80"
    echo ""
    echo "📊 监控面板:"
    echo "  • Grafana:       http://localhost:3001 (admin/admin123)"
    echo "  • Prometheus:    http://localhost:9090"
    echo ""
    echo "🔧 数据库管理:"
    echo "  • pgAdmin:       http://localhost:5050 (admin@octopus.com/admin123)"
    echo "  • Redis Commander: http://localhost:8081"
    echo "  • Mongo Express: http://localhost:8082 (admin/admin123)"
    echo ""
    echo "📋 常用命令:"
    echo "  • 查看日志:      docker compose logs -f"
    echo "  • 重启服务:      docker compose restart [服务名]"
    echo "  • 停止所有:      docker compose down"
    echo "  • 清理重启:      ./scripts/docker-start.sh --clean"
    echo ""
    echo "🔍 健康检查:"
    echo "  • 网关健康:      curl http://localhost:3000/health"
    echo "  • 所有服务状态:  docker compose ps"
    echo ""
}

# 主函数
main() {
    echo "🐙 Octopus Messenger Docker 启动脚本"
    echo "========================================"
    echo ""
    
    # 检查参数
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        echo "用法: $0 [选项]"
        echo ""
        echo "选项:"
        echo "  --clean    清理数据卷后重新启动"
        echo "  --build    重新构建镜像"
        echo "  --help     显示此帮助信息"
        echo ""
        exit 0
    fi
    
    # 执行启动流程
    check_prerequisites
    create_directories
    stop_containers
    cleanup_volumes "$1"
    
    if [ "$1" = "--build" ]; then
        build_images
    fi
    
    start_databases
    start_services
    start_monitoring
    start_management_tools
    
    sleep 5  # 等待服务完全启动
    
    check_services
    show_access_info
    
    log_success "🎉 Octopus Messenger 启动完成！"
}

# 运行主函数
main "$@" 