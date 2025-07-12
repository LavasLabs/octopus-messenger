#!/bin/bash

# Octopus Messenger 本地部署配置脚本

set -e

echo "🐙 Octopus Messenger 本地部署配置脚本"
echo "================================================"

# 检查必需的工具
check_requirements() {
    echo "📋 检查系统要求..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js 未安装。请安装 Node.js 18+ 版本"
        exit 1
    fi
    
    node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        echo "❌ Node.js 版本过低，当前版本：$(node -v)，需要 18+"
        exit 1
    fi
    echo "✅ Node.js 版本：$(node -v)"
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        echo "❌ npm 未安装"
        exit 1
    fi
    echo "✅ npm 版本：$(npm -v)"
    
    # 检查 Docker（可选）
    if command -v docker &> /dev/null; then
        echo "✅ Docker 版本：$(docker -v)"
    else
        echo "⚠️  Docker 未安装（可选，但推荐用于数据库）"
    fi
    
    # 检查 PostgreSQL
    if command -v psql &> /dev/null; then
        echo "✅ PostgreSQL 已安装"
    else
        echo "⚠️  PostgreSQL 未安装（将建议使用 Docker）"
    fi
    
    # 检查 Redis
    if command -v redis-cli &> /dev/null; then
        echo "✅ Redis 已安装"
    else
        echo "⚠️  Redis 未安装（将建议使用 Docker）"
    fi
}

# 创建环境配置文件
create_env_file() {
    echo ""
    echo "📝 创建环境配置文件..."
    
    if [ -f ".env" ]; then
        echo "⚠️  .env 文件已存在"
        read -p "是否覆盖现有配置？(y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "跳过环境配置文件创建"
            return
        fi
    fi
    
    # 复制模板文件
    cp docs/env-template.txt .env
    echo "✅ 已创建 .env 文件（从模板复制）"
    
    # 生成随机密钥
    jwt_secret=$(openssl rand -hex 32)
    service_token=$(openssl rand -hex 24)
    
    # 更新密钥
    sed -i.bak "s/请生成一个256位的随机密钥/$jwt_secret/g" .env
    sed -i.bak "s/请生成一个服务间通信密钥/$service_token/g" .env
    rm .env.bak
    
    echo "✅ 已生成随机密钥"
}

# 配置数据库
setup_database() {
    echo ""
    echo "🗄️  配置数据库..."
    
    echo "选择数据库配置方式："
    echo "1) 使用 Docker (推荐)"
    echo "2) 使用本地安装的数据库"
    echo "3) 跳过数据库配置"
    
    read -p "请选择 (1-3): " -n 1 -r db_choice
    echo
    
    case $db_choice in
        1)
            setup_docker_database
            ;;
        2)
            setup_local_database
            ;;
        3)
            echo "⏭️  跳过数据库配置"
            ;;
        *)
            echo "❌ 无效选择，跳过数据库配置"
            ;;
    esac
}

# 使用 Docker 配置数据库
setup_docker_database() {
    echo "🐳 使用 Docker 启动数据库..."
    
    # 检查 Docker 是否运行
    if ! docker info &> /dev/null; then
        echo "❌ Docker 未运行，请启动 Docker"
        return
    fi
    
    # 启动 PostgreSQL
    echo "启动 PostgreSQL..."
    docker run -d \
        --name octopus-postgres \
        -p 5432:5432 \
        -e POSTGRES_DB=octopus_messenger \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=octopus123 \
        -v octopus_postgres_data:/var/lib/postgresql/data \
        postgres:14-alpine
    
    # 启动 Redis
    echo "启动 Redis..."
    docker run -d \
        --name octopus-redis \
        -p 6379:6379 \
        -v octopus_redis_data:/data \
        redis:7-alpine
    
    # 更新 .env 文件
    sed -i.bak "s/请填入您的PostgreSQL密码/octopus123/g" .env
    rm .env.bak
    
    echo "✅ 数据库容器已启动"
    echo "   PostgreSQL: localhost:5432"
    echo "   Redis: localhost:6379"
    echo "   密码已更新到 .env 文件"
}

