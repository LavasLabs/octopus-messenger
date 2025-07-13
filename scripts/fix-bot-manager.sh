#!/bin/bash

# 修复 bot-manager 依赖问题的脚本

set -e

echo "🔧 修复 Bot Manager 依赖问题"
echo "============================"

# 检查是否在正确的目录
if [ ! -f "services/bot-manager/package.json" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

# 方法1: 禁用 puppeteer 的 Chrome 下载
fix_puppeteer_download() {
    echo "🚫 禁用 puppeteer 的 Chrome 自动下载..."
    
    cd services/bot-manager
    
    # 设置环境变量禁用 puppeteer 下载
    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    export PUPPETEER_SKIP_DOWNLOAD=true
    
    # 清理并重新安装
    rm -rf node_modules package-lock.json
    npm cache clean --force
    
    echo "📦 重新安装依赖（跳过 Chrome 下载）..."
    if npm install; then
        echo "✅ bot-manager 依赖安装成功"
        cd ../..
        return 0
    else
        echo "❌ 安装仍然失败"
        cd ../..
        return 1
    fi
}

# 方法2: 使用 puppeteer-core 替代 puppeteer
use_puppeteer_core() {
    echo "🔄 使用 puppeteer-core 替代 puppeteer..."
    
    cd services/bot-manager
    
    # 备份原始 package.json
    cp package.json package.json.backup
    
    # 替换 puppeteer 为 puppeteer-core
    sed -i.tmp 's/"puppeteer": ".*"/"puppeteer-core": "^24.12.1"/' package.json
    rm package.json.tmp
    
    # 清理并重新安装
    rm -rf node_modules package-lock.json
    npm cache clean --force
    
    echo "📦 安装 puppeteer-core..."
    if npm install; then
        echo "✅ 使用 puppeteer-core 安装成功"
        cd ../..
        return 0
    else
        echo "❌ puppeteer-core 安装失败，恢复原始配置"
        mv package.json.backup package.json
        cd ../..
        return 1
    fi
}

# 方法3: 完全移除 puppeteer 依赖
remove_puppeteer() {
    echo "🗑️  移除 puppeteer 依赖..."
    
    cd services/bot-manager
    
    # 备份原始 package.json
    cp package.json package.json.backup
    
    # 移除 puppeteer 依赖
    sed -i.tmp '/puppeteer/d' package.json
    rm package.json.tmp
    
    # 清理并重新安装
    rm -rf node_modules package-lock.json
    npm cache clean --force
    
    echo "📦 安装其他依赖..."
    if npm install; then
        echo "✅ 移除 puppeteer 后安装成功"
        echo "⚠️  注意：WhatsApp 功能将不可用"
        cd ../..
        return 0
    else
        echo "❌ 安装仍然失败，恢复原始配置"
        mv package.json.backup package.json
        cd ../..
        return 1
    fi
}

# 方法4: 手动安装 Chrome
install_chrome_manually() {
    echo "🌐 手动安装 Chrome..."
    
    if command -v google-chrome &> /dev/null; then
        echo "✅ Chrome 已安装"
        return 0
    fi
    
    echo "💡 请手动安装 Chrome 浏览器："
    echo "1. 访问 https://www.google.com/chrome/"
    echo "2. 下载并安装 Chrome"
    echo "3. 重新运行此脚本"
    
    return 1
}

# 显示选择菜单
show_menu() {
    echo ""
    echo "请选择修复方法："
    echo "1) 禁用 puppeteer Chrome 下载（推荐）"
    echo "2) 使用 puppeteer-core 替代"
    echo "3) 完全移除 puppeteer（WhatsApp 功能将不可用）"
    echo "4) 手动安装 Chrome"
    echo "5) 跳过 bot-manager，继续其他服务"
    echo ""
    read -p "选择 (1-5): " choice
    
    case $choice in
        1) fix_puppeteer_download ;;
        2) use_puppeteer_core ;;
        3) remove_puppeteer ;;
        4) install_chrome_manually ;;
        5) 
            echo "⏭️  跳过 bot-manager 服务"
            return 0
            ;;
        *) 
            echo "❌ 无效选择"
            return 1
            ;;
    esac
}

# 主函数
main() {
    echo "🔍 检测到 bot-manager 依赖问题..."
    echo "主要原因：puppeteer 需要下载 Chrome 浏览器"
    echo ""
    
    # 显示选择菜单
    if show_menu; then
        echo ""
        echo "🎉 bot-manager 问题已解决！"
        echo ""
        echo "💡 下一步："
        echo "• 运行 ./scripts/quick-start.sh 启动核心服务"
        echo "• 或运行 ./scripts/setup-local.sh 继续完整安装"
    else
        echo ""
        echo "❌ 修复失败，建议："
        echo "• 使用 ./scripts/quick-start.sh 跳过 bot-manager"
        echo "• 或稍后手动处理 bot-manager 依赖"
    fi
}

# 运行主函数
main "$@" 