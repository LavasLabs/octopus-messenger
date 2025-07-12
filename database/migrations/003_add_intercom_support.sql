-- 003_add_intercom_support.sql
-- 添加Intercom平台支持

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