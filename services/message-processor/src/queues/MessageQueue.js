const Bull = require('bull');
const logger = require('../utils/logger');

class MessageQueue {
  constructor(config) {
    this.config = config || {};
    this.redisConfig = this.config.redis || {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    };
    
    this.queues = {};
    this.workers = {};
    this.isInitialized = false;
    
    // 队列配置
    this.queueConfigs = {
      'message-processing': {
        concurrency: this.config.concurrency || 5,
        attempts: this.config.attempts || 3,
        delay: this.config.delay || 0,
        removeOnComplete: this.config.removeOnComplete || 100,
        removeOnFail: this.config.removeOnFail || 50
      },
      'ai-classification': {
        concurrency: 3,
        attempts: 2,
        delay: 1000,
        removeOnComplete: 50,
        removeOnFail: 25
      },
      'human-handoff': {
        concurrency: 10,
        attempts: 1,
        delay: 0,
        removeOnComplete: 200,
        removeOnFail: 100
      },
      'translation': {
        concurrency: 5,
        attempts: 2,
        delay: 500,
        removeOnComplete: 100,
        removeOnFail: 50
      },
      'notification': {
        concurrency: 10,
        attempts: 3,
        delay: 0,
        removeOnComplete: 50,
        removeOnFail: 25
      }
    };
  }

  async initialize() {
    try {
      logger.info('Initializing Message Queue...');
      
      // 创建队列
      for (const [queueName, config] of Object.entries(this.queueConfigs)) {
        this.queues[queueName] = new Bull(queueName, {
          redis: this.redisConfig,
          defaultJobOptions: {
            attempts: config.attempts,
            delay: config.delay,
            removeOnComplete: config.removeOnComplete,
            removeOnFail: config.removeOnFail,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          }
        });

        // 设置队列事件监听
        this.setupQueueEvents(queueName, this.queues[queueName]);
      }

      this.isInitialized = true;
      logger.info('Message Queue initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Message Queue', { error: error.message });
      throw error;
    }
  }

  setupQueueEvents(queueName, queue) {
    queue.on('completed', (job, result) => {
      logger.logQueue(queueName, 'completed', {
        jobId: job.id,
        duration: Date.now() - job.processedOn,
        result: typeof result === 'object' ? 'object' : result
      });
    });

    queue.on('failed', (job, err) => {
      logger.logQueue(queueName, 'failed', {
        jobId: job.id,
        error: err.message,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts
      });
    });

    queue.on('stalled', (job) => {
      logger.warn('Job stalled', {
        queue: queueName,
        jobId: job.id,
        data: job.data
      });
    });

    queue.on('error', (error) => {
      logger.error('Queue error', {
        queue: queueName,
        error: error.message
      });
    });
  }

  async startWorkers() {
    try {
      if (!this.isInitialized) {
        throw new Error('Message queue not initialized');
      }

      logger.info('Starting queue workers...');

      // 消息处理工作器
      this.workers['message-processing'] = this.queues['message-processing'].process(
        this.queueConfigs['message-processing'].concurrency,
        async (job) => {
          return await this.processMessage(job);
        }
      );

      // AI分类工作器
      this.workers['ai-classification'] = this.queues['ai-classification'].process(
        this.queueConfigs['ai-classification'].concurrency,
        async (job) => {
          return await this.processAIClassification(job);
        }
      );

      // 人工介入工作器
      this.workers['human-handoff'] = this.queues['human-handoff'].process(
        this.queueConfigs['human-handoff'].concurrency,
        async (job) => {
          return await this.processHumanHandoff(job);
        }
      );

      // 翻译工作器
      this.workers['translation'] = this.queues['translation'].process(
        this.queueConfigs['translation'].concurrency,
        async (job) => {
          return await this.processTranslation(job);
        }
      );

      // 通知工作器
      this.workers['notification'] = this.queues['notification'].process(
        this.queueConfigs['notification'].concurrency,
        async (job) => {
          return await this.processNotification(job);
        }
      );

      logger.info('Queue workers started successfully');
    } catch (error) {
      logger.error('Failed to start queue workers', { error: error.message });
      throw error;
    }
  }

  async stopWorkers() {
    try {
      logger.info('Stopping queue workers...');
      
      for (const [queueName, queue] of Object.entries(this.queues)) {
        await queue.close();
        logger.info(`Queue ${queueName} closed`);
      }

      logger.info('All queue workers stopped');
    } catch (error) {
      logger.error('Failed to stop queue workers', { error: error.message });
      throw error;
    }
  }

  // 添加消息到处理队列
  async add(queueName, data, options = {}) {
    try {
      if (!this.queues[queueName]) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const job = await this.queues[queueName].add(data, {
        priority: options.priority || 0,
        delay: options.delay || 0,
        attempts: options.attempts,
        ...options
      });

      logger.logQueue(queueName, 'added', {
        jobId: job.id,
        data: typeof data === 'object' ? Object.keys(data) : data
      });

      return job;
    } catch (error) {
      logger.error('Failed to add job to queue', {
        queue: queueName,
        error: error.message
      });
      throw error;
    }
  }

