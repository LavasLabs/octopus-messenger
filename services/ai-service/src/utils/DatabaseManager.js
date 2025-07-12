const { Pool } = require('pg');
const logger = require('./logger');

class DatabaseManager {
  constructor(config) {
    this.config = config.postgres || config;
    this.pool = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing database connection...');
      
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        ssl: this.config.ssl,
        max: this.config.pool?.max || 20,
        min: this.config.pool?.min || 5,
        idleTimeoutMillis: this.config.pool?.idle || 30000,
        connectionTimeoutMillis: 10000,
      });

      // 测试连接
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isInitialized = true;
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Failed to initialize database connection', { error: error.message });
      throw error;
    }
  }

  async query(text, params = []) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Database query executed', {
        query: text.substring(0, 100),
        duration,
        rowCount: result.rowCount
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query failed', {
        query: text.substring(0, 100),
        duration,
        error: error.message
      });
      throw error;
    }
  }

  // AI分类相关数据库操作
  async saveClassificationResult(messageId, classification, tenantId) {
    const query = `
      INSERT INTO ai_classifications (
        message_id, tenant_id, category, confidence, 
        classifier_used, priority, sentiment, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (message_id) 
      DO UPDATE SET
        category = EXCLUDED.category,
        confidence = EXCLUDED.confidence,
        classifier_used = EXCLUDED.classifier_used,
        priority = EXCLUDED.priority,
        sentiment = EXCLUDED.sentiment,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    `;

    const params = [
      messageId,
      tenantId,
      classification.category,
      classification.confidence,
      classification.classifier,
      classification.priority || 'medium',
      classification.sentiment || null,
      JSON.stringify(classification.metadata || {})
    ];

    return await this.query(query, params);
  }

  async getClassificationHistory(tenantId, limit = 100, offset = 0) {
    const query = `
      SELECT ac.*, m.content, m.platform, m.sender_name
      FROM ai_classifications ac
      JOIN messages m ON ac.message_id = m.id
      WHERE ac.tenant_id = $1
      ORDER BY ac.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    return await this.query(query, [tenantId, limit, offset]);
  }

  async getClassificationStats(tenantId, startDate, endDate) {
    const query = `
      SELECT 
        category,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence,
        classifier_used,
        DATE_TRUNC('day', created_at) as date
      FROM ai_classifications
      WHERE tenant_id = $1 
        AND created_at >= $2 
        AND created_at <= $3
      GROUP BY category, classifier_used, DATE_TRUNC('day', created_at)
      ORDER BY date DESC, count DESC
    `;

    return await this.query(query, [tenantId, startDate, endDate]);
  }

  async saveTrainingData(tenantId, examples, modelType) {
    const query = `
      INSERT INTO ai_training_data (
        tenant_id, model_type, examples, created_at
      ) VALUES ($1, $2, $3, NOW())
      RETURNING *
    `;

    return await this.query(query, [
      tenantId,
      modelType,
      JSON.stringify(examples)
    ]);
  }

  async getTrainingData(tenantId, modelType, limit = 1000) {
    const query = `
      SELECT examples
      FROM ai_training_data
      WHERE tenant_id = $1 AND model_type = $2
      ORDER BY created_at DESC
      LIMIT $3
    `;

    const result = await this.query(query, [tenantId, modelType, limit]);
    return result.rows.flatMap(row => JSON.parse(row.examples));
  }

  async saveModelMetrics(tenantId, modelType, metrics) {
    const query = `
      INSERT INTO ai_model_metrics (
        tenant_id, model_type, accuracy, precision_score, recall_score,
        f1_score, training_samples, evaluation_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
      RETURNING *
    `;

    const params = [
      tenantId,
      modelType,
      metrics.accuracy,
      metrics.precision,
      metrics.recall,
      metrics.f1Score,
      metrics.trainingSamples,
      JSON.stringify(metrics.metadata || {})
    ];

    return await this.query(query, params);
  }

  async getLatestModelMetrics(tenantId, modelType) {
    const query = `
      SELECT *
      FROM ai_model_metrics
      WHERE tenant_id = $1 AND model_type = $2
      ORDER BY evaluation_date DESC
      LIMIT 1
    `;

    return await this.query(query, [tenantId, modelType]);
  }

  async saveAPIUsage(tenantId, provider, endpoint, tokens, cost, success) {
    const query = `
      INSERT INTO ai_api_usage (
        tenant_id, provider, endpoint, tokens_used, 
        cost, success, request_time
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;

    return await this.query(query, [
      tenantId,
      provider,
      endpoint,
      tokens,
      cost,
      success
    ]);
  }

  async getAPIUsageStats(tenantId, startDate, endDate) {
    const query = `
      SELECT 
        provider,
        endpoint,
        COUNT(*) as requests,
        SUM(tokens_used) as total_tokens,
        SUM(cost) as total_cost,
        AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) as success_rate,
        DATE_TRUNC('day', request_time) as date
      FROM ai_api_usage
      WHERE tenant_id = $1 
        AND request_time >= $2 
        AND request_time <= $3
      GROUP BY provider, endpoint, DATE_TRUNC('day', request_time)
      ORDER BY date DESC, total_cost DESC
    `;

    return await this.query(query, [tenantId, startDate, endDate]);
  }

  async saveClassificationRule(tenantId, rule) {
    const query = `
      INSERT INTO classification_rules (
        tenant_id, name, keywords, category, priority,
        conditions, actions, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `;

    const params = [
      tenantId,
      rule.name,
      JSON.stringify(rule.keywords || []),
      rule.category,
      rule.priority || 'medium',
      JSON.stringify(rule.conditions || {}),
      JSON.stringify(rule.actions || {}),
      rule.isActive !== false
    ];

    return await this.query(query, params);
  }

  async getClassificationRules(tenantId, isActive = true) {
    const query = `
      SELECT *
      FROM classification_rules
      WHERE tenant_id = $1 AND is_active = $2
      ORDER BY priority DESC, created_at ASC
    `;

    return await this.query(query, [tenantId, isActive]);
  }

  async updateClassificationRule(ruleId, tenantId, updates) {
    const fields = [];
    const values = [];
    let paramCounter = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'keywords' || key === 'conditions' || key === 'actions') {
        fields.push(`${key} = $${paramCounter}`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = $${paramCounter}`);
        values.push(value);
      }
      paramCounter++;
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push('updated_at = NOW()');
    values.push(ruleId, tenantId);

    const query = `
      UPDATE classification_rules
      SET ${fields.join(', ')}
      WHERE id = $${paramCounter} AND tenant_id = $${paramCounter + 1}
      RETURNING *
    `;

    return await this.query(query, values);
  }

  async deleteClassificationRule(ruleId, tenantId) {
    const query = `
      UPDATE classification_rules
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    return await this.query(query, [ruleId, tenantId]);
  }

  // 事务支持
  async withTransaction(callback) {
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

  // 健康检查
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1 as health_check');
      return {
        status: 'healthy',
        connectionPool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        }
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
      this.isInitialized = false;
      logger.info('Database connection closed');
    }
  }
}

module.exports = DatabaseManager; 