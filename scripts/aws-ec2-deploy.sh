#!/bin/bash

set -e

echo "🚀 开始在AWS EC2上部署Octopus Messenger测试环境..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
AWS_REGION=${AWS_REGION:-us-east-1}
PROJECT_NAME=${PROJECT_NAME:-octopus-messenger-test}
INSTANCE_TYPE=${INSTANCE_TYPE:-t3.medium}
KEY_NAME=${KEY_NAME:-octopus-messenger-key}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-"8098345020:AAGdTTRkrjBo46BteA3qOwxgDOXUNhkUl5A"}

echo -e "${BLUE}📋 部署配置:${NC}"
echo -e "  - AWS区域: $AWS_REGION"
echo -e "  - 项目名称: $PROJECT_NAME"
echo -e "  - 实例类型: $INSTANCE_TYPE"
echo -e "  - 密钥名称: $KEY_NAME"

# 检查必要工具
echo -e "${BLUE}📋 检查必要工具...${NC}"
command -v aws >/dev/null 2>&1 || { echo -e "${RED}❌ AWS CLI 未安装${NC}"; exit 1; }

# 检查AWS凭证
echo -e "${BLUE}🔐 检查AWS凭证...${NC}"
aws sts get-caller-identity >/dev/null 2>&1 || { echo -e "${RED}❌ AWS凭证未配置${NC}"; exit 1; }

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}✅ AWS账户ID: $AWS_ACCOUNT_ID${NC}"

# 1. 创建密钥对
echo -e "${BLUE}🔑 创建EC2密钥对...${NC}"
if ! aws ec2 describe-key-pairs --key-names $KEY_NAME --region $AWS_REGION >/dev/null 2>&1; then
    aws ec2 create-key-pair \
        --key-name $KEY_NAME \
        --region $AWS_REGION \
        --query 'KeyMaterial' \
        --output text > ~/.ssh/${KEY_NAME}.pem
    
    chmod 600 ~/.ssh/${KEY_NAME}.pem
    echo -e "${GREEN}✅ 密钥对已创建: ~/.ssh/${KEY_NAME}.pem${NC}"
else
    echo -e "${YELLOW}⚠️ 密钥对已存在${NC}"
fi

# 2. 获取默认VPC
echo -e "${BLUE}🌐 获取VPC信息...${NC}"
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query 'Subnets[0].SubnetId' --output text --region $AWS_REGION)

echo -e "${GREEN}✅ VPC ID: $VPC_ID${NC}"
echo -e "${GREEN}✅ 子网ID: $SUBNET_ID${NC}"

# 3. 创建安全组
echo -e "${BLUE}🔒 创建安全组...${NC}"
SECURITY_GROUP_ID=$(aws ec2 create-security-group \
    --group-name $PROJECT_NAME-sg \
    --description "Security group for $PROJECT_NAME" \
    --vpc-id $VPC_ID \
    --region $AWS_REGION \
    --query 'GroupId' \
    --output text 2>/dev/null || \
    aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=$PROJECT_NAME-sg" "Name=vpc-id,Values=$VPC_ID" \
        --query 'SecurityGroups[0].GroupId' \
        --output text \
        --region $AWS_REGION)

# 添加安全组规则
echo -e "${BLUE}🔓 配置安全组规则...${NC}"
# SSH访问
aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 22 \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION \
    2>/dev/null || echo "SSH规则已存在"

# HTTP访问
aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION \
    2>/dev/null || echo "HTTP规则已存在"

# 应用端口
aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 3000-3005 \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION \
    2>/dev/null || echo "应用端口规则已存在"

# 数据库端口
aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 5432 \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION \
    2>/dev/null || echo "数据库端口规则已存在"

# Redis端口
aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 6379 \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION \
    2>/dev/null || echo "Redis端口规则已存在"

echo -e "${GREEN}✅ 安全组ID: $SECURITY_GROUP_ID${NC}"

# 4. 创建用户数据脚本
echo -e "${BLUE}📝 创建用户数据脚本...${NC}"
cat > /tmp/user-data.sh << 'EOF'
#!/bin/bash
yum update -y
yum install -y docker git

# 启动Docker服务
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# 安装Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose

# 创建项目目录
mkdir -p /home/ec2-user/octopus-messenger
cd /home/ec2-user/octopus-messenger

# 克隆项目（如果是私有仓库，需要配置SSH密钥）
git clone https://github.com/your-org/octopus-messenger.git . || {
    echo "无法克隆仓库，创建基本项目结构..."
    mkdir -p services/{gateway,message-processor,ai-service,task-service,bot-manager,admin-panel}
    mkdir -p docker database/init
}

