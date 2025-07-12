-- Octopus Messenger 初始数据
-- 插入基础平台数据

-- 插入支持的平台
INSERT INTO platforms (id, name, slug, description, status, config) VALUES
(uuid_generate_v4(), 'Telegram', 'telegram', 'Telegram Bot平台', 'active', '{"api_url": "https://api.telegram.org/bot", "webhook_path": "/api/webhooks/telegram"}'),
(uuid_generate_v4(), 'Discord', 'discord', 'Discord Bot平台', 'active', '{"api_url": "https://discord.com/api/v10", "webhook_path": "/api/webhooks/discord"}'),
(uuid_generate_v4(), 'Slack', 'slack', 'Slack Bot平台', 'active', '{"api_url": "https://slack.com/api", "webhook_path": "/api/webhooks/slack"}'),
(uuid_generate_v4(), 'WhatsApp', 'whatsapp', 'WhatsApp Business API', 'active', '{"api_url": "https://graph.facebook.com/v17.0", "webhook_path": "/api/webhooks/whatsapp"}'),
(uuid_generate_v4(), '企业微信', 'wework', '企业微信机器人', 'active', '{"api_url": "https://qyapi.weixin.qq.com/cgi-bin", "webhook_path": "/api/webhooks/wework"}'),
(uuid_generate_v4(), '钉钉', 'dingtalk', '钉钉机器人', 'active', '{"api_url": "https://oapi.dingtalk.com", "webhook_path": "/api/webhooks/dingtalk"}'),
(uuid_generate_v4(), '飞书', 'lark', '飞书机器人', 'active', '{"api_url": "https://open.feishu.cn/open-apis", "webhook_path": "/api/webhooks/lark"}')
ON CONFLICT (slug) DO NOTHING;

-- 插入默认租户
INSERT INTO tenants (id, name, slug, description, status, settings) VALUES
(uuid_generate_v4(), '默认租户', 'default', '系统默认租户', 'active', '{"max_bots": 10, "max_messages_per_month": 50000, "features": ["ai_classification", "crm_integration", "auto_reply"]}')
ON CONFLICT (slug) DO NOTHING;

-- 获取默认租户ID (用于后续插入)
-- 注意：在实际使用中，你需要替换这个ID为实际的租户ID

-- 插入默认管理员用户
-- 密码: admin123 (已经过bcrypt加密)
INSERT INTO users (id, tenant_id, email, username, password_hash, first_name, last_name, display_name, role, status, email_verified, language, timezone) VALUES
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), 'admin@octopus-messenger.com', 'admin', '$2b$12$LQv3c1yqBwEHv9LVBfgVye7fOYNWJ8hm8MZsUYYjcJQOZ6GfYLO8q', '系统', '管理员', '系统管理员', 'admin', 'active', true, 'zh-CN', 'Asia/Shanghai')
ON CONFLICT (email) DO NOTHING;

-- 插入一些示例分类规则的数据
INSERT INTO message_classifications (id, message_id, category, subcategory, confidence, priority, sentiment, language, tags, keywords, ai_model, processing_time_ms) VALUES
(uuid_generate_v4(), uuid_generate_v4(), '产品咨询', '功能询问', 0.85, 'medium', 'neutral', 'zh-CN', '["product", "feature"]', '["功能", "如何使用", "怎么"]', 'gpt-4', 120),
(uuid_generate_v4(), uuid_generate_v4(), '技术支持', '故障报告', 0.92, 'high', 'negative', 'zh-CN', '["support", "bug"]', '["错误", "故障", "不能用"]', 'gpt-4', 95),
(uuid_generate_v4(), uuid_generate_v4(), '销售线索', '询价', 0.78, 'high', 'positive', 'zh-CN', '["sales", "price"]', '["价格", "报价", "购买"]', 'gpt-4', 110)
ON CONFLICT DO NOTHING;

-- 插入默认自动回复规则
INSERT INTO auto_reply_rules (id, tenant_id, platform_id, name, description, conditions, actions, priority, status) VALUES
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), (SELECT id FROM platforms WHERE slug = 'telegram'), '欢迎消息', '新用户欢迎消息', 
'{"event": "first_message", "keywords": ["hello", "hi", "你好", "开始"]}', 
'{"type": "text", "content": "欢迎使用Octopus Messenger！我是您的智能助手，有什么可以帮助您的吗？", "delay": 0}', 
1, 'active'),
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), (SELECT id FROM platforms WHERE slug = 'discord'), '帮助信息', '提供帮助信息', 
'{"keywords": ["help", "帮助", "使用说明"]}', 
'{"type": "embed", "title": "帮助信息", "description": "您可以发送任何问题，我会智能分类并为您创建任务。", "fields": [{"name": "支持的功能", "value": "• 智能分类\n• 任务创建\n• CRM集成"}]}', 
2, 'active'),
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), (SELECT id FROM platforms WHERE slug = 'slack'), '常见问题', '常见问题回复', 
'{"keywords": ["faq", "常见问题", "问题"]}', 
'{"type": "text", "content": "以下是一些常见问题的解答：\n\n1. 如何创建任务？\n   - 直接发送您的问题，系统会自动创建任务\n\n2. 如何查看任务状态？\n   - 使用 /status 命令查看\n\n3. 如何联系人工客服？\n   - 使用 /contact 命令"}', 
3, 'active')
ON CONFLICT DO NOTHING;

