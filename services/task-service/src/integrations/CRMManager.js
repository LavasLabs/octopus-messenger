const axios = require('axios');
const { logger } = require('../utils/logger');

// 导入各种CRM集成
const SalesforceIntegration = require('./salesforce');
const HubSpotIntegration = require('./hubspot');
const DingTalkIntegration = require('./dingtalk');
const WeWorkIntegration = require('./wework');
const LarkIntegration = require('./lark');
const NotionIntegration = require('./notion');
const MondayIntegration = require('./monday');
const JiraIntegration = require('./jira');
const AsanaIntegration = require('./asana');

class CRMManager {
  constructor() {
    this.integrations = new Map();
    this.strategies = {
      PRIMARY_BACKUP: 'primary_backup',
      CATEGORY_ROUTING: 'category_routing',
      PARALLEL_SYNC: 'parallel_sync'
    };
    
    // 注册支持的CRM类型
    this.supportedCRMs = {
      salesforce: SalesforceIntegration,
      hubspot: HubSpotIntegration,
      dingtalk: DingTalkIntegration,
      wework: WeWorkIntegration,
      lark: LarkIntegration,
      notion: NotionIntegration,
      monday: MondayIntegration,
      jira: JiraIntegration,
      asana: AsanaIntegration
    };
  }

  /**
   * 初始化CRM集成
   * @param {Array} crmConfigs - CRM配置数组
   */
  async initialize(crmConfigs) {
    logger.info('Initializing CRM integrations', { count: crmConfigs.length });
    
    for (const config of crmConfigs) {
      try {
        await this.addIntegration(config);
      } catch (error) {
        logger.error('Failed to initialize CRM integration', {
          type: config.type,
          id: config.id,
          error: error.message
        });
      }
    }
  }

  /**
   * 添加CRM集成
   * @param {Object} config - CRM配置
   */
  async addIntegration(config) {
    const { id, type, enabled, config: crmConfig } = config;
    
    if (!enabled) {
      logger.info('CRM integration disabled', { id, type });
      return;
    }

    const CRMClass = this.supportedCRMs[type];
    if (!CRMClass) {
      throw new Error(`Unsupported CRM type: ${type}`);
    }

    const integration = new CRMClass(crmConfig);
    
    // 测试连接
    try {
      await integration.testConnection();
      this.integrations.set(id, {
        instance: integration,
        config: config,
        type: type,
        lastSync: null,
        status: 'active'
      });
      
      logger.info('CRM integration added successfully', { id, type });
    } catch (error) {
      logger.error('CRM connection test failed', { id, type, error: error.message });
      throw error;
    }
  }

  /**
   * 移除CRM集成
   * @param {string} integrationId - 集成ID
   */
  removeIntegration(integrationId) {
    if (this.integrations.has(integrationId)) {
      this.integrations.delete(integrationId);
      logger.info('CRM integration removed', { integrationId });
    }
  }

  /**
   * 获取可用的集成
   * @param {string} type - CRM类型（可选）
   * @returns {Array} 集成列表
   */
  getAvailableIntegrations(type = null) {
    const integrations = Array.from(this.integrations.values());
    
    if (type) {
      return integrations.filter(integration => integration.type === type);
    }
    
    return integrations.filter(integration => integration.status === 'active');
  }

  /**
   * 同步消息到CRM系统
   * @param {Object} messageData - 消息数据
   * @param {Object} classification - 分类结果
   * @param {Object} strategy - 同步策略
   */
  async syncMessage(messageData, classification, strategy = null) {
    const availableIntegrations = this.getAvailableIntegrations();
    
    if (availableIntegrations.length === 0) {
      throw new Error('No active CRM integrations available');
    }

    // 如果没有指定策略，使用默认策略
    if (!strategy) {
      strategy = {
        type: this.strategies.PRIMARY_BACKUP,
        primary: availableIntegrations[0].config.id,
        fallback: availableIntegrations.length > 1 ? availableIntegrations[1].config.id : null
      };
    }

    switch (strategy.type) {
      case this.strategies.PRIMARY_BACKUP:
        return await this._syncWithPrimaryBackup(messageData, classification, strategy);
      
      case this.strategies.CATEGORY_ROUTING:
        return await this._syncWithCategoryRouting(messageData, classification, strategy);
      
      case this.strategies.PARALLEL_SYNC:
        return await this._syncWithParallelSync(messageData, classification, strategy);
      
      default:
        throw new Error(`Unknown sync strategy: ${strategy.type}`);
    }
  }

