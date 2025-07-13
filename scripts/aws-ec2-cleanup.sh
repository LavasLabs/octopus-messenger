#!/bin/bash

set -e

echo "🗑️ 清理AWS EC2测试环境资源..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
AWS_REGION=${AWS_REGION:-us-east-1}
PROJECT_NAME=${PROJECT_NAME:-octopus-messenger-test}
KEY_NAME=${KEY_NAME:-octopus-messenger-key}

echo -e "${BLUE}📋 清理配置:${NC}"
echo -e "  - 项目名称: $PROJECT_NAME"
echo -e "  - AWS区域: $AWS_REGION"
echo -e "  - 密钥名称: $KEY_NAME"

# 确认清理
read -p "⚠️  确认删除所有 $PROJECT_NAME 相关的AWS资源? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ 清理已取消${NC}"
    exit 1
fi

echo -e "${BLUE}🔄 开始清理资源...${NC}"

# 1. 查找并终止EC2实例
echo -e "${BLUE}🖥️ 查找并终止EC2实例...${NC}"
INSTANCE_IDS=$(aws ec2 describe-instances \
    --filters "Name=tag:Project,Values=$PROJECT_NAME" "Name=instance-state-name,Values=running,stopped,stopping" \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text \
    --region $AWS_REGION)

if [ -n "$INSTANCE_IDS" ] && [ "$INSTANCE_IDS" != "None" ]; then
    echo -e "${BLUE}🔍 找到实例: $INSTANCE_IDS${NC}"
    
    # 获取实例信息
    for INSTANCE_ID in $INSTANCE_IDS; do
        echo -e "${BLUE}📋 实例 $INSTANCE_ID 信息:${NC}"
        aws ec2 describe-instances \
            --instance-ids $INSTANCE_ID \
            --query 'Reservations[0].Instances[0].{InstanceId:InstanceId,State:State.Name,PublicIP:PublicIpAddress,LaunchTime:LaunchTime}' \
            --output table \
            --region $AWS_REGION
    done
    
    # 终止实例
    echo -e "${BLUE}🛑 终止实例...${NC}"
    aws ec2 terminate-instances \
        --instance-ids $INSTANCE_IDS \
        --region $AWS_REGION
    
    echo -e "${YELLOW}⏳ 等待实例终止...${NC}"
    aws ec2 wait instance-terminated --instance-ids $INSTANCE_IDS --region $AWS_REGION
    
    echo -e "${GREEN}✅ 实例已终止${NC}"
else
    echo -e "${YELLOW}⚠️ 未找到相关实例${NC}"
fi

# 2. 删除安全组
echo -e "${BLUE}🔒 删除安全组...${NC}"
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)

SECURITY_GROUP_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$PROJECT_NAME-sg" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text \
    --region $AWS_REGION \
    2>/dev/null || echo "none")

if [ "$SECURITY_GROUP_ID" != "none" ] && [ "$SECURITY_GROUP_ID" != "None" ]; then
    echo -e "${BLUE}🔍 找到安全组: $SECURITY_GROUP_ID${NC}"
    
    # 等待一段时间确保实例完全终止
    echo -e "${YELLOW}⏳ 等待实例完全终止...${NC}"
    sleep 30
    
    # 删除安全组
    aws ec2 delete-security-group \
        --group-id $SECURITY_GROUP_ID \
        --region $AWS_REGION \
        2>/dev/null && echo -e "${GREEN}✅ 安全组已删除${NC}" || echo -e "${YELLOW}⚠️ 安全组删除失败或不存在${NC}"
else
    echo -e "${YELLOW}⚠️ 未找到相关安全组${NC}"
fi

# 3. 删除密钥对
echo -e "${BLUE}🔑 删除密钥对...${NC}"
if aws ec2 describe-key-pairs --key-names $KEY_NAME --region $AWS_REGION >/dev/null 2>&1; then
    aws ec2 delete-key-pair \
        --key-name $KEY_NAME \
        --region $AWS_REGION
    
    # 删除本地密钥文件
    if [ -f ~/.ssh/${KEY_NAME}.pem ]; then
        rm -f ~/.ssh/${KEY_NAME}.pem
        echo -e "${GREEN}✅ 本地密钥文件已删除${NC}"
    fi
    
    echo -e "${GREEN}✅ 密钥对已删除${NC}"
else
    echo -e "${YELLOW}⚠️ 密钥对不存在${NC}"
fi

# 4. 清理弹性IP（如果有）
echo -e "${BLUE}🌐 检查弹性IP...${NC}"
ELASTIC_IPS=$(aws ec2 describe-addresses \
    --filters "Name=tag:Project,Values=$PROJECT_NAME" \
    --query 'Addresses[].AllocationId' \
    --output text \
    --region $AWS_REGION)