-- 插入示例CRM集成配置
INSERT INTO crm_integrations (id, tenant_id, name, type, config, status) VALUES
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), '飞书集成', 'lark', 
'{"app_id": "your_app_id", "app_secret": "your_app_secret", "base_url": "https://open.feishu.cn", "default_table_id": "your_table_id"}', 
'inactive'),
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), 'Notion集成', 'notion', 
'{"token": "your_notion_token", "database_id": "your_database_id"}', 
'inactive'),
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), 'Salesforce集成', 'salesforce', 
'{"client_id": "your_client_id", "client_secret": "your_client_secret", "username": "your_username", "password": "your_password", "instance_url": "https://login.salesforce.com"}', 
'inactive')
ON CONFLICT DO NOTHING;

-- 插入示例Webhook配置
INSERT INTO webhook_configs (id, tenant_id, name, url, events, headers, secret, status, retry_count, timeout_seconds) VALUES
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), '第三方系统通知', 'https://your-system.com/webhooks/octopus', 
'["message_received", "task_created", "task_completed"]', 
'{"Content-Type": "application/json", "X-Custom-Header": "octopus-webhook"}', 
'your_webhook_secret', 'inactive', 3, 30),
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), '内部监控系统', 'https://monitor.your-company.com/webhooks', 
'["system_error", "service_down"]', 
'{"Content-Type": "application/json", "Authorization": "Bearer your_token"}', 
'monitor_secret', 'inactive', 5, 15)
ON CONFLICT DO NOTHING;

-- 插入一些示例消息分类类别（用于前端选择）
-- 这些可以存储在一个配置表中，或者作为系统配置
-- 这里我们插入一些示例数据到系统日志表中作为配置记录

INSERT INTO system_logs (id, tenant_id, level, service, action, message, metadata) VALUES
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), 'info', 'system', 'config_init', '初始化消息分类类别', 
'{"categories": [
  {"name": "产品咨询", "subcategories": ["功能询问", "使用帮助", "产品对比"]},
  {"name": "技术支持", "subcategories": ["故障报告", "配置问题", "性能问题"]},
  {"name": "销售线索", "subcategories": ["询价", "产品演示", "合作咨询"]},
  {"name": "客户投诉", "subcategories": ["服务问题", "产品问题", "流程问题"]},
  {"name": "建议反馈", "subcategories": ["功能建议", "改进建议", "用户体验"]},
  {"name": "其他", "subcategories": ["一般咨询", "闲聊", "测试"]}
]}'),
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), 'info', 'system', 'config_init', '初始化优先级配置', 
'{"priorities": [
  {"name": "low", "label": "低优先级", "color": "#28a745"},
  {"name": "medium", "label": "中优先级", "color": "#ffc107"},
  {"name": "high", "label": "高优先级", "color": "#fd7e14"},
  {"name": "urgent", "label": "紧急", "color": "#dc3545"}
]}'),
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), 'info', 'system', 'config_init', '初始化情感分析配置', 
'{"sentiments": [
  {"name": "positive", "label": "积极", "color": "#28a745"},
  {"name": "neutral", "label": "中性", "color": "#6c757d"},
  {"name": "negative", "label": "消极", "color": "#dc3545"},
  {"name": "mixed", "label": "复杂", "color": "#17a2b8"}
]}')
ON CONFLICT DO NOTHING;

-- 插入一些示例任务状态配置
INSERT INTO system_logs (id, tenant_id, level, service, action, message, metadata) VALUES
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), 'info', 'system', 'config_init', '初始化任务状态配置', 
'{"task_statuses": [
  {"name": "pending", "label": "待处理", "color": "#6c757d"},
  {"name": "assigned", "label": "已分配", "color": "#17a2b8"},
  {"name": "in_progress", "label": "进行中", "color": "#ffc107"},
  {"name": "completed", "label": "已完成", "color": "#28a745"},
  {"name": "cancelled", "label": "已取消", "color": "#dc3545"},
  {"name": "failed", "label": "失败", "color": "#e83e8c"}
]}')
ON CONFLICT DO NOTHING;

-- 创建一些示例API密钥（用于测试）
INSERT INTO api_keys (id, tenant_id, user_id, name, key_hash, key_prefix, permissions, status, expires_at) VALUES
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), (SELECT id FROM users WHERE username = 'admin'), 
'开发测试密钥', '$2b$12$LQv3c1yqBwEHv9LVBfgVye7fOYNWJ8hm8MZsUYYjcJQOZ6GfYLO8q', 'sk_test_', 
'["read", "write", "admin"]', 'active', NOW() + INTERVAL '1 year'),
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), (SELECT id FROM users WHERE username = 'admin'), 
'只读API密钥', '$2b$12$LQv3c1yqBwEHv9LVBfgVye7fOYNWJ8hm8MZsUYYjcJQOZ6GfYLO8q', 'sk_readonly_', 
'["read"]', 'active', NOW() + INTERVAL '6 months')
ON CONFLICT DO NOTHING;

-- 插入一些示例统计数据
INSERT INTO system_logs (id, tenant_id, level, service, action, message, metadata) VALUES
(uuid_generate_v4(), (SELECT id FROM tenants WHERE slug = 'default'), 'info', 'system', 'init_complete', '系统初始化完成', 
'{"version": "1.0.0", "init_time": "' || NOW() || '", "components": ["database", "platforms", "users", "configs"]}')
ON CONFLICT DO NOTHING;

-- 更新统计信息
ANALYZE;

-- 显示初始化完成信息
SELECT 
    '数据库初始化完成' as status,
    COUNT(*) as total_tables
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'; 