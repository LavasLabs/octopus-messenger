#!/bin/bash

# 创建合并后的SQL文件
OUTPUT_FILE="../all_migrations.sql"

echo "-- =================================================================" > $OUTPUT_FILE
echo "-- Octopus Messenger 合并迁移文件" >> $OUTPUT_FILE
echo "-- 版本: 1.0.0 (合并所有迁移)" >> $OUTPUT_FILE
echo "-- 创建日期: $(date +%Y-%m-%d)" >> $OUTPUT_FILE
echo "-- 包含: 所有数据库迁移功能" >> $OUTPUT_FILE
echo "-- =================================================================" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# 按顺序合并文件
files=(
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
        echo "-- =================================================================" >> $OUTPUT_FILE
        echo "-- 来源: $file" >> $OUTPUT_FILE
        echo "-- =================================================================" >> $OUTPUT_FILE
        echo "" >> $OUTPUT_FILE
        
        # 跳过重复的扩展创建和其他重复内容
        cat "$file" | grep -v "^-- Octopus Messenger" | grep -v "^-- 版本:" | grep -v "^-- 创建日期:" | sed '/^$/N;/^\n$/d' >> $OUTPUT_FILE
        echo "" >> $OUTPUT_FILE
        echo "" >> $OUTPUT_FILE
    else
        echo "警告: 文件 $file 不存在"
    fi
done

echo "合并完成，输出文件: $OUTPUT_FILE"
