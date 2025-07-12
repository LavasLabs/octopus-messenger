const logger = require('../utils/logger');
const { BusinessError, TaskProcessingError, CRMIntegrationError } = require('../middleware/errorHandler');

class TaskManager {
  constructor({ dbManager, cacheManager, crmManager, config }) {
    this.db = dbManager;
    this.cache = cacheManager;
    this.crm = crmManager;
    this.config = config;
    this.initialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing TaskManager...');
      
      // 验证依赖
      if (!this.db || !this.cache || !this.crm) {
        throw new Error('Missing required dependencies');
      }

      this.initialized = true;
      logger.info('TaskManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize TaskManager', { error: error.message });
      throw error;
    }
  }

  // 创建任务
  async createTask(taskData) {
    try {
      if (!this.initialized) {
        throw new BusinessError('TaskManager not initialized');
      }

      logger.task('create', 'new', { taskData });

      // 验证任务数据
      this.validateTaskData(taskData);

      // 检查是否有重复任务
      if (taskData.messageId) {
        const existingTask = await this.getTaskByMessageId(taskData.messageId, taskData.tenantId);
        if (existingTask) {
          logger.warn('Duplicate task creation attempt', {
            messageId: taskData.messageId,
            existingTaskId: existingTask.id
          });
          return existingTask;
        }
      }

      // 创建任务
      const task = await this.db.createTask(taskData);
      
      // 缓存任务
      await this.cache.cacheTask(task.id, task);

      // 清除相关列表缓存
      await this.cache.delPattern(this.cache.generateKey('tasks', taskData.tenantId, '*'));

      logger.task('created', task.id, {
        tenantId: taskData.tenantId,
        title: task.title,
        priority: task.priority
      });

      return task;
    } catch (error) {
      logger.error('Failed to create task', { error: error.message, taskData });
      throw new TaskProcessingError('Task creation failed', null, 'create');
    }
  }

  // 获取任务列表
  async getTasks(filters = {}, pagination = {}) {
    try {
      if (!this.initialized) {
        throw new BusinessError('TaskManager not initialized');
      }

      // 检查缓存
      const cachedResult = await this.cache.getCachedTaskList(filters.tenantId, { ...filters, ...pagination });
      if (cachedResult) {
        logger.debug('Tasks retrieved from cache', { tenantId: filters.tenantId });
        return cachedResult;
      }

      // 从数据库获取
      const result = await this.db.getTasks(filters, pagination);

      // 缓存结果
      await this.cache.cacheTaskList(filters.tenantId, { ...filters, ...pagination }, result);

      logger.debug('Tasks retrieved from database', {
        tenantId: filters.tenantId,
        count: result.tasks.length,
        total: result.pagination.total
      });

      return result;
    } catch (error) {
      logger.error('Failed to get tasks', { error: error.message, filters });
      throw error;
    }
  }

  // 获取单个任务
  async getTaskById(taskId, tenantId) {
    try {
      if (!this.initialized) {
        throw new BusinessError('TaskManager not initialized');
      }

      // 检查缓存
      const cachedTask = await this.cache.getCachedTask(taskId);
      if (cachedTask && cachedTask.tenant_id === tenantId) {
        logger.debug('Task retrieved from cache', { taskId });
        return cachedTask;
      }

      // 从数据库获取
      const task = await this.db.getTaskById(taskId, tenantId);
      
      if (task) {
        // 缓存任务
        await this.cache.cacheTask(taskId, task);
        logger.debug('Task retrieved from database', { taskId });
      }

      return task;
    } catch (error) {
      logger.error('Failed to get task', { error: error.message, taskId });
      throw error;
    }
  }

  // 更新任务
  async updateTask(taskId, updates, tenantId) {
    try {
      if (!this.initialized) {
        throw new BusinessError('TaskManager not initialized');
      }

      logger.task('update', taskId, { updates });

      // 验证更新数据
      this.validateTaskUpdates(updates);

      // 更新数据库
      const updatedTask = await this.db.updateTask(taskId, updates, tenantId);
      
      if (!updatedTask) {
        throw new BusinessError('Task not found or access denied');
      }

      // 更新缓存
      await this.cache.cacheTask(taskId, updatedTask);

      // 清除相关列表缓存
      await this.cache.delPattern(this.cache.generateKey('tasks', tenantId, '*'));

      logger.task('updated', taskId, {
        tenantId,
        changes: Object.keys(updates)
      });

      return updatedTask;
    } catch (error) {
      logger.error('Failed to update task', { error: error.message, taskId, updates });
      throw new TaskProcessingError('Task update failed', taskId, 'update');
    }
  }

  // 同步任务到CRM
  async syncTaskToCRM(taskId, options = {}) {
    try {
      if (!this.initialized) {
        throw new BusinessError('TaskManager not initialized');
      }

      const { integrationIds, strategy = 'create_new', tenantId } = options;

      // 获取任务
      const task = await this.getTaskById(taskId, tenantId);
      if (!task) {
        throw new BusinessError('Task not found');
      }

      logger.task('sync_start', taskId, { integrationIds, strategy });

      // 获取可用的CRM集成
      const availableIntegrations = await this.crm.getAvailableIntegrations();
      const targetIntegrations = integrationIds 
        ? availableIntegrations.filter(int => integrationIds.includes(int.id))
        : availableIntegrations.filter(int => int.enabled);

      if (targetIntegrations.length === 0) {
        throw new BusinessError('No valid CRM integrations found');
      }

      const syncResults = [];

      // 并行同步到多个CRM
      const syncPromises = targetIntegrations.map(async (integration) => {
        try {
          const result = await this.syncToSingleCRM(task, integration, strategy);
          syncResults.push({
            integrationId: integration.id,
            integrationName: integration.name,
            success: true,
            externalId: result.externalId,
            url: result.url
          });
          
          logger.sync(taskId, integration.id, 'success', result);
        } catch (error) {
          syncResults.push({
            integrationId: integration.id,
            integrationName: integration.name,
            success: false,
            error: error.message
          });
          
          logger.sync(taskId, integration.id, 'failed', { error: error.message });
        }
      });

      await Promise.all(syncPromises);

      // 更新任务同步状态
      const successfulSyncs = syncResults.filter(r => r.success).length;
      const syncStatus = successfulSyncs > 0 ? 'synced' : 'sync_failed';
      
      await this.updateTask(taskId, { 
        sync_status: syncStatus,
        last_sync_at: new Date()
      }, tenantId);

      const result = {
        taskId,
        successful: successfulSyncs,
        failed: syncResults.length - successfulSyncs,
        details: syncResults
      };

      logger.task('sync_completed', taskId, result);
      return result;

    } catch (error) {
      logger.error('Failed to sync task to CRM', { error: error.message, taskId, options });
      throw new CRMIntegrationError('Task sync failed', null, 'multiple');
    }
  }

  // 同步到单个CRM
  async syncToSingleCRM(task, integration, strategy) {
    try {
      const crmAdapter = await this.crm.getAdapter(integration.type);
      
      // 转换任务数据为CRM格式
      const crmData = this.transformTaskForCRM(task, integration.type);
      
      let result;
      switch (strategy) {
        case 'create_new':
          result = await crmAdapter.createTask(crmData, integration.config);
          break;
        case 'update_existing':
          result = await crmAdapter.updateTask(task.external_id, crmData, integration.config);
          break;
        case 'sync_all':
          // 尝试更新，如果失败则创建
          try {
            result = await crmAdapter.updateTask(task.external_id, crmData, integration.config);
          } catch (updateError) {
            result = await crmAdapter.createTask(crmData, integration.config);
          }
          break;
        default:
          throw new Error(`Unknown sync strategy: ${strategy}`);
      }

      return result;
    } catch (error) {
      throw new CRMIntegrationError(
        `Failed to sync to ${integration.type}: ${error.message}`,
        integration.id,
        integration.type
      );
    }
  }

  // 转换任务数据为CRM格式
  transformTaskForCRM(task, crmType) {
    const baseData = {
      title: task.title,
      description: task.description,
      status: this.mapStatusToCRM(task.status, crmType),
      priority: this.mapPriorityToCRM(task.priority, crmType),
      category: task.category,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    };

    // 根据CRM类型进行特定转换
    switch (crmType) {
      case 'salesforce':
        return {
          ...baseData,
          Subject: task.title,
          Description: task.description,
          Status: this.mapStatusToCRM(task.status, 'salesforce'),
          Priority: this.mapPriorityToCRM(task.priority, 'salesforce')
        };
      case 'hubspot':
        return {
          ...baseData,
          hs_task_subject: task.title,
          hs_task_body: task.description,
          hs_task_status: this.mapStatusToCRM(task.status, 'hubspot'),
          hs_task_priority: this.mapPriorityToCRM(task.priority, 'hubspot')
        };
      case 'notion':
        return {
          ...baseData,
          properties: {
            'Title': { title: [{ text: { content: task.title } }] },
            'Description': { rich_text: [{ text: { content: task.description } }] },
            'Status': { select: { name: this.mapStatusToCRM(task.status, 'notion') } },
            'Priority': { select: { name: this.mapPriorityToCRM(task.priority, 'notion') } }
          }
        };
      default:
        return baseData;
    }
  }

  // 状态映射
  mapStatusToCRM(status, crmType) {
    const mappings = {
      salesforce: {
        pending: 'Not Started',
        in_progress: 'In Progress',
        completed: 'Completed',
        cancelled: 'Deferred'
      },
      hubspot: {
        pending: 'NOT_STARTED',
        in_progress: 'IN_PROGRESS',
        completed: 'COMPLETED',
        cancelled: 'DEFERRED'
      },
      notion: {
        pending: 'Pending',
        in_progress: 'In Progress',
        completed: 'Done',
        cancelled: 'Cancelled'
      }
    };

    return mappings[crmType]?.[status] || status;
  }

  // 优先级映射
  mapPriorityToCRM(priority, crmType) {
    const mappings = {
      salesforce: {
        low: 'Low',
        medium: 'Normal',
        high: 'High',
        urgent: 'High'
      },
      hubspot: {
        low: 'LOW',
        medium: 'MEDIUM',
        high: 'HIGH',
        urgent: 'HIGH'
      },
      notion: {
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        urgent: 'Urgent'
      }
    };

    return mappings[crmType]?.[priority] || priority;
  }

  // 根据消息ID获取任务
  async getTaskByMessageId(messageId, tenantId) {
    try {
      const query = `
        SELECT * FROM tasks 
        WHERE message_id = $1 AND tenant_id = $2
        LIMIT 1
      `;
      const result = await this.db.query(query, [messageId, tenantId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get task by message ID', { error: error.message, messageId });
      throw error;
    }
  }

  // 获取统计信息
  async getStats(tenantId) {
    try {
      if (!this.initialized) {
        throw new BusinessError('TaskManager not initialized');
      }

      // 检查缓存
      const cachedStats = await this.cache.getCachedStats(tenantId, 'task-stats');
      if (cachedStats) {
        return cachedStats;
      }

      // 从数据库计算统计
      const statsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
          COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high,
          COUNT(CASE WHEN sync_status = 'synced' THEN 1 END) as synced
        FROM tasks 
        WHERE tenant_id = $1
      `;

      const result = await this.db.query(statsQuery, [tenantId]);
      const stats = result.rows[0];

      // 转换为数字
      Object.keys(stats).forEach(key => {
        stats[key] = parseInt(stats[key]);
      });

      // 缓存统计数据
      await this.cache.cacheStats(tenantId, 'task-stats', stats);

      return stats;
    } catch (error) {
      logger.error('Failed to get task stats', { error: error.message, tenantId });
      throw error;
    }
  }

  // 验证任务数据
  validateTaskData(taskData) {
    const required = ['tenantId', 'title'];
    const missing = required.filter(field => !taskData[field]);
    
    if (missing.length > 0) {
      throw new BusinessError(`Missing required fields: ${missing.join(', ')}`);
    }

    if (taskData.title.length > 200) {
      throw new BusinessError('Task title too long (max 200 characters)');
    }

    if (taskData.description && taskData.description.length > 2000) {
      throw new BusinessError('Task description too long (max 2000 characters)');
    }
  }

  // 验证任务更新数据
  validateTaskUpdates(updates) {
    const allowedFields = ['title', 'description', 'status', 'priority', 'category', 'assigned_to'];
    const invalidFields = Object.keys(updates).filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      throw new BusinessError(`Invalid fields: ${invalidFields.join(', ')}`);
    }

    if (updates.title && updates.title.length > 200) {
      throw new BusinessError('Task title too long (max 200 characters)');
    }

    if (updates.description && updates.description.length > 2000) {
      throw new BusinessError('Task description too long (max 2000 characters)');
    }
  }

  // 关闭任务管理器
  async shutdown() {
    try {
      logger.info('Shutting down TaskManager...');
      this.initialized = false;
      logger.info('TaskManager shut down successfully');
    } catch (error) {
      logger.error('Error during TaskManager shutdown', { error: error.message });
      throw error;
    }
  }
}

module.exports = TaskManager; 