const axios = require('axios');
const config = require('../../../../config/config');
const logger = require('./logger');

class AIServiceClient {
  constructor(tenantId) {
    this.tenantId = tenantId;
    this.baseURL = `http://localhost:${config.services.aiService.port}`;
    this.timeout = 30000; // 30秒超时
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        // 添加租户ID
        if (this.tenantId) {
          config.headers['X-Tenant-ID'] = this.tenantId;
        }
        
        logger.debug('AI service request', {
          url: config.url,
          method: config.method,
          tenantId: this.tenantId
        });
        
        return config;
      },
      (error) => {
        logger.error('AI service request interceptor error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('AI service response', {
          url: response.config.url,
          status: response.status,
          tenantId: this.tenantId
        });
        return response;
      },
      (error) => {
        logger.error('AI service response error', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
          tenantId: this.tenantId
        });
        
        // 处理错误，保持原有的错误结构
        if (error.response) {
          error.status = error.response.status;
          error.message = error.response.data?.error || error.response.data?.message || error.message;
        }
        
        return Promise.reject(error);
      }
    );
  }

  // 设置认证头
  setAuthorization(authorization) {
    if (authorization) {
      this.client.defaults.headers.common['Authorization'] = authorization;
    }
  }

  // 智能消息分类
  async classifyMessage(message, options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.post('/api/smart-classify/message', {
        message,
        options
      });

      return response.data;
    } catch (error) {
      logger.error('Message classification failed', {
        tenantId: this.tenantId,
        error: error.message,
        messageLength: message.content?.length
      });
      throw error;
    }
  }

  // 批量消息分类
  async classifyBatch(messages, options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.post('/api/smart-classify/batch', {
        messages,
        options
      });

      return response.data;
    } catch (error) {
      logger.error('Batch classification failed', {
        tenantId: this.tenantId,
        error: error.message,
        messageCount: messages.length
      });
      throw error;
    }
  }

  // 获取当前模式
  async getCurrentMode(options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.get('/api/mode/current');
      return response.data;
    } catch (error) {
      logger.error('Failed to get current mode', {
        tenantId: this.tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 获取详细模式信息
  async getModeInfo(options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.get('/api/mode/info');
      return response.data;
    } catch (error) {
      logger.error('Failed to get mode info', {
        tenantId: this.tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 切换模式
  async switchMode(mode, reason, options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.post('/api/mode/switch', {
        mode,
        reason
      });

      return response.data;
    } catch (error) {
      logger.error('Mode switch failed', {
        tenantId: this.tenantId,
        mode,
        error: error.message
      });
      throw error;
    }
  }

  // 获取模式推荐
  async getModeRecommendation(options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.get('/api/mode/recommend');
      return response.data;
    } catch (error) {
      logger.error('Failed to get mode recommendation', {
        tenantId: this.tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 获取分类统计
  async getClassificationStats(timeRange = '24h', options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.get(`/api/smart-classify/stats?timeRange=${timeRange}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get classification stats', {
        tenantId: this.tenantId,
        timeRange,
        error: error.message
      });
      throw error;
    }
  }

  // 获取租户模型列表
  async getTenantModels(options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.get('/api/tenant/models');
      return response.data;
    } catch (error) {
      logger.error('Failed to get tenant models', {
        tenantId: this.tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 训练租户模型
  async trainModel(modelType, examples, options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.post('/api/tenant/models/train', {
        modelType,
        examples,
        options
      });

      return response.data;
    } catch (error) {
      logger.error('Model training failed', {
        tenantId: this.tenantId,
        modelType,
        exampleCount: examples.length,
        error: error.message
      });
      throw error;
    }
  }

  // 使用租户模型预测
  async predictWithTenantModel(modelType, text, options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.post(`/api/tenant/models/${modelType}/predict`, {
        text
      });

      return response.data;
    } catch (error) {
      logger.error('Tenant model prediction failed', {
        tenantId: this.tenantId,
        modelType,
        error: error.message
      });
      throw error;
    }
  }

  // 获取租户统计
  async getTenantStats(options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.get('/api/tenant/stats');
      return response.data;
    } catch (error) {
      logger.error('Failed to get tenant stats', {
        tenantId: this.tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 预览分类（不存储数据）
  async previewClassification(message, mode = null, options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.post('/api/smart-classify/preview', {
        message,
        mode
      });

      return response.data;
    } catch (error) {
      logger.error('Classification preview failed', {
        tenantId: this.tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 获取分类策略信息
  async getClassificationStrategy(options = {}) {
    try {
      if (options.authorization) {
        this.setAuthorization(options.authorization);
      }

      const response = await this.client.get('/api/smart-classify/strategy');
      return response.data;
    } catch (error) {
      logger.error('Failed to get classification strategy', {
        tenantId: this.tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // 健康检查
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      logger.error('AI service health check failed', {
        error: error.message
      });
      throw error;
    }
  }

  // 检查AI服务是否可用
  async isServiceAvailable() {
    try {
      await this.healthCheck();
      return true;
    } catch (error) {
      logger.warn('AI service is not available', {
        error: error.message
      });
      return false;
    }
  }

  // 使用通用分类（回退机制）
  async classifyWithFallback(message, options = {}) {
    try {
      // 首先尝试智能分类
      return await this.classifyMessage(message, options);
    } catch (error) {
      logger.warn('Smart classification failed, attempting fallback', {
        tenantId: this.tenantId,
        error: error.message
      });

      try {
        // 回退到基础分类
        if (options.authorization) {
          this.setAuthorization(options.authorization);
        }

        const response = await this.client.post('/api/classify', {
          message,
          options
        });

        return {
          ...response.data,
          fallback: true,
          fallbackReason: 'Smart classification unavailable'
        };
      } catch (fallbackError) {
        logger.error('Fallback classification also failed', {
          tenantId: this.tenantId,
          error: fallbackError.message
        });
        throw fallbackError;
      }
    }
  }
}

module.exports = AIServiceClient; 