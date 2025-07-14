-- 008_add_ai_customer_service.sql
-- 添加AI客服系统支持

-- 扩展消息表以支持对话ID和语言信息
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(255);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS detected_language VARCHAR(10);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS original_content TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS translated_content TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS translation_confidence DECIMAL(3,2);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_conversation ON messages(tenant_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_language ON messages(detected_language);

-- 扩展消息分类表以支持人工介入标记
ALTER TABLE message_classifications ADD COLUMN IF NOT EXISTS needs_human_handoff BOOLEAN DEFAULT false;
ALTER TABLE message_classifications ADD COLUMN IF NOT EXISTS handoff_reason TEXT;
ALTER TABLE message_classifications ADD COLUMN IF NOT EXISTS escalation_type VARCHAR(50);
ALTER TABLE message_classifications ADD COLUMN IF NOT EXISTS detected_language VARCHAR(10);
ALTER TABLE message_classifications ADD COLUMN IF NOT EXISTS urgency_level VARCHAR(20) DEFAULT 'medium';

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_message_classifications_handoff ON message_classifications(tenant_id, needs_human_handoff) WHERE needs_human_handoff = true;
CREATE INDEX IF NOT EXISTS idx_message_classifications_urgency ON message_classifications(urgency_level);

-- 创建AI API调用日志表
CREATE TABLE IF NOT EXISTS ai_api_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id VARCHAR(255),
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    
    -- API调用信息
    provider VARCHAR(50) NOT NULL,              -- openai, claude, deepl, google
    model VARCHAR(100),                         -- 模型名称
    api_endpoint VARCHAR(255),                  -- API端点
    
    -- 请求信息
    request_type VARCHAR(50) NOT NULL,          -- classification, translation, generation
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    
    -- 响应信息
    response_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    error_code VARCHAR(50),
    
    -- 成本信息
    estimated_cost DECIMAL(10,6) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- 质量评估
    confidence_score DECIMAL(3,2),
    quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
    
    -- 元数据
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ai_api_calls_tenant ON ai_api_calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_api_calls_conversation ON ai_api_calls(tenant_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_api_calls_provider ON ai_api_calls(provider, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_api_calls_success ON ai_api_calls(success, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_api_calls_cost ON ai_api_calls(tenant_id, created_at, estimated_cost);

-- 创建人工介入会话表
CREATE TABLE IF NOT EXISTS human_handoff_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id VARCHAR(255) NOT NULL,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    
    -- 介入信息
    escalation_reason TEXT NOT NULL,
    escalation_type VARCHAR(50) DEFAULT 'manual',     -- manual, automatic, permission, complex, complaint
    priority_level VARCHAR(20) DEFAULT 'medium',      -- low, medium, high, urgent
    
    -- 分配信息
    assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE,
    assignment_method VARCHAR(50) DEFAULT 'auto',     -- auto, manual, round_robin, skill_based
    
    -- 状态信息
    status VARCHAR(20) DEFAULT 'pending',             -- pending, active, resolved, cancelled, transferred
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    first_response_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- 解决信息
    resolution_summary TEXT,
    resolution_category VARCHAR(100),
    customer_satisfaction INTEGER CHECK (customer_satisfaction >= 1 AND customer_satisfaction <= 5),
    
    -- 统计信息
    total_messages INTEGER DEFAULT 0,
    response_time_avg_minutes INTEGER,
    session_duration_minutes INTEGER,
    
    -- 元数据
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_human_handoff_tenant ON human_handoff_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_human_handoff_conversation ON human_handoff_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_human_handoff_agent ON human_handoff_sessions(assigned_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_human_handoff_status ON human_handoff_sessions(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_human_handoff_priority ON human_handoff_sessions(priority_level, status);

-- 创建对话摘要表
CREATE TABLE IF NOT EXISTS conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id VARCHAR(255) NOT NULL,
    
    -- 摘要内容
    summary_text TEXT NOT NULL,
    key_points JSONB DEFAULT '[]',
    main_topics JSONB DEFAULT '[]',
    
    -- 情感分析
    overall_sentiment VARCHAR(20) DEFAULT 'neutral',  -- positive, negative, neutral, mixed
    sentiment_trend JSONB DEFAULT '[]',               -- [{"timestamp": "", "sentiment": "", "score": 0.5}]
    
    -- 统计信息
    total_messages INTEGER DEFAULT 0,
    user_messages INTEGER DEFAULT 0,
    assistant_messages INTEGER DEFAULT 0,
    conversation_duration_minutes INTEGER,
    
    -- 语言信息
    primary_language VARCHAR(10) DEFAULT 'zh',
    detected_languages JSONB DEFAULT '[]',
    
    -- 分类信息
    conversation_categories JSONB DEFAULT '[]',       -- 对话涉及的主要分类
    escalation_count INTEGER DEFAULT 0,              -- 人工介入次数
    
    -- 质量评估
    summary_quality_score DECIMAL(3,2),
    auto_generated BOOLEAN DEFAULT true,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    -- 时间信息
    conversation_started_at TIMESTAMP WITH TIME ZONE,
    conversation_ended_at TIMESTAMP WITH TIME ZONE,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 确保每个对话只有一个摘要
    UNIQUE(tenant_id, conversation_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_tenant ON conversation_summaries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_language ON conversation_summaries(primary_language);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_sentiment ON conversation_summaries(overall_sentiment);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_updated ON conversation_summaries(tenant_id, last_updated_at);

-- 创建翻译缓存表（避免重复翻译）
CREATE TABLE IF NOT EXISTS translation_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 翻译信息
    source_text_hash VARCHAR(64) NOT NULL,           -- 源文本的哈希值
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    provider VARCHAR(50) NOT NULL,                   -- openai, deepl, google
    
    -- 翻译结果
    translated_text TEXT NOT NULL,
    confidence_score DECIMAL(3,2),
    
    -- 使用统计
    usage_count INTEGER DEFAULT 1,
    first_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 质量信息
    quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
    manual_reviewed BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 确保相同源文本和语言对只有一个缓存
    UNIQUE(source_text_hash, source_language, target_language, provider)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_translation_cache_hash ON translation_cache(source_text_hash, source_language, target_language);
CREATE INDEX IF NOT EXISTS idx_translation_cache_provider ON translation_cache(provider, last_used_at);
CREATE INDEX IF NOT EXISTS idx_translation_cache_usage ON translation_cache(usage_count DESC, last_used_at);

-- 创建客服知识库表
CREATE TABLE IF NOT EXISTS customer_service_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- 知识条目信息
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100),
    tags JSONB DEFAULT '[]',
    
    -- 匹配信息
    keywords JSONB DEFAULT '[]',                      -- 关键词数组
    intent_patterns JSONB DEFAULT '[]',               -- 意图模式
    language VARCHAR(10) DEFAULT 'zh',
    
    -- 使用统计
    view_count INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- 质量信息
    effectiveness_score DECIMAL(3,2),                -- 有效性评分
    user_rating DECIMAL(3,2),                        -- 用户评分
    feedback_count INTEGER DEFAULT 0,
    
    -- 状态信息
    status VARCHAR(20) DEFAULT 'active',             -- active, inactive, draft, archived
    priority INTEGER DEFAULT 0,
    
    -- 维护信息
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_knowledge_tenant ON customer_service_knowledge(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON customer_service_knowledge(tenant_id, category, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_language ON customer_service_knowledge(language, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_effectiveness ON customer_service_knowledge(effectiveness_score DESC, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_keywords ON customer_service_knowledge USING gin(keywords);

-- 创建触发器更新时间戳
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

-- 为相关表添加更新时间戳触发器
DROP TRIGGER IF EXISTS update_human_handoff_sessions_updated_at ON human_handoff_sessions;
CREATE TRIGGER update_human_handoff_sessions_updated_at 
    BEFORE UPDATE ON human_handoff_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversation_summaries_updated_at ON conversation_summaries;
CREATE TRIGGER update_conversation_summaries_updated_at 
    BEFORE UPDATE ON conversation_summaries 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_service_knowledge_updated_at ON customer_service_knowledge;
CREATE TRIGGER update_customer_service_knowledge_updated_at 
    BEFORE UPDATE ON customer_service_knowledge 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建一些有用的视图

-- 客服工作负载统计视图
CREATE OR REPLACE VIEW customer_service_workload AS
SELECT 
    h.tenant_id,
    h.assigned_agent_id,
    u.display_name as agent_name,
    COUNT(*) as total_sessions,
    COUNT(CASE WHEN h.status = 'active' THEN 1 END) as active_sessions,
    COUNT(CASE WHEN h.status = 'pending' THEN 1 END) as pending_sessions,
    COUNT(CASE WHEN h.status = 'resolved' THEN 1 END) as resolved_sessions,
    AVG(h.response_time_avg_minutes) as avg_response_time,
    AVG(h.customer_satisfaction) as avg_satisfaction,
    AVG(h.session_duration_minutes) as avg_session_duration
FROM human_handoff_sessions h
LEFT JOIN users u ON h.assigned_agent_id = u.id
WHERE h.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY h.tenant_id, h.assigned_agent_id, u.display_name;

-- AI使用成本统计视图  
CREATE OR REPLACE VIEW ai_usage_costs AS
SELECT 
    a.tenant_id,
    a.provider,
    a.model,
    DATE(a.created_at) as usage_date,
    COUNT(*) as total_calls,
    COUNT(CASE WHEN a.success THEN 1 END) as successful_calls,
    SUM(a.prompt_tokens) as total_prompt_tokens,
    SUM(a.completion_tokens) as total_completion_tokens,
    SUM(a.total_tokens) as total_tokens,
    SUM(a.estimated_cost) as total_cost,
    AVG(a.response_time_ms) as avg_response_time,
    AVG(a.confidence_score) as avg_confidence
FROM ai_api_calls a
WHERE a.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY a.tenant_id, a.provider, a.model, DATE(a.created_at)
ORDER BY usage_date DESC, total_cost DESC;

-- 对话质量统计视图
CREATE OR REPLACE VIEW conversation_quality_stats AS
SELECT 
    cs.tenant_id,
    cs.primary_language,
    DATE(cs.created_at) as summary_date,
    COUNT(*) as total_conversations,
    AVG(cs.total_messages) as avg_messages_per_conversation,
    AVG(cs.conversation_duration_minutes) as avg_duration_minutes,
    COUNT(CASE WHEN cs.overall_sentiment = 'positive' THEN 1 END) as positive_conversations,
    COUNT(CASE WHEN cs.overall_sentiment = 'negative' THEN 1 END) as negative_conversations,
    COUNT(CASE WHEN cs.overall_sentiment = 'neutral' THEN 1 END) as neutral_conversations,
    AVG(cs.escalation_count) as avg_escalations_per_conversation,
    AVG(cs.summary_quality_score) as avg_summary_quality
FROM conversation_summaries cs
WHERE cs.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY cs.tenant_id, cs.primary_language, DATE(cs.created_at)
ORDER BY summary_date DESC;

-- 添加注释
COMMENT ON TABLE ai_api_calls IS 'AI API调用日志，记录所有AI服务的使用情况和成本';
COMMENT ON TABLE human_handoff_sessions IS '人工介入会话记录，管理AI转人工的完整流程';
COMMENT ON TABLE conversation_summaries IS '对话摘要，存储对话的总结和分析结果';
COMMENT ON TABLE translation_cache IS '翻译缓存，避免重复翻译相同内容';
COMMENT ON TABLE customer_service_knowledge IS '客服知识库，存储常见问题和解答';

COMMENT ON VIEW customer_service_workload IS '客服工作负载统计，显示每个客服的工作量和绩效';
COMMENT ON VIEW ai_usage_costs IS 'AI使用成本统计，跟踪AI服务的使用量和费用';
COMMENT ON VIEW conversation_quality_stats IS '对话质量统计，分析对话的质量和满意度趋势'; 