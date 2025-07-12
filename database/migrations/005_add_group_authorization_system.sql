-- 005_add_group_authorization_system.sql
-- 群组权限管理系统

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