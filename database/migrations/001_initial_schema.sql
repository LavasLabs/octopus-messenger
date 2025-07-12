-- 创建数据库
CREATE DATABASE IF NOT EXISTS octopus_messenger;

-- 使用数据库
\c octopus_messenger;

-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 创建枚举类型
CREATE TYPE platform_type AS ENUM ('telegram', 'whatsapp', 'slack', 'discord', 'teams');
CREATE TYPE message_type AS ENUM ('text', 'image', 'audio', 'video', 'document', 'location', 'contact');
CREATE TYPE classification_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'operator', 'viewer');
CREATE TYPE subscription_status AS ENUM ('active', 'inactive', 'suspended', 'cancelled');

-- 租户表（多租户SAAS架构）
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    settings JSONB DEFAULT '{}',
    subscription_status subscription_status DEFAULT 'active',
    subscription_plan VARCHAR(50) DEFAULT 'basic',
    max_bots INTEGER DEFAULT 5,
    max_messages_per_month INTEGER DEFAULT 10000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url VARCHAR(500),
    role user_role DEFAULT 'viewer',
    permissions JSONB DEFAULT '{}',
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, username)
);

-- Bot配置表
CREATE TABLE bot_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    platform platform_type NOT NULL,
    bot_token VARCHAR(500),
    webhook_url VARCHAR(500),
    webhook_secret VARCHAR(255),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 消息表
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID REFERENCES bot_configs(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    platform platform_type NOT NULL,
    message_type message_type NOT NULL,
    content TEXT,
    media_url VARCHAR(500),
    media_type VARCHAR(100),
    sender_id VARCHAR(255),
    sender_username VARCHAR(255),
    sender_name VARCHAR(255),
    chat_id VARCHAR(255),
    chat_title VARCHAR(255),
    chat_type VARCHAR(50),
    raw_data JSONB,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_messages_tenant_platform (tenant_id, platform),
    INDEX idx_messages_chat_id (chat_id),
    INDEX idx_messages_sender_id (sender_id),
    INDEX idx_messages_received_at (received_at)
);

-- 消息分类表
CREATE TABLE message_classifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    ai_model VARCHAR(100) NOT NULL,
    classification_status classification_status DEFAULT 'pending',
    category VARCHAR(100),
    subcategory VARCHAR(100),
    tags TEXT[],
    sentiment VARCHAR(50),
    confidence_score DECIMAL(5,4),
    priority task_priority,
    urgency_level INTEGER DEFAULT 1,
    suggested_actions JSONB,
    ai_response TEXT,
    processing_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_classifications_status (classification_status),
    INDEX idx_classifications_category (category),
    INDEX idx_classifications_priority (priority)
);

-- 任务表
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    classification_id UUID REFERENCES message_classifications(id) ON DELETE SET NULL,
    lark_task_id VARCHAR(255),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    tags TEXT[],
    priority task_priority DEFAULT 'medium',
    status task_status DEFAULT 'pending',
    assignee_id UUID REFERENCES users(id),
    assignee_email VARCHAR(255),
    assignee_name VARCHAR(255),
    due_date TIMESTAMP WITH TIME ZONE,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    parent_task_id UUID REFERENCES tasks(id),
    project_id VARCHAR(255),
    checklist JSONB,
    attachments JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    INDEX idx_tasks_tenant_status (tenant_id, status),
    INDEX idx_tasks_assignee (assignee_id),
    INDEX idx_tasks_priority (priority),
    INDEX idx_tasks_due_date (due_date)
);

-- 任务评论表
CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    mentions TEXT[],
    attachments JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 分类规则表
CREATE TABLE classification_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    keywords TEXT[],
    patterns TEXT[],
    category VARCHAR(100),
    subcategory VARCHAR(100),
    priority task_priority,
    auto_assign_to UUID REFERENCES users(id),
    conditions JSONB,
    actions JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    order_index INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 统计表
CREATE TABLE statistics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,4),
    metadata JSONB,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_statistics_tenant_metric (tenant_id, metric_name),
    INDEX idx_statistics_recorded_at (recorded_at)
);

-- 系统日志表
CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    service_name VARCHAR(100) NOT NULL,
    log_level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    context JSONB,
    error_stack TEXT,
    user_id UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_system_logs_tenant_service (tenant_id, service_name),
    INDEX idx_system_logs_level (log_level),
    INDEX idx_system_logs_created_at (created_at)
);

-- 创建触发器函数更新updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为需要的表添加触发器
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bot_configs_updated_at BEFORE UPDATE ON bot_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_message_classifications_updated_at BEFORE UPDATE ON message_classifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_comments_updated_at BEFORE UPDATE ON task_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classification_rules_updated_at BEFORE UPDATE ON classification_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建索引
CREATE INDEX idx_messages_content_gin ON messages USING gin(to_tsvector('english', content));
CREATE INDEX idx_tasks_title_gin ON tasks USING gin(to_tsvector('english', title));
CREATE INDEX idx_tasks_description_gin ON tasks USING gin(to_tsvector('english', description));

-- 创建视图
CREATE VIEW active_tasks AS
SELECT 
    t.*,
    u.full_name as assignee_name,
    u.email as assignee_email,
    m.content as original_message,
    m.sender_name as message_sender,
    bc.name as bot_name,
    bc.platform as message_platform
FROM tasks t
LEFT JOIN users u ON t.assignee_id = u.id
LEFT JOIN messages m ON t.message_id = m.id
LEFT JOIN bot_configs bc ON m.bot_config_id = bc.id
WHERE t.status != 'completed' AND t.status != 'cancelled';

CREATE VIEW task_statistics AS
SELECT 
    tenant_id,
    COUNT(*) as total_tasks,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tasks,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
    COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent_tasks,
    COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_tasks,
    AVG(CASE WHEN completed_at IS NOT NULL THEN 
        EXTRACT(EPOCH FROM (completed_at - created_at))/3600 
    END) as avg_completion_hours
FROM tasks
GROUP BY tenant_id; 