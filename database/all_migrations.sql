-- =================================================================
-- Octopus Messenger 合并迁移文件
-- 版本: 1.0.0 (合并所有迁移)
-- 创建日期: 2024-01-01
-- 包含: 所有数据库迁移功能
-- =================================================================


-- =================================================================
-- 来源: 001_initial_schema.sql
-- =================================================================


-- 启用UUID扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 创建租户表
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    display_name VARCHAR(200),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user', 'agent')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    email_verified BOOLEAN DEFAULT false,
    phone VARCHAR(20),
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'zh-CN',
    preferences JSONB DEFAULT '{}',
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- 创建平台表
CREATE TABLE IF NOT EXISTS platforms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建Bot配置表
CREATE TABLE IF NOT EXISTS bot_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    platform_id UUID REFERENCES platforms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    bot_token VARCHAR(500) NOT NULL,
    webhook_url TEXT,
    webhook_secret VARCHAR(255),
    settings JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    last_activity_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE NULL,
    UNIQUE(tenant_id, platform_id)
);

-- 创建消息表
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    platform_id UUID REFERENCES platforms(id) ON DELETE CASCADE,
    platform_message_id VARCHAR(255) NOT NULL,
    sender_id VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    sender_username VARCHAR(255),
    sender_avatar_url TEXT,
    channel_id VARCHAR(255),
    channel_name VARCHAR(255),
    thread_id VARCHAR(255),
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    content TEXT,
    content_type VARCHAR(50) DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'audio', 'file', 'location', 'contact', 'sticker', 'poll')),
    raw_content JSONB,
    attachments JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'archived')),
    direction VARCHAR(20) DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
    is_bot_message BOOLEAN DEFAULT false,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform_id, platform_message_id)
);

-- 创建消息分类表
CREATE TABLE IF NOT EXISTS message_classifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    confidence DECIMAL(3,2) DEFAULT 0.00,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    sentiment VARCHAR(20) DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
    language VARCHAR(10) DEFAULT 'zh-CN',
    tags JSONB DEFAULT '[]',
    keywords JSONB DEFAULT '[]',
    entities JSONB DEFAULT '[]',
    ai_model VARCHAR(100),
    ai_version VARCHAR(50),
    processing_time_ms INTEGER,
    raw_result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建任务表
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    classification_id UUID REFERENCES message_classifications(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'failed')),
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    category VARCHAR(100),
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

-- 创建CRM集成表
CREATE TABLE IF NOT EXISTS crm_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(20) DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- 创建CRM同步记录表
CREATE TABLE IF NOT EXISTS crm_sync_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID REFERENCES crm_integrations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    external_type VARCHAR(100),
    external_url TEXT,
    sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('pending', 'success', 'failed', 'retrying')),
    sync_attempts INTEGER DEFAULT 0,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建会话表
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    platform_id UUID REFERENCES platforms(id) ON DELETE CASCADE,
    platform_user_id VARCHAR(255) NOT NULL,
    platform_channel_id VARCHAR(255),
    session_type VARCHAR(50) DEFAULT 'customer_service' CHECK (session_type IN ('customer_service', 'sales', 'support', 'feedback')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'transferred', 'escalated')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    metadata JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建自动回复规则表
CREATE TABLE IF NOT EXISTS auto_reply_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    platform_id UUID REFERENCES platforms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    priority INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- 创建系统日志表
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    level VARCHAR(20) NOT NULL CHECK (level IN ('error', 'warn', 'info', 'debug')),
    service VARCHAR(100) NOT NULL,
    action VARCHAR(100),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建API密钥表
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    permissions JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(key_hash)
);

