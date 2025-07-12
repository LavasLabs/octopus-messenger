-- 002_add_discord_support.sql
-- Migration to add Discord platform support

-- Add Discord platform to platform enum
ALTER TYPE platform_type ADD VALUE 'discord';

-- Add Discord-specific configuration columns to bot_configs table
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS discord_client_id VARCHAR(255);
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS discord_client_secret VARCHAR(255);
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS discord_public_key VARCHAR(255);
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS discord_guild_id VARCHAR(255);

-- Add Discord-specific message types to message_type enum
ALTER TYPE message_type ADD VALUE 'command';
ALTER TYPE message_type ADD VALUE 'interaction';

-- Create index for Discord-specific queries
CREATE INDEX IF NOT EXISTS idx_messages_discord_guild 
ON messages (platform, chat_id) 
WHERE platform = 'discord';

-- Create index for Discord commands
CREATE INDEX IF NOT EXISTS idx_messages_discord_commands 
ON messages (platform, message_type, content) 
WHERE platform = 'discord' AND message_type = 'command';

-- Insert sample Discord bot configuration
INSERT INTO bot_configs (
    id, tenant_id, platform, bot_name, bot_token, 
    webhook_url, webhook_secret, is_active, settings, 
    created_at, updated_at
) VALUES (
    'discord-bot-sample',
    'default',
    'discord',
    'Octopus Discord Bot',
    'YOUR_DISCORD_BOT_TOKEN',
    'https://your-domain.com/api/webhooks/discord',
    'YOUR_DISCORD_PUBLIC_KEY',
    false,
    '{
        "auto_reply": true,
        "ai_classification": true,
        "forward_to_crm": true,
        "supported_languages": ["en", "zh"],
        "slash_commands": [
            {
                "name": "help",
                "description": "Show help information"
            },
            {
                "name": "support",
                "description": "Contact customer support"
            },
            {
                "name": "faq",
                "description": "View frequently asked questions"
            }
        ],
        "embed_templates": {
            "welcome": {
                "title": "Welcome to Customer Support",
                "description": "How can we help you today?",
                "color": 65535
            },
            "queue_status": {
                "title": "Queue Status",
                "description": "You are in the customer service queue",
                "color": 16776960
            }
        }
    }',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Add Discord-specific task categories
INSERT INTO task_categories (name, description, color, icon, platform_specific) VALUES
('discord_support', 'Discord Customer Support', '#7289da', 'discord', true),
('discord_feedback', 'Discord User Feedback', '#99aab5', 'feedback', true),
('discord_moderation', 'Discord Moderation Issues', '#ed4245', 'shield', true)
ON CONFLICT (name) DO NOTHING;

-- Update classification rules to include Discord
INSERT INTO classification_rules (
    id, name, description, conditions, actions, 
    priority, is_active, created_at, updated_at
) VALUES (
    'discord-support-request',
    'Discord Support Request',
    'Auto-classify Discord support requests',
    '{
        "platform": "discord",
        "keywords": ["help", "support", "problem", "issue", "bug"],
        "message_types": ["command", "text"]
    }',
    '{
        "category": "customer_support",
        "priority": "normal",
        "assign_to": "support_team",
        "auto_reply": true,
        "create_ticket": true
    }',
    10,
    true,
    NOW(),
    NOW()
),
(
    'discord-urgent-issues',
    'Discord Urgent Issues',
    'Auto-classify urgent Discord issues',
    '{
        "platform": "discord",
        "keywords": ["urgent", "critical", "down", "not working", "emergency"],
        "message_types": ["command", "text", "interaction"]
    }',
    '{
        "category": "urgent_support",
        "priority": "urgent",
        "assign_to": "senior_support",
        "auto_reply": true,
        "create_ticket": true,
        "escalate": true
    }',
    20,
    true,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Add Discord webhook configuration
INSERT INTO webhook_configs (
    id, tenant_id, platform, webhook_url, secret_token,
    events, is_active, retry_config, created_at, updated_at
) VALUES (
    'discord-webhook-default',
    'default',
    'discord',
    'https://your-domain.com/api/webhooks/discord',
    'YOUR_DISCORD_PUBLIC_KEY',
    '["INTERACTION_CREATE", "MESSAGE_CREATE"]',
    true,
    '{
        "max_retries": 3,
        "retry_delay": 1000,
        "exponential_backoff": true
    }',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create Discord-specific analytics views