  // 批量添加任务
  async addBatch(queueName, jobs) {
    try {
      if (!this.queues[queueName]) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const batchJobs = await this.queues[queueName].addBulk(jobs);
      
      logger.logQueue(queueName, 'batch_added', {
        count: batchJobs.length
      });

      return batchJobs;
    } catch (error) {
      logger.error('Failed to add batch jobs to queue', {
        queue: queueName,
        error: error.message,
        jobCount: jobs.length
      });
      throw error;
    }
  }

  // 处理消息任务
  async processMessage(job) {
    const { messageData, messageProcessor } = job.data;
    
    try {
      logger.logProcessing(messageData.messageId, 'queue_processing_start');
      
      const result = await messageProcessor.processMessage(messageData);
      
      logger.logProcessing(messageData.messageId, 'queue_processing_completed', {
        processingTime: result.processingTime,
        aiProcessed: !!result.aiResult
      });

      return result;
    } catch (error) {
      logger.error('Queue message processing failed', {
        messageId: messageData.messageId,
        error: error.message
      });
      throw error;
    }
  }

  // 处理AI分类任务
  async processAIClassification(job) {
    const { messageData, aiClient } = job.data;
    
    try {
      const classificationResult = await aiClient.classifyMessage(messageData);
      
      logger.info('AI classification completed in queue', {
        messageId: messageData.messageId,
        category: classificationResult.classification?.category
      });

      return classificationResult;
    } catch (error) {
      logger.error('Queue AI classification failed', {
        messageId: messageData.messageId,
        error: error.message
      });
      throw error;
    }
  }

  // 处理人工介入任务
  async processHumanHandoff(job) {
    const { conversationId, handoffInfo, tenantId } = job.data;
    
    try {
      // 这里实现具体的人工介入逻辑
      // 比如发送通知给客服、更新CRM系统等
      
      logger.info('Human handoff processed', {
        conversationId,
        reason: handoffInfo.reason,
        tenantId
      });

      // 发送WebSocket通知
      await this.sendNotification('human-handoff-alert', {
        conversationId,
        tenantId,
        handoffInfo,
        timestamp: new Date()
      });

      return { success: true, handoffId: handoffInfo.id };
    } catch (error) {
      logger.error('Queue human handoff processing failed', {
        conversationId,
        error: error.message
      });
      throw error;
    }
  }

  // 处理翻译任务
  async processTranslation(job) {
    const { text, targetLanguage, sourceLanguage, aiClient, options } = job.data;
    
    try {
      const translationResult = await aiClient.translateText(
        text,
        targetLanguage,
        sourceLanguage,
        options
      );
      
      logger.info('Translation completed in queue', {
        textLength: text.length,
        targetLanguage,
        sourceLanguage
      });

      return translationResult;
    } catch (error) {
      logger.error('Queue translation failed', {
        error: error.message,
        targetLanguage
      });
      throw error;
    }
  }

  // 处理通知任务
  async processNotification(job) {
    const { type, data, recipients } = job.data;
    
    try {
      // 这里实现具体的通知逻辑
      // 比如WebSocket推送、邮件发送、短信通知等
      
      logger.info('Notification processed', {
        type,
        recipientCount: recipients?.length || 0
      });

      return { success: true, type, sent: true };
    } catch (error) {
      logger.error('Queue notification processing failed', {
        type,
        error: error.message
      });
      throw error;
    }
  }

  // 发送通知的便捷方法
  async sendNotification(type, data, options = {}) {
    return await this.add('notification', {
      type,
      data,
      recipients: options.recipients || [],
      timestamp: new Date()
    }, options);
  }

  // 获取队列统计
  async getStats() {
    const stats = {};
    
    try {
      for (const [queueName, queue] of Object.entries(this.queues)) {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getCompleted(),
          queue.getFailed(),
          queue.getDelayed()
        ]);

        stats[queueName] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          total: waiting.length + active.length + completed.length + failed.length + delayed.length
        };
      }
    } catch (error) {
      logger.error('Failed to get queue stats', { error: error.message });
    }

    return stats;
  }

  // 清理队列
  async cleanQueues() {
    try {
      for (const [queueName, queue] of Object.entries(this.queues)) {
        // 清理已完成的任务（保留最近100个）
        await queue.clean(24 * 60 * 60 * 1000, 'completed', 100);
        
        // 清理失败的任务（保留最近50个）
        await queue.clean(24 * 60 * 60 * 1000, 'failed', 50);
        
        logger.info(`Queue ${queueName} cleaned`);
      }
    } catch (error) {
      logger.error('Failed to clean queues', { error: error.message });
      throw error;
    }
  }

  // 暂停队列
  async pauseQueue(queueName) {
    if (this.queues[queueName]) {
      await this.queues[queueName].pause();
      logger.info(`Queue ${queueName} paused`);
    }
  }

  // 恢复队列
  async resumeQueue(queueName) {
    if (this.queues[queueName]) {
      await this.queues[queueName].resume();
      logger.info(`Queue ${queueName} resumed`);
    }
  }

  // 获取队列信息
  async getQueueInfo(queueName) {
    if (!this.queues[queueName]) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const queue = this.queues[queueName];
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
      queue.isPaused()
    ]);

    return {
      name: queueName,
      paused,
      counts: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length
      },
      jobs: {
        waiting: waiting.slice(0, 10), // 只返回前10个
        active: active.slice(0, 10),
        failed: failed.slice(0, 10)
      }
    };
  }
}

module.exports = MessageQueue; 