if [ -n "$ELASTIC_IPS" ] && [ "$ELASTIC_IPS" != "None" ]; then
    echo -e "${BLUE}🔍 找到弹性IP: $ELASTIC_IPS${NC}"
    
    for ALLOCATION_ID in $ELASTIC_IPS; do
        # 解除关联
        aws ec2 disassociate-address \
            --allocation-id $ALLOCATION_ID \
            --region $AWS_REGION \
            2>/dev/null || echo "IP未关联或已解除关联"
        
        # 释放IP
        aws ec2 release-address \
            --allocation-id $ALLOCATION_ID \
            --region $AWS_REGION \
            2>/dev/null && echo -e "${GREEN}✅ 弹性IP $ALLOCATION_ID 已释放${NC}" || echo -e "${YELLOW}⚠️ 弹性IP释放失败${NC}"
    done
else
    echo -e "${YELLOW}⚠️ 未找到相关弹性IP${NC}"
fi

# 5. 清理卷（如果有未附加的）
echo -e "${BLUE}💾 检查未附加的卷...${NC}"
VOLUMES=$(aws ec2 describe-volumes \
    --filters "Name=tag:Project,Values=$PROJECT_NAME" "Name=state,Values=available" \
    --query 'Volumes[].VolumeId' \
    --output text \
    --region $AWS_REGION)

if [ -n "$VOLUMES" ] && [ "$VOLUMES" != "None" ]; then
    echo -e "${BLUE}🔍 找到未附加的卷: $VOLUMES${NC}"
    
    for VOLUME_ID in $VOLUMES; do
        aws ec2 delete-volume \
            --volume-id $VOLUME_ID \
            --region $AWS_REGION \
            2>/dev/null && echo -e "${GREEN}✅ 卷 $VOLUME_ID 已删除${NC}" || echo -e "${YELLOW}⚠️ 卷删除失败${NC}"
    done
else
    echo -e "${YELLOW}⚠️ 未找到相关卷${NC}"
fi

# 6. 清理快照（如果有）
echo -e "${BLUE}📸 检查快照...${NC}"
SNAPSHOTS=$(aws ec2 describe-snapshots \
    --owner-ids self \
    --filters "Name=tag:Project,Values=$PROJECT_NAME" \
    --query 'Snapshots[].SnapshotId' \
    --output text \
    --region $AWS_REGION)

if [ -n "$SNAPSHOTS" ] && [ "$SNAPSHOTS" != "None" ]; then
    echo -e "${BLUE}🔍 找到快照: $SNAPSHOTS${NC}"
    
    for SNAPSHOT_ID in $SNAPSHOTS; do
        aws ec2 delete-snapshot \
            --snapshot-id $SNAPSHOT_ID \
            --region $AWS_REGION \
            2>/dev/null && echo -e "${GREEN}✅ 快照 $SNAPSHOT_ID 已删除${NC}" || echo -e "${YELLOW}⚠️ 快照删除失败${NC}"
    done
else
    echo -e "${YELLOW}⚠️ 未找到相关快照${NC}"
fi

# 7. 验证清理结果
echo -e "${BLUE}✅ 验证清理结果...${NC}"

# 检查实例
REMAINING_INSTANCES=$(aws ec2 describe-instances \
    --filters "Name=tag:Project,Values=$PROJECT_NAME" "Name=instance-state-name,Values=running,stopped,stopping" \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text \
    --region $AWS_REGION)

if [ -z "$REMAINING_INSTANCES" ] || [ "$REMAINING_INSTANCES" = "None" ]; then
    echo -e "${GREEN}✅ 所有实例已清理${NC}"
else
    echo -e "${RED}❌ 仍有实例未清理: $REMAINING_INSTANCES${NC}"
fi

# 检查安全组
REMAINING_SG=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$PROJECT_NAME-sg" \
    --query 'SecurityGroups[].GroupId' \
    --output text \
    --region $AWS_REGION \
    2>/dev/null || echo "")

if [ -z "$REMAINING_SG" ] || [ "$REMAINING_SG" = "None" ]; then
    echo -e "${GREEN}✅ 安全组已清理${NC}"
else
    echo -e "${RED}❌ 仍有安全组未清理: $REMAINING_SG${NC}"
fi

# 检查密钥对
if aws ec2 describe-key-pairs --key-names $KEY_NAME --region $AWS_REGION >/dev/null 2>&1; then
    echo -e "${RED}❌ 密钥对仍存在${NC}"
else
    echo -e "${GREEN}✅ 密钥对已清理${NC}"
fi

# 8. 显示成本信息
echo -e "${BLUE}💰 成本信息:${NC}"
echo -e "  - 实例运行时间会产生费用"
echo -e "  - 存储卷会产生费用"
echo -e "  - 弹性IP会产生费用"
echo -e "  - 数据传输会产生费用"
echo -e "  - 建议检查AWS账单确认费用"

echo -e "${GREEN}🎉 AWS资源清理完成!${NC}"
echo -e "${BLUE}📋 清理摘要:${NC}"
echo -e "  - 项目名称: $PROJECT_NAME"
echo -e "  - AWS区域: $AWS_REGION"
echo -e "  - 清理时间: $(date)"

echo -e "${YELLOW}⚠️ 注意事项:${NC}"
echo -e "  - 某些资源可能需要几分钟才能完全删除"
echo -e "  - 如果有资源未完全清理，请手动检查AWS控制台"
echo -e "  - 建议检查AWS账单确认没有产生意外费用"

echo -e "${GREEN}✅ 清理脚本执行完成!${NC}" 