CREATE OR REPLACE VIEW discord_message_analytics AS
SELECT 
    DATE_TRUNC('day', received_at) as date,
    COUNT(*) as total_messages,
    COUNT(CASE WHEN message_type = 'command' THEN 1 END) as command_count,
    COUNT(CASE WHEN message_type = 'interaction' THEN 1 END) as interaction_count,
    COUNT(CASE WHEN message_type = 'text' THEN 1 END) as text_messages,
    COUNT(DISTINCT sender_id) as unique_users,
    COUNT(DISTINCT chat_id) as active_channels,
    AVG(LENGTH(content)) as avg_message_length
FROM messages 
WHERE platform = 'discord' 
    AND received_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', received_at)
ORDER BY date DESC;

-- Create Discord guild activity view
CREATE OR REPLACE VIEW discord_guild_activity AS
SELECT 
    chat_id as guild_id,
    chat_title as guild_name,
    COUNT(*) as message_count,
    COUNT(DISTINCT sender_id) as unique_users,
    COUNT(CASE WHEN message_type = 'command' THEN 1 END) as command_usage,
    MAX(received_at) as last_activity,
    AVG(LENGTH(content)) as avg_message_length
FROM messages 
WHERE platform = 'discord' 
    AND chat_type = 'guild'
    AND received_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY chat_id, chat_title
ORDER BY message_count DESC;

-- Add Discord-specific permissions
INSERT INTO permissions (name, description, resource, action) VALUES
('discord:read', 'Read Discord messages and interactions', 'discord', 'read'),
('discord:write', 'Send Discord messages and responses', 'discord', 'write'),
('discord:manage', 'Manage Discord bot configuration', 'discord', 'manage'),
('discord:commands', 'Execute Discord slash commands', 'discord', 'commands'),
('discord:moderate', 'Moderate Discord channels', 'discord', 'moderate')
ON CONFLICT (name) DO NOTHING;

-- Add Discord permissions to default roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin' AND p.name LIKE 'discord:%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'support_agent' AND p.name IN ('discord:read', 'discord:write', 'discord:commands')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Create Discord interaction log table
CREATE TABLE IF NOT EXISTS discord_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    interaction_id VARCHAR(255) NOT NULL,
    interaction_type VARCHAR(50) NOT NULL,
    command_name VARCHAR(100),
    custom_id VARCHAR(255),
    user_id VARCHAR(255) NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    guild_id VARCHAR(255),
    response_data JSONB,
    processing_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_discord_interaction UNIQUE (tenant_id, interaction_id)
);

-- Create indexes for Discord interactions
CREATE INDEX IF NOT EXISTS idx_discord_interactions_tenant 
ON discord_interactions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_discord_interactions_user 
ON discord_interactions (user_id);

CREATE INDEX IF NOT EXISTS idx_discord_interactions_type 
ON discord_interactions (interaction_type);

CREATE INDEX IF NOT EXISTS idx_discord_interactions_command 
ON discord_interactions (command_name);

CREATE INDEX IF NOT EXISTS idx_discord_interactions_created 
ON discord_interactions (created_at);

-- Add Discord-specific triggers
CREATE OR REPLACE FUNCTION update_discord_bot_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.platform = 'discord' THEN
        INSERT INTO bot_stats (
            tenant_id, platform, date, messages_received, 
            commands_executed, interactions_processed, active_users
        ) VALUES (
            NEW.tenant_id, 'discord', CURRENT_DATE, 1, 
            CASE WHEN NEW.message_type = 'command' THEN 1 ELSE 0 END,
            CASE WHEN NEW.message_type = 'interaction' THEN 1 ELSE 0 END,
            1
        )
        ON CONFLICT (tenant_id, platform, date) 
        DO UPDATE SET 
            messages_received = bot_stats.messages_received + 1,
            commands_executed = bot_stats.commands_executed + 
                CASE WHEN NEW.message_type = 'command' THEN 1 ELSE 0 END,
            interactions_processed = bot_stats.interactions_processed + 
                CASE WHEN NEW.message_type = 'interaction' THEN 1 ELSE 0 END,
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_discord_bot_stats
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_discord_bot_stats();

-- Migration completion log
INSERT INTO migration_log (version, description, applied_at) 
VALUES (2, 'Add Discord platform support', NOW())
ON CONFLICT (version) DO NOTHING; 