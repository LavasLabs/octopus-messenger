-- 租户模式配置表
CREATE TABLE IF NOT EXISTS tenant_modes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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