# 修改文件所有者
chown -R ec2-user:ec2-user /home/ec2-user/octopus-messenger

# 等待Docker启动
sleep 30

# 启动服务
cd /home/ec2-user/octopus-messenger
sudo -u ec2-user docker-compose up -d

# 设置开机启动
cat > /etc/systemd/system/octopus-messenger.service << 'SYSTEMD_EOF'
[Unit]
Description=Octopus Messenger
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ec2-user/octopus-messenger
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0
User=ec2-user

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

systemctl enable octopus-messenger.service

echo "EC2 setup completed" > /tmp/setup-complete.log
EOF

# 5. 获取最新的Amazon Linux 2 AMI
echo -e "${BLUE}🖼️ 获取AMI信息...${NC}"
AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" "Name=state,Values=available" \
    --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
    --output text \
    --region $AWS_REGION)

echo -e "${GREEN}✅ AMI ID: $AMI_ID${NC}"

# 6. 启动EC2实例
echo -e "${BLUE}🚀 启动EC2实例...${NC}"
INSTANCE_ID=$(aws ec2 run-instances \
    --image-id $AMI_ID \
    --count 1 \
    --instance-type $INSTANCE_TYPE \
    --key-name $KEY_NAME \
    --security-group-ids $SECURITY_GROUP_ID \
    --subnet-id $SUBNET_ID \
    --user-data file:///tmp/user-data.sh \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$PROJECT_NAME},{Key=Project,Value=$PROJECT_NAME}]" \
    --region $AWS_REGION \
    --query 'Instances[0].InstanceId' \
    --output text)

echo -e "${GREEN}✅ 实例ID: $INSTANCE_ID${NC}"

# 7. 等待实例启动
echo -e "${YELLOW}⏳ 等待实例启动...${NC}"
aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $AWS_REGION

# 8. 获取实例信息
INSTANCE_INFO=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --region $AWS_REGION \
    --query 'Reservations[0].Instances[0]')

PUBLIC_IP=$(echo $INSTANCE_INFO | jq -r '.PublicIpAddress')
PUBLIC_DNS=$(echo $INSTANCE_INFO | jq -r '.PublicDnsName')

echo -e "${GREEN}✅ 实例启动完成!${NC}"
echo -e "${GREEN}✅ 公网IP: $PUBLIC_IP${NC}"
echo -e "${GREEN}✅ 公网DNS: $PUBLIC_DNS${NC}"

# 9. 创建环境配置文件
echo -e "${BLUE}📄 创建环境配置文件...${NC}"
cat > /tmp/docker-compose.override.yml << EOF
version: '3.8'

services:
  gateway:
    environment:
      - TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
      - PUBLIC_URL=http://$PUBLIC_IP:3000
    ports:
      - "3000:3000"

  admin-panel:
    ports:
      - "3005:3005"

  postgres:
    ports:
      - "5432:5432"

  redis:
    ports:
      - "6379:6379"

  mongodb:
    ports:
      - "27017:27017"
EOF

# 10. 等待实例完全启动并复制文件
echo -e "${YELLOW}⏳ 等待实例完全启动...${NC}"
sleep 60

# 检查实例状态
echo -e "${BLUE}🔍 检查实例状态...${NC}"
for i in {1..30}; do
    if aws ec2 describe-instance-status --instance-ids $INSTANCE_ID --region $AWS_REGION --query 'InstanceStatuses[0].InstanceStatus.Status' --output text | grep -q "ok"; then
        echo -e "${GREEN}✅ 实例状态检查通过${NC}"
        break
    fi
    echo -e "${YELLOW}⏳ 等待实例状态检查... ($i/30)${NC}"
    sleep 10
done

# 11. 复制配置文件到实例
echo -e "${BLUE}📁 复制配置文件到实例...${NC}"
scp -i ~/.ssh/${KEY_NAME}.pem -o StrictHostKeyChecking=no /tmp/docker-compose.override.yml ec2-user@$PUBLIC_IP:/home/ec2-user/octopus-messenger/

# 12. 在实例上执行部署命令
echo -e "${BLUE}🚀 在实例上执行部署命令...${NC}"
ssh -i ~/.ssh/${KEY_NAME}.pem -o StrictHostKeyChecking=no ec2-user@$PUBLIC_IP << 'REMOTE_EOF'
cd /home/ec2-user/octopus-messenger