  /**
   * 主备模式同步
   */
  async _syncWithPrimaryBackup(messageData, classification, strategy) {
    const primaryIntegration = this.integrations.get(strategy.primary);
    
    if (!primaryIntegration) {
      throw new Error(`Primary integration not found: ${strategy.primary}`);
    }

    try {
      const result = await this._syncToIntegration(
        primaryIntegration,
        messageData,
        classification
      );
      
      logger.info('Message synced to primary CRM', {
        integrationId: strategy.primary,
        messageId: messageData.id,
        result: result.id
      });
      
      return result;
    } catch (error) {
      logger.warn('Primary CRM sync failed, trying fallback', {
        primary: strategy.primary,
        fallback: strategy.fallback,
        error: error.message
      });

      if (strategy.fallback) {
        const fallbackIntegration = this.integrations.get(strategy.fallback);
        if (fallbackIntegration) {
          try {
            const result = await this._syncToIntegration(
              fallbackIntegration,
              messageData,
              classification
            );
            
            logger.info('Message synced to fallback CRM', {
              integrationId: strategy.fallback,
              messageId: messageData.id,
              result: result.id
            });
            
            return result;
          } catch (fallbackError) {
            logger.error('Fallback CRM sync also failed', {
              fallback: strategy.fallback,
              error: fallbackError.message
            });
            throw fallbackError;
          }
        }
      }
      
      throw error;
    }
  }

  /**
   * 分类路由模式同步
   */
  async _syncWithCategoryRouting(messageData, classification, strategy) {
    const category = classification.category;
    const routeConfig = strategy.routes[category];
    
    if (!routeConfig || routeConfig.length === 0) {
      throw new Error(`No CRM route configured for category: ${category}`);
    }

    const integrationId = routeConfig[0]; // 使用第一个配置的CRM
    const integration = this.integrations.get(integrationId);
    
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    const result = await this._syncToIntegration(integration, messageData, classification);
    
    logger.info('Message synced with category routing', {
      category,
      integrationId,
      messageId: messageData.id,
      result: result.id
    });
    
    return result;
  }

  /**
   * 并行同步模式
   */
  async _syncWithParallelSync(messageData, classification, strategy) {
    const syncPromises = strategy.targets.map(async (target) => {
      const integration = this.integrations.get(target.integrationId);
      
      if (!integration) {
        logger.warn('Integration not found for parallel sync', {
          integrationId: target.integrationId
        });
        return null;
      }

      try {
        const result = await this._syncToIntegration(integration, messageData, classification);
        return {
          integrationId: target.integrationId,
          success: true,
          result: result
        };
      } catch (error) {
        logger.error('Parallel sync failed for integration', {
          integrationId: target.integrationId,
          error: error.message
        });
        return {
          integrationId: target.integrationId,
          success: false,
          error: error.message
        };
      }
    });

    const results = await Promise.allSettled(syncPromises);
    const successfulSyncs = results
      .filter(result => result.status === 'fulfilled' && result.value && result.value.success)
      .map(result => result.value);

    logger.info('Parallel sync completed', {
      total: strategy.targets.length,
      successful: successfulSyncs.length,
      messageId: messageData.id
    });

    return {
      strategy: 'parallel',
      results: successfulSyncs,
      totalAttempts: strategy.targets.length,
      successfulSyncs: successfulSyncs.length
    };
  }

  /**
   * 同步到特定集成
   */
  async _syncToIntegration(integrationWrapper, messageData, classification) {
    const { instance, config, type } = integrationWrapper;
    
    try {
      // 根据分类决定创建的对象类型
      let result;
      
      switch (classification.category) {
        case '销售线索':
        case '产品咨询':
          result = await instance.createLead(messageData, classification);
          break;
          
        case '技术支持':
        case '故障报告':
          result = await instance.createTicket(messageData, classification);
          break;
          
        case '客户投诉':
        case '服务问题':
          result = await instance.createCase(messageData, classification);
          break;
          
        default:
          result = await instance.createTask(messageData, classification);
      }

      // 更新最后同步时间
      integrationWrapper.lastSync = new Date();
      
      return {
        id: result.id,
        type: type,
        objectType: result.objectType || 'task',
        url: result.url,
        createdAt: result.createdAt || new Date()
      };
      
    } catch (error) {
      // 标记集成状态
      if (this._isConnectionError(error)) {
        integrationWrapper.status = 'connection_error';
      }
      
      throw error;
    }
  }

