const { Pool } = require('pg');
const logger = require('./logger');

class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.pool = null;
    this.isConnected = false;
  }

  // 初始化数据库连接池
  async initialize() {
    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        max: this.config.pool?.max || 20,
        idleTimeoutMillis: this.config.pool?.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: this.config.pool?.connectionTimeoutMillis || 10000,
        ssl: this.config.ssl ? {
          rejectUnauthorized: false
        } : false
      });

      // 测试连接
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      logger.info('Database connection established', {
        host: this.config.host,
        database: this.config.database,
        pool: {
          max: this.pool.options.max,
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        }
      });

      // 设置连接池事件监听
      this.setupPoolEventListeners();

    } catch (error) {
      logger.error('Failed to initialize database connection', {
        error: error.message,
        host: this.config.host,
        database: this.config.database
      });
      throw error;
    }
  }

  // 设置连接池事件监听器
  setupPoolEventListeners() {
    this.pool.on('connect', (client) => {
      logger.debug('New database client connected', {
        processID: client.processID
      });
    });

    this.pool.on('acquire', (client) => {
      logger.debug('Database client acquired from pool', {
        processID: client.processID,
        poolStats: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        }
      });
    });

    this.pool.on('error', (err, client) => {
      logger.error('Database pool error', {
        error: err.message,
        processID: client?.processID
      });
    });

    this.pool.on('remove', (client) => {
      logger.debug('Database client removed from pool', {
        processID: client.processID
      });
    });
  }

  // 执行查询
  async query(text, params = []) {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    const start = Date.now();
    let client;

    try {
      client = await this.pool.connect();
      const result = await client.query(text, params);
      const duration = Date.now() - start;

      logger.debug('Database query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        params: params.length,
        rows: result.rowCount,
        duration: `${duration}ms`
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      logger.error('Database query failed', {
        error: error.message,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        params: params.length,
        duration: `${duration}ms`
      });

      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  // 开始事务
  async beginTransaction() {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    await client.query('BEGIN');

    logger.debug('Database transaction started', {
      processID: client.processID
    });

    return {
      client,
      query: async (text, params = []) => {
        try {
          return await client.query(text, params);
        } catch (error) {
          logger.error('Transaction query failed', {
            error: error.message,
            query: text.substring(0, 100)
          });
          throw error;
        }
      },
      commit: async () => {
        try {
          await client.query('COMMIT');
          logger.debug('Database transaction committed', {
            processID: client.processID
          });
        } finally {
          client.release();
        }
      },
      rollback: async () => {
        try {
          await client.query('ROLLBACK');
          logger.debug('Database transaction rolled back', {
            processID: client.processID
          });
        } finally {
          client.release();
        }
      }
    };
  }

  // 检查数据库连接状态
  async checkConnection() {
    try {
      const result = await this.query('SELECT 1 as connected');
      return result.rows[0].connected === 1;
    } catch (error) {
      logger.warn('Database connection check failed', {
        error: error.message
      });
      return false;
    }
  }

  // 获取连接池状态
  getPoolStats() {
    if (!this.pool) {
      return null;
    }

    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
      max: this.pool.options.max
    };
  }

  // 任务相关查询方法
  async getTasks(filters = {}, pagination = {}) {
    const { tenantId, status, priority, category, assignedTo, search } = filters;
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    let whereConditions = ['t.tenant_id = $1'];
    let params = [tenantId];
    let paramCount = 1;

    if (status) {
      whereConditions.push(`t.status = $${++paramCount}`);
      params.push(status);
    }

    if (priority) {
      whereConditions.push(`t.priority = $${++paramCount}`);
      params.push(priority);
    }

    if (category) {
      whereConditions.push(`t.category = $${++paramCount}`);
      params.push(category);
    }

    if (assignedTo) {
      whereConditions.push(`t.assigned_to = $${++paramCount}`);
      params.push(assignedTo);
    }

    if (search) {
      whereConditions.push(`(t.title ILIKE $${++paramCount} OR t.description ILIKE $${++paramCount})`);
      params.push(`%${search}%`, `%${search}%`);
      paramCount++;
    }

    const whereClause = whereConditions.join(' AND ');

    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tasks t
      WHERE ${whereClause}
    `;
    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // 获取任务列表
    const tasksQuery = `
      SELECT 
        t.*,
        u.username as assigned_username,
        m.content as message_content,
        c.category as classification_category
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN messages m ON t.message_id = m.id
      LEFT JOIN classifications c ON t.classification_id = c.id
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
    params.push(limit, offset);

    const tasksResult = await this.query(tasksQuery, params);

    return {
      tasks: tasksResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getTaskById(taskId, tenantId) {
    const query = `
      SELECT 
        t.*,
        u.username as assigned_username,
        m.content as message_content,
        m.platform as message_platform,
        c.category as classification_category,
        c.confidence as classification_confidence
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN messages m ON t.message_id = m.id
      LEFT JOIN classifications c ON t.classification_id = c.id
      WHERE t.id = $1 AND t.tenant_id = $2
    `;

    const result = await this.query(query, [taskId, tenantId]);
    return result.rows[0] || null;
  }

  async createTask(taskData) {
    const {
      tenantId,
      messageId,
      classificationId,
      title,
      description,
      category,
      priority = 'medium',
      status = 'pending'
    } = taskData;

    const query = `
      INSERT INTO tasks (
        tenant_id, message_id, classification_id, title, description,
        category, priority, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `;

    const params = [
      tenantId, messageId, classificationId, title, description,
      category, priority, status
    ];

    const result = await this.query(query, params);
    return result.rows[0];
  }

  async updateTask(taskId, updates, tenantId) {
    const allowedFields = ['title', 'description', 'status', 'priority', 'category', 'assigned_to'];
    const updateFields = [];
    const params = [];
    let paramCount = 0;

    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${++paramCount}`);
        params.push(value);
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    updateFields.push(`updated_at = $${++paramCount}`);
    params.push(new Date());

    params.push(taskId, tenantId);

    const query = `
      UPDATE tasks 
      SET ${updateFields.join(', ')}
      WHERE id = $${++paramCount} AND tenant_id = $${++paramCount}
      RETURNING *
    `;

    const result = await this.query(query, params);
    return result.rows[0] || null;
  }

  // 关闭数据库连接
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database connection pool closed');
    }
  }
}

module.exports = DatabaseManager; 