const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();
const logger = require('../utils/logger');
const { ValidationError } = require('../middleware/errorHandler');

// 验证中间件
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }
  next();
};

// 获取队列状态
router.get('/queues', async (req, res, next) => {
  try {
    const messageQueue = req.app.locals.messageQueue;
    
    if (!messageQueue) {
      return res.status(503).json({
        success: false,
        error: 'Message queue not available'
      });
    }

    const stats = await messageQueue.getStats();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 获取特定队列信息
router.get('/queues/:queueName', [
  param('queueName').notEmpty().withMessage('Queue name is required'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageQueue = req.app.locals.messageQueue;
    const queueName = req.params.queueName;
    
    if (!messageQueue) {
      return res.status(503).json({
        success: false,
        error: 'Message queue not available'
      });
    }

    const queueInfo = await messageQueue.getQueueInfo(queueName);

    res.json({
      success: true,
      data: queueInfo,
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 暂停队列
router.post('/queues/:queueName/pause', [
  param('queueName').notEmpty().withMessage('Queue name is required'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageQueue = req.app.locals.messageQueue;
    const queueName = req.params.queueName;
    
    if (!messageQueue) {
      return res.status(503).json({
        success: false,
        error: 'Message queue not available'
      });
    }

    await messageQueue.pauseQueue(queueName);

    logger.info('Queue paused by user', {
      queueName,
      userId: req.user?.id,
      tenantId: req.user?.tenantId
    });

    res.json({
      success: true,
      message: `Queue ${queueName} paused successfully`,
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 恢复队列
router.post('/queues/:queueName/resume', [
  param('queueName').notEmpty().withMessage('Queue name is required'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageQueue = req.app.locals.messageQueue;
    const queueName = req.params.queueName;
    
    if (!messageQueue) {
      return res.status(503).json({
        success: false,
        error: 'Message queue not available'
      });
    }

    await messageQueue.resumeQueue(queueName);

    logger.info('Queue resumed by user', {
      queueName,
      userId: req.user?.id,
      tenantId: req.user?.tenantId
    });

    res.json({
      success: true,
      message: `Queue ${queueName} resumed successfully`,
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 清理队列
router.post('/queues/clean', async (req, res, next) => {
  try {
    const messageQueue = req.app.locals.messageQueue;
    
    if (!messageQueue) {
      return res.status(503).json({
        success: false,
        error: 'Message queue not available'
      });
    }

    await messageQueue.cleanQueues();

    logger.info('Queues cleaned by user', {
      userId: req.user?.id,
      tenantId: req.user?.tenantId
    });

    res.json({
      success: true,
      message: 'Queues cleaned successfully',
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 添加AI分类任务
router.post('/ai-classify', [
  body('messageData').isObject().withMessage('Message data is required'),
  body('messageData.tenantId').notEmpty().withMessage('Tenant ID is required'),
  body('messageData.message').isObject().withMessage('Message object is required'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageQueue = req.app.locals.messageQueue;
    const aiClient = req.app.locals.messageProcessor?.aiClient;
    
    if (!messageQueue || !aiClient) {
      return res.status(503).json({
        success: false,
        error: 'Required services not available'
      });
    }

    const job = await messageQueue.add('ai-classification', {
      messageData: req.body.messageData,
      aiClient: aiClient,
      priority: req.body.priority || 0
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        queueName: 'ai-classification'
      },
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 添加翻译任务
router.post('/translate', [
  body('text').notEmpty().withMessage('Text is required'),
  body('targetLanguage').notEmpty().withMessage('Target language is required'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageQueue = req.app.locals.messageQueue;
    const aiClient = req.app.locals.messageProcessor?.aiClient;
    
    if (!messageQueue || !aiClient) {
      return res.status(503).json({
        success: false,
        error: 'Required services not available'
      });
    }

    const job = await messageQueue.add('translation', {
      text: req.body.text,
      targetLanguage: req.body.targetLanguage,
      sourceLanguage: req.body.sourceLanguage,
      aiClient: aiClient,
      options: {
        tenantId: req.user?.tenantId,
        provider: req.body.provider
      },
      priority: req.body.priority || 0
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        queueName: 'translation'
      },
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 触发人工介入
router.post('/handoff', [
  body('conversationId').notEmpty().withMessage('Conversation ID is required'),
  body('reason').notEmpty().withMessage('Handoff reason is required'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageQueue = req.app.locals.messageQueue;
    
    if (!messageQueue) {
      return res.status(503).json({
        success: false,
        error: 'Message queue not available'
      });
    }

    const handoffInfo = {
      id: require('crypto').randomUUID(),
      reason: req.body.reason,
      type: req.body.type || 'manual',
      assignedAgent: req.body.assignedAgent,
      priority: req.body.priority || 'medium',
      requestedBy: req.user?.id,
      requestedAt: new Date()
    };

    const job = await messageQueue.add('human-handoff', {
      conversationId: req.body.conversationId,
      handoffInfo: handoffInfo,
      tenantId: req.user?.tenantId || req.body.tenantId,
      priority: req.body.priority === 'high' ? 10 : 0
    });

    logger.info('Human handoff requested', {
      conversationId: req.body.conversationId,
      reason: req.body.reason,
      requestedBy: req.user?.id,
      tenantId: req.user?.tenantId
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        handoffId: handoffInfo.id,
        queueName: 'human-handoff'
      },
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 发送通知
router.post('/notify', [
  body('type').notEmpty().withMessage('Notification type is required'),
  body('data').isObject().withMessage('Notification data is required'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageQueue = req.app.locals.messageQueue;
    
    if (!messageQueue) {
      return res.status(503).json({
        success: false,
        error: 'Message queue not available'
      });
    }

    const job = await messageQueue.add('notification', {
      type: req.body.type,
      data: req.body.data,
      recipients: req.body.recipients || [],
      tenantId: req.user?.tenantId || req.body.tenantId,
      priority: req.body.priority || 0
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        queueName: 'notification'
      },
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 批量添加消息处理任务
router.post('/batch-process', [
  body('messages').isArray({ min: 1, max: 100 }).withMessage('Messages must be an array with 1-100 items'),
  handleValidationErrors
], async (req, res, next) => {
  try {
    const messageQueue = req.app.locals.messageQueue;
    const messageProcessor = req.app.locals.messageProcessor;
    
    if (!messageQueue || !messageProcessor) {
      return res.status(503).json({
        success: false,
        error: 'Required services not available'
      });
    }

    const batchJobs = req.body.messages.map((messageData, index) => ({
      data: {
        messageData: messageData,
        messageProcessor: messageProcessor
      },
      opts: {
        priority: messageData.priority || 0,
        delay: index * 100 // 错开处理时间
      }
    }));

    const jobs = await messageQueue.addBatch('message-processing', batchJobs);

    res.json({
      success: true,
      data: {
        batchId: require('crypto').randomUUID(),
        jobCount: jobs.length,
        jobIds: jobs.map(job => job.id),
        queueName: 'message-processing'
      },
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 获取处理性能指标
router.get('/metrics', async (req, res, next) => {
  try {
    const messageProcessor = req.app.locals.messageProcessor;
    const messageQueue = req.app.locals.messageQueue;
    const cacheManager = req.app.locals.cacheManager;
    
    if (!messageProcessor) {
      return res.status(503).json({
        success: false,
        error: 'Message processor not available'
      });
    }

    const [processorStats, queueStats] = await Promise.all([
      messageProcessor.getStats(),
      messageQueue ? messageQueue.getStats() : {},
    ]);

    // 获取缓存状态
    let cacheStats = null;
    if (cacheManager && cacheManager.isConnected) {
      try {
        const info = await cacheManager.client.info('memory');
        const lines = info.split('\r\n');
        const memoryInfo = {};
        lines.forEach(line => {
          if (line.includes(':')) {
            const [key, value] = line.split(':');
            memoryInfo[key] = value;
          }
        });
        
        cacheStats = {
          connected: true,
          usedMemory: memoryInfo.used_memory_human,
          totalConnections: memoryInfo.total_connections_received,
          commandsProcessed: memoryInfo.total_commands_processed
        };
      } catch (error) {
        cacheStats = { connected: false, error: error.message };
      }
    }

    // 计算处理速率
    const uptime = processorStats.uptime || 1;
    const processingRate = {
      messagesPerSecond: (processorStats.processed / uptime).toFixed(2),
      messagesPerMinute: (processorStats.processed / (uptime / 60)).toFixed(2),
      aiProcessingRate: (processorStats.aiProcessed / uptime).toFixed(2),
      handoffRate: (processorStats.handoffs / uptime).toFixed(2)
    };

    res.json({
      success: true,
      data: {
        processor: processorStats,
        queues: queueStats,
        cache: cacheStats,
        rates: processingRate,
        system: {
          uptime: uptime,
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        }
      },
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 重置处理器统计
router.post('/reset-stats', async (req, res, next) => {
  try {
    const messageProcessor = req.app.locals.messageProcessor;
    
    if (!messageProcessor) {
      return res.status(503).json({
        success: false,
        error: 'Message processor not available'
      });
    }

    messageProcessor.resetStats();

    logger.info('Processor stats reset by user', {
      userId: req.user?.id,
      tenantId: req.user?.tenantId
    });

    res.json({
      success: true,
      message: 'Processor statistics reset successfully',
      timestamp: new Date()
    });

  } catch (error) {
    next(error);
  }
});

// 健康检查
router.get('/health', async (req, res, next) => {
  try {
    const messageProcessor = req.app.locals.messageProcessor;
    const messageQueue = req.app.locals.messageQueue;
    const dbManager = req.app.locals.dbManager;
    const cacheManager = req.app.locals.cacheManager;

    const health = {
      status: 'healthy',
      services: {},
      timestamp: new Date()
    };

    // 检查消息处理器
    if (messageProcessor) {
      try {
        const processorHealth = await messageProcessor.healthCheck();
        health.services.messageProcessor = processorHealth;
      } catch (error) {
        health.services.messageProcessor = { status: 'unhealthy', error: error.message };
        health.status = 'degraded';
      }
    } else {
      health.services.messageProcessor = { status: 'unavailable' };
      health.status = 'unhealthy';
    }

    // 检查消息队列
    if (messageQueue) {
      try {
        const queueStats = await messageQueue.getStats();
        health.services.messageQueue = {
          status: 'healthy',
          stats: queueStats
        };
      } catch (error) {
        health.services.messageQueue = { status: 'unhealthy', error: error.message };
        health.status = 'degraded';
      }
    } else {
      health.services.messageQueue = { status: 'unavailable' };
      health.status = 'degraded';
    }

    // 检查数据库
    if (dbManager) {
      try {
        await dbManager.query('SELECT 1');
        health.services.database = { status: 'healthy' };
      } catch (error) {
        health.services.database = { status: 'unhealthy', error: error.message };
        health.status = 'unhealthy';
      }
    } else {
      health.services.database = { status: 'unavailable' };
      health.status = 'unhealthy';
    }

    // 检查缓存
    if (cacheManager) {
      health.services.cache = {
        status: cacheManager.isConnected ? 'healthy' : 'unhealthy',
        connected: cacheManager.isConnected
      };
      
      if (!cacheManager.isConnected) {
        health.status = 'degraded';
      }
    } else {
      health.services.cache = { status: 'unavailable' };
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      success: health.status !== 'unhealthy',
      data: health
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      message: error.message,
      timestamp: new Date()
    });
  }
});

module.exports = router; 