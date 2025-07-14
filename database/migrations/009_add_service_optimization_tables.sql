-- 009_add_service_optimization_tables.sql
-- 为服务优化功能添加必要的数据库表

-- 服务发现和健康检查表
CREATE TABLE IF NOT EXISTS service_instances (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    instance_url VARCHAR(255) NOT NULL,
    weight INTEGER DEFAULT 1,
    healthy BOOLEAN DEFAULT true,
    connections INTEGER DEFAULT 0,
    last_health_check TIMESTAMP,
    last_success TIMESTAMP,
    last_error TIMESTAMP,
    consecutive_failures INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 服务性能指标表
CREATE TABLE IF NOT EXISTS service_metrics (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    instance_url VARCHAR(255),
    metric_type VARCHAR(50) NOT NULL, -- 'response_time', 'throughput', 'error_rate', etc.
    metric_value DECIMAL(10,4) NOT NULL,
    unit VARCHAR(20), -- 'ms', 'req/min', '%', etc.
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- 存储优化统计表
CREATE TABLE IF NOT EXISTS storage_optimization_stats (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL,
    storage_level VARCHAR(20) NOT NULL, -- 'hot', 'warm', 'cold'
    original_size BIGINT,
    compressed_size BIGINT,
    compression_ratio DECIMAL(5,4),
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP,
    migrated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI性能优化表
CREATE TABLE IF NOT EXISTS ai_classifier_performance (
    id SERIAL PRIMARY KEY,
    classifier_name VARCHAR(50) NOT NULL,
    request_count INTEGER DEFAULT 0,
    total_response_time BIGINT DEFAULT 0, -- milliseconds
    error_count INTEGER DEFAULT 0,
    avg_confidence DECIMAL(5,4) DEFAULT 0,
    success_rate DECIMAL(5,4) DEFAULT 0,
    last_used TIMESTAMP,
    performance_score DECIMAL(5,2) DEFAULT 0,
    date_bucket DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(classifier_name, date_bucket)
);

-- 平台优化统计表
CREATE TABLE IF NOT EXISTS platform_optimization_stats (
    id SERIAL PRIMARY KEY,
    platform_name VARCHAR(50) NOT NULL,
    total_messages BIGINT DEFAULT 0,
    successful_messages BIGINT DEFAULT 0,
    failed_messages BIGINT DEFAULT 0,
    avg_processing_time DECIMAL(8,2) DEFAULT 0,
    rate_limit_hits INTEGER DEFAULT 0,
    last_message_time TIMESTAMP,
    date_bucket DATE DEFAULT CURRENT_DATE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform_name, date_bucket)
);

-- CRM优化性能表
CREATE TABLE IF NOT EXISTS crm_performance_metrics (
    id SERIAL PRIMARY KEY,
    crm_name VARCHAR(50) NOT NULL,
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    avg_response_time DECIMAL(8,2) DEFAULT 0,
    consecutive_failures INTEGER DEFAULT 0,
    performance_score DECIMAL(5,2) DEFAULT 0,
    last_request TIMESTAMP,
    date_bucket DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(crm_name, date_bucket)
);

-- 任务路由优化表
CREATE TABLE IF NOT EXISTS task_routing_optimization (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    task_type VARCHAR(50),
    priority VARCHAR(20),
    selected_crm VARCHAR(50),
    routing_reason VARCHAR(100),
    processing_time INTEGER, -- milliseconds
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 系统告警表
CREATE TABLE IF NOT EXISTS system_alerts (
    id SERIAL PRIMARY KEY,
    alert_id VARCHAR(255) UNIQUE NOT NULL,
    severity VARCHAR(20) NOT NULL, -- 'critical', 'warning', 'info'
    category VARCHAR(50) NOT NULL, -- 'system', 'business', 'security'
    metric_name VARCHAR(100) NOT NULL,
    current_value DECIMAL(10,4),
    threshold_value DECIMAL(10,4),
    critical_value DECIMAL(10,4),
    unit VARCHAR(20),
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'resolved', 'suppressed'
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 缓存性能统计表
CREATE TABLE IF NOT EXISTS cache_performance_stats (
    id SERIAL PRIMARY KEY,
    cache_type VARCHAR(50) NOT NULL, -- 'classification', 'translation', 'conversation'
    cache_key_pattern VARCHAR(255),
    hit_count BIGINT DEFAULT 0,
    miss_count BIGINT DEFAULT 0,
    total_requests BIGINT DEFAULT 0,
    hit_rate DECIMAL(5,4) DEFAULT 0,
    avg_response_time DECIMAL(8,2) DEFAULT 0,
    cache_size BIGINT DEFAULT 0,
    eviction_count INTEGER DEFAULT 0,
    date_bucket DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cache_type, cache_key_pattern, date_bucket)
);

-- 负载均衡统计表
CREATE TABLE IF NOT EXISTS load_balancer_stats (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    strategy VARCHAR(50) NOT NULL, -- 'round-robin', 'weighted', 'least-connections'
    instance_url VARCHAR(255) NOT NULL,
    request_count BIGINT DEFAULT 0,
    success_count BIGINT DEFAULT 0,
    error_count BIGINT DEFAULT 0,
    avg_response_time DECIMAL(8,2) DEFAULT 0,
    current_connections INTEGER DEFAULT 0,
    date_bucket DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_service_instances_name_healthy ON service_instances(service_name, healthy);
CREATE INDEX IF NOT EXISTS idx_service_metrics_service_type_time ON service_metrics(service_name, metric_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_storage_stats_level_accessed ON storage_optimization_stats(storage_level, last_accessed);
CREATE INDEX IF NOT EXISTS idx_ai_performance_classifier_date ON ai_classifier_performance(classifier_name, date_bucket);
CREATE INDEX IF NOT EXISTS idx_platform_stats_platform_date ON platform_optimization_stats(platform_name, date_bucket);
CREATE INDEX IF NOT EXISTS idx_crm_metrics_crm_date ON crm_performance_metrics(crm_name, date_bucket);
CREATE INDEX IF NOT EXISTS idx_task_routing_type_time ON task_routing_optimization(task_type, created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_severity_status_time ON system_alerts(severity, status, created_at);
CREATE INDEX IF NOT EXISTS idx_cache_stats_type_date ON cache_performance_stats(cache_type, date_bucket);
CREATE INDEX IF NOT EXISTS idx_load_balancer_service_date ON load_balancer_stats(service_name, date_bucket);

-- 为messages表添加新字段支持存储优化
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS storage_level VARCHAR(20) DEFAULT 'hot',
ADD COLUMN IF NOT EXISTS content_ref VARCHAR(255),
ADD COLUMN IF NOT EXISTS compression_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_size BIGINT,
ADD COLUMN IF NOT EXISTS compressed_size BIGINT;

-- 为message_classifications表添加性能相关字段
ALTER TABLE message_classifications 
ADD COLUMN IF NOT EXISTS classifier_used VARCHAR(50),
ADD COLUMN IF NOT EXISTS processing_time INTEGER, -- milliseconds
ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS performance_score DECIMAL(5,2);

-- 创建视图以便于查询优化统计
CREATE OR REPLACE VIEW service_health_summary AS
SELECT 
    service_name,
    COUNT(*) as total_instances,
    COUNT(CASE WHEN healthy = true THEN 1 END) as healthy_instances,
    AVG(CASE WHEN healthy = true THEN 1.0 ELSE 0.0 END) * 100 as health_percentage,
    MAX(last_health_check) as last_check,
    AVG(consecutive_failures) as avg_failures
FROM service_instances
GROUP BY service_name;

CREATE OR REPLACE VIEW ai_classifier_daily_summary AS
SELECT 
    classifier_name,
    date_bucket,
    request_count,
    CASE WHEN request_count > 0 THEN total_response_time / request_count ELSE 0 END as avg_response_time,
    CASE WHEN request_count > 0 THEN (request_count - error_count)::DECIMAL / request_count ELSE 0 END as success_rate,
    avg_confidence,
    performance_score
FROM ai_classifier_performance
WHERE date_bucket >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date_bucket DESC, performance_score DESC;

CREATE OR REPLACE VIEW storage_efficiency_summary AS
SELECT 
    storage_level,
    COUNT(*) as total_messages,
    AVG(compression_ratio) as avg_compression_ratio,
    SUM(original_size) as total_original_size,
    SUM(compressed_size) as total_compressed_size,
    SUM(original_size - COALESCE(compressed_size, original_size)) as total_saved_bytes
FROM storage_optimization_stats
GROUP BY storage_level;

CREATE OR REPLACE VIEW platform_performance_summary AS
SELECT 
    platform_name,
    SUM(total_messages) as total_messages,
    AVG(avg_processing_time) as avg_processing_time,
    CASE WHEN SUM(total_messages) > 0 THEN SUM(successful_messages)::DECIMAL / SUM(total_messages) ELSE 0 END as success_rate,
    SUM(rate_limit_hits) as total_rate_limit_hits,
    MAX(last_message_time) as last_activity
FROM platform_optimization_stats
WHERE date_bucket >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY platform_name;

CREATE OR REPLACE VIEW active_alerts_summary AS
SELECT 
    severity,
    category,
    COUNT(*) as alert_count,
    COUNT(CASE WHEN acknowledged = true THEN 1 END) as acknowledged_count,
    MAX(created_at) as latest_alert
FROM system_alerts
WHERE status = 'active'
GROUP BY severity, category
ORDER BY 
    CASE severity 
        WHEN 'critical' THEN 1 
        WHEN 'warning' THEN 2 
        WHEN 'info' THEN 3 
    END;

-- 添加触发器自动更新updated_at字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为相关表添加更新触发器
DROP TRIGGER IF EXISTS update_service_instances_updated_at ON service_instances;
CREATE TRIGGER update_service_instances_updated_at 
    BEFORE UPDATE ON service_instances 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_classifier_performance_updated_at ON ai_classifier_performance;
CREATE TRIGGER update_ai_classifier_performance_updated_at 
    BEFORE UPDATE ON ai_classifier_performance 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_optimization_stats_updated_at ON platform_optimization_stats;
CREATE TRIGGER update_platform_optimization_stats_updated_at 
    BEFORE UPDATE ON platform_optimization_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_crm_performance_metrics_updated_at ON crm_performance_metrics;
CREATE TRIGGER update_crm_performance_metrics_updated_at 
    BEFORE UPDATE ON crm_performance_metrics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_alerts_updated_at ON system_alerts;
CREATE TRIGGER update_system_alerts_updated_at 
    BEFORE UPDATE ON system_alerts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cache_performance_stats_updated_at ON cache_performance_stats;
CREATE TRIGGER update_cache_performance_stats_updated_at 
    BEFORE UPDATE ON cache_performance_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入一些初始数据
INSERT INTO service_instances (service_name, instance_url, weight, healthy) VALUES
('gateway', 'http://localhost:3000', 1, true),
('ai-service', 'http://localhost:3001', 1, true),
('message-processor', 'http://localhost:3002', 1, true),
('task-service', 'http://localhost:3003', 1, true),
('bot-manager', 'http://localhost:3004', 1, true),
('admin-panel', 'http://localhost:3005', 1, true)
ON CONFLICT DO NOTHING;

-- 为AI分类器初始化性能记录
INSERT INTO ai_classifier_performance (classifier_name, date_bucket) VALUES
('openai', CURRENT_DATE),
('claude', CURRENT_DATE),
('ruleEngine', CURRENT_DATE)
ON CONFLICT (classifier_name, date_bucket) DO NOTHING;

-- 为平台初始化优化统计
INSERT INTO platform_optimization_stats (platform_name, date_bucket) VALUES
('telegram', CURRENT_DATE),
('discord', CURRENT_DATE),
('whatsapp', CURRENT_DATE),
('slack', CURRENT_DATE),
('line', CURRENT_DATE),
('wework', CURRENT_DATE),
('intercom', CURRENT_DATE)
ON CONFLICT (platform_name, date_bucket) DO NOTHING;

-- 为CRM系统初始化性能记录
INSERT INTO crm_performance_metrics (crm_name, date_bucket) VALUES
('salesforce', CURRENT_DATE),
('hubspot', CURRENT_DATE),
('dingtalk', CURRENT_DATE),
('wework', CURRENT_DATE),
('lark', CURRENT_DATE),
('notion', CURRENT_DATE),
('monday', CURRENT_DATE),
('jira', CURRENT_DATE),
('asana', CURRENT_DATE)
ON CONFLICT (crm_name, date_bucket) DO NOTHING; 