  /**
   * 测试CRM连接
   * @param {string} integrationId - 集成ID
   */
  async testConnection(integrationId) {
    const integration = this.integrations.get(integrationId);
    
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    try {
      const result = await integration.instance.testConnection();
      integration.status = 'active';
      
      logger.info('CRM connection test successful', { integrationId });
      return result;
    } catch (error) {
      integration.status = 'connection_error';
      
      logger.error('CRM connection test failed', {
        integrationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 获取集成统计信息
   */
  getIntegrationStats() {
    const stats = {
      total: this.integrations.size,
      active: 0,
      error: 0,
      byType: {}
    };

    for (const [id, integration] of this.integrations) {
      // 统计状态
      if (integration.status === 'active') {
        stats.active++;
      } else {
        stats.error++;
      }

      // 按类型统计
      const type = integration.type;
      if (!stats.byType[type]) {
        stats.byType[type] = {
          count: 0,
          active: 0,
          error: 0
        };
      }
      
      stats.byType[type].count++;
      if (integration.status === 'active') {
        stats.byType[type].active++;
      } else {
        stats.byType[type].error++;
      }
    }

    return stats;
  }

  /**
   * 获取支持的CRM类型列表
   */
  getSupportedCRMTypes() {
    return Object.keys(this.supportedCRMs).map(type => ({
      type,
      name: this._getCRMDisplayName(type),
      features: this._getCRMFeatures(type)
    }));
  }

  /**
   * 重试失败的同步
   * @param {string} integrationId - 集成ID
   * @param {Object} messageData - 消息数据
   * @param {Object} classification - 分类结果
   * @param {number} maxRetries - 最大重试次数
   */
  async retrySync(integrationId, messageData, classification, maxRetries = 3) {
    const integration = this.integrations.get(integrationId);
    
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this._syncToIntegration(integration, messageData, classification);
        
        logger.info('Retry sync successful', {
          integrationId,
          attempt,
          messageId: messageData.id
        });
        
        return result;
      } catch (error) {
        if (attempt === maxRetries) {
          logger.error('All retry attempts failed', {
            integrationId,
            attempts: maxRetries,
            lastError: error.message
          });
          throw error;
        }

        // 指数退避
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        logger.warn('Retry attempt failed, will retry', {
          integrationId,
          attempt,
          nextAttempt: attempt + 1,
          delay
        });
      }
    }
  }

  /**
   * 判断是否为连接错误
   */
  _isConnectionError(error) {
    const connectionErrorCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'];
    return connectionErrorCodes.includes(error.code) || 
           error.message.includes('timeout') ||
           error.message.includes('connection');
  }

  /**
   * 获取CRM显示名称
   */
  _getCRMDisplayName(type) {
    const displayNames = {
      salesforce: 'Salesforce',
      hubspot: 'HubSpot',
      dingtalk: '钉钉',
      wework: '企业微信',
      lark: '飞书',
      notion: 'Notion',
      monday: 'Monday.com',
      jira: 'Jira',
      asana: 'Asana'
    };
    
    return displayNames[type] || type;
  }

  /**
   * 获取CRM功能特性
   */
  _getCRMFeatures(type) {
    const features = {
      salesforce: ['leads', 'cases', 'opportunities', 'contacts'],
      hubspot: ['contacts', 'tickets', 'deals', 'companies'],
      dingtalk: ['tasks', 'approvals', 'notifications'],
      wework: ['approvals', 'messages', 'tasks'],
      lark: ['tasks', 'documents', 'notifications'],
      notion: ['pages', 'databases', 'blocks'],
      monday: ['items', 'boards', 'updates'],
      jira: ['issues', 'projects', 'workflows'],
      asana: ['tasks', 'projects', 'portfolios']
    };
    
    return features[type] || ['tasks'];
  }
}

module.exports = CRMManager; 