-- 007_add_merchant_system.sql
-- 添加商户管理系统支持

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