-- 创建Webhook配置表
CREATE TABLE IF NOT EXISTS webhook_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    events JSONB DEFAULT '[]',
    headers JSONB DEFAULT '{}',
    secret VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    retry_count INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 30,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- 创建Webhook事件表
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID REFERENCES webhook_configs(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
    attempts INTEGER DEFAULT 0,
    response_code INTEGER,
    response_body TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE
);

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为所有有updated_at字段的表创建触发器
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platforms_updated_at BEFORE UPDATE ON platforms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bot_configs_updated_at BEFORE UPDATE ON bot_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_message_classifications_updated_at BEFORE UPDATE ON message_classifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crm_integrations_updated_at BEFORE UPDATE ON crm_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crm_sync_records_updated_at BEFORE UPDATE ON crm_sync_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_auto_reply_rules_updated_at BEFORE UPDATE ON auto_reply_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhook_configs_updated_at BEFORE UPDATE ON webhook_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_bot_configs_tenant_id ON bot_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bot_configs_platform_id ON bot_configs(platform_id);
CREATE INDEX IF NOT EXISTS idx_bot_configs_status ON bot_configs(status);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_platform_id ON messages(platform_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_content_gin ON messages USING gin(to_tsvector('simple', content));
CREATE INDEX IF NOT EXISTS idx_message_classifications_message_id ON message_classifications(message_id);
CREATE INDEX IF NOT EXISTS idx_message_classifications_category ON message_classifications(category);
CREATE INDEX IF NOT EXISTS idx_message_classifications_priority ON message_classifications(priority);
CREATE INDEX IF NOT EXISTS idx_message_classifications_sentiment ON message_classifications(sentiment);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_message_id ON tasks(message_id);
CREATE INDEX IF NOT EXISTS idx_tasks_classification_id ON tasks(classification_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_crm_integrations_tenant_id ON crm_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_integrations_type ON crm_integrations(type);
CREATE INDEX IF NOT EXISTS idx_crm_integrations_status ON crm_integrations(status);
CREATE INDEX IF NOT EXISTS idx_crm_sync_records_integration_id ON crm_sync_records(integration_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_records_message_id ON crm_sync_records(message_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_records_task_id ON crm_sync_records(task_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_records_sync_status ON crm_sync_records(sync_status);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_id ON sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_platform_id ON sessions(platform_id);
CREATE INDEX IF NOT EXISTS idx_sessions_platform_user_id ON sessions(platform_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_tenant_id ON auto_reply_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_platform_id ON auto_reply_rules(platform_id);
CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_status ON auto_reply_rules(status);
CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_priority ON auto_reply_rules(priority);
CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_id ON system_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_service ON system_logs(service);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_tenant_id ON webhook_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_status ON webhook_configs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook_id ON webhook_events(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);

-- 创建全文搜索索引
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING gin(content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm ON tasks USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_description_trgm ON tasks USING gin(description gin_trgm_ops);

-- 创建复合索引
CREATE INDEX IF NOT EXISTS idx_messages_tenant_platform_created ON messages(tenant_id, platform_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status_created ON tasks(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_sync_records_status_created ON crm_sync_records(sync_status, created_at DESC);

-- 添加表注释
COMMENT ON TABLE tenants IS '租户表';
COMMENT ON TABLE users IS '用户表';
COMMENT ON TABLE platforms IS '平台表';
COMMENT ON TABLE bot_configs IS 'Bot配置表';
COMMENT ON TABLE messages IS '消息表';
COMMENT ON TABLE message_classifications IS '消息分类表';
COMMENT ON TABLE tasks IS '任务表';
COMMENT ON TABLE crm_integrations IS 'CRM集成表';
COMMENT ON TABLE crm_sync_records IS 'CRM同步记录表';
COMMENT ON TABLE sessions IS '会话表';
COMMENT ON TABLE auto_reply_rules IS '自动回复规则表';
COMMENT ON TABLE system_logs IS '系统日志表';
COMMENT ON TABLE api_keys IS 'API密钥表';
COMMENT ON TABLE webhook_configs IS 'Webhook配置表';
COMMENT ON TABLE webhook_events IS 'Webhook事件表'; 

-- =================================================================
-- 来源: 002_add_discord_support.sql
-- =================================================================

-- Add Discord platform to platform enum
ALTER TYPE platform_type ADD VALUE 'discord';

-- Add Discord-specific configuration columns to bot_configs table
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS discord_client_id VARCHAR(255);
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS discord_client_secret VARCHAR(255);
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS discord_public_key VARCHAR(255);
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS discord_guild_id VARCHAR(255);

-- Add Discord-specific message types to message_type enum
ALTER TYPE message_type ADD VALUE 'command';
ALTER TYPE message_type ADD VALUE 'interaction';

-- Create index for Discord-specific queries
CREATE INDEX IF NOT EXISTS idx_messages_discord_guild 
ON messages (platform, chat_id) 
WHERE platform = 'discord';

-- Create index for Discord commands
CREATE INDEX IF NOT EXISTS idx_messages_discord_commands 
ON messages (platform, message_type, content) 
WHERE platform = 'discord' AND message_type = 'command';

-- Insert sample Discord bot configuration
INSERT INTO bot_configs (
    id, tenant_id, platform, bot_name, bot_token, 
    webhook_url, webhook_secret, is_active, settings, 
    created_at, updated_at
) VALUES (
    'discord-bot-sample',
    'default',
    'discord',
    'Octopus Discord Bot',
    'YOUR_DISCORD_BOT_TOKEN',
    'https://your-domain.com/api/webhooks/discord',
    'YOUR_DISCORD_PUBLIC_KEY',
    false,
    '{
        "auto_reply": true,
        "ai_classification": true,
        "forward_to_crm": true,
        "supported_languages": ["en", "zh"],
        "slash_commands": [
            {
                "name": "help",
                "description": "Show help information"
            },
            {
                "name": "support",
                "description": "Contact customer support"
            },
            {
                "name": "faq",
                "description": "View frequently asked questions"
            }
        ],
        "embed_templates": {
            "welcome": {
                "title": "Welcome to Customer Support",
                "description": "How can we help you today?",
                "color": 65535
            },
            "queue_status": {
                "title": "Queue Status",
                "description": "You are in the customer service queue",
                "color": 16776960
            }
        }
    }',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Add Discord-specific task categories
INSERT INTO task_categories (name, description, color, icon, platform_specific) VALUES
('discord_support', 'Discord Customer Support', '#7289da', 'discord', true),
('discord_feedback', 'Discord User Feedback', '#99aab5', 'feedback', true),
('discord_moderation', 'Discord Moderation Issues', '#ed4245', 'shield', true)
ON CONFLICT (name) DO NOTHING;

-- Update classification rules to include Discord
INSERT INTO classification_rules (
    id, name, description, conditions, actions, 
    priority, is_active, created_at, updated_at
) VALUES (
    'discord-support-request',
    'Discord Support Request',
    'Auto-classify Discord support requests',
    '{
        "platform": "discord",
        "keywords": ["help", "support", "problem", "issue", "bug"],
        "message_types": ["command", "text"]
    }',
    '{
        "category": "customer_support",
        "priority": "normal",
        "assign_to": "support_team",
        "auto_reply": true,
        "create_ticket": true
    }',
    10,
    true,
    NOW(),
    NOW()
),
(
    'discord-urgent-issues',
    'Discord Urgent Issues',
    'Auto-classify urgent Discord issues',
    '{
        "platform": "discord",
        "keywords": ["urgent", "critical", "down", "not working", "emergency"],
        "message_types": ["command", "text", "interaction"]
    }',
    '{
        "category": "urgent_support",
        "priority": "urgent",
        "assign_to": "senior_support",
        "auto_reply": true,
        "create_ticket": true,
        "escalate": true
    }',
    20,
    true,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Add Discord webhook configuration
INSERT INTO webhook_configs (
    id, tenant_id, platform, webhook_url, secret_token,
    events, is_active, retry_config, created_at, updated_at
) VALUES (
    'discord-webhook-default',
    'default',
    'discord',
    'https://your-domain.com/api/webhooks/discord',
    'YOUR_DISCORD_PUBLIC_KEY',
    '["INTERACTION_CREATE", "MESSAGE_CREATE"]',
    true,
    '{
        "max_retries": 3,
        "retry_delay": 1000,
        "exponential_backoff": true
    }',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create Discord-specific analytics views
CREATE OR REPLACE VIEW discord_message_analytics AS
SELECT 
    DATE_TRUNC('day', received_at) as date,
    COUNT(*) as total_messages,
    COUNT(CASE WHEN message_type = 'command' THEN 1 END) as command_count,
    COUNT(CASE WHEN message_type = 'interaction' THEN 1 END) as interaction_count,
    COUNT(CASE WHEN message_type = 'text' THEN 1 END) as text_messages,
    COUNT(DISTINCT sender_id) as unique_users,
    COUNT(DISTINCT chat_id) as active_channels,
    AVG(LENGTH(content)) as avg_message_length
FROM messages 
WHERE platform = 'discord' 
    AND received_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', received_at)
ORDER BY date DESC;

-- Create Discord guild activity view
CREATE OR REPLACE VIEW discord_guild_activity AS
SELECT 
    chat_id as guild_id,
    chat_title as guild_name,
    COUNT(*) as message_count,
    COUNT(DISTINCT sender_id) as unique_users,
    COUNT(CASE WHEN message_type = 'command' THEN 1 END) as command_usage,
    MAX(received_at) as last_activity,
    AVG(LENGTH(content)) as avg_message_length
FROM messages 
WHERE platform = 'discord' 
    AND chat_type = 'guild'
    AND received_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY chat_id, chat_title
ORDER BY message_count DESC;

-- Add Discord-specific permissions
INSERT INTO permissions (name, description, resource, action) VALUES
('discord:read', 'Read Discord messages and interactions', 'discord', 'read'),
('discord:write', 'Send Discord messages and responses', 'discord', 'write'),
('discord:manage', 'Manage Discord bot configuration', 'discord', 'manage'),
('discord:commands', 'Execute Discord slash commands', 'discord', 'commands'),
('discord:moderate', 'Moderate Discord channels', 'discord', 'moderate')
ON CONFLICT (name) DO NOTHING;

-- Add Discord permissions to default roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin' AND p.name LIKE 'discord:%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'support_agent' AND p.name IN ('discord:read', 'discord:write', 'discord:commands')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Create Discord interaction log table
CREATE TABLE IF NOT EXISTS discord_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    interaction_id VARCHAR(255) NOT NULL,
    interaction_type VARCHAR(50) NOT NULL,
    command_name VARCHAR(100),
    custom_id VARCHAR(255),
    user_id VARCHAR(255) NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    guild_id VARCHAR(255),
    response_data JSONB,
    processing_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_discord_interaction UNIQUE (tenant_id, interaction_id)
);

-- Create indexes for Discord interactions
CREATE INDEX IF NOT EXISTS idx_discord_interactions_tenant 
ON discord_interactions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_discord_interactions_user 
ON discord_interactions (user_id);

CREATE INDEX IF NOT EXISTS idx_discord_interactions_type 
ON discord_interactions (interaction_type);

CREATE INDEX IF NOT EXISTS idx_discord_interactions_command 
ON discord_interactions (command_name);

CREATE INDEX IF NOT EXISTS idx_discord_interactions_created 
ON discord_interactions (created_at);

-- Add Discord-specific triggers
CREATE OR REPLACE FUNCTION update_discord_bot_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.platform = 'discord' THEN
        INSERT INTO bot_stats (
            tenant_id, platform, date, messages_received, 
            commands_executed, interactions_processed, active_users
        ) VALUES (
            NEW.tenant_id, 'discord', CURRENT_DATE, 1, 
            CASE WHEN NEW.message_type = 'command' THEN 1 ELSE 0 END,
            CASE WHEN NEW.message_type = 'interaction' THEN 1 ELSE 0 END,
            1
        )
        ON CONFLICT (tenant_id, platform, date) 
        DO UPDATE SET 
            messages_received = bot_stats.messages_received + 1,
            commands_executed = bot_stats.commands_executed + 
                CASE WHEN NEW.message_type = 'command' THEN 1 ELSE 0 END,
            interactions_processed = bot_stats.interactions_processed + 
                CASE WHEN NEW.message_type = 'interaction' THEN 1 ELSE 0 END,
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_discord_bot_stats
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_discord_bot_stats();

-- Migration completion log
INSERT INTO migration_log (version, description, applied_at) 
VALUES (2, 'Add Discord platform support', NOW())
ON CONFLICT (version) DO NOTHING; 

-- =================================================================
-- 来源: 003_add_tenant_models.sql
-- =================================================================

    tenant_id VARCHAR(255) NOT NULL,
    model_type VARCHAR(100) NOT NULL,
    model_version INTEGER NOT NULL DEFAULT 1,
    model_path TEXT NOT NULL,
    model_config JSONB DEFAULT '{}',
    model_metrics JSONB DEFAULT '{}',
    file_size BIGINT DEFAULT 0,
    checksum VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, model_type, model_version)
);

-- 租户训练数据表
CREATE TABLE IF NOT EXISTS tenant_training_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    model_type VARCHAR(100) NOT NULL,
    training_examples JSONB NOT NULL,
    examples_count INTEGER NOT NULL DEFAULT 0,
    data_hash VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI分类结果表扩展（添加租户模型支持）
ALTER TABLE ai_classifications ADD COLUMN IF NOT EXISTS tenant_model_id UUID;
ALTER TABLE ai_classifications ADD COLUMN IF NOT EXISTS tenant_model_version INTEGER;

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_tenant_models_tenant_type ON tenant_models(tenant_id, model_type);
CREATE INDEX IF NOT EXISTS idx_tenant_models_active ON tenant_models(tenant_id, model_type, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tenant_models_version ON tenant_models(tenant_id, model_type, model_version DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_training_data_tenant_type ON tenant_training_data(tenant_id, model_type);
CREATE INDEX IF NOT EXISTS idx_tenant_training_data_created ON tenant_training_data(tenant_id, model_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_classifications_tenant_model ON ai_classifications(tenant_id, tenant_model_id) WHERE tenant_model_id IS NOT NULL;

-- 租户模型版本触发器
CREATE OR REPLACE FUNCTION update_tenant_model_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_models_update_trigger
    BEFORE UPDATE ON tenant_models
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_model_version();

-- 清理函数：删除非活跃的旧版本模型
CREATE OR REPLACE FUNCTION cleanup_old_tenant_models(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- 软删除超过指定天数的非活跃模型
    UPDATE tenant_models 
    SET deleted_at = NOW()
    WHERE is_active = false 
      AND updated_at < NOW() - INTERVAL '1 day' * days_to_keep
      AND deleted_at IS NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 租户数据统计视图
CREATE OR REPLACE VIEW tenant_model_stats AS
SELECT 
    tm.tenant_id,
    tm.model_type,
    COUNT(*) as total_versions,
    MAX(tm.model_version) as latest_version,
    SUM(CASE WHEN tm.is_active THEN 1 ELSE 0 END) as active_versions,
    MAX(tm.created_at) as last_trained,
    COALESCE(td.total_examples, 0) as total_training_examples,
    COALESCE(td.training_sessions, 0) as training_sessions,
    COALESCE(ac.predictions_count, 0) as predictions_count,
    COALESCE(ac.avg_confidence, 0) as avg_prediction_confidence
FROM tenant_models tm
LEFT JOIN (
    SELECT 
        tenant_id,
        model_type,
        SUM(examples_count) as total_examples,
        COUNT(*) as training_sessions
    FROM tenant_training_data
    GROUP BY tenant_id, model_type
) td ON tm.tenant_id = td.tenant_id AND tm.model_type = td.model_type
LEFT JOIN (
    SELECT 
        tenant_id,
        COUNT(*) as predictions_count,
        AVG(confidence) as avg_confidence
    FROM ai_classifications
    WHERE tenant_model_id IS NOT NULL
    GROUP BY tenant_id
) ac ON tm.tenant_id = ac.tenant_id
GROUP BY tm.tenant_id, tm.model_type, td.total_examples, td.training_sessions, ac.predictions_count, ac.avg_confidence;

-- 数据完整性约束
ALTER TABLE tenant_models ADD CONSTRAINT check_model_version_positive CHECK (model_version > 0);
ALTER TABLE tenant_training_data ADD CONSTRAINT check_examples_count_positive CHECK (examples_count >= 0);

-- 外键约束（如果需要的话）
-- ALTER TABLE ai_classifications ADD CONSTRAINT fk_tenant_model_id 
--     FOREIGN KEY (tenant_model_id) REFERENCES tenant_models(id) ON DELETE SET NULL;

-- 注释
COMMENT ON TABLE tenant_models IS '租户专用AI模型存储表';
COMMENT ON TABLE tenant_training_data IS '租户训练数据存储表';
COMMENT ON VIEW tenant_model_stats IS '租户模型统计视图';

COMMENT ON COLUMN tenant_models.tenant_id IS '租户ID';
COMMENT ON COLUMN tenant_models.model_type IS '模型类型（rule-engine, local-classifier, embedding-model等）';
COMMENT ON COLUMN tenant_models.model_version IS '模型版本号';
COMMENT ON COLUMN tenant_models.model_path IS '模型文件路径';
COMMENT ON COLUMN tenant_models.model_config IS '模型配置信息';
COMMENT ON COLUMN tenant_models.model_metrics IS '模型性能指标';
COMMENT ON COLUMN tenant_models.checksum IS '模型文件校验和';
COMMENT ON COLUMN tenant_models.is_active IS '是否为活跃版本';

COMMENT ON COLUMN tenant_training_data.training_examples IS '训练数据JSON格式';
COMMENT ON COLUMN tenant_training_data.examples_count IS '训练样本数量';
COMMENT ON COLUMN tenant_training_data.data_hash IS '训练数据哈希值';

-- 示例数据（可选）
-- INSERT INTO tenant_models (tenant_id, model_type, model_version, model_path, model_config, model_metrics) VALUES
-- ('tenant_001', 'rule-engine', 1, '/models/tenant_001/rule-engine/v1/model.json', '{"priority": "medium"}', '{"accuracy": 0.85, "training_time": 1500}'),
-- ('tenant_002', 'local-classifier', 1, '/models/tenant_002/local-classifier/v1/model.json', '{"algorithm": "naive-bayes"}', '{"accuracy": 0.78, "training_time": 2300}');

-- 权限设置（根据实际需要调整）
-- GRANT SELECT, INSERT, UPDATE ON tenant_models TO ai_service_user;
-- GRANT SELECT, INSERT ON tenant_training_data TO ai_service_user;
-- GRANT SELECT ON tenant_model_stats TO ai_service_user; 

-- =================================================================
-- 来源: 003_add_intercom_support.sql
-- =================================================================

-- 添加Intercom到支持的平台枚举
ALTER TYPE bot_platform ADD VALUE 'intercom';

-- 更新bot_configs表，添加Intercom特定配置字段
ALTER TABLE bot_configs 
ADD COLUMN IF NOT EXISTS app_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS secret_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS region VARCHAR(10) DEFAULT 'us',
ADD COLUMN IF NOT EXISTS process_admin_replies BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS default_admin_id VARCHAR(255);

-- 为Intercom特定字段添加注释
COMMENT ON COLUMN bot_configs.app_id IS 'Intercom App ID';
COMMENT ON COLUMN bot_configs.secret_key IS 'Intercom Secret Key for webhook verification';
COMMENT ON COLUMN bot_configs.region IS 'Intercom region: us, eu, au';
COMMENT ON COLUMN bot_configs.process_admin_replies IS 'Whether to process admin replies as messages';
COMMENT ON COLUMN bot_configs.default_admin_id IS 'Default admin ID for sending messages';

-- 创建Intercom会话表
CREATE TABLE IF NOT EXISTS intercom_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    conversation_id VARCHAR(255) NOT NULL,
    external_id VARCHAR(255),
    title TEXT,
    state VARCHAR(50) DEFAULT 'open',
    priority VARCHAR(20) DEFAULT 'not_priority',
    admin_assignee_id VARCHAR(255),
    team_assignee_id VARCHAR(255),
    open BOOLEAN DEFAULT true,
    read_status BOOLEAN DEFAULT false,
    waiting_since BIGINT,
    snoozed_until BIGINT,
    created_at_intercom BIGINT,
    updated_at_intercom BIGINT,
    tags JSONB DEFAULT '[]',
    contacts JSONB DEFAULT '[]',
    custom_attributes JSONB DEFAULT '{}',
    conversation_rating JSONB,
    statistics JSONB,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_intercom_conversations_tenant_id 
ON intercom_conversations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_intercom_conversations_bot_config_id 
ON intercom_conversations(bot_config_id);

CREATE INDEX IF NOT EXISTS idx_intercom_conversations_conversation_id 
ON intercom_conversations(conversation_id);

CREATE INDEX IF NOT EXISTS idx_intercom_conversations_state 
ON intercom_conversations(state);

CREATE INDEX IF NOT EXISTS idx_intercom_conversations_priority 
ON intercom_conversations(priority);

CREATE INDEX IF NOT EXISTS idx_intercom_conversations_assignee 
ON intercom_conversations(admin_assignee_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intercom_conversations_unique 
ON intercom_conversations(tenant_id, conversation_id);

-- 创建Intercom联系人表
CREATE TABLE IF NOT EXISTS intercom_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    contact_id VARCHAR(255) NOT NULL,
    external_id VARCHAR(255),
    user_id VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    avatar_url TEXT,
    location JSONB,
    custom_attributes JSONB DEFAULT '{}',
    tags JSONB DEFAULT '[]',
    segments JSONB DEFAULT '[]',
    social_profiles JSONB DEFAULT '[]',
    companies JSONB DEFAULT '[]',
    last_seen_at BIGINT,
    created_at_intercom BIGINT,
    updated_at_intercom BIGINT,
    signed_up_at BIGINT,
    last_contacted_at BIGINT,
    session_count INTEGER DEFAULT 0,
    unsubscribed_from_emails BOOLEAN DEFAULT false,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_intercom_contacts_tenant_id 
ON intercom_contacts(tenant_id);

CREATE INDEX IF NOT EXISTS idx_intercom_contacts_bot_config_id 
ON intercom_contacts(bot_config_id);

CREATE INDEX IF NOT EXISTS idx_intercom_contacts_contact_id 
ON intercom_contacts(contact_id);

CREATE INDEX IF NOT EXISTS idx_intercom_contacts_email 
ON intercom_contacts(email);

CREATE INDEX IF NOT EXISTS idx_intercom_contacts_external_id 
ON intercom_contacts(external_id);

CREATE INDEX IF NOT EXISTS idx_intercom_contacts_user_id 
ON intercom_contacts(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intercom_contacts_unique 
ON intercom_contacts(tenant_id, contact_id);

-- 创建Intercom标签表
CREATE TABLE IF NOT EXISTS intercom_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    tag_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(20),
    description TEXT,
    created_at_intercom BIGINT,
    updated_at_intercom BIGINT,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_intercom_tags_tenant_id 
ON intercom_tags(tenant_id);

CREATE INDEX IF NOT EXISTS idx_intercom_tags_name 
ON intercom_tags(name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intercom_tags_unique 
ON intercom_tags(tenant_id, tag_id);

-- 创建Intercom团队表
CREATE TABLE IF NOT EXISTS intercom_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    team_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    admin_ids JSONB DEFAULT '[]',
    admin_priority_level JSONB DEFAULT '{}',
    created_at_intercom BIGINT,
    updated_at_intercom BIGINT,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_intercom_teams_tenant_id 
ON intercom_teams(tenant_id);

CREATE INDEX IF NOT EXISTS idx_intercom_teams_name 
ON intercom_teams(name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intercom_teams_unique 
ON intercom_teams(tenant_id, team_id);

-- 创建Intercom管理员表
CREATE TABLE IF NOT EXISTS intercom_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    admin_id VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    job_title VARCHAR(255),
    avatar_url TEXT,
    away_mode_enabled BOOLEAN DEFAULT false,
    away_mode_reassign BOOLEAN DEFAULT false,
    has_inbox_seat BOOLEAN DEFAULT false,
    team_ids JSONB DEFAULT '[]',
    custom_attributes JSONB DEFAULT '{}',
    created_at_intercom BIGINT,
    updated_at_intercom BIGINT,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_intercom_admins_tenant_id 
ON intercom_admins(tenant_id);

CREATE INDEX IF NOT EXISTS idx_intercom_admins_email 
ON intercom_admins(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intercom_admins_unique 
ON intercom_admins(tenant_id, admin_id);

-- 为messages表添加Intercom特定字段
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS intercom_conversation_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS intercom_part_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS intercom_priority VARCHAR(20),
ADD COLUMN IF NOT EXISTS intercom_state VARCHAR(50),
ADD COLUMN IF NOT EXISTS intercom_assignee_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS intercom_team_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS intercom_tags JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS html_content TEXT;

-- 创建相关索引
CREATE INDEX IF NOT EXISTS idx_messages_intercom_conversation_id 
ON messages(intercom_conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_intercom_priority 
ON messages(intercom_priority);

CREATE INDEX IF NOT EXISTS idx_messages_intercom_state 
ON messages(intercom_state);

-- 更新触发器函数以支持新表
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为新表添加updated_at触发器
DROP TRIGGER IF EXISTS update_intercom_conversations_updated_at ON intercom_conversations;
CREATE TRIGGER update_intercom_conversations_updated_at 
    BEFORE UPDATE ON intercom_conversations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_intercom_contacts_updated_at ON intercom_contacts;
CREATE TRIGGER update_intercom_contacts_updated_at 
    BEFORE UPDATE ON intercom_contacts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_intercom_tags_updated_at ON intercom_tags;
CREATE TRIGGER update_intercom_tags_updated_at 
    BEFORE UPDATE ON intercom_tags 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_intercom_teams_updated_at ON intercom_teams;
CREATE TRIGGER update_intercom_teams_updated_at 
    BEFORE UPDATE ON intercom_teams 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_intercom_admins_updated_at ON intercom_admins;
CREATE TRIGGER update_intercom_admins_updated_at 
    BEFORE UPDATE ON intercom_admins 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入Intercom平台示例配置
INSERT INTO bot_configs (
    id,
    tenant_id,
    name,
    platform,
    access_token,
    app_id,
    secret_key,
    region,
    webhook_url,
    webhook_secret,
    process_admin_replies,
    default_admin_id,
    is_active,
    settings
) VALUES (
    gen_random_uuid(),
    (SELECT id FROM tenants LIMIT 1),
    'Intercom客服Bot',
    'intercom',
    'your_intercom_access_token_here',
    'your_intercom_app_id_here',
    'your_intercom_secret_key_here',
    'us',
    'https://your-domain.com/api/webhooks/intercom',
    'your_webhook_secret_here',
    false,
    'your_default_admin_id_here',
    false,
    jsonb_build_object(
        'auto_reply', true,
        'ai_enabled', true,
        'language', 'zh',
        'timezone', 'Asia/Shanghai',
        'business_hours', jsonb_build_object(
            'enabled', true,
            'monday', jsonb_build_object('start', '09:00', 'end', '18:00'),
            'tuesday', jsonb_build_object('start', '09:00', 'end', '18:00'),
            'wednesday', jsonb_build_object('start', '09:00', 'end', '18:00'),
            'thursday', jsonb_build_object('start', '09:00', 'end', '18:00'),
            'friday', jsonb_build_object('start', '09:00', 'end', '18:00'),
            'saturday', jsonb_build_object('start', '10:00', 'end', '16:00'),
            'sunday', jsonb_build_object('start', '10:00', 'end', '16:00')
        ),
        'features', jsonb_build_object(
            'conversation_management', true,
            'contact_sync', true,
            'tag_management', true,
            'team_assignment', true,
            'priority_handling', true,
            'rich_messages', true,
            'file_uploads', true,
            'conversation_search', true,
            'analytics', true
        )
    )
) ON CONFLICT DO NOTHING;

-- 添加约束检查
ALTER TABLE bot_configs 
ADD CONSTRAINT check_intercom_region 
CHECK (region IS NULL OR region IN ('us', 'eu', 'au'));

-- 添加注释
COMMENT ON TABLE intercom_conversations IS 'Intercom对话记录表';
COMMENT ON TABLE intercom_contacts IS 'Intercom联系人表';
COMMENT ON TABLE intercom_tags IS 'Intercom标签表';
COMMENT ON TABLE intercom_teams IS 'Intercom团队表';
COMMENT ON TABLE intercom_admins IS 'Intercom管理员表';

-- 创建视图：Intercom对话概览
CREATE OR REPLACE VIEW intercom_conversation_overview AS
SELECT 
    ic.id,
    ic.tenant_id,
    t.name as tenant_name,
    ic.conversation_id,
    ic.title,
    ic.state,
    ic.priority,
    ic.open,
    ic.admin_assignee_id,
    ia.name as assignee_name,
    ic.team_assignee_id,
    it.name as team_name,
    ic.waiting_since,
    ic.created_at_intercom,
    ic.updated_at_intercom,
    jsonb_array_length(ic.contacts) as contact_count,
    jsonb_array_length(ic.tags) as tag_count,
    CASE 
        WHEN ic.waiting_since IS NOT NULL THEN 
            EXTRACT(EPOCH FROM NOW()) - (ic.waiting_since / 1000)
        ELSE NULL 
    END as waiting_time_seconds,
    ic.created_at,
    ic.updated_at
FROM intercom_conversations ic
JOIN tenants t ON ic.tenant_id = t.id
LEFT JOIN intercom_admins ia ON ic.tenant_id = ia.tenant_id 
    AND ic.admin_assignee_id = ia.admin_id
LEFT JOIN intercom_teams it ON ic.tenant_id = it.tenant_id 
    AND ic.team_assignee_id = it.team_id;

-- 创建视图：Intercom联系人概览
CREATE OR REPLACE VIEW intercom_contact_overview AS
SELECT 
    ic.id,
    ic.tenant_id,
    t.name as tenant_name,
    ic.contact_id,
    ic.email,
    ic.name,
    ic.role,
    ic.phone,
    ic.external_id,
    ic.user_id,
    jsonb_array_length(ic.tags) as tag_count,
    jsonb_array_length(ic.companies) as company_count,
    ic.session_count,
    ic.last_seen_at,
    ic.created_at_intercom,
    ic.signed_up_at,
    ic.unsubscribed_from_emails,
    ic.created_at,
    ic.updated_at
FROM intercom_contacts ic
JOIN tenants t ON ic.tenant_id = t.id;

COMMENT ON VIEW intercom_conversation_overview IS 'Intercom对话概览视图';
COMMENT ON VIEW intercom_contact_overview IS 'Intercom联系人概览视图'; 

-- =================================================================
-- 来源: 004_add_tenant_modes.sql
-- =================================================================

    tenant_id VARCHAR(255) UNIQUE NOT NULL,
    mode VARCHAR(50) NOT NULL DEFAULT 'normal',
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_mode CHECK (mode IN ('training', 'normal'))
);

-- 租户模式切换历史记录表
CREATE TABLE IF NOT EXISTS tenant_mode_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    from_mode VARCHAR(50),
    to_mode VARCHAR(50) NOT NULL,
    reason TEXT,
    switched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    switched_by VARCHAR(255),
    CONSTRAINT valid_from_mode CHECK (from_mode IN ('training', 'normal')),
    CONSTRAINT valid_to_mode CHECK (to_mode IN ('training', 'normal'))
);

-- 租户订阅计划表（用于权限控制）
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) UNIQUE NOT NULL,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'basic',
    features JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    subscription_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    subscription_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_plan_type CHECK (plan_type IN ('basic', 'premium', 'enterprise'))
);

-- 租户消息存储表（仅在训练模式下使用）
CREATE TABLE IF NOT EXISTS tenant_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    message_id VARCHAR(255),
    platform VARCHAR(50) NOT NULL,
    user_id VARCHAR(255),
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    metadata JSONB DEFAULT '{}',
    classification JSONB,
    is_training_data BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_tenant_modes_tenant_id ON tenant_modes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modes_mode ON tenant_modes(mode) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tenant_mode_history_tenant_id ON tenant_mode_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_mode_history_switched_at ON tenant_mode_history(switched_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_id ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_plan_type ON tenant_subscriptions(plan_type) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tenant_messages_tenant_id ON tenant_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_messages_created_at ON tenant_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_messages_training_data ON tenant_messages(tenant_id, is_training_data) WHERE is_training_data = true;
CREATE INDEX IF NOT EXISTS idx_tenant_messages_platform ON tenant_messages(tenant_id, platform, created_at DESC);

-- 触发器：自动更新 updated_at 字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_modes_updated_at_trigger
    BEFORE UPDATE ON tenant_modes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tenant_subscriptions_updated_at_trigger
    BEFORE UPDATE ON tenant_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 自动清理过期消息的函数
CREATE OR REPLACE FUNCTION cleanup_expired_messages(retention_days INTEGER DEFAULT 90)
RETURNS TABLE(tenant_id VARCHAR(255), deleted_count INTEGER) AS $$
BEGIN
    RETURN QUERY
    WITH deleted_messages AS (
        DELETE FROM tenant_messages tm
        WHERE tm.created_at < NOW() - INTERVAL '1 day' * retention_days
        AND EXISTS (
            SELECT 1 FROM tenant_modes tmm 
            WHERE tmm.tenant_id = tm.tenant_id 
            AND tmm.mode = 'training'
            AND (tmm.config->>'dataRetentionDays')::INTEGER <= retention_days
        )
        RETURNING tm.tenant_id
    )
    SELECT 
        dm.tenant_id,
        COUNT(*)::INTEGER as deleted_count
    FROM deleted_messages dm
    GROUP BY dm.tenant_id;
END;
$$ LANGUAGE plpgsql;

-- 租户模式统计视图
CREATE OR REPLACE VIEW tenant_mode_stats AS
SELECT 
    tm.tenant_id,
    tm.mode,
    tm.config,
    tm.created_at as mode_created_at,
    tm.updated_at as mode_updated_at,
    COALESCE(msg_stats.total_messages, 0) as total_messages,
    COALESCE(msg_stats.training_messages, 0) as training_messages,
    COALESCE(msg_stats.last_message, NULL) as last_message_at,
    COALESCE(model_stats.total_models, 0) as total_models,
    COALESCE(model_stats.last_training, NULL) as last_training_at,
    ts.plan_type,
    ts.subscription_end
FROM tenant_modes tm
LEFT JOIN (
    SELECT 
        tenant_id,
        COUNT(*) as total_messages,
        COUNT(CASE WHEN is_training_data = true THEN 1 END) as training_messages,
        MAX(created_at) as last_message
    FROM tenant_messages
    GROUP BY tenant_id
) msg_stats ON tm.tenant_id = msg_stats.tenant_id
LEFT JOIN (
    SELECT 
        tenant_id,
        COUNT(*) as total_models,
        MAX(updated_at) as last_training
    FROM tenant_models
    WHERE is_active = true
    GROUP BY tenant_id
) model_stats ON tm.tenant_id = model_stats.tenant_id
LEFT JOIN tenant_subscriptions ts ON tm.tenant_id = ts.tenant_id AND ts.is_active = true
WHERE tm.is_active = true;

-- 数据完整性约束
ALTER TABLE tenant_modes ADD CONSTRAINT check_mode_not_empty CHECK (mode != '');
ALTER TABLE tenant_messages ADD CONSTRAINT check_content_not_empty CHECK (content != '');

-- 注释
COMMENT ON TABLE tenant_modes IS '租户模式配置表';
COMMENT ON TABLE tenant_mode_history IS '租户模式切换历史记录表';
COMMENT ON TABLE tenant_subscriptions IS '租户订阅计划表';
COMMENT ON TABLE tenant_messages IS '租户消息存储表（仅训练模式使用）';
COMMENT ON VIEW tenant_mode_stats IS '租户模式统计视图';

COMMENT ON COLUMN tenant_modes.mode IS '模式类型：training（训练模式）或 normal（普通模式）';
COMMENT ON COLUMN tenant_modes.config IS '模式配置信息JSON';
COMMENT ON COLUMN tenant_subscriptions.plan_type IS '订阅计划类型：basic, premium, enterprise';
COMMENT ON COLUMN tenant_subscriptions.features IS '订阅功能特性JSON';
COMMENT ON COLUMN tenant_messages.is_training_data IS '是否用作训练数据';
COMMENT ON COLUMN tenant_messages.classification IS '消息分类结果JSON';

-- 插入默认订阅计划配置
INSERT INTO tenant_subscriptions (tenant_id, plan_type, features) VALUES
('demo_tenant', 'enterprise', '{"aiTraining": true, "dataRetention": true, "analytics": true}')
ON CONFLICT (tenant_id) DO NOTHING;

-- 示例数据
INSERT INTO tenant_modes (tenant_id, mode, config) VALUES
('demo_tenant', 'training', '{"dataRetention": true, "autoTraining": true, "privacyMode": false, "minTrainingExamples": 50, "trainingInterval": 86400000, "dataRetentionDays": 90, "enableAnalytics": true, "enablePersonalization": true}')
ON CONFLICT (tenant_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    config = EXCLUDED.config,
    updated_at = NOW();

-- 权限设置（根据实际需要调整）
-- GRANT SELECT, INSERT, UPDATE ON tenant_modes TO ai_service_user;
-- GRANT SELECT, INSERT ON tenant_mode_history TO ai_service_user;
-- GRANT SELECT ON tenant_subscriptions TO ai_service_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_messages TO ai_service_user;
-- GRANT SELECT ON tenant_mode_stats TO ai_service_user; 

-- =================================================================
-- 来源: 004_add_user_tagging_system.sql
-- =================================================================

-- 创建标签类型枚举
CREATE TYPE tag_category AS ENUM (
    'demographic',      -- 人口统计学：年龄、性别、地域等
    'behavior',         -- 行为特征：活跃度、偏好等
    'interest',         -- 兴趣爱好：产品偏好、内容偏好等
    'value',           -- 价值特征：VIP、消费水平等
    'lifecycle',       -- 生命周期：新客户、老客户、流失等
    'communication',   -- 沟通特征：沟通方式、频率等
    'satisfaction',    -- 满意度：投诉、好评等
    'technical',       -- 技术特征：设备、平台使用等
    'custom'          -- 自定义标签
);

-- 创建标签来源枚举
CREATE TYPE tag_source AS ENUM (
    'auto_ai',         -- AI自动生成
    'auto_behavior',   -- 行为分析自动生成
    'manual',          -- 手动添加
    'import',          -- 导入添加
    'api'             -- API添加
);

-- 创建标签定义表
CREATE TABLE IF NOT EXISTS tag_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    category tag_category NOT NULL,
    color VARCHAR(7) DEFAULT '#3498db', -- 十六进制颜色代码
    icon VARCHAR(50), -- 图标名称
    is_system BOOLEAN DEFAULT false, -- 是否为系统预定义标签
    is_active BOOLEAN DEFAULT true,
    auto_apply_rules JSONB DEFAULT '{}', -- 自动应用规则
    weight INTEGER DEFAULT 1, -- 标签权重，用于排序和重要性
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tag_definitions_tenant_category ON tag_definitions(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_tag_definitions_active ON tag_definitions(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_definitions_tenant_name ON tag_definitions(tenant_id, name);

-- 创建用户档案表（扩展现有用户信息）
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_identifier VARCHAR(255) NOT NULL, -- 跨平台用户标识
    user_id_hash VARCHAR(64), -- 用户ID的哈希值，保护隐私
    
    -- 基础信息
    display_name VARCHAR(255),
    avatar_url TEXT,
    email VARCHAR(255),
    phone VARCHAR(50),
    
    -- 人口统计学信息
    estimated_age_range VARCHAR(20), -- 如：18-25, 26-35
    estimated_gender VARCHAR(20),    -- 如：male, female, unknown
    estimated_location VARCHAR(100), -- 估计位置
    language_preference VARCHAR(10), -- 语言偏好
    timezone VARCHAR(50),           -- 时区
    
    -- 行为特征
    first_seen_at TIMESTAMP WITH TIME ZONE,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    total_messages INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    avg_response_time_minutes INTEGER, -- 平均响应时间（分钟）
    active_hours JSONB DEFAULT '[]', -- 活跃时间段 [{"start": 9, "end": 18}]
    preferred_platforms JSONB DEFAULT '[]', -- 偏好平台
    
    -- 沟通特征
    communication_style VARCHAR(50), -- formal, casual, emoji_heavy等
    message_length_avg INTEGER,     -- 平均消息长度
    question_frequency DECIMAL(5,2), -- 问题频率（每对话问题数）
    politeness_score DECIMAL(3,2),  -- 礼貌度评分 0-1
    
    -- 满意度和情感
    overall_sentiment DECIMAL(3,2), -- 整体情感倾向 -1到1
    satisfaction_score DECIMAL(3,2), -- 满意度评分 0-1
    complaint_count INTEGER DEFAULT 0,
    compliment_count INTEGER DEFAULT 0,
    
    -- 价值特征
    estimated_value_tier VARCHAR(20), -- low, medium, high, vip
    purchase_indicators JSONB DEFAULT '{}', -- 购买意图指标
    support_cost_estimate DECIMAL(10,2), -- 估计支持成本
    
    -- 技术特征
    device_types JSONB DEFAULT '[]', -- 使用的设备类型
    browser_info JSONB DEFAULT '{}', -- 浏览器信息
    
    -- 隐私和合规
    data_retention_until TIMESTAMP WITH TIME ZONE, -- 数据保留截止日期
    consent_given BOOLEAN DEFAULT false, -- 是否同意数据收集
    anonymized BOOLEAN DEFAULT false, -- 是否已匿名化
    
    -- 自定义字段
    custom_attributes JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_identifier ON user_profiles(user_identifier);
CREATE INDEX IF NOT EXISTS idx_user_profiles_hash ON user_profiles(user_id_hash);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen ON user_profiles(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_user_profiles_value_tier ON user_profiles(estimated_value_tier);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_tenant_identifier ON user_profiles(tenant_id, user_identifier);

-- 创建用户标签关联表
CREATE TABLE IF NOT EXISTS user_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    tag_definition_id UUID NOT NULL REFERENCES tag_definitions(id) ON DELETE CASCADE,
    
    -- 标签详情
    source tag_source NOT NULL,
    confidence_score DECIMAL(3,2) DEFAULT 1.0, -- 置信度 0-1
    value TEXT, -- 标签值（如果是参数化标签）
    expires_at TIMESTAMP WITH TIME ZONE, -- 标签过期时间
    
    -- 应用信息
    applied_by UUID, -- 应用者ID（人工添加时）
    applied_reason TEXT, -- 应用原因
    applied_context JSONB DEFAULT '{}', -- 应用上下文
    
    -- 验证信息
    verified BOOLEAN DEFAULT false, -- 是否已验证
    verified_by UUID, -- 验证者
    verified_at TIMESTAMP WITH TIME ZONE, -- 验证时间
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_tags_user_profile ON user_tags(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_tag_definition ON user_tags(tag_definition_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_tenant ON user_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_source ON user_tags(source);
CREATE INDEX IF NOT EXISTS idx_user_tags_confidence ON user_tags(confidence_score);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tags_unique ON user_tags(user_profile_id, tag_definition_id);

-- 创建用户行为事件表
CREATE TABLE IF NOT EXISTS user_behavior_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    
    -- 事件基础信息
    event_type VARCHAR(100) NOT NULL, -- message_sent, conversation_started, question_asked等
    event_category VARCHAR(50) NOT NULL, -- communication, engagement, satisfaction等
    platform VARCHAR(50) NOT NULL,
    
    -- 事件详情
    event_data JSONB DEFAULT '{}', -- 事件具体数据
    conversation_id VARCHAR(255), -- 关联的对话ID
    message_id VARCHAR(255), -- 关联的消息ID
    
    -- 分析维度
    sentiment_score DECIMAL(3,2), -- 情感得分 -1到1
    urgency_level INTEGER DEFAULT 0, -- 紧急程度 0-5
    complexity_score INTEGER DEFAULT 0, -- 复杂度 0-5
    satisfaction_indicator DECIMAL(3,2), -- 满意度指标
    
    -- 时间信息
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    processing_delay_ms INTEGER, -- 处理延迟（毫秒）
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_user_profile ON user_behavior_events(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_tenant ON user_behavior_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_type ON user_behavior_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_timestamp ON user_behavior_events(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_platform ON user_behavior_events(platform);

-- 创建用户分析摘要表（定期更新的分析结果）
CREATE TABLE IF NOT EXISTS user_analytics_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    
    -- 分析周期
    period_type VARCHAR(20) NOT NULL, -- daily, weekly, monthly
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- 活跃度指标
    message_count INTEGER DEFAULT 0,
    conversation_count INTEGER DEFAULT 0,
    active_days INTEGER DEFAULT 0,
    avg_session_duration_minutes INTEGER DEFAULT 0,
    
    -- 沟通质量指标
    avg_sentiment DECIMAL(3,2),
    politeness_score DECIMAL(3,2),
    question_ratio DECIMAL(3,2), -- 问题占比
    response_rate DECIMAL(3,2), -- 回复率
    
    -- 满意度指标
    satisfaction_events INTEGER DEFAULT 0,
    complaint_events INTEGER DEFAULT 0,
    resolution_rate DECIMAL(3,2), -- 问题解决率
    
    -- 价值指标
    support_interactions INTEGER DEFAULT 0,
    estimated_support_cost DECIMAL(10,2),
    value_score DECIMAL(5,2), -- 综合价值评分
    
    -- 标签变化
    tags_added INTEGER DEFAULT 0,
    tags_removed INTEGER DEFAULT 0,
    tag_stability_score DECIMAL(3,2), -- 标签稳定性
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_analytics_summary_user_profile ON user_analytics_summary(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_analytics_summary_tenant ON user_analytics_summary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_analytics_summary_period ON user_analytics_summary(period_type, period_start, period_end);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_analytics_summary_unique ON user_analytics_summary(user_profile_id, period_type, period_start);

-- 创建标签应用规则表
CREATE TABLE IF NOT EXISTS tag_application_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tag_definition_id UUID NOT NULL REFERENCES tag_definitions(id) ON DELETE CASCADE,
    
    -- 规则定义
    rule_name VARCHAR(200) NOT NULL,
    rule_description TEXT,
    rule_type VARCHAR(50) NOT NULL, -- keyword, behavior, ai_prediction, threshold等
    
    -- 规则条件
    conditions JSONB NOT NULL, -- 规则条件的JSON定义
    trigger_events JSONB DEFAULT '[]', -- 触发事件列表
    
    -- 执行参数
    confidence_threshold DECIMAL(3,2) DEFAULT 0.7,
    apply_automatically BOOLEAN DEFAULT true,
    requires_verification BOOLEAN DEFAULT false,
    
    -- 生效控制
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 1,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    
    -- 统计信息
    times_applied INTEGER DEFAULT 0,
    last_applied_at TIMESTAMP WITH TIME ZONE,
    success_rate DECIMAL(3,2),
    
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tag_application_rules_tag ON tag_application_rules(tag_definition_id);
CREATE INDEX IF NOT EXISTS idx_tag_application_rules_tenant ON tag_application_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tag_application_rules_active ON tag_application_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tag_application_rules_type ON tag_application_rules(rule_type);

-- 添加触发器以更新时间戳
DROP TRIGGER IF EXISTS update_tag_definitions_updated_at ON tag_definitions;
CREATE TRIGGER update_tag_definitions_updated_at 
    BEFORE UPDATE ON tag_definitions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON user_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_tags_updated_at ON user_tags;
CREATE TRIGGER update_user_tags_updated_at 
    BEFORE UPDATE ON user_tags 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_analytics_summary_updated_at ON user_analytics_summary;
CREATE TRIGGER update_user_analytics_summary_updated_at 
    BEFORE UPDATE ON user_analytics_summary 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tag_application_rules_updated_at ON tag_application_rules;
CREATE TRIGGER update_tag_application_rules_updated_at 
    BEFORE UPDATE ON tag_application_rules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入系统预定义标签
INSERT INTO tag_definitions (tenant_id, name, display_name, description, category, color, is_system) VALUES
-- 生命周期标签
((SELECT id FROM tenants LIMIT 1), 'new_user', '新用户', '首次接触7天内的用户', 'lifecycle', '#2ecc71', true),
((SELECT id FROM tenants LIMIT 1), 'active_user', '活跃用户', '近30天内有互动的用户', 'lifecycle', '#3498db', true),
((SELECT id FROM tenants LIMIT 1), 'dormant_user', '沉睡用户', '超过90天未互动的用户', 'lifecycle', '#95a5a6', true),
((SELECT id FROM tenants LIMIT 1), 'returning_user', '回流用户', '重新开始互动的用户', 'lifecycle', '#9b59b6', true),

-- 价值标签
((SELECT id FROM tenants LIMIT 1), 'vip_user', 'VIP用户', '高价值客户', 'value', '#f39c12', true),
((SELECT id FROM tenants LIMIT 1), 'high_value', '高价值', '具有高商业价值的用户', 'value', '#e67e22', true),
((SELECT id FROM tenants LIMIT 1), 'potential_customer', '潜在客户', '有购买意向的用户', 'value', '#f1c40f', true),

-- 行为标签
((SELECT id FROM tenants LIMIT 1), 'heavy_user', '重度用户', '使用频率很高的用户', 'behavior', '#e74c3c', true),
((SELECT id FROM tenants LIMIT 1), 'question_asker', '爱提问', '经常提问的用户', 'behavior', '#1abc9c', true),
((SELECT id FROM tenants LIMIT 1), 'quick_responder', '快速回复', '回复速度很快的用户', 'behavior', '#16a085', true),
((SELECT id FROM tenants LIMIT 1), 'night_owl', '夜猫子', '经常在夜间活跃的用户', 'behavior', '#2c3e50', true),

-- 沟通特征标签
((SELECT id FROM tenants LIMIT 1), 'polite_user', '礼貌用户', '沟通礼貌得体的用户', 'communication', '#27ae60', true),
((SELECT id FROM tenants LIMIT 1), 'emoji_lover', '表情达人', '喜欢使用表情符号的用户', 'communication', '#f4d03f', true),
((SELECT id FROM tenants LIMIT 1), 'formal_communication', '正式沟通', '偏好正式沟通方式的用户', 'communication', '#5d6d7e', true),

-- 满意度标签
((SELECT id FROM tenants LIMIT 1), 'satisfied_customer', '满意客户', '对服务满意的客户', 'satisfaction', '#58d68d', true),
((SELECT id FROM tenants LIMIT 1), 'complainant', '投诉用户', '有过投诉记录的用户', 'satisfaction', '#ec7063', true),
((SELECT id FROM tenants LIMIT 1), 'advocate', '品牌拥护者', '积极推荐的用户', 'satisfaction', '#af7ac5', true),

-- 技术特征标签
((SELECT id FROM tenants LIMIT 1), 'mobile_user', '移动用户', '主要通过移动设备使用的用户', 'technical', '#5dade2', true),
((SELECT id FROM tenants LIMIT 1), 'desktop_user', '桌面用户', '主要通过桌面使用的用户', 'technical', '#85c1e9', true),
((SELECT id FROM tenants LIMIT 1), 'multi_platform', '多平台用户', '在多个平台都有活动的用户', 'technical', '#a569bd', true)

ON CONFLICT (tenant_id, name) DO NOTHING;

-- 插入示例标签应用规则
INSERT INTO tag_application_rules (tenant_id, tag_definition_id, rule_name, rule_type, conditions) VALUES
-- 新用户规则
((SELECT id FROM tenants LIMIT 1), 
 (SELECT id FROM tag_definitions WHERE name = 'new_user' LIMIT 1),
 '新用户自动标记', 'threshold', 
 '{"field": "days_since_first_seen", "operator": "<=", "value": 7}'),

-- VIP用户规则
((SELECT id FROM tenants LIMIT 1),
 (SELECT id FROM tag_definitions WHERE name = 'vip_user' LIMIT 1),
 'VIP用户识别', 'behavior',
 '{"conditions": [{"field": "total_messages", "operator": ">", "value": 50}, {"field": "satisfaction_score", "operator": ">", "value": 0.8}], "logic": "AND"}'),

-- 重度用户规则
((SELECT id FROM tenants LIMIT 1),
 (SELECT id FROM tag_definitions WHERE name = 'heavy_user' LIMIT 1),
 '重度用户识别', 'threshold',
 '{"field": "messages_per_week", "operator": ">", "value": 20}')

ON CONFLICT DO NOTHING;

-- 创建视图：用户标签概览
CREATE OR REPLACE VIEW user_tag_overview AS
SELECT 
    up.id as user_profile_id,
    up.tenant_id,
    up.user_identifier,
    up.display_name,
    up.estimated_value_tier,
    up.total_messages,
    up.total_conversations,
    up.last_seen_at,
    array_agg(
        json_build_object(
            'tag_name', td.name,
            'display_name', td.display_name,
            'category', td.category,
            'confidence', ut.confidence_score,
            'source', ut.source,
            'created_at', ut.created_at
        ) ORDER BY td.weight DESC, ut.confidence_score DESC
    ) FILTER (WHERE td.id IS NOT NULL) as tags,
    count(ut.id) as tag_count
FROM user_profiles up
LEFT JOIN user_tags ut ON up.id = ut.user_profile_id
LEFT JOIN tag_definitions td ON ut.tag_definition_id = td.id AND td.is_active = true
GROUP BY up.id, up.tenant_id, up.user_identifier, up.display_name, 
         up.estimated_value_tier, up.total_messages, up.total_conversations, up.last_seen_at;

-- 创建视图：标签使用统计
CREATE OR REPLACE VIEW tag_usage_stats AS
SELECT 
    td.id as tag_definition_id,
    td.tenant_id,
    td.name,
    td.display_name,
    td.category,
    count(ut.id) as usage_count,
    avg(ut.confidence_score) as avg_confidence,
    count(ut.id) FILTER (WHERE ut.source = 'auto_ai') as ai_generated_count,
    count(ut.id) FILTER (WHERE ut.source = 'manual') as manual_count,
    count(ut.id) FILTER (WHERE ut.verified = true) as verified_count,
    max(ut.created_at) as last_used_at
FROM tag_definitions td
LEFT JOIN user_tags ut ON td.id = ut.tag_definition_id
WHERE td.is_active = true
GROUP BY td.id, td.tenant_id, td.name, td.display_name, td.category;

-- 添加注释
COMMENT ON TABLE tag_definitions IS '标签定义表';
COMMENT ON TABLE user_profiles IS '用户档案表，存储用户的详细分析信息';
COMMENT ON TABLE user_tags IS '用户标签关联表';
COMMENT ON TABLE user_behavior_events IS '用户行为事件表';
COMMENT ON TABLE user_analytics_summary IS '用户分析摘要表';
COMMENT ON TABLE tag_application_rules IS '标签自动应用规则表';

COMMENT ON COLUMN user_profiles.user_identifier IS '跨平台用户标识，可以是email、phone或其他唯一标识';
COMMENT ON COLUMN user_profiles.user_id_hash IS '用户ID的哈希值，用于保护隐私的同时支持分析';
COMMENT ON COLUMN user_tags.confidence_score IS '标签置信度，0-1，1表示100%确信';
COMMENT ON COLUMN tag_application_rules.conditions IS '规则条件的JSON格式定义'; 

-- =================================================================
-- 来源: 005_add_group_authorization_system.sql
-- =================================================================

-- 创建群组状态枚举
CREATE TYPE group_status AS ENUM (
    'pending',      -- 待审批
    'approved',     -- 已批准
    'rejected',     -- 已拒绝
    'suspended',    -- 已暂停
    'blacklisted'   -- 已拉黑
);

-- 创建群组类型枚举
CREATE TYPE group_type AS ENUM (
    'group',        -- 普通群组
    'channel',      -- 频道
    'supergroup',   -- 超级群组
    'private',      -- 私有群组
    'public'        -- 公开群组
);

-- 创建权限策略枚举
CREATE TYPE auth_policy AS ENUM (
    'whitelist',    -- 白名单模式：只有允许的群组可以使用
    'blacklist',    -- 黑名单模式：除了禁止的群组都可以使用
    'approval',     -- 审批模式：需要审批才能使用
    'open'          -- 开放模式：任何群组都可以使用
);

-- 创建群组信息表
CREATE TABLE IF NOT EXISTS group_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    
    -- 群组标识信息
    platform_group_id VARCHAR(255) NOT NULL, -- 平台群组ID
    group_name VARCHAR(500),                  -- 群组名称
    group_type group_type NOT NULL,           -- 群组类型
    group_description TEXT,                   -- 群组描述
    
    -- 群组统计信息
    member_count INTEGER DEFAULT 0,          -- 成员数量
    admin_count INTEGER DEFAULT 0,           -- 管理员数量
    bot_join_date TIMESTAMP WITH TIME ZONE,  -- Bot加入时间
    last_activity_at TIMESTAMP WITH TIME ZONE, -- 最后活动时间
    
    -- 权限状态
    status group_status NOT NULL DEFAULT 'pending',
    approved_by UUID,                         -- 审批者ID
    approved_at TIMESTAMP WITH TIME ZONE,    -- 审批时间
    rejection_reason TEXT,                    -- 拒绝原因
    
    -- 使用配额
    message_quota INTEGER DEFAULT 1000,      -- 消息配额
    message_used INTEGER DEFAULT 0,          -- 已使用消息数
    quota_reset_at TIMESTAMP WITH TIME ZONE, -- 配额重置时间
    
    -- 群组设置
    settings JSONB DEFAULT '{}',              -- 群组特定设置
    
    -- 邀请者信息
    invited_by_user_id VARCHAR(255),          -- 邀请者用户ID
    invited_by_username VARCHAR(255),         -- 邀请者用户名
    invite_timestamp TIMESTAMP WITH TIME ZONE, -- 邀请时间
    
    -- 元数据
    metadata JSONB DEFAULT '{}',              -- 其他元数据
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_group_info_tenant ON group_info(tenant_id);
CREATE INDEX IF NOT EXISTS idx_group_info_bot_config ON group_info(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_group_info_platform_group ON group_info(platform_group_id);
CREATE INDEX IF NOT EXISTS idx_group_info_status ON group_info(status);
CREATE INDEX IF NOT EXISTS idx_group_info_last_activity ON group_info(last_activity_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_info_unique ON group_info(tenant_id, bot_config_id, platform_group_id);

-- 创建Bot权限策略表
CREATE TABLE IF NOT EXISTS bot_auth_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    
    -- 权限策略
    policy_type auth_policy NOT NULL DEFAULT 'approval',
    auto_approve BOOLEAN DEFAULT false,       -- 是否自动审批
    require_admin_invite BOOLEAN DEFAULT true, -- 是否需要管理员邀请
    
    -- 群组限制
    max_groups INTEGER DEFAULT 100,          -- 最大群组数
    max_members_per_group INTEGER DEFAULT 500, -- 单群最大成员数
    allowed_group_types JSONB DEFAULT '["group", "supergroup"]', -- 允许的群组类型
    
    -- 使用配额
    default_message_quota INTEGER DEFAULT 1000, -- 默认消息配额
    quota_reset_period VARCHAR(20) DEFAULT 'monthly', -- 配额重置周期
    
    -- 时间限制
    service_hours JSONB DEFAULT '{"enabled": false, "start": "09:00", "end": "18:00", "timezone": "Asia/Shanghai"}',
    
    -- 地域限制
    allowed_regions JSONB DEFAULT '[]',       -- 允许的地域列表
    blocked_regions JSONB DEFAULT '[]',       -- 禁止的地域列表
    
    -- 内容限制
    content_filters JSONB DEFAULT '{}',       -- 内容过滤规则
    
    -- 通知设置
    notifications JSONB DEFAULT '{
        "new_group_request": true,
        "quota_warning": true,
        "policy_violation": true
    }',
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_bot_auth_policies_tenant ON bot_auth_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bot_auth_policies_bot_config ON bot_auth_policies(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_bot_auth_policies_active ON bot_auth_policies(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_auth_policies_unique ON bot_auth_policies(tenant_id, bot_config_id);

-- 创建群组权限规则表
CREATE TABLE IF NOT EXISTS group_permission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    
    -- 规则信息
    rule_name VARCHAR(255) NOT NULL,
    rule_description TEXT,
    rule_type VARCHAR(50) NOT NULL, -- whitelist, blacklist, keyword, regex等
    priority INTEGER DEFAULT 1,     -- 优先级，数字越大优先级越高
    
    -- 规则条件
    conditions JSONB NOT NULL,       -- 规则条件JSON
    action VARCHAR(50) NOT NULL,     -- allow, deny, require_approval
    
    -- 匹配目标
    target_type VARCHAR(50) NOT NULL, -- group_name, group_id, user_id, keyword等
    target_value TEXT,               -- 目标值
    
    -- 生效条件
    is_active BOOLEAN DEFAULT true,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    
    -- 统计信息
    match_count INTEGER DEFAULT 0,   -- 匹配次数
    last_matched_at TIMESTAMP WITH TIME ZONE, -- 最后匹配时间
    
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_group_permission_rules_tenant ON group_permission_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_group_permission_rules_bot_config ON group_permission_rules(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_group_permission_rules_active ON group_permission_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_group_permission_rules_priority ON group_permission_rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_group_permission_rules_type ON group_permission_rules(rule_type);

-- 创建群组操作日志表
CREATE TABLE IF NOT EXISTS group_operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    group_info_id UUID REFERENCES group_info(id) ON DELETE SET NULL,
    
    -- 操作信息
    operation_type VARCHAR(50) NOT NULL, -- join, leave, approve, reject, suspend等
    operation_details JSONB DEFAULT '{}',
    
    -- 操作者信息
    operator_type VARCHAR(50) NOT NULL, -- user, admin, system, auto
    operator_id VARCHAR(255),           -- 操作者ID
    operator_name VARCHAR(255),         -- 操作者名称
    
    -- 操作结果
    result VARCHAR(50) NOT NULL,        -- success, failed, pending
    error_message TEXT,                 -- 错误信息
    
    -- 上下文信息
    platform VARCHAR(50) NOT NULL,     -- 平台类型
    platform_group_id VARCHAR(255),    -- 平台群组ID
    platform_user_id VARCHAR(255),     -- 平台用户ID
    
    -- 附加信息
    metadata JSONB DEFAULT '{}',
    ip_address INET,                    -- IP地址
    user_agent TEXT,                    -- 用户代理
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_group_operation_logs_tenant ON group_operation_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_group_operation_logs_bot_config ON group_operation_logs(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_group_operation_logs_group_info ON group_operation_logs(group_info_id);
CREATE INDEX IF NOT EXISTS idx_group_operation_logs_operation_type ON group_operation_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_group_operation_logs_created_at ON group_operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_group_operation_logs_result ON group_operation_logs(result);

-- 创建群组使用统计表
CREATE TABLE IF NOT EXISTS group_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    group_info_id UUID NOT NULL REFERENCES group_info(id) ON DELETE CASCADE,
    
    -- 统计周期
    period_type VARCHAR(20) NOT NULL,   -- daily, weekly, monthly
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- 消息统计
    message_count INTEGER DEFAULT 0,    -- 消息总数
    user_message_count INTEGER DEFAULT 0, -- 用户消息数
    bot_message_count INTEGER DEFAULT 0, -- Bot消息数
    
    -- 用户统计
    active_users INTEGER DEFAULT 0,     -- 活跃用户数
    new_users INTEGER DEFAULT 0,        -- 新用户数
    
    -- 互动统计
    command_count INTEGER DEFAULT 0,    -- 命令使用次数
    reaction_count INTEGER DEFAULT 0,   -- 反应次数
    
    -- 服务质量
    avg_response_time_ms INTEGER DEFAULT 0, -- 平均响应时间
    error_count INTEGER DEFAULT 0,      -- 错误次数
    
    -- 配额使用
    quota_used INTEGER DEFAULT 0,       -- 已使用配额
    quota_remaining INTEGER DEFAULT 0,  -- 剩余配额
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_group_usage_stats_tenant ON group_usage_stats(tenant_id);
CREATE INDEX IF NOT EXISTS idx_group_usage_stats_bot_config ON group_usage_stats(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_group_usage_stats_group_info ON group_usage_stats(group_info_id);
CREATE INDEX IF NOT EXISTS idx_group_usage_stats_period ON group_usage_stats(period_type, period_start, period_end);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_usage_stats_unique ON group_usage_stats(group_info_id, period_type, period_start);

-- 创建群组管理员表
CREATE TABLE IF NOT EXISTS group_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_info_id UUID NOT NULL REFERENCES group_info(id) ON DELETE CASCADE,
    
    -- 管理员信息
    platform_user_id VARCHAR(255) NOT NULL, -- 平台用户ID
    username VARCHAR(255),               -- 用户名
    full_name VARCHAR(255),              -- 全名
    
    -- 权限信息
    admin_level VARCHAR(50) NOT NULL DEFAULT 'admin', -- owner, admin, moderator
    permissions JSONB DEFAULT '{}',      -- 权限列表
    
    -- 状态信息
    is_active BOOLEAN DEFAULT true,     -- 是否活跃
    added_by VARCHAR(255),              -- 添加者
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_group_admins_tenant ON group_admins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_group_admins_group_info ON group_admins(group_info_id);
CREATE INDEX IF NOT EXISTS idx_group_admins_platform_user ON group_admins(platform_user_id);
CREATE INDEX IF NOT EXISTS idx_group_admins_active ON group_admins(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_admins_unique ON group_admins(group_info_id, platform_user_id);

-- 添加触发器以更新时间戳
DROP TRIGGER IF EXISTS update_group_info_updated_at ON group_info;
CREATE TRIGGER update_group_info_updated_at 
    BEFORE UPDATE ON group_info 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bot_auth_policies_updated_at ON bot_auth_policies;
CREATE TRIGGER update_bot_auth_policies_updated_at 
    BEFORE UPDATE ON bot_auth_policies 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_group_permission_rules_updated_at ON group_permission_rules;
CREATE TRIGGER update_group_permission_rules_updated_at 
    BEFORE UPDATE ON group_permission_rules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_group_usage_stats_updated_at ON group_usage_stats;
CREATE TRIGGER update_group_usage_stats_updated_at 
    BEFORE UPDATE ON group_usage_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_group_admins_updated_at ON group_admins;
CREATE TRIGGER update_group_admins_updated_at 
    BEFORE UPDATE ON group_admins 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默认的权限策略
INSERT INTO bot_auth_policies (tenant_id, bot_config_id, policy_type, auto_approve, require_admin_invite)
SELECT 
    t.id as tenant_id,
    bc.id as bot_config_id,
    'approval' as policy_type,
    false as auto_approve,
    true as require_admin_invite
FROM tenants t
CROSS JOIN bot_configs bc
WHERE t.id = bc.tenant_id
ON CONFLICT (tenant_id, bot_config_id) DO NOTHING;

-- 插入预定义的权限规则示例
INSERT INTO group_permission_rules (tenant_id, bot_config_id, rule_name, rule_type, conditions, action, target_type, priority)
SELECT 
    t.id as tenant_id,
    bc.id as bot_config_id,
    '禁止测试群组' as rule_name,
    'keyword' as rule_type,
    '{"keywords": ["test", "测试", "demo", "演示"], "match_type": "contains"}' as conditions,
    'deny' as action,
    'group_name' as target_type,
    10 as priority
FROM tenants t
CROSS JOIN bot_configs bc
WHERE t.id = bc.tenant_id
ON CONFLICT DO NOTHING;

-- 创建视图：群组权限概览
CREATE OR REPLACE VIEW group_permission_overview AS
SELECT 
    gi.id as group_info_id,
    gi.tenant_id,
    gi.bot_config_id,
    gi.platform_group_id,
    gi.group_name,
    gi.group_type,
    gi.status,
    gi.member_count,
    gi.message_quota,
    gi.message_used,
    gi.quota_reset_at,
    gi.last_activity_at,
    
    -- 权限策略信息
    bap.policy_type,
    bap.auto_approve,
    bap.require_admin_invite,
    bap.max_groups,
    bap.max_members_per_group,
    
    -- 使用统计（最近30天）
    COALESCE(recent_stats.message_count, 0) as recent_message_count,
    COALESCE(recent_stats.active_users, 0) as recent_active_users,
    
    -- 管理员信息
    admin_info.admin_count,
    admin_info.admin_names
    
FROM group_info gi
LEFT JOIN bot_auth_policies bap ON gi.bot_config_id = bap.bot_config_id
LEFT JOIN (
    SELECT 
        group_info_id,
        SUM(message_count) as message_count,
        SUM(active_users) as active_users
    FROM group_usage_stats
    WHERE period_start >= NOW() - INTERVAL '30 days'
    GROUP BY group_info_id
) recent_stats ON gi.id = recent_stats.group_info_id
LEFT JOIN (
    SELECT 
        group_info_id,
        COUNT(*) as admin_count,
        array_agg(username) as admin_names
    FROM group_admins
    WHERE is_active = true
    GROUP BY group_info_id
) admin_info ON gi.id = admin_info.group_info_id;

-- 创建视图：权限策略统计
CREATE OR REPLACE VIEW auth_policy_stats AS
SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    bc.id as bot_config_id,
    bc.name as bot_name,
    bc.platform,
    
    -- 权限策略
    bap.policy_type,
    bap.auto_approve,
    bap.require_admin_invite,
    bap.max_groups,
    
    -- 群组统计
    COUNT(gi.id) as total_groups,
    COUNT(gi.id) FILTER (WHERE gi.status = 'approved') as approved_groups,
    COUNT(gi.id) FILTER (WHERE gi.status = 'pending') as pending_groups,
    COUNT(gi.id) FILTER (WHERE gi.status = 'rejected') as rejected_groups,
    COUNT(gi.id) FILTER (WHERE gi.status = 'suspended') as suspended_groups,
    
    -- 使用统计
    SUM(gi.message_used) as total_messages_used,
    SUM(gi.message_quota) as total_message_quota,
    AVG(gi.member_count) as avg_members_per_group,
    
    -- 活跃度
    COUNT(gi.id) FILTER (WHERE gi.last_activity_at >= NOW() - INTERVAL '7 days') as active_groups_7d,
    COUNT(gi.id) FILTER (WHERE gi.last_activity_at >= NOW() - INTERVAL '30 days') as active_groups_30d

FROM tenants t
JOIN bot_configs bc ON t.id = bc.tenant_id
LEFT JOIN bot_auth_policies bap ON bc.id = bap.bot_config_id
LEFT JOIN group_info gi ON bc.id = gi.bot_config_id
WHERE bc.deleted_at IS NULL
GROUP BY t.id, t.name, bc.id, bc.name, bc.platform, 
         bap.policy_type, bap.auto_approve, bap.require_admin_invite, bap.max_groups;

-- 添加表和列的注释
COMMENT ON TABLE group_info IS '群组信息表，存储Bot加入的群组基本信息';
COMMENT ON TABLE bot_auth_policies IS 'Bot权限策略表，定义Bot的群组使用策略';
COMMENT ON TABLE group_permission_rules IS '群组权限规则表，定义具体的权限规则';
COMMENT ON TABLE group_operation_logs IS '群组操作日志表，记录所有群组相关操作';
COMMENT ON TABLE group_usage_stats IS '群组使用统计表，记录群组使用情况';
COMMENT ON TABLE group_admins IS '群组管理员表，记录群组管理员信息';

COMMENT ON COLUMN group_info.platform_group_id IS '平台原生群组ID（如Telegram群组ID）';
COMMENT ON COLUMN group_info.status IS '群组状态：pending-待审批, approved-已批准, rejected-已拒绝, suspended-已暂停, blacklisted-已拉黑';
COMMENT ON COLUMN bot_auth_policies.policy_type IS '权限策略类型：whitelist-白名单, blacklist-黑名单, approval-审批, open-开放';
COMMENT ON COLUMN group_permission_rules.conditions IS '权限规则条件的JSON格式定义';
COMMENT ON COLUMN group_operation_logs.operation_type IS '操作类型：join-加入, leave-离开, approve-批准, reject-拒绝, suspend-暂停等'; 

-- =================================================================
-- 来源: 007_add_merchant_system.sql
-- =================================================================

-- 启用UUID扩展（如果尚未启用）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建商户表
CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- 商户基本信息
    merchant_id VARCHAR(50) NOT NULL UNIQUE,  -- 商户唯一标识符，如：SHOP001
    merchant_name VARCHAR(255) NOT NULL,      -- 商户名称
    merchant_slug VARCHAR(100) NOT NULL,      -- 商户标识符，用于URL
    description TEXT,                         -- 商户描述
    
    -- 商户类型和行业
    business_type VARCHAR(100),               -- 业务类型：餐饮、零售、服务等
    industry VARCHAR(100),                    -- 行业分类
    
    -- 联系信息
    contact_phone VARCHAR(50),                -- 联系电话
    contact_email VARCHAR(255),               -- 联系邮箱
    contact_address TEXT,                     -- 联系地址
    
    -- 商户配置
    settings JSONB DEFAULT '{
        "auto_reply": true,
        "language": "zh-CN",
        "timezone": "Asia/Shanghai",
        "business_hours": {
            "enabled": true,
            "monday": {"start": "09:00", "end": "18:00"},
            "tuesday": {"start": "09:00", "end": "18:00"},
            "wednesday": {"start": "09:00", "end": "18:00"},
            "thursday": {"start": "09:00", "end": "18:00"},
            "friday": {"start": "09:00", "end": "18:00"},
            "saturday": {"start": "10:00", "end": "17:00"},
            "sunday": {"start": "10:00", "end": "17:00"}
        },
        "welcome_message": "欢迎来到我们的店铺！有什么可以帮助您的吗？",
        "service_phone": "",
        "service_email": "",
        "brand_logo": "",
        "brand_colors": {
            "primary": "#007bff",
            "secondary": "#6c757d"
        }
    }',
    
    -- 商户状态
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    
    -- 统计信息
    total_bots INTEGER DEFAULT 0,            -- 总bot数量
    total_messages INTEGER DEFAULT 0,        -- 总消息数
    total_customers INTEGER DEFAULT 0,        -- 总客户数
    
    -- 元数据
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- 创建商户-Bot关联表
CREATE TABLE IF NOT EXISTS merchant_bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    
    -- 关联信息
    platform VARCHAR(50) NOT NULL,           -- 平台类型
    platform_bot_id VARCHAR(255),            -- 平台bot ID
    
    -- Bot特定配置
    bot_settings JSONB DEFAULT '{}',          -- 平台特定设置
    
    -- 状态信息
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false,         -- 是否为主要bot
    
    -- 统计信息
    message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMP WITH TIME ZONE,
    
    -- 元数据
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建商户邀请码表（用于快速绑定）
CREATE TABLE IF NOT EXISTS merchant_invite_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    
    -- 邀请码信息
    invite_code VARCHAR(20) NOT NULL UNIQUE,  -- 邀请码：如 SHOP001-TG
    platform VARCHAR(50) NOT NULL,           -- 目标平台
    
    -- 邀请码配置
    max_uses INTEGER DEFAULT 1,              -- 最大使用次数
    used_count INTEGER DEFAULT 0,            -- 已使用次数
    
    -- 有效期
    expires_at TIMESTAMP WITH TIME ZONE,     -- 过期时间
    
    -- 状态
    is_active BOOLEAN DEFAULT true,
    
    -- 元数据
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建商户数据共享表（跨平台数据共享）
CREATE TABLE IF NOT EXISTS merchant_shared_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    
    -- 数据类型
    data_type VARCHAR(50) NOT NULL,          -- customer_profiles, conversation_history, analytics等
    data_key VARCHAR(255) NOT NULL,          -- 数据键
    
    -- 数据内容
    data_value JSONB NOT NULL,               -- 数据值
    
    -- 同步信息
    sync_status VARCHAR(20) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed')),
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 元数据
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 添加外键约束到现有表
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id);
ALTER TABLE group_info ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_merchants_tenant ON merchants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_merchants_merchant_id ON merchants(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
CREATE INDEX IF NOT EXISTS idx_merchants_business_type ON merchants(business_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_tenant_merchant_id ON merchants(tenant_id, merchant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_tenant_slug ON merchants(tenant_id, merchant_slug);

CREATE INDEX IF NOT EXISTS idx_merchant_bots_merchant ON merchant_bots(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_bots_bot_config ON merchant_bots(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_merchant_bots_platform ON merchant_bots(platform);
CREATE INDEX IF NOT EXISTS idx_merchant_bots_active ON merchant_bots(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_bots_unique ON merchant_bots(merchant_id, bot_config_id);

CREATE INDEX IF NOT EXISTS idx_merchant_invite_codes_merchant ON merchant_invite_codes(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_invite_codes_code ON merchant_invite_codes(invite_code);
CREATE INDEX IF NOT EXISTS idx_merchant_invite_codes_platform ON merchant_invite_codes(platform);
CREATE INDEX IF NOT EXISTS idx_merchant_invite_codes_active ON merchant_invite_codes(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_merchant_shared_data_merchant ON merchant_shared_data(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_shared_data_type ON merchant_shared_data(data_type);
CREATE INDEX IF NOT EXISTS idx_merchant_shared_data_key ON merchant_shared_data(data_key);
CREATE INDEX IF NOT EXISTS idx_merchant_shared_data_sync_status ON merchant_shared_data(sync_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_shared_data_unique ON merchant_shared_data(merchant_id, data_type, data_key);

CREATE INDEX IF NOT EXISTS idx_bot_configs_merchant ON bot_configs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_merchant ON user_profiles(merchant_id);
CREATE INDEX IF NOT EXISTS idx_group_info_merchant ON group_info(merchant_id);

-- 创建更新时间戳触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_merchants_updated_at ON merchants;
CREATE TRIGGER update_merchants_updated_at 
    BEFORE UPDATE ON merchants 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchant_bots_updated_at ON merchant_bots;
CREATE TRIGGER update_merchant_bots_updated_at 
    BEFORE UPDATE ON merchant_bots 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchant_invite_codes_updated_at ON merchant_invite_codes;
CREATE TRIGGER update_merchant_invite_codes_updated_at 
    BEFORE UPDATE ON merchant_invite_codes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchant_shared_data_updated_at ON merchant_shared_data;
CREATE TRIGGER update_merchant_shared_data_updated_at 
    BEFORE UPDATE ON merchant_shared_data 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建统计信息更新触发器
CREATE OR REPLACE FUNCTION update_merchant_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- 更新商户总bot数量
    UPDATE merchants SET 
        total_bots = (
            SELECT COUNT(*) FROM merchant_bots 
            WHERE merchant_id = NEW.merchant_id AND is_active = true
        )
    WHERE id = NEW.merchant_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_merchant_stats ON merchant_bots;
CREATE TRIGGER trigger_update_merchant_stats
    AFTER INSERT OR UPDATE OR DELETE ON merchant_bots
    FOR EACH ROW EXECUTE FUNCTION update_merchant_stats();

-- 插入系统预定义商户类型
INSERT INTO merchants (tenant_id, merchant_id, merchant_name, merchant_slug, business_type, industry, settings, created_by) 
SELECT 
    t.id,
    'DEMO001',
    '示例商户',
    'demo-merchant',
    '零售',
    '电子商务',
    jsonb_build_object(
        'auto_reply', true,
        'language', 'zh-CN',
        'timezone', 'Asia/Shanghai',
        'business_hours', jsonb_build_object(
            'enabled', true,
            'monday', jsonb_build_object('start', '09:00', 'end', '18:00'),
            'tuesday', jsonb_build_object('start', '09:00', 'end', '18:00'),
            'wednesday', jsonb_build_object('start', '09:00', 'end', '18:00'),
            'thursday', jsonb_build_object('start', '09:00', 'end', '18:00'),
            'friday', jsonb_build_object('start', '09:00', 'end', '18:00'),
            'saturday', jsonb_build_object('start', '10:00', 'end', '17:00'),
            'sunday', jsonb_build_object('start', '10:00', 'end', '17:00')
        ),
        'welcome_message', '欢迎来到我们的店铺！有什么可以帮助您的吗？'
    ),
    u.id
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.role = 'admin'
WHERE t.slug = 'default'
LIMIT 1
ON CONFLICT (merchant_id) DO NOTHING;

-- 创建视图：商户概览
CREATE OR REPLACE VIEW merchant_overview AS
SELECT 
    m.id,
    m.merchant_id,
    m.merchant_name,
    m.merchant_slug,
    m.business_type,
    m.industry,
    m.status,
    m.total_bots,
    m.total_messages,
    m.total_customers,
    m.created_at,
    m.updated_at,
    t.name as tenant_name,
    u.full_name as created_by_name,
    COUNT(mb.id) as active_bots,
    ARRAY_AGG(DISTINCT mb.platform) FILTER (WHERE mb.is_active) as platforms
FROM merchants m
LEFT JOIN tenants t ON m.tenant_id = t.id
LEFT JOIN users u ON m.created_by = u.id
LEFT JOIN merchant_bots mb ON m.id = mb.merchant_id AND mb.is_active = true
WHERE m.deleted_at IS NULL
GROUP BY m.id, t.name, u.full_name;

-- 创建视图：商户Bot统计
CREATE OR REPLACE VIEW merchant_bot_stats AS
SELECT 
    m.id as merchant_id,
    m.merchant_id,
    m.merchant_name,
    COUNT(mb.id) as total_bots,
    COUNT(CASE WHEN mb.is_active THEN 1 END) as active_bots,
    COUNT(CASE WHEN mb.is_primary THEN 1 END) as primary_bots,
    SUM(mb.message_count) as total_messages,
    MAX(mb.last_message_at) as last_message_at,
    ARRAY_AGG(DISTINCT mb.platform) FILTER (WHERE mb.is_active) as platforms
FROM merchants m
LEFT JOIN merchant_bots mb ON m.id = mb.merchant_id
WHERE m.deleted_at IS NULL
GROUP BY m.id, m.merchant_id, m.merchant_name;

-- 添加注释
COMMENT ON TABLE merchants IS '商户信息表';
COMMENT ON TABLE merchant_bots IS '商户-Bot关联表';
COMMENT ON TABLE merchant_invite_codes IS '商户邀请码表';
COMMENT ON TABLE merchant_shared_data IS '商户跨平台数据共享表';

COMMENT ON COLUMN merchants.merchant_id IS '商户唯一标识符，如：SHOP001';
COMMENT ON COLUMN merchants.merchant_slug IS '商户URL标识符';
COMMENT ON COLUMN merchants.settings IS '商户配置JSON';
COMMENT ON COLUMN merchant_bots.is_primary IS '是否为主要Bot';
COMMENT ON COLUMN merchant_invite_codes.invite_code IS '邀请码，格式：SHOP001-TG';
COMMENT ON COLUMN merchant_shared_data.data_type IS '数据类型：customer_profiles, conversation_history等'; 
