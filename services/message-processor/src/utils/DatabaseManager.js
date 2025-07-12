const { Pool } = require('pg');
const logger = require('./logger');

class DatabaseManager {
  constructor(config) {
    this.config = config.postgres;
    this.pool = null;
  }

  async initialize() {
    try {
      // 创建连接池
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        ssl: this.config.ssl,
        min: this.config.pool.min,
        max: this.config.pool.max,
        idleTimeoutMillis: this.config.pool.idle,
        connectionTimeoutMillis: 10000,
        statement_timeout: 30000,
        query_timeout: 30000,
        application_name: 'message-processor'
      });

      // 测试连接
      await this.pool.query('SELECT NOW()');
      logger.info('Database connection established successfully');

      // 设置连接池事件监听
      this.pool.on('connect', () => {
        logger.debug('New client connected to database');
      });

      this.pool.on('error', (err) => {
        logger.error('Database pool error:', err);
      });

    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  async query(text, params = []) {
    const startTime = Date.now();
    
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - startTime;
      
      logger.logDatabase('query', 'unknown', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        params: params.length,
        rows: result.rows.length,
        duration: `${duration}ms`
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Database query error:', {
        error: error.message,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        params: params,
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // 消息相关方法
  async createMessage(messageData) {
    const query = `
      INSERT INTO messages (
        tenant_id, platform_id, platform_message_id, sender_id, sender_name, 
        sender_username, sender_avatar_url, channel_id, channel_name, thread_id,
        reply_to_id, content, content_type, raw_content, attachments, metadata,
        status, direction, is_bot_message
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      ) RETURNING *
    `;
    
    const values = [
      messageData.tenantId,
      messageData.platformId,
      messageData.platformMessageId,
      messageData.senderId,
      messageData.senderName,
      messageData.senderUsername,
      messageData.senderAvatarUrl,
      messageData.channelId,
      messageData.channelName,
      messageData.threadId,
      messageData.replyToId,
      messageData.content,
      messageData.contentType || 'text',
      JSON.stringify(messageData.rawContent || {}),
      JSON.stringify(messageData.attachments || []),
      JSON.stringify(messageData.metadata || {}),
      messageData.status || 'received',
      messageData.direction || 'inbound',
      messageData.isBotMessage || false
    ];
    
    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getMessageById(messageId) {
    const query = `
      SELECT m.*, p.name as platform_name, p.slug as platform_slug
      FROM messages m
      JOIN platforms p ON m.platform_id = p.id
      WHERE m.id = $1
    `;
    
    const result = await this.query(query, [messageId]);
    return result.rows[0];
  }

  async updateMessageStatus(messageId, status, metadata = {}) {
    const query = `
      UPDATE messages 
      SET status = $2, metadata = metadata || $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await this.query(query, [messageId, status, JSON.stringify(metadata)]);
    return result.rows[0];
  }

  async getMessagesByChannel(tenantId, channelId, limit = 50, offset = 0) {
    const query = `
      SELECT m.*, p.name as platform_name, p.slug as platform_slug
      FROM messages m
      JOIN platforms p ON m.platform_id = p.id
      WHERE m.tenant_id = $1 AND m.channel_id = $2
      ORDER BY m.created_at DESC
      LIMIT $3 OFFSET $4
    `;
    
    const result = await this.query(query, [tenantId, channelId, limit, offset]);
    return result.rows;
  }

  async getUnprocessedMessages(limit = 100) {
    const query = `
      SELECT m.*, p.name as platform_name, p.slug as platform_slug
      FROM messages m
      JOIN platforms p ON m.platform_id = p.id
      WHERE m.status = 'received' AND m.direction = 'inbound'
      ORDER BY m.created_at ASC
      LIMIT $1
    `;
    
    const result = await this.query(query, [limit]);
    return result.rows;
  }

  // 分类相关方法
  async createMessageClassification(classificationData) {
    const query = `
      INSERT INTO message_classifications (
        message_id, category, subcategory, confidence, priority, sentiment,
        language, tags, keywords, entities, ai_model, ai_version,
        processing_time_ms, raw_result
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING *
    `;
    
    const values = [
      classificationData.messageId,
      classificationData.category,
      classificationData.subcategory,
      classificationData.confidence,
      classificationData.priority,
      classificationData.sentiment,
      classificationData.language,
      JSON.stringify(classificationData.tags || []),
      JSON.stringify(classificationData.keywords || []),
      JSON.stringify(classificationData.entities || []),
      classificationData.aiModel,
      classificationData.aiVersion,
      classificationData.processingTimeMs,
      JSON.stringify(classificationData.rawResult || {})
    ];
    
    const result = await this.query(query, values);
    return result.rows[0];
  }

  // 平台相关方法
  async getPlatformBySlug(slug) {
    const query = 'SELECT * FROM platforms WHERE slug = $1';
    const result = await this.query(query, [slug]);
    return result.rows[0];
  }

  async getPlatformById(id) {
    const query = 'SELECT * FROM platforms WHERE id = $1';
    const result = await this.query(query, [id]);
    return result.rows[0];
  }

  // 租户相关方法
  async getTenantBySlug(slug) {
    const query = 'SELECT * FROM tenants WHERE slug = $1 AND status = $2';
    const result = await this.query(query, [slug, 'active']);
    return result.rows[0];
  }

  async getTenantById(id) {
    const query = 'SELECT * FROM tenants WHERE id = $1 AND status = $2';
    const result = await this.query(query, [id, 'active']);
    return result.rows[0];
  }

  // 统计相关方法
  async getMessageStats(tenantId, timeRange = '24h') {
    const query = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN status = 'received' THEN 1 END) as received_count,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_count,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_count,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_count
      FROM messages 
      WHERE tenant_id = $1 
      AND created_at >= NOW() - INTERVAL $2
    `;
    
    const result = await this.query(query, [tenantId, timeRange]);
    return result.rows[0];
  }

  // 健康检查
  async healthCheck() {
    try {
      const result = await this.query('SELECT NOW() as timestamp, version() as version');
      return {
        status: 'healthy',
        timestamp: result.rows[0].timestamp,
        version: result.rows[0].version,
        poolSize: this.pool.totalCount,
        activeConnections: this.pool.idleCount
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('Database connection pool closed');
    }
  }
}

module.exports = DatabaseManager; 