-- 租户模型存储表
CREATE TABLE IF NOT EXISTS tenant_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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