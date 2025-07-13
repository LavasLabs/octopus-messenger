#!/bin/bash

# 合并所有迁移文件到一个文件
OUTPUT_FILE="../all_migrations.sql"

echo "开始合并迁移文件..."

# 创建文件头
cat > $OUTPUT_FILE << 'HEADER'
-- =================================================================
-- Octopus Messenger 合并迁移文件
-- 版本: 1.0.0 (合并所有迁移)
-- 创建日期: 2024-01-01
-- 包含: 所有数据库迁移功能
-- =================================================================

HEADER

# 按顺序合并文件
declare -a files=(
    "001_initial_schema.sql"
    "002_add_discord_support.sql"
    "003_add_tenant_models.sql"
    "003_add_intercom_support.sql"
    "004_add_tenant_modes.sql"
    "004_add_user_tagging_system.sql"
    "005_add_group_authorization_system.sql"
    "007_add_merchant_system.sql"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "正在添加: $file"
        
        # 添加文件分隔符
        echo "" >> $OUTPUT_FILE
        echo "-- =================================================================" >> $OUTPUT_FILE
        echo "-- 来源: $file" >> $OUTPUT_FILE
        echo "-- =================================================================" >> $OUTPUT_FILE
        echo "" >> $OUTPUT_FILE
        
        # 添加文件内容，过滤掉注释头部
        tail -n +4 "$file" >> $OUTPUT_FILE
        echo "" >> $OUTPUT_FILE
        
    else
        echo "警告: 文件 $file 不存在"
    fi
done

echo "合并完成！输出文件: $OUTPUT_FILE"
echo "文件大小: $(wc -l < $OUTPUT_FILE) 行" 