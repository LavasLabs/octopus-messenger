const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const config = require('../../../../config/config');
const logger = require('../utils/logger');
const AIServiceClient = require('../utils/AIServiceClient');

// 创建数据库连接池
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl
});

class MessageProcessor {
  constructor() {
    this.processingQueue = new Map(); // 消息处理队列
    this.rateLimitMap = new Map(); // 频率限制映射
  }

  // 检查频率限制
  checkRateLimit(tenantId, senderId) {
    const key = `${tenantId}:${senderId}`;
    const now = Date.now();
    const limit = 10; // 每分钟最多10条消息
    const window = 60 * 1000; // 1分钟窗口

    if (!this.rateLimitMap.has(key)) {
      this.rateLimitMap.set(key, []);
    }

    const timestamps = this.rateLimitMap.get(key);
    
    // 清理过期的时间戳
    while (timestamps.length > 0 && timestamps[0] < now - window) {
      timestamps.shift();
    }

    if (timestamps.length >= limit) {
      return false; // 超过频率限制
    }

    timestamps.push(now);
    return true;
  }

  // 保存消息到数据库
  async saveMessage(messageData) {
    try {
      const insertQuery = `
        INSERT INTO messages (
          id, tenant_id, bot_config_id, external_id, platform, message_type,
          content, media_url, sender_id, sender_username, sender_name,
          chat_id, chat_title, chat_type, raw_data, received_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
        RETURNING id
      `;

      const result = await pool.query(insertQuery, [
        messageData.id, messageData.tenantId, messageData.botConfigId,
        messageData.externalId, messageData.platform, messageData.messageType,
        messageData.content, messageData.mediaUrl, messageData.senderId,
        messageData.senderUsername, messageData.senderName, messageData.chatId,
        messageData.chatTitle, messageData.chatType, messageData.rawData,
        messageData.receivedAt
      ]);

      logger.info('Message saved to database', {
        messageId: messageData.id,
        tenantId: messageData.tenantId,
        platform: messageData.platform
      });

      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to save message to database', {
        messageId: messageData.id,
        tenantId: messageData.tenantId,
        error: error.message
      });
      throw error;
    }
  }

  // AI智能分类
  async classifyMessage(messageData) {
    try {
      // 检查是否需要分类
      if (!messageData.content || !messageData.content.trim()) {
        return {
          category: 'media',
          confidence: 1.0,
          classifier: 'rule-based',
          reason: 'Non-text message'
        };
      }

      logger.info('Starting AI classification', {
        messageId: messageData.id,
        tenantId: messageData.tenantId,
        platform: messageData.platform,
        contentLength: messageData.content.length
      });

      // 创建AI服务客户端
      const aiClient = new AIServiceClient(messageData.tenantId);
      
      // 使用智能分类（带回退机制）
      const classificationResult = await aiClient.classifyWithFallback({
        id: messageData.id,
        content: messageData.content,
        platform: messageData.platform,
        userId: messageData.senderId,
        type: messageData.messageType
      });

      const classification = classificationResult.classification;
      
      logger.info('AI classification completed', {
        messageId: messageData.id,
        tenantId: messageData.tenantId,
        category: classification.category,
        confidence: classification.confidence,
        usedCustomModel: classification.usedCustomModel,
        mode: classification.mode,
        fallback: classificationResult.fallback || false
      });

      // 更新数据库中的分类信息
      await this.updateMessageClassification(messageData.id, classification);

      return classification;

    } catch (error) {
      logger.error('AI classification failed', {
        messageId: messageData.id,
        tenantId: messageData.tenantId,
        error: error.message
      });
      
      // 返回默认分类
      return {
        category: 'unclassified',
        confidence: 0,
        classifier: 'fallback',
        error: error.message
      };
    }
  }

  // 更新消息分类信息
  async updateMessageClassification(messageId, classification) {
    try {
      const updateQuery = `
        UPDATE messages 
        SET classification = $1, classification_confidence = $2, 
            ai_model_used = $3, classified_at = NOW()
        WHERE id = $4
      `;
      
      await pool.query(updateQuery, [
        JSON.stringify(classification),
        classification.confidence,
        classification.classifier || 'unknown',
        messageId
      ]);

      logger.debug('Message classification updated in database', {
        messageId,
        category: classification.category
      });

    } catch (error) {
      logger.error('Failed to update message classification', {
        messageId,
        error: error.message
      });
      // 不抛出错误，因为这不应该影响消息处理
    }
  }

  // 发送到消息处理服务
  async sendToProcessor(messageData, botConfig) {
    try {
      const messageProcessorUrl = `http://localhost:${config.services.messageProcessor.port}/process`;
      
      const response = await axios.post(messageProcessorUrl, {
        message: messageData,
        botConfig: botConfig
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': botConfig.tenant_id
        },
        timeout: 15000 // 15秒超时
      });

      logger.info('Message sent to processor', {
        messageId: messageData.id,
        tenantId: botConfig.tenant_id,
        platform: messageData.platform,
        classification: messageData.classification?.category,
        response: response.status
      });

      return response.data;

    } catch (error) {
      logger.error('Failed to send message to processor', {
        messageId: messageData.id,
        tenantId: botConfig.tenant_id,
        error: error.message
      });
      throw error;
    }
  }

  // 检查是否为紧急消息
  isUrgentMessage(content) {
    if (!content) return false;
    
    const urgentKeywords = [
      'urgent', 'emergency', 'help', 'error', 'bug', 'critical', 'issue',
      '紧急', '急', '帮助', '错误', '故障', '问题', '不能', '无法'
    ];
    
    const lowercaseContent = content.toLowerCase();
    return urgentKeywords.some(keyword => lowercaseContent.includes(keyword));
  }

  // 处理消息的主函数
  async processMessage(messageData, botConfig, options = {}) {
    const startTime = Date.now();
    
    try {
      // 1. 检查频率限制
      if (!this.checkRateLimit(messageData.tenantId, messageData.senderId)) {
        logger.warn('Rate limit exceeded', {
          tenantId: messageData.tenantId,
          senderId: messageData.senderId
        });
        
        return {
          success: false,
          error: 'Rate limit exceeded',
          messageId: messageData.id
        };
      }

      // 2. 保存消息到数据库
      await this.saveMessage(messageData);

      // 3. AI智能分类
      const classification = await this.classifyMessage(messageData);
      
      // 4. 将分类结果添加到消息数据
      const enrichedMessageData = {
        ...messageData,
        classification,
        processed_at: new Date().toISOString()
      };

      // 5. 检查是否为紧急消息
      const isUrgent = this.isUrgentMessage(messageData.content);
      if (isUrgent) {
        logger.info('Urgent message detected, prioritizing', {
          messageId: messageData.id,
          tenantId: messageData.tenantId,
          category: classification.category
        });
        
        enrichedMessageData.priority = 'urgent';
      }

      // 6. 发送到消息处理服务
      const processorResult = await this.sendToProcessor(enrichedMessageData, botConfig);

      const processingTime = Date.now() - startTime;

      logger.info('Message processing completed', {
        messageId: messageData.id,
        tenantId: messageData.tenantId,
        platform: messageData.platform,
        category: classification.category,
        confidence: classification.confidence,
        processingTime,
        urgent: isUrgent
      });

      return {
        success: true,
        messageId: messageData.id,
        classification,
        processingTime,
        urgent: isUrgent,
        processorResult
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Message processing failed', {
        messageId: messageData.id,
        tenantId: messageData.tenantId,
        error: error.message,
        processingTime,
        stack: error.stack
      });

      return {
        success: false,
        messageId: messageData.id,
        error: error.message,
        processingTime
      };
    }
  }

  // 批量处理消息
  async processMessageBatch(messages, botConfig) {
    const results = [];
    const batchStartTime = Date.now();

    logger.info('Starting batch message processing', {
      tenantId: botConfig.tenant_id,
      messageCount: messages.length
    });

    for (const messageData of messages) {
      try {
        const result = await this.processMessage(messageData, botConfig);
        results.push(result);
      } catch (error) {
        logger.error('Batch message processing error', {
          messageId: messageData.id,
          error: error.message
        });
        
        results.push({
          success: false,
          messageId: messageData.id,
          error: error.message
        });
      }
    }

    const batchProcessingTime = Date.now() - batchStartTime;
    const successCount = results.filter(r => r.success).length;

    logger.info('Batch message processing completed', {
      tenantId: botConfig.tenant_id,
      total: messages.length,
      successful: successCount,
      failed: messages.length - successCount,
      batchProcessingTime
    });

    return {
      results,
      summary: {
        total: messages.length,
        successful: successCount,
        failed: messages.length - successCount,
        batchProcessingTime,
        averageTimePerMessage: batchProcessingTime / messages.length
      }
    };
  }

  // 健康检查
  async healthCheck() {
    try {
      // 检查数据库连接
      await pool.query('SELECT 1');
      
      // 检查AI服务连接
      const aiClient = new AIServiceClient('health-check');
      const aiHealthy = await aiClient.isServiceAvailable();
      
      return {
        status: 'healthy',
        database: 'connected',
        aiService: aiHealthy ? 'connected' : 'disconnected',
        queueSize: this.processingQueue.size,
        rateLimitEntries: this.rateLimitMap.size
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // 清理资源
  cleanup() {
    // 清理过期的频率限制记录
    const now = Date.now();
    const window = 60 * 1000; // 1分钟

    for (const [key, timestamps] of this.rateLimitMap.entries()) {
      const validTimestamps = timestamps.filter(ts => ts > now - window);
      if (validTimestamps.length === 0) {
        this.rateLimitMap.delete(key);
      } else {
        this.rateLimitMap.set(key, validTimestamps);
      }
    }

    logger.debug('Message processor cleanup completed', {
      rateLimitEntries: this.rateLimitMap.size
    });
  }
}

// 创建单例实例
const messageProcessor = new MessageProcessor();

// 定期清理
setInterval(() => {
  messageProcessor.cleanup();
}, 5 * 60 * 1000); // 每5分钟清理一次

module.exports = messageProcessor; 