-- =================================================================
-- Octopus Messenger 完整数据库初始化脚本
-- 版本: 1.0.0 (合并所有迁移)
-- 创建日期: 2024-01-01
-- 包含: 基础架构 + Discord + Intercom + 用户标签系统 + 群组权限系统 + 商户系统
-- =================================================================

-- 启用扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =================================================================
-- 创建枚举类型
-- =================================================================

-- 平台类型
DO $$ BEGIN
    CREATE TYPE platform_type AS ENUM (
        'telegram', 'whatsapp', 'slack', 'discord', 'teams', 'line', 'wechat', 'intercom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 消息类型
DO $$ BEGIN
    CREATE TYPE message_type AS ENUM (
        'text', 'image', 'audio', 'video', 'document', 'location', 'contact', 
        'sticker', 'emoji', 'command', 'interaction'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Bot平台类型
DO $$ BEGIN
    CREATE TYPE bot_platform AS ENUM (
        'telegram', 'whatsapp', 'slack', 'discord', 'teams', 'line', 'wechat', 'intercom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 权限策略类型
DO $$ BEGIN
    CREATE TYPE auth_policy AS ENUM ('open', 'whitelist', 'blacklist', 'approval');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 租户模式类型
DO $$ BEGIN
    CREATE TYPE tenant_mode AS ENUM ('training', 'privacy');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =================================================================
-- 基础表结构
-- =================================================================

-- 创建租户表
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    subscription_status VARCHAR(20) DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
    subscription_plan VARCHAR(50) DEFAULT 'basic',
    max_bots INTEGER DEFAULT 5,
    max_messages_per_month INTEGER DEFAULT 10000,
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    current_mode tenant_mode DEFAULT 'training',
    privacy_mode_enabled BOOLEAN DEFAULT false,
    data_retention_days INTEGER DEFAULT 90,
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
    full_name VARCHAR(200),
    display_name VARCHAR(200),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user', 'agent')),
    permissions JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    phone VARCHAR(20),
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'zh-CN',
    preferences JSONB DEFAULT '{}',
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_from VARCHAR(50) DEFAULT 'manual',
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

-- =================================================================
-- 商户系统表
-- =================================================================

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

-- 创建Bot配置表
CREATE TABLE IF NOT EXISTS bot_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    bot_token VARCHAR(500) NOT NULL,
    webhook_url TEXT,
    webhook_secret VARCHAR(255),
    merchant_id UUID REFERENCES merchants(id),
    
    -- Discord特定字段
    discord_client_id VARCHAR(255),
    discord_client_secret VARCHAR(255),
    discord_public_key VARCHAR(255),
    discord_guild_id VARCHAR(255),
    
    -- Intercom特定字段
    app_id VARCHAR(255),
    secret_key VARCHAR(255),
    region VARCHAR(10) DEFAULT 'us',
    process_admin_replies BOOLEAN DEFAULT false,
    default_admin_id VARCHAR(255),
    
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    last_activity_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_from VARCHAR(50) DEFAULT 'manual',
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

-- 创建商户邀请码表
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

-- 创建商户数据共享表
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

-- =================================================================
-- 消息和任务表
-- =================================================================

-- 创建消息表
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID REFERENCES bot_configs(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    platform_message_id VARCHAR(255),
    sender_id VARCHAR(255),
    sender_name VARCHAR(255),
    sender_username VARCHAR(255),
    channel_id VARCHAR(255),
    channel_name VARCHAR(255),
    thread_id VARCHAR(255),
    reply_to_message_id VARCHAR(255),
    content TEXT,
    message_type VARCHAR(50) DEFAULT 'text',
    media_urls JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    direction VARCHAR(20) DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
    status VARCHAR(20) DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed')),
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建消息分类表
CREATE TABLE IF NOT EXISTS message_classifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    sentiment VARCHAR(20) DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    language VARCHAR(10) DEFAULT 'zh-CN',
    tags JSONB DEFAULT '[]',
    keywords JSONB DEFAULT '[]',
    ai_model VARCHAR(50),
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建任务表
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    classification_id UUID REFERENCES message_classifications(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =================================================================
-- 用户标签系统
-- =================================================================

-- 创建标签定义表
CREATE TABLE IF NOT EXISTS tag_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- 标签基本信息
    name VARCHAR(100) NOT NULL,               -- 标签名称（英文，用于系统内部）
    display_name VARCHAR(100) NOT NULL,       -- 显示名称（可以是中文）
    description TEXT,                         -- 标签描述
    
    -- 标签分类
    category VARCHAR(50) NOT NULL,            -- 标签类别：demographic, behavior, interest, value, lifecycle等
    
    -- 视觉配置
    color VARCHAR(7) DEFAULT '#6c757d',       -- 标签颜色（hex格式）
    icon VARCHAR(50),                         -- 图标名称
    
    -- 应用规则
    is_system BOOLEAN DEFAULT false,          -- 是否为系统预定义标签
    is_active BOOLEAN DEFAULT true,           -- 是否启用
    is_auto_apply BOOLEAN DEFAULT false,      -- 是否自动应用
    
    -- 排序和显示
    sort_order INTEGER DEFAULT 0,            -- 显示顺序
    
    -- 元数据
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建用户档案表
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES merchants(id),
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

-- 创建用户标签关联表
CREATE TABLE IF NOT EXISTS user_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    tag_definition_id UUID NOT NULL REFERENCES tag_definitions(id) ON DELETE CASCADE,
    
    -- 标签应用信息
    confidence DECIMAL(3,2) DEFAULT 1.0,     -- 标签置信度 0-1
    source VARCHAR(50) NOT NULL,             -- 标签来源：manual, auto, ai, import等
    applied_by UUID REFERENCES users(id),    -- 手动应用者
    applied_reason TEXT,                     -- 应用原因
    
    -- 标签值（用于参数化标签）
    tag_value JSONB,                         -- 标签值，如数值、日期等
    
    -- 时间信息
    first_applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_confirmed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,     -- 标签过期时间
    
    -- 状态
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =================================================================
-- 群组权限系统
-- =================================================================

-- 创建群组信息表
CREATE TABLE IF NOT EXISTS group_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES merchants(id),
    
    -- 群组基本信息
    platform_group_id VARCHAR(255) NOT NULL,  -- 平台群组ID
    group_name VARCHAR(255),                   -- 群组名称
    group_type VARCHAR(50),                    -- 群组类型：group, supergroup, channel等
    group_description TEXT,                    -- 群组描述
    member_count INTEGER DEFAULT 0,           -- 成员数量
    
    -- 权限状态
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
    
    -- 配额管理
    message_quota INTEGER DEFAULT 1000,       -- 消息配额
    quota_used INTEGER DEFAULT 0,             -- 已使用配额
    quota_reset_at TIMESTAMP WITH TIME ZONE,  -- 配额重置时间
    
    -- 邀请信息
    invited_by_user_id VARCHAR(255),          -- 邀请者用户ID
    invited_by_username VARCHAR(255),         -- 邀请者用户名
    invite_timestamp TIMESTAMP WITH TIME ZONE,-- 邀请时间
    
    -- Bot加入信息
    bot_join_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    bot_permissions JSONB DEFAULT '{}',       -- Bot权限
    
    -- 活动统计
    last_activity_at TIMESTAMP WITH TIME ZONE,
    total_messages INTEGER DEFAULT 0,
    
    -- 审批信息
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

-- =================================================================
-- Intercom集成表
-- =================================================================

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

-- =================================================================
-- Discord集成表
-- =================================================================

-- 创建Discord交互表
CREATE TABLE IF NOT EXISTS discord_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bot_config_id UUID NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
    interaction_id VARCHAR(255) NOT NULL,
    interaction_type INTEGER NOT NULL,
    interaction_token VARCHAR(255),
    user_id VARCHAR(255),
    guild_id VARCHAR(255),
    channel_id VARCHAR(255),
    command_name VARCHAR(255),
    command_options JSONB DEFAULT '{}',
    component_custom_id VARCHAR(255),
    component_values JSONB DEFAULT '[]',
    response_type INTEGER,
    response_sent BOOLEAN DEFAULT false,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =================================================================
-- 其他支持表
-- =================================================================

-- 创建CRM集成表
CREATE TABLE IF NOT EXISTS crm_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('lark', 'salesforce', 'hubspot', 'pipedrive', 'zoho')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    config JSONB NOT NULL,
    webhook_url TEXT,
    webhook_secret VARCHAR(255),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建会话表
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    platform_user_id VARCHAR(255) NOT NULL,
    platform_username VARCHAR(255),
    session_data JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'ended', 'expired')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建自动回复规则表
CREATE TABLE IF NOT EXISTS auto_reply_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    priority INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

-- =================================================================
-- 创建触发器函数
-- =================================================================

-- 更新时间戳函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 更新商户统计信息函数
CREATE OR REPLACE FUNCTION update_merchant_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- 更新商户总bot数量
    UPDATE merchants SET 
        total_bots = (
            SELECT COUNT(*) FROM merchant_bots 
            WHERE merchant_id = COALESCE(NEW.merchant_id, OLD.merchant_id) AND is_active = true
        )
    WHERE id = COALESCE(NEW.merchant_id, OLD.merchant_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- =================================================================
-- 创建触发器
-- =================================================================

-- 更新时间戳触发器
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at 
    BEFORE UPDATE ON tenants 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_platforms_updated_at ON platforms;
CREATE TRIGGER update_platforms_updated_at 
    BEFORE UPDATE ON platforms 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bot_configs_updated_at ON bot_configs;
CREATE TRIGGER update_bot_configs_updated_at 
    BEFORE UPDATE ON bot_configs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- 商户统计更新触发器
DROP TRIGGER IF EXISTS trigger_update_merchant_stats ON merchant_bots;
CREATE TRIGGER trigger_update_merchant_stats
    AFTER INSERT OR UPDATE OR DELETE ON merchant_bots
    FOR EACH ROW EXECUTE FUNCTION update_merchant_stats();

-- =================================================================
-- 创建索引
-- =================================================================

-- 基础表索引
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_mode ON tenants(current_mode);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE INDEX IF NOT EXISTS idx_bot_configs_tenant_id ON bot_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bot_configs_platform ON bot_configs(platform);
CREATE INDEX IF NOT EXISTS idx_bot_configs_merchant ON bot_configs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_bot_configs_status ON bot_configs(is_active);

-- 商户系统索引
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

-- 消息系统索引
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_bot_config_id ON messages(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_messages_platform ON messages(platform);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_content_gin ON messages USING gin(to_tsvector('simple', content));
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING gin(content gin_trgm_ops);

-- 用户标签系统索引
CREATE INDEX IF NOT EXISTS idx_tag_definitions_tenant ON tag_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tag_definitions_category ON tag_definitions(category);
CREATE INDEX IF NOT EXISTS idx_tag_definitions_active ON tag_definitions(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_definitions_tenant_name ON tag_definitions(tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_merchant ON user_profiles(merchant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_identifier ON user_profiles(user_identifier);
CREATE INDEX IF NOT EXISTS idx_user_profiles_hash ON user_profiles(user_id_hash);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen ON user_profiles(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_user_profiles_value_tier ON user_profiles(estimated_value_tier);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_tenant_identifier ON user_profiles(tenant_id, user_identifier);

CREATE INDEX IF NOT EXISTS idx_user_tags_profile ON user_tags(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_definition ON user_tags(tag_definition_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_active ON user_tags(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tags_unique ON user_tags(user_profile_id, tag_definition_id) WHERE is_active = true;

-- 群组权限系统索引
CREATE INDEX IF NOT EXISTS idx_group_info_tenant ON group_info(tenant_id);
CREATE INDEX IF NOT EXISTS idx_group_info_bot_config ON group_info(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_group_info_merchant ON group_info(merchant_id);
CREATE INDEX IF NOT EXISTS idx_group_info_platform_group ON group_info(platform_group_id);
CREATE INDEX IF NOT EXISTS idx_group_info_status ON group_info(status);
CREATE INDEX IF NOT EXISTS idx_group_info_last_activity ON group_info(last_activity_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_info_unique ON group_info(tenant_id, bot_config_id, platform_group_id);

CREATE INDEX IF NOT EXISTS idx_bot_auth_policies_tenant ON bot_auth_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bot_auth_policies_bot_config ON bot_auth_policies(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_bot_auth_policies_active ON bot_auth_policies(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_auth_policies_unique ON bot_auth_policies(tenant_id, bot_config_id);

-- Intercom集成索引
CREATE INDEX IF NOT EXISTS idx_intercom_conversations_tenant ON intercom_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_intercom_conversations_bot_config ON intercom_conversations(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_intercom_conversations_id ON intercom_conversations(conversation_id);

-- Discord集成索引
CREATE INDEX IF NOT EXISTS idx_discord_interactions_tenant ON discord_interactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_discord_interactions_bot_config ON discord_interactions(bot_config_id);
CREATE INDEX IF NOT EXISTS idx_discord_interactions_id ON discord_interactions(interaction_id);

-- =================================================================
-- 插入初始数据
-- =================================================================

-- 插入支持的平台
INSERT INTO platforms (id, name, slug, description, status, config) VALUES
(uuid_generate_v4(), 'Telegram', 'telegram', 'Telegram Bot平台', 'active', '{"api_url": "https://api.telegram.org/bot", "webhook_path": "/api/webhooks/telegram"}'),
(uuid_generate_v4(), 'Discord', 'discord', 'Discord Bot平台', 'active', '{"api_url": "https://discord.com/api/v10", "webhook_path": "/api/webhooks/discord"}'),
(uuid_generate_v4(), 'Slack', 'slack', 'Slack Bot平台', 'active', '{"api_url": "https://slack.com/api", "webhook_path": "/api/webhooks/slack"}'),
(uuid_generate_v4(), 'WhatsApp', 'whatsapp', 'WhatsApp Business API', 'active', '{"api_url": "https://graph.facebook.com/v17.0", "webhook_path": "/api/webhooks/whatsapp"}'),
(uuid_generate_v4(), 'Intercom', 'intercom', 'Intercom客服平台', 'active', '{"api_url": "https://api.intercom.io", "webhook_path": "/api/webhooks/intercom"}'),
(uuid_generate_v4(), '企业微信', 'wework', '企业微信机器人', 'active', '{"api_url": "https://qyapi.weixin.qq.com/cgi-bin", "webhook_path": "/api/webhooks/wework"}'),
(uuid_generate_v4(), '钉钉', 'dingtalk', '钉钉机器人', 'active', '{"api_url": "https://oapi.dingtalk.com", "webhook_path": "/api/webhooks/dingtalk"}'),
(uuid_generate_v4(), '飞书', 'lark', '飞书机器人', 'active', '{"api_url": "https://open.feishu.cn/open-apis", "webhook_path": "/api/webhooks/lark"}'),
(uuid_generate_v4(), 'Line', 'line', 'Line Bot平台', 'active', '{"api_url": "https://api.line.me/v2", "webhook_path": "/api/webhooks/line"}')
ON CONFLICT (slug) DO NOTHING;

-- =================================================================
-- 创建视图
-- =================================================================

-- 商户概览视图
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

-- 商户Bot统计视图
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

-- =================================================================
-- 添加注释
-- =================================================================

COMMENT ON TABLE merchants IS '商户信息表';
COMMENT ON TABLE merchant_bots IS '商户-Bot关联表';
COMMENT ON TABLE merchant_invite_codes IS '商户邀请码表';
COMMENT ON TABLE merchant_shared_data IS '商户跨平台数据共享表';
COMMENT ON TABLE user_profiles IS '用户档案表，用于跨平台用户分析';
COMMENT ON TABLE tag_definitions IS '标签定义表';
COMMENT ON TABLE user_tags IS '用户标签关联表';
COMMENT ON TABLE group_info IS '群组信息表';
COMMENT ON TABLE bot_auth_policies IS 'Bot权限策略表';

COMMENT ON COLUMN merchants.merchant_id IS '商户唯一标识符，如：SHOP001';
COMMENT ON COLUMN merchants.merchant_slug IS '商户URL标识符';
COMMENT ON COLUMN merchants.settings IS '商户配置JSON';
COMMENT ON COLUMN merchant_bots.is_primary IS '是否为主要Bot';
COMMENT ON COLUMN merchant_invite_codes.invite_code IS '邀请码，格式：SHOP001-TG';
COMMENT ON COLUMN merchant_shared_data.data_type IS '数据类型：customer_profiles, conversation_history等';

-- =================================================================
-- 完成
-- =================================================================

SELECT 'Octopus Messenger 数据库初始化完成！' as message; 