# 配置本地数据库
setup_local_database() {
    echo "💻 配置本地数据库..."
    
    # PostgreSQL 配置
    echo "配置 PostgreSQL："
    read -p "PostgreSQL 主机 (localhost): " pg_host
    pg_host=${pg_host:-localhost}
    
    read -p "PostgreSQL 端口 (5432): " pg_port
    pg_port=${pg_port:-5432}
    
    read -p "PostgreSQL 用户名 (postgres): " pg_user
    pg_user=${pg_user:-postgres}
    
    read -s -p "PostgreSQL 密码: " pg_password
    echo
    
    # 更新 .env 文件
    sed -i.bak "s/localhost/$pg_host/g" .env
    sed -i.bak "s/5432/$pg_port/g" .env
    sed -i.bak "s/postgres/$pg_user/g" .env
    sed -i.bak "s/请填入您的PostgreSQL密码/$pg_password/g" .env
    rm .env.bak
    
    echo "✅ PostgreSQL 配置已更新"
}

# 配置 AI 服务
setup_ai_service() {
    echo ""
    echo "🤖 配置 AI 服务..."
    
    echo "选择 AI 服务提供商："
    echo "1) OpenAI (推荐)"
    echo "2) Claude"
    echo "3) 都配置"
    echo "4) 跳过"
    
    read -p "请选择 (1-4): " -n 1 -r ai_choice
    echo
    
    case $ai_choice in
        1|3)
            read -p "请输入 OpenAI API Key (sk-...): " openai_key
            if [ ! -z "$openai_key" ]; then
                sed -i.bak "s/sk-请填入您的OpenAI API密钥/$openai_key/g" .env
                rm .env.bak
                echo "✅ OpenAI API Key 已配置"
            fi
            ;&
        2|3)
            if [ "$ai_choice" = "2" ] || [ "$ai_choice" = "3" ]; then
                read -p "请输入 Claude API Key: " claude_key
                if [ ! -z "$claude_key" ]; then
                    sed -i.bak "s/请填入您的Claude API密钥/$claude_key/g" .env
                    rm .env.bak
                    echo "✅ Claude API Key 已配置"
                fi
            fi
            ;;
        4)
            echo "⏭️  跳过 AI 服务配置"
            ;;
        *)
            echo "❌ 无效选择，跳过 AI 服务配置"
            ;;
    esac
}

# 安装依赖
install_dependencies() {
    echo ""
    echo "📦 安装项目依赖..."
    
    npm install
    echo "✅ 依赖安装完成"
}

# 初始化数据库
init_database() {
    echo ""
    echo "🔧 初始化数据库..."
    
    # 等待数据库启动
    echo "等待数据库启动..."
    sleep 5
    
    # 运行数据库迁移
    npm run db:migrate 2>/dev/null || {
        echo "⚠️  数据库迁移失败，可能是数据库连接问题"
        echo "请检查数据库配置并手动运行：npm run db:migrate"
        return
    }
    
    echo "✅ 数据库迁移完成"
}

# 测试配置
test_configuration() {
    echo ""
    echo "🧪 测试配置..."
    
    # 测试健康检查端点
    echo "启动服务进行测试..."
    timeout 30s npm run dev:gateway &
    gateway_pid=$!
    
    sleep 10
    
    # 测试健康检查
    if curl -s http://localhost:3000/health > /dev/null; then
        echo "✅ 服务启动成功"
    else
        echo "⚠️  服务可能未正常启动"
    fi
    
    # 停止测试服务
    kill $gateway_pid 2>/dev/null || true
}

# 显示启动说明
show_usage() {
    echo ""
    echo "🎉 配置完成！"
    echo "================================================"
    echo ""
    echo "下一步操作："
    echo ""
    echo "1. 启动所有服务："
    echo "   npm run dev"
    echo ""
    echo "2. 或单独启动服务："
    echo "   npm run dev:gateway        # API 网关 (端口 3000)"
    echo "   npm run dev:admin-panel    # 管理面板 (端口 3005)"
    echo ""
    echo "3. 访问管理面板："
    echo "   http://localhost:3005"
    echo ""
    echo "4. API 文档："
    echo "   http://localhost:3000/api/docs"
    echo ""
    echo "5. 健康检查："
    echo "   http://localhost:3000/health"
    echo ""
    echo "📚 更多配置选项请查看："
    echo "   - docs/Local-Deployment-Guide.md"
    echo "   - docs/Bot-Configuration-Guide.md"
    echo "   - docs/CRM-Integration-Guide.md"
    echo ""
    echo "❓ 如有问题，请查看日志文件：logs/app.log"
}

# 主函数
main() {
    echo "开始配置 Octopus Messenger 本地开发环境..."
    echo ""
    
    check_requirements
    create_env_file
    setup_database
    setup_ai_service
    install_dependencies
    init_database
    show_usage
    
    echo ""
    echo "✨ 配置完成！祝您使用愉快！"
}

# 运行主函数
main "$@" 