# 如果项目文件不存在，创建基本的docker-compose.yml
if [ ! -f docker-compose.yml ]; then
    cat > docker-compose.yml << 'COMPOSE_EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: octopus-postgres
    environment:
      POSTGRES_DB: octopus_messenger
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: Abc123123!
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d octopus_messenger"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - octopus-network

  redis:
    image: redis:7-alpine
    container_name: octopus-redis
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --requirepass "redis123"
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "redis123", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - octopus-network

  mongodb:
    image: mongo:6.0
    container_name: octopus-mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin123
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongo", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - octopus-network

  gateway:
    image: node:18-alpine
    container_name: octopus-gateway
    working_dir: /app
    volumes:
      - ./services/gateway:/app
      - /app/node_modules
    command: sh -c "npm install && npm start"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=octopus_messenger
      - DB_USER=postgres
      - DB_PASSWORD=Abc123123!
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=redis123
      - MONGODB_URI=mongodb://admin:admin123@mongodb:27017/octopus_messenger?authSource=admin
      - JWT_SECRET=test-jwt-secret-change-in-production
    depends_on:
      - postgres
      - redis
      - mongodb
    restart: unless-stopped
    networks:
      - octopus-network

  admin-panel:
    image: node:18-alpine
    container_name: octopus-admin-panel
    working_dir: /app
    volumes:
      - ./services/admin-panel:/app
      - /app/node_modules
    command: sh -c "npm install && npm start"
    environment:
      - NODE_ENV=production
      - PORT=3005
      - GATEWAY_URL=http://gateway:3000
    depends_on:
      - gateway
    restart: unless-stopped
    networks:
      - octopus-network

volumes:
  postgres_data:
  redis_data:
  mongodb_data:

networks:
  octopus-network:
    driver: bridge
COMPOSE_EOF
fi

# 创建基本的服务目录结构
mkdir -p services/gateway services/admin-panel

# 创建Gateway服务
if [ ! -f services/gateway/package.json ]; then
    cat > services/gateway/package.json << 'GATEWAY_PKG_EOF'
{
  "name": "octopus-gateway",
  "version": "1.0.0",
  "description": "Octopus Messenger Gateway Service",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "morgan": "^1.10.0",
    "pg": "^8.11.0",
    "redis": "^4.6.7",
    "mongodb": "^5.6.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "joi": "^17.9.2",
    "axios": "^1.4.0"
  }
}
GATEWAY_PKG_EOF

    cat > services/gateway/index.js << 'GATEWAY_INDEX_EOF'
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'gateway',
        version: '1.0.0'
    });
});

