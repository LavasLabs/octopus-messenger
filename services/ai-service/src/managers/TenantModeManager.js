const logger = require('../utils/logger');
const { ValidationError } = require('../middleware/errorHandler');

class TenantModeManager {
  constructor(options = {}) {
    this.dbManager = options.dbManager;
    this.cacheManager = options.cacheManager;
    this.config = options.config || {};
    this.isInitialized = false;
    
    // 租户模式缓存
    this.tenantModes = new Map();
    
    // 模式定义
    this.modes = {
      TRAINING: 'training',    // 训练模式：存储聊天数据，训练专用模型
      NORMAL: 'normal'        // 普通模式：使用通用模型，不存储聊天数据
    };
  }

  async initialize() {
    try {
      logger.info('Initializing tenant mode manager...');
      
      // 加载已有的租户模式配置
      await this.loadTenantModes();
      
      this.isInitialized = true;
      logger.info('Tenant mode manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize tenant mode manager', { error: error.message });
      throw error;
    }
  }

  async loadTenantModes() {
    try {
      const query = `
        SELECT tenant_id, mode, config, created_at, updated_at
        FROM tenant_modes 
        WHERE is_active = true
      `;
      
      const result = await this.dbManager.query(query);
      
      for (const row of result.rows) {
        const cacheKey = `mode:${row.tenant_id}`;
        const modeConfig = {
          tenantId: row.tenant_id,
          mode: row.mode,
          config: JSON.parse(row.config || '{}'),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
        
        this.tenantModes.set(cacheKey, modeConfig);
        
        // 同时缓存到Redis
        if (this.cacheManager) {
          await this.cacheManager.set(cacheKey, modeConfig, 3600); // 1小时缓存
        }
      }
      
      logger.info('Loaded tenant modes', { modesCount: this.tenantModes.size });
    } catch (error) {
      logger.warn('Failed to load tenant modes', { error: error.message });
    }
  }

  async getTenantMode(tenantId) {
    const cacheKey = `mode:${tenantId}`;
    
    // 先从内存缓存获取
    let modeConfig = this.tenantModes.get(cacheKey);
    if (modeConfig) {
      return modeConfig;
    }

    // 从Redis缓存获取
    if (this.cacheManager) {
      modeConfig = await this.cacheManager.get(cacheKey);
      if (modeConfig) {
        this.tenantModes.set(cacheKey, modeConfig);
        return modeConfig;
      }
    }

    // 从数据库加载
    try {
      const query = `
        SELECT * FROM tenant_modes 
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY updated_at DESC LIMIT 1
      `;
      
      const result = await this.dbManager.query(query, [tenantId]);
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        modeConfig = {
          tenantId: row.tenant_id,
          mode: row.mode,
          config: JSON.parse(row.config || '{}'),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
        
        // 缓存配置
        this.tenantModes.set(cacheKey, modeConfig);
        if (this.cacheManager) {
          await this.cacheManager.set(cacheKey, modeConfig, 3600);
        }
        
        return modeConfig;
      }
    } catch (error) {
      logger.error('Failed to load tenant mode', { tenantId, error: error.message });
    }
    
    // 如果没有配置，返回默认的普通模式
    return this.getDefaultMode(tenantId);
  }

  getDefaultMode(tenantId) {
    return {
      tenantId,
      mode: this.modes.NORMAL,
      config: {
        dataRetention: false,
        autoTraining: false,
        privacyMode: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async setTenantMode(tenantId, mode, config = {}) {
    try {
      // 验证模式
      if (!Object.values(this.modes).includes(mode)) {
        throw new ValidationError(`Invalid mode: ${mode}. Valid modes are: ${Object.values(this.modes).join(', ')}`);
      }

      // 构建配置
      const modeConfig = {
        tenantId,
        mode,
        config: {
          ...this.getDefaultConfig(mode),
          ...config
        },
        updatedAt: new Date()
      };

      // 保存到数据库
      const query = `
        INSERT INTO tenant_modes (tenant_id, mode, config, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (tenant_id) 
        DO UPDATE SET 
          mode = $2,
          config = $3,
          updated_at = NOW()
        RETURNING *
      `;
      
      const result = await this.dbManager.query(query, [
        tenantId,
        mode,
        JSON.stringify(modeConfig.config)
      ]);

      // 更新缓存
      const cacheKey = `mode:${tenantId}`;
      this.tenantModes.set(cacheKey, modeConfig);
      if (this.cacheManager) {
        await this.cacheManager.set(cacheKey, modeConfig, 3600);
      }

      logger.info('Tenant mode updated', { tenantId, mode, config: modeConfig.config });
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to set tenant mode', { tenantId, mode, error: error.message });
      throw error;
    }
  }

  getDefaultConfig(mode) {
    switch (mode) {
      case this.modes.TRAINING:
        return {
          dataRetention: true,           // 保留聊天数据用于训练
          autoTraining: true,            // 自动训练模型
          privacyMode: false,            // 非隐私模式
          minTrainingExamples: 50,       // 最少训练样本数
          trainingInterval: 24 * 60 * 60 * 1000, // 24小时训练一次
          dataRetentionDays: 90,         // 数据保留90天
          enableAnalytics: true,         // 启用分析
          enablePersonalization: true    // 启用个性化
        };
      
      case this.modes.NORMAL:
        return {
          dataRetention: false,          // 不保留聊天数据
          autoTraining: false,           // 不自动训练
          privacyMode: true,             // 隐私模式
          useGeneralModel: true,         // 使用通用模型
          enableAnalytics: false,        // 不启用分析
          enablePersonalization: false   // 不启用个性化
        };
      
      default:
        return {};
    }
  }

  async isTrainingMode(tenantId) {
    const modeConfig = await this.getTenantMode(tenantId);
    return modeConfig.mode === this.modes.TRAINING;
  }

  async isNormalMode(tenantId) {
    const modeConfig = await this.getTenantMode(tenantId);
    return modeConfig.mode === this.modes.NORMAL;
  }

  async shouldStoreData(tenantId) {
    const modeConfig = await this.getTenantMode(tenantId);
    return modeConfig.config.dataRetention === true;
  }

  async shouldUseCustomModel(tenantId) {
    const modeConfig = await this.getTenantMode(tenantId);
    return modeConfig.mode === this.modes.TRAINING;
  }

  async shouldAutoTrain(tenantId) {
    const modeConfig = await this.getTenantMode(tenantId);
    return modeConfig.config.autoTraining === true;
  }

  async canEnableTrainingMode(tenantId) {
    // 检查租户是否有权限开启训练模式
    // 这里可以添加业务逻辑，比如检查订阅计划等
    try {
      const query = `
        SELECT plan_type, features 
        FROM tenant_subscriptions 
        WHERE tenant_id = $1 AND is_active = true
      `;
      
      const result = await this.dbManager.query(query, [tenantId]);
      
      if (result.rows.length > 0) {
        const subscription = result.rows[0];
        const features = JSON.parse(subscription.features || '{}');
        
        // 检查是否有AI训练功能
        return features.aiTraining === true || subscription.plan_type === 'enterprise';
      }
      
      return false; // 默认不允许训练模式
    } catch (error) {
      logger.warn('Failed to check training mode permission', { tenantId, error: error.message });
      return false;
    }
  }

  async getModeStatistics(tenantId) {
    const modeConfig = await this.getTenantMode(tenantId);
    
    const stats = {
      mode: modeConfig.mode,
      config: modeConfig.config,
      isTrainingMode: modeConfig.mode === this.modes.TRAINING,
      dataRetention: modeConfig.config.dataRetention || false
    };

    // 如果是训练模式，获取更多统计信息
    if (modeConfig.mode === this.modes.TRAINING) {
      try {
        // 获取训练数据统计
        const trainingQuery = `
          SELECT 
            COUNT(*) as total_messages,
            COUNT(DISTINCT DATE(created_at)) as active_days,
            MIN(created_at) as first_message,
            MAX(created_at) as last_message
          FROM tenant_training_data 
          WHERE tenant_id = $1
        `;
        
        const trainingResult = await this.dbManager.query(trainingQuery, [tenantId]);
        
        if (trainingResult.rows.length > 0) {
          const trainingStats = trainingResult.rows[0];
          stats.trainingData = {
            totalMessages: parseInt(trainingStats.total_messages),
            activeDays: parseInt(trainingStats.active_days),
            firstMessage: trainingStats.first_message,
            lastMessage: trainingStats.last_message
          };
        }

        // 获取模型统计
        const modelQuery = `
          SELECT 
            COUNT(*) as total_models,
            MAX(updated_at) as last_training
          FROM tenant_models 
          WHERE tenant_id = $1 AND is_active = true
        `;
        
        const modelResult = await this.dbManager.query(modelQuery, [tenantId]);
        
        if (modelResult.rows.length > 0) {
          const modelStats = modelResult.rows[0];
          stats.models = {
            totalModels: parseInt(modelStats.total_models),
            lastTraining: modelStats.last_training
          };
        }
      } catch (error) {
        logger.warn('Failed to get training mode statistics', { tenantId, error: error.message });
      }
    }

    return stats;
  }

  async switchMode(tenantId, newMode, reason = '') {
    try {
      const currentMode = await this.getTenantMode(tenantId);
      
      if (currentMode.mode === newMode) {
        return { success: true, message: 'Mode is already set to ' + newMode };
      }

      // 如果切换到训练模式，检查权限
      if (newMode === this.modes.TRAINING) {
        const canEnable = await this.canEnableTrainingMode(tenantId);
        if (!canEnable) {
          throw new ValidationError('Training mode is not available for this tenant plan');
        }
      }

      // 记录模式切换
      const switchQuery = `
        INSERT INTO tenant_mode_history (
          tenant_id, from_mode, to_mode, reason, switched_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `;
      
      await this.dbManager.query(switchQuery, [
        tenantId,
        currentMode.mode,
        newMode,
        reason
      ]);

      // 设置新模式
      const result = await this.setTenantMode(tenantId, newMode);
      
      logger.info('Tenant mode switched', { 
        tenantId, 
        from: currentMode.mode, 
        to: newMode, 
        reason 
      });
      
      return { 
        success: true, 
        message: `Mode switched from ${currentMode.mode} to ${newMode}`,
        previousMode: currentMode.mode,
        newMode: newMode
      };
    } catch (error) {
      logger.error('Failed to switch tenant mode', { tenantId, newMode, error: error.message });
      throw error;
    }
  }

  async getModeHistory(tenantId, limit = 10) {
    try {
      const query = `
        SELECT from_mode, to_mode, reason, switched_at
        FROM tenant_mode_history
        WHERE tenant_id = $1
        ORDER BY switched_at DESC
        LIMIT $2
      `;
      
      const result = await this.dbManager.query(query, [tenantId, limit]);
      
      return result.rows.map(row => ({
        fromMode: row.from_mode,
        toMode: row.to_mode,
        reason: row.reason,
        switchedAt: row.switched_at
      }));
    } catch (error) {
      logger.error('Failed to get mode history', { tenantId, error: error.message });
      return [];
    }
  }

  async getAllTenantModes() {
    try {
      const query = `
        SELECT tenant_id, mode, config, created_at, updated_at
        FROM tenant_modes 
        WHERE is_active = true
        ORDER BY tenant_id
      `;
      
      const result = await this.dbManager.query(query);
      
      return result.rows.map(row => ({
        tenantId: row.tenant_id,
        mode: row.mode,
        config: JSON.parse(row.config || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      logger.error('Failed to get all tenant modes', { error: error.message });
      return [];
    }
  }

  async cleanupExpiredData(tenantId) {
    const modeConfig = await this.getTenantMode(tenantId);
    
    // 只有训练模式才需要清理数据
    if (modeConfig.mode !== this.modes.TRAINING) {
      return { cleaned: 0, message: 'No cleanup needed for normal mode' };
    }

    const retentionDays = modeConfig.config.dataRetentionDays || 90;
    
    try {
      const query = `
        DELETE FROM tenant_training_data 
        WHERE tenant_id = $1 
        AND created_at < NOW() - INTERVAL '${retentionDays} days'
      `;
      
      const result = await this.dbManager.query(query, [tenantId]);
      
      logger.info('Cleaned up expired training data', { 
        tenantId, 
        retentionDays, 
        deletedRows: result.rowCount 
      });
      
      return { 
        cleaned: result.rowCount, 
        message: `Cleaned up ${result.rowCount} expired training records` 
      };
    } catch (error) {
      logger.error('Failed to cleanup expired data', { tenantId, error: error.message });
      throw error;
    }
  }

  async healthCheck() {
    return {
      status: 'healthy',
      initialized: this.isInitialized,
      cachedModes: this.tenantModes.size,
      supportedModes: Object.values(this.modes)
    };
  }

  async shutdown() {
    this.tenantModes.clear();
    this.isInitialized = false;
    logger.info('Tenant mode manager shut down');
  }
}

module.exports = TenantModeManager; 