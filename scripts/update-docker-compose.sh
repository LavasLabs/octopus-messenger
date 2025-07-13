#!/bin/bash

# 批量更新docker-compose为docker compose的脚本
# 适配新版本Docker CLI

echo "🔄 开始更新docker-compose命令为docker compose..."

# 定义要更新的文件类型和目录
files_to_update=(
    "*.md"
    "*.sh"
    "*.yml"
    "*.yaml"
    "*.txt"
)

# 更新函数
update_docker_compose() {
    local file="$1"
    
    # 检查文件是否存在且可读
    if [[ ! -f "$file" || ! -r "$file" ]]; then
        return
    fi
    
    # 创建备份
    cp "$file" "$file.backup"
    
    # 执行替换
    sed -i.tmp \
        -e 's/docker-compose --version/docker compose version/g' \
        -e 's/docker-compose up/docker compose up/g' \
        -e 's/docker-compose down/docker compose down/g' \
        -e 's/docker-compose ps/docker compose ps/g' \
        -e 's/docker-compose logs/docker compose logs/g' \
        -e 's/docker-compose exec/docker compose exec/g' \
        -e 's/docker-compose build/docker compose build/g' \
        -e 's/docker-compose restart/docker compose restart/g' \
        -e 's/docker-compose pull/docker compose pull/g' \
        -e 's/docker-compose -f/docker compose -f/g' \
        -e 's/docker-compose\.yml/docker-compose.yml/g' \
        "$file"
    
    # 清理临时文件
    rm -f "$file.tmp"
    
    echo "✅ 已更新: $file"
}

# 查找并更新所有相关文件
echo "📁 扫描项目文件..."

# 更新Markdown文档
find . -name "*.md" -type f | while read -r file; do
    if grep -q "docker-compose" "$file"; then
        update_docker_compose "$file"
    fi
done

# 更新Shell脚本
find . -name "*.sh" -type f | while read -r file; do
    if grep -q "docker-compose" "$file"; then
        update_docker_compose "$file"
    fi
done

# 更新其他配置文件
find . -name "*.txt" -type f | while read -r file; do
    if grep -q "docker-compose" "$file"; then
        update_docker_compose "$file"
    fi
done

echo ""
echo "🎉 更新完成！"
echo ""
echo "📋 更新摘要:"
echo "• 所有 docker-compose 命令已更新为 docker compose"
echo "• 文件备份已保存为 .backup 后缀"
echo "• docker-compose.yml 文件名保持不变"
echo ""
echo "⚠️  注意事项:"
echo "• 请确保你的Docker版本支持 docker compose 命令"
echo "• 如果遇到问题，可以使用备份文件恢复"
echo "• 建议测试更新后的命令是否正常工作"
echo ""
echo "🔍 验证更新:"
echo "docker compose version"
echo "docker compose config"
echo ""

# 清理备份文件的选项
read -p "是否删除备份文件？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    find . -name "*.backup" -type f -delete
    echo "✅ 备份文件已删除"
else
    echo "💾 备份文件已保留"
fi

echo "✨ 脚本执行完成！" 