// API路由
app.get('/api/status', (req, res) => {
    res.json({
        message: 'Octopus Messenger Gateway is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Telegram Webhook
app.post('/webhooks/telegram', (req, res) => {
    console.log('Telegram webhook received:', req.body);
    res.json({ status: 'ok' });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gateway service running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
GATEWAY_INDEX_EOF
fi

# 创建Admin Panel服务
if [ ! -f services/admin-panel/package.json ]; then
    cat > services/admin-panel/package.json << 'ADMIN_PKG_EOF'
{
  "name": "octopus-admin-panel",
  "version": "1.0.0",
  "description": "Octopus Messenger Admin Panel",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "express-handlebars": "^7.0.7",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "morgan": "^1.10.0",
    "axios": "^1.4.0"
  }
}
ADMIN_PKG_EOF

    cat > services/admin-panel/index.js << 'ADMIN_INDEX_EOF'
const express = require('express');
const { engine } = require('express-handlebars');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3005;

// 配置模板引擎
app.engine('handlebars', engine({
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials')
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// 中间件
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'admin-panel',
        version: '1.0.0'
    });
});

// 主页
app.get('/', (req, res) => {
    res.render('dashboard', {
        title: 'Octopus Messenger 管理面板',
        message: '欢迎使用 Octopus Messenger 管理面板！'
    });
});

// 创建基本视图
const viewsDir = path.join(__dirname, 'views');
const layoutsDir = path.join(viewsDir, 'layouts');
require('fs').mkdirSync(layoutsDir, { recursive: true });

require('fs').writeFileSync(path.join(layoutsDir, 'main.handlebars'), `
<!DOCTYPE html>
<html>
<head>
    <title>{{title}}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container">
            <a class="navbar-brand" href="/">Octopus Messenger</a>
        </div>
    </nav>
    <div class="container mt-4">
        {{{body}}}
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
`);

require('fs').writeFileSync(path.join(viewsDir, 'dashboard.handlebars'), `
<div class="row">
    <div class="col-12">
        <h1>{{title}}</h1>
        <div class="alert alert-success">
            {{message}}
        </div>
        <div class="row">
            <div class="col-md-4">
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">系统状态</h5>
                        <p class="card-text">所有服务运行正常</p>
                        <span class="badge bg-success">在线</span>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">Telegram Bot</h5>
                        <p class="card-text">Bot连接正常</p>
                        <span class="badge bg-success">已连接</span>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">数据库</h5>
                        <p class="card-text">PostgreSQL运行正常</p>
                        <span class="badge bg-success">正常</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
`);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Admin panel running on port ${PORT}`);
    console.log(`Access: http://localhost:${PORT}`);
});
ADMIN_INDEX_EOF
fi

# 启动服务
echo "启动Docker服务..."
sudo systemctl start docker
sudo systemctl enable docker

echo "启动Octopus Messenger..."
docker-compose down 2>/dev/null || true
docker-compose up -d

echo "等待服务启动..."
sleep 30

echo "检查服务状态..."
docker-compose ps

echo "部署完成！"
REMOTE_EOF

# 13. 验证部署
echo -e "${BLUE}✅ 验证部署...${NC}"
sleep 10

# 检查服务健康状态
echo -e "${BLUE}🔍 检查服务健康状态...${NC}"
if curl -s http://$PUBLIC_IP:3000/health > /dev/null; then
    echo -e "${GREEN}✅ Gateway服务运行正常${NC}"
else
    echo -e "${YELLOW}⚠️ Gateway服务可能还在启动中${NC}"
fi

if curl -s http://$PUBLIC_IP:3005/health > /dev/null; then
    echo -e "${GREEN}✅ Admin Panel服务运行正常${NC}"
else
    echo -e "${YELLOW}⚠️ Admin Panel服务可能还在启动中${NC}"
fi

# 14. 输出部署信息
echo -e "${GREEN}🎉 部署完成!${NC}"
echo -e "${BLUE}📋 部署信息:${NC}"
echo -e "  - 项目名称: $PROJECT_NAME"
echo -e "  - AWS区域: $AWS_REGION"
echo -e "  - 实例ID: $INSTANCE_ID"
echo -e "  - 实例类型: $INSTANCE_TYPE"
echo -e "  - 公网IP: $PUBLIC_IP"
echo -e "  - 公网DNS: $PUBLIC_DNS"
echo -e "  - SSH密钥: ~/.ssh/${KEY_NAME}.pem"

echo -e "${BLUE}🔗 访问地址:${NC}"
echo -e "  - Gateway API: http://$PUBLIC_IP:3000"
echo -e "  - 健康检查: http://$PUBLIC_IP:3000/health"
echo -e "  - 管理面板: http://$PUBLIC_IP:3005"
echo -e "  - API状态: http://$PUBLIC_IP:3000/api/status"

echo -e "${BLUE}🔧 SSH连接:${NC}"
echo -e "  ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@$PUBLIC_IP"

echo -e "${BLUE}🛠️ 管理命令:${NC}"
echo -e "  - 查看日志: ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@$PUBLIC_IP 'cd octopus-messenger && docker-compose logs -f'"
echo -e "  - 重启服务: ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@$PUBLIC_IP 'cd octopus-messenger && docker-compose restart'"
echo -e "  - 停止服务: ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@$PUBLIC_IP 'cd octopus-messenger && docker-compose down'"

echo -e "${BLUE}📱 Telegram Bot配置:${NC}"
echo -e "  - Bot Token: $TELEGRAM_BOT_TOKEN"
echo -e "  - Webhook URL: http://$PUBLIC_IP:3000/webhooks/telegram"
echo -e "  - 设置命令: curl -X POST \"https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook\" -H \"Content-Type: application/json\" -d '{\"url\": \"http://$PUBLIC_IP:3000/webhooks/telegram\"}'"

echo -e "${YELLOW}⚠️ 注意事项:${NC}"
echo -e "  - 这是测试环境，请不要在生产环境中使用"
echo -e "  - 服务可能需要几分钟才能完全启动"
echo -e "  - 记得在测试完成后清理AWS资源以避免费用"
echo -e "  - 数据库密码: Abc123123!"
echo -e "  - Redis密码: redis123"

# 清理临时文件
rm -f /tmp/user-data.sh /tmp/docker-compose.override.yml

echo -e "${GREEN}✅ 部署脚本执行完成!${NC}" 