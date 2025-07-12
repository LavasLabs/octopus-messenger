-- 004_add_user_tagging_system.sql
-- 用户标签和行为分析系统

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