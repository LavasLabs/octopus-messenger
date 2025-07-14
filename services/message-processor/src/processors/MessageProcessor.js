const logger = require('../utils/logger');
const AIServiceClient = require('../utils/AIServiceClient');
const StorageOptimizer = require('../utils/StorageOptimizer');

class MessageProcessor {
  constructor(options = {}) {
    this.dbManager = options.dbManager;
    this.cacheManager = options.cacheManager;
    this.messageQueue = options.messageQueue;
    this.mongoManager = options.mongoManager;
    this.config = options.config || {};
    
    // 初始化AI服务客户端
    this.aiClient = new AIServiceClient(this.config.aiService);
    
    // 初始化存储优化器
    this.storageOptimizer = new StorageOptimizer({
      dbManager: this.dbManager,
      mongoManager: this.mongoManager,
      cacheManager: this.cacheManager,
      config: this.config.storage || {}
    });
    
    // 处理选项
    this.enableAIProcessing = this.config.enableAIProcessing !== false;
    this.enableTranslation = this.config.enableTranslation || false;
    this.batchSize = this.config.batchSize || 10;
    this.processingTimeout = this.config.processingTimeout || 30000;
    
    // 统计
    this.stats = {
      processed: 0,
      failed: 0,
      aiProcessed: 0,
      translated: 0,
      handoffs: 0,
      startTime: new Date()
    };
    
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing Message Processor...');
      
      // 检查AI服务连接
      if (this.enableAIProcessing) {
        try {
          const healthCheck = await this.aiClient.healthCheck();
          logger.info('AI Service connected', { status: healthCheck.status });
        } catch (error) {
          logger.warn('AI Service connection failed, continuing without AI processing', {
            error: error.message
          });
          this.enableAIProcessing = false;
        }
      }
      
      this.isInitialized = true;
      logger.info('Message Processor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Message Processor', { error: error.message });
      throw error;
    }
  }

  // 处理单个消息
  async processMessage(messageData, options = {}) {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized) {
        throw new Error('Message processor not initialized');
      }

      const { tenantId, messageId } = messageData;
      
      logger.logProcessing(messageId, 'start', {
        tenantId,
        platform: messageData.platform,
        contentLength: messageData.content?.length || 0
      });

      // 1. 使用优化存储保存消息
      const savedMessage = await this.storageOptimizer.storeMessage(messageData);
      
      // 2. 生成或获取对话ID
      const conversationId = await this.getOrCreateConversationId(messageData);
      
      // 3. AI处理（如果启用）
      let aiResult = null;
      if (this.enableAIProcessing && messageData.content && messageData.content.trim()) {
        aiResult = await this.processWithAI(messageData, conversationId, options);
      }
      
      // 4. 更新消息状态
      await this.updateMessageStatus(savedMessage.id, 'processed', {
        processed_at: new Date(),
        ai_processed: !!aiResult,
        conversation_id: conversationId,
        processing_time_ms: Date.now() - startTime
      });

      this.stats.processed++;
      if (aiResult) {
        this.stats.aiProcessed++;
        if (aiResult.needsHandoff) {
          this.stats.handoffs++;
        }
        if (aiResult.translated) {
          this.stats.translated++;
        }
      }

      const result = {
        success: true,
        messageId: savedMessage.id,
        conversationId: conversationId,
        processingTime: Date.now() - startTime,
        aiResult: aiResult
      };

      logger.logProcessing(messageId, 'completed', {
        tenantId,
        processingTime: result.processingTime,
        aiProcessed: !!aiResult,
        needsHandoff: aiResult?.needsHandoff || false
      });

      return result;

    } catch (error) {
      this.stats.failed++;
      
      logger.error('Message processing failed', {
        messageId: messageData.messageId,
        tenantId: messageData.tenantId,
        error: error.message,
        processingTime: Date.now() - startTime
      });

      // 尝试更新消息状态为失败
      try {
        if (messageData.messageId) {
          await this.updateMessageStatus(messageData.messageId, 'failed', {
            error_message: error.message,
            failed_at: new Date()
          });
        }
      } catch (updateError) {
        logger.error('Failed to update message status', { error: updateError.message });
      }

      throw error;
    }
  }

  // 批量处理消息
  async processMessageBatch(messages, options = {}) {
    const startTime = Date.now();
    const results = [];
    
    try {
      logger.info('Processing message batch', {
        count: messages.length,
        tenantId: messages[0]?.tenantId
      });

      // 分批处理以避免超时
      for (let i = 0; i < messages.length; i += this.batchSize) {
        const batch = messages.slice(i, i + this.batchSize);
        const batchPromises = batch.map(message => 
          this.processMessage(message, options).catch(error => ({
            success: false,
            messageId: message.messageId,
            error: error.message
          }))
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // 小间隔避免过载
        if (i + this.batchSize < messages.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      logger.info('Batch processing completed', {
        total: messages.length,
        successful,
        failed,
        processingTime: Date.now() - startTime
      });

      return {
        success: true,
        total: messages.length,
        successful,
        failed,
        results,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      logger.error('Batch processing failed', {
        error: error.message,
        messageCount: messages.length
      });
      throw error;
    }
  }

  // AI处理逻辑
  async processWithAI(messageData, conversationId, options = {}) {
    try {
      const aiMessageData = this.aiClient.normalizeMessageData(messageData, messageData.tenantId);
      aiMessageData.conversationId = conversationId;

      // 调用AI客服处理
      const aiResponse = await this.aiClient.processCustomerServiceChat(aiMessageData, {
        token: options.token,
        includeContext: true
      });

      if (!aiResponse.success) {
        throw new Error('AI processing failed: ' + (aiResponse.error || 'Unknown error'));
      }

      // 保存AI分类结果
      if (aiResponse.classification) {
        await this.saveClassificationResult(messageData.messageId, aiResponse.classification);
      }

      // 处理人工介入
      if (aiResponse.needsHumanHandoff && aiResponse.humanHandoff) {
        await this.handleHumanHandoff(conversationId, aiResponse.humanHandoff, messageData.tenantId);
      }

      return {
        classification: aiResponse.classification,
        needsHandoff: aiResponse.needsHumanHandoff,
        handoffReason: aiResponse.humanHandoff?.reason,
        aiResponse: aiResponse.aiResponse,
        translated: !!aiResponse.aiResponse?.translatedResponse,
        language: aiResponse.language,
        processingTime: aiResponse.processingTime
      };

    } catch (error) {
      logger.error('AI processing failed', {
        error: error.message,
        messageId: messageData.messageId,
        conversationId: conversationId
      });
      
      // AI处理失败时返回基础分类
      return {
        classification: {
          category: 'unclassified',
          confidence: 0,
          classifier: 'fallback',
          error: error.message
        },
        needsHandoff: false,
        error: error.message
      };
    }
  }

  // 保存消息到数据库
  async saveMessage(messageData) {
    try {
      const dbMessageData = {
        tenantId: messageData.tenantId,
        platformId: messageData.platformId,
        platformMessageId: messageData.platformMessageId || messageData.messageId,
        senderId: messageData.senderId || messageData.userId,
        senderName: messageData.senderName,
        senderUsername: messageData.senderUsername,
        senderAvatarUrl: messageData.senderAvatarUrl,
        channelId: messageData.channelId || messageData.channel,
        channelName: messageData.channelName,
        threadId: messageData.threadId,
        replyToId: messageData.replyToId,
        content: messageData.content || messageData.message,
        contentType: messageData.contentType || messageData.messageType || 'text',
        rawContent: messageData.rawContent || messageData,
        attachments: messageData.attachments || [],
        metadata: {
          ...messageData.metadata,
          originalContent: messageData.originalContent,
          detectedLanguage: messageData.language,
          platform: messageData.platform,
          timestamp: messageData.timestamp || new Date()
        },
        status: 'processing',
        direction: messageData.direction || 'inbound',
        isBotMessage: messageData.isBotMessage || false
      };

      return await this.dbManager.createMessage(dbMessageData);
    } catch (error) {
      logger.error('Failed to save message', {
        error: error.message,
        messageId: messageData.messageId
      });
      throw error;
    }
  }

  // 获取或创建对话ID
  async getOrCreateConversationId(messageData) {
    try {
      const { tenantId, senderId, platform, channelId } = messageData;
      
      // 生成对话键
      const conversationKey = `conversation:${tenantId}:${senderId}:${platform}:${channelId || 'default'}`;
      
      // 检查缓存中是否有现有对话
      let conversationId = null;
      if (this.cacheManager) {
        const cached = await this.cacheManager.get(conversationKey);
        if (cached) {
          const { id, lastMessageTime } = JSON.parse(cached);
          
          // 检查是否为新对话（超过30分钟认为是新对话）
          if (!this.aiClient.isNewConversation(messageData, lastMessageTime)) {
            conversationId = id;
          }
        }
      }

      // 如果没有现有对话，创建新的
      if (!conversationId) {
        conversationId = this.aiClient.generateConversationId(tenantId, senderId, platform, channelId);
        
        logger.info('New conversation created', {
          conversationId,
          tenantId,
          senderId,
          platform
        });
      }

      // 更新缓存
      if (this.cacheManager) {
        await this.cacheManager.set(conversationKey, JSON.stringify({
          id: conversationId,
          lastMessageTime: new Date(),
          messageCount: 1
        }), 3600); // 1小时过期
      }

      return conversationId;
    } catch (error) {
      logger.error('Failed to get/create conversation ID', {
        error: error.message,
        messageId: messageData.messageId
      });
      
      // 生成临时对话ID
      return this.aiClient.generateConversationId(
        messageData.tenantId || 'default',
        messageData.senderId || 'unknown',
        messageData.platform || 'unknown',
        messageData.channelId || 'default'
      );
    }
  }

  // 保存分类结果
  async saveClassificationResult(messageId, classification) {
    try {
      const classificationData = {
        messageId: messageId,
        category: classification.category,
        subcategory: classification.subcategory,
        confidence: classification.confidence,
        priority: classification.urgency || 'medium',
        sentiment: classification.sentiment,
        language: classification.language,
        tags: classification.keywords || [],
        keywords: classification.keywords || [],
        entities: [],
        aiModel: classification.classifier,
        aiVersion: '1.0',
        processingTimeMs: classification.processingTime || 0,
        rawResult: classification,
        needsHumanHandoff: classification.escalate || false,
        handoffReason: classification.reason,
        escalationType: classification.escalationType
      };

      return await this.dbManager.createMessageClassification(classificationData);
    } catch (error) {
      logger.error('Failed to save classification result', {
        error: error.message,
        messageId: messageId
      });
      throw error;
    }
  }

  // 处理人工介入
  async handleHumanHandoff(conversationId, handoffInfo, tenantId) {
    try {
      // 这里可以添加人工介入的具体逻辑
      // 比如通知人工客服、创建工单等
      
      logger.info('Human handoff triggered', {
        conversationId,
        reason: handoffInfo.reason,
        type: handoffInfo.type,
        tenantId
      });

      // 发送通知到队列或WebSocket
      if (this.messageQueue) {
        await this.messageQueue.add('human-handoff', {
          conversationId,
          handoffInfo,
          tenantId,
          timestamp: new Date()
        });
      }

      return true;
    } catch (error) {
      logger.error('Failed to handle human handoff', {
        error: error.message,
        conversationId,
        tenantId
      });
      return false;
    }
  }

  // 更新消息状态
  async updateMessageStatus(messageId, status, metadata = {}) {
    try {
      return await this.dbManager.updateMessageStatus(messageId, status, metadata);
    } catch (error) {
      logger.error('Failed to update message status', {
        error: error.message,
        messageId,
        status
      });
      throw error;
    }
  }

  // 获取未处理的消息
  async getUnprocessedMessages(limit = 100) {
    try {
      return await this.dbManager.getUnprocessedMessages(limit);
    } catch (error) {
      logger.error('Failed to get unprocessed messages', {
        error: error.message,
        limit
      });
      throw error;
    }
  }

  // 定期处理未处理的消息
  async processBacklog() {
    try {
      const messages = await this.getUnprocessedMessages(this.batchSize);
      
      if (messages.length > 0) {
        logger.info('Processing backlog messages', { count: messages.length });
        
        const normalizedMessages = messages.map(msg => ({
          messageId: msg.id,
          tenantId: msg.tenant_id,
          platformId: msg.platform_id,
          platform: msg.platform_name,
          senderId: msg.sender_id,
          senderName: msg.sender_name,
          senderUsername: msg.sender_username,
          channelId: msg.channel_id,
          channelName: msg.channel_name,
          content: msg.content,
          contentType: msg.content_type,
          rawContent: msg.raw_content,
          attachments: msg.attachments,
          metadata: msg.metadata,
          timestamp: msg.created_at
        }));

        return await this.processMessageBatch(normalizedMessages);
      }

      return { success: true, total: 0, processed: 0 };
    } catch (error) {
      logger.error('Failed to process backlog', { error: error.message });
      throw error;
    }
  }

  // 获取处理统计
  async getStats() {
    const uptime = Date.now() - this.stats.startTime.getTime();
    const ratePerMinute = this.stats.processed > 0 ? (this.stats.processed / (uptime / 60000)).toFixed(2) : 0;
    
    return {
      ...this.stats,
      uptime: Math.floor(uptime / 1000),
      processingRate: ratePerMinute,
      aiServiceEnabled: this.enableAIProcessing,
      translationEnabled: this.enableTranslation
    };
  }

  // 重置统计
  resetStats() {
    this.stats = {
      processed: 0,
      failed: 0,
      aiProcessed: 0,
      translated: 0,
      handoffs: 0,
      startTime: new Date()
    };
  }

  // 健康检查
  async healthCheck() {
    const stats = await this.getStats();
    const aiServiceHealth = this.enableAIProcessing ? await this.aiClient.healthCheck() : { status: 'disabled' };
    
    return {
      status: 'healthy',
      initialized: this.isInitialized,
      stats: stats,
      aiService: aiServiceHealth,
      timestamp: new Date()
    };
  }
}

module.exports = MessageProcessor; 