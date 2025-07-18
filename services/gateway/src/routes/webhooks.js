const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const config = require('../../../../config/config');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { authenticateApiKey } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const AIServiceClient = require('../utils/AIServiceClient');

const router = express.Router();

// 创建数据库连接池
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl
});

// 验证Telegram签名
const verifyTelegramSignature = (body, signature, secret) => {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return hash === signature;
};

// 验证WhatsApp签名
const verifyWhatsAppSignature = (body, signature, secret) => {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hash}` === signature;
};

// 验证Slack签名
const verifySlackSignature = (body, timestamp, signature, secret) => {
  const baseString = `v0:${timestamp}:${body}`;
  const hash = crypto.createHmac('sha256', secret).update(baseString).digest('hex');
  return `v0=${hash}` === signature;
};

// 验证Discord签名
const verifyDiscordSignature = (body, timestamp, signature, publicKey) => {
  const nacl = require('tweetnacl');
  
  try {
    const sig = Buffer.from(signature, 'hex');
    const msg = Buffer.from(timestamp + body);
    const key = Buffer.from(publicKey, 'hex');
    
    return nacl.sign.detached.verify(msg, sig, key);
  } catch (error) {
    return false;
  }
};

// 验证Line签名
const verifyLineSignature = (body, signature, secret) => {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64');
  return hash === signature;
};

// 验证企业微信签名
const verifyWeWorkSignature = (timestamp, nonce, signature, token) => {
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  const hash = crypto.createHash('sha1').update(str).digest('hex');
  return hash === signature;
};

// 处理消息的通用函数（集成AI分类）
const processMessage = async (messageData, botConfig) => {
  try {
    let classification = null;
    
    // 如果消息有文本内容，进行AI分类
    if (messageData.content && messageData.content.trim()) {
      try {
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

        classification = classificationResult.classification;
        
        logger.info('AI classification completed', {
          messageId: messageData.id,
          tenantId: messageData.tenantId,
          category: classification.category,
          confidence: classification.confidence,
          usedCustomModel: classification.usedCustomModel,
          mode: classification.mode,
          fallback: classificationResult.fallback || false
        });

        // 更新消息记录中的分类信息
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
          messageData.id
        ]);

      } catch (aiError) {
        logger.error('AI classification failed', {
          messageId: messageData.id,
          tenantId: messageData.tenantId,
          error: aiError.message,
          fallbackUsed: false
        });
        
        // AI分类失败不影响消息处理，继续处理消息
        classification = {
          category: 'unclassified',
          confidence: 0,
          error: aiError.message,
          classifier: 'fallback'
        };
      }
    } else {
      logger.debug('Skipping AI classification for non-text message', {
        messageId: messageData.id,
        messageType: messageData.messageType
      });
    }

    // 将分类结果添加到消息数据中
    const enrichedMessageData = {
      ...messageData,
      classification
    };

    // 发送消息到消息处理服务
    const messageProcessorUrl = `http://localhost:${config.services.messageProcessor.port}/process`;
    
    const response = await axios.post(messageProcessorUrl, {
      message: enrichedMessageData,
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
      classification: classification?.category,
      response: response.status
    });

    return {
      ...response.data,
      classification
    };
  } catch (error) {
    logger.error('Error processing message', {
      messageId: messageData.id,
      tenantId: botConfig.tenant_id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

// 处理高优先级消息（紧急分类）
const processHighPriorityMessage = async (messageData, botConfig) => {
  try {
    // 高优先级消息的快速分类
    const urgentKeywords = ['urgent', 'emergency', '紧急', '急', 'help', '帮助', 'error', '错误', 'bug'];
    const content = messageData.content.toLowerCase();
    
    let isUrgent = false;
    for (const keyword of urgentKeywords) {
      if (content.includes(keyword)) {
        isUrgent = true;
        break;
      }
    }

    if (isUrgent) {
      logger.info('High priority message detected', {
        messageId: messageData.id,
        tenantId: messageData.tenantId,
        content: messageData.content.substring(0, 100)
      });

      // 立即处理，跳过队列
      return await processMessage(messageData, botConfig);
    } else {
      // 正常处理
      return await processMessage(messageData, botConfig);
    }
  } catch (error) {
    logger.error('Error in high priority message processing', {
      messageId: messageData.id,
      tenantId: botConfig.tenant_id,
      error: error.message
    });
    
    // 回退到正常处理
    return await processMessage(messageData, botConfig);
  }
};

/**
 * @swagger
 * /api/webhooks/telegram:
 *   post:
 *     summary: Telegram webhook endpoint
 *     tags: [Webhooks]
 *     parameters:
 *       - in: header
 *         name: X-Telegram-Bot-Api-Secret-Token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 *       500:
 *         description: Processing error
 */
router.post('/telegram', asyncHandler(async (req, res) => {
  const signature = req.headers['x-telegram-bot-api-secret-token'];
  const body = JSON.stringify(req.body);

  // 获取bot配置
  const botQuery = `
    SELECT bc.*, t.name as tenant_name
    FROM bot_configs bc
    JOIN tenants t ON bc.tenant_id = t.id
    WHERE bc.platform = 'telegram' AND bc.is_active = true
  `;
  
  const botResult = await pool.query(botQuery);
  
  if (botResult.rows.length === 0) {
    throw new AppError('No active Telegram bot found', 404);
  }

  const botConfig = botResult.rows[0];

  // 验证签名（如果配置了secret）
  if (botConfig.webhook_secret && !verifyTelegramSignature(body, signature, botConfig.webhook_secret)) {
    throw new AppError('Invalid signature', 401);
  }

  const update = req.body;
  
  // 处理消息
  if (update.message) {
    const message = update.message;
    
    // 构建标准消息格式
    const messageData = {
      id: uuidv4(),
      externalId: message.message_id.toString(),
      platform: 'telegram',
      messageType: message.text ? 'text' : 
                  message.photo ? 'image' :
                  message.audio ? 'audio' :
                  message.video ? 'video' :
                  message.document ? 'document' :
                  message.location ? 'location' :
                  message.contact ? 'contact' : 'text',
      content: message.text || message.caption || '',
      mediaUrl: message.photo ? message.photo[message.photo.length - 1].file_id : 
                message.audio ? message.audio.file_id :
                message.video ? message.video.file_id :
                message.document ? message.document.file_id : null,
      senderId: message.from.id.toString(),
      senderUsername: message.from.username || '',
      senderName: `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim(),
      chatId: message.chat.id.toString(),
      chatTitle: message.chat.title || message.chat.first_name || '',
      chatType: message.chat.type,
      rawData: message,
      receivedAt: new Date().toISOString(),
      tenantId: botConfig.tenant_id,
      botConfigId: botConfig.id
    };

    // 保存消息到数据库
    const insertQuery = `
      INSERT INTO messages (
        id, tenant_id, bot_config_id, external_id, platform, message_type,
        content, media_url, sender_id, sender_username, sender_name,
        chat_id, chat_title, chat_type, raw_data, received_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
    `;

    await pool.query(insertQuery, [
      messageData.id, messageData.tenantId, messageData.botConfigId,
      messageData.externalId, messageData.platform, messageData.messageType,
      messageData.content, messageData.mediaUrl, messageData.senderId,
      messageData.senderUsername, messageData.senderName, messageData.chatId,
      messageData.chatTitle, messageData.chatType, messageData.rawData,
      messageData.receivedAt
    ]);

    // 发送到消息处理服务
    await processMessage(messageData, botConfig);

    logger.info('Telegram message processed', {
      messageId: messageData.id,
      tenantId: botConfig.tenant_id,
      chatId: messageData.chatId,
      messageType: messageData.messageType
    });
  }

  res.json({ status: 'ok' });
}));

/**
 * @swagger
 * /api/webhooks/whatsapp:
 *   post:
 *     summary: WhatsApp webhook endpoint
 *     tags: [Webhooks]
 *     parameters:
 *       - in: header
 *         name: X-Hub-Signature-256
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post('/whatsapp', asyncHandler(async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const body = JSON.stringify(req.body);

  // 获取bot配置
  const botQuery = `
    SELECT bc.*, t.name as tenant_name
    FROM bot_configs bc
    JOIN tenants t ON bc.tenant_id = t.id
    WHERE bc.platform = 'whatsapp' AND bc.is_active = true
  `;
  
  const botResult = await pool.query(botQuery);
  
  if (botResult.rows.length === 0) {
    throw new AppError('No active WhatsApp bot found', 404);
  }

  const botConfig = botResult.rows[0];

  // 验证签名
  if (botConfig.webhook_secret && !verifyWhatsAppSignature(body, signature, botConfig.webhook_secret)) {
    throw new AppError('Invalid signature', 401);
  }

  const webhook = req.body;
  
  // 处理消息
  if (webhook.entry) {
    for (const entry of webhook.entry) {
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.value && change.value.messages) {
            for (const message of change.value.messages) {
              // 构建标准消息格式
              const messageData = {
                id: uuidv4(),
                externalId: message.id,
                platform: 'whatsapp',
                messageType: message.type || 'text',
                content: message.text ? message.text.body : '',
                mediaUrl: message.image ? message.image.id : 
                         message.audio ? message.audio.id :
                         message.video ? message.video.id :
                         message.document ? message.document.id : null,
                senderId: message.from,
                senderUsername: '',
                senderName: change.value.contacts ? change.value.contacts[0]?.profile?.name || '' : '',
                chatId: message.from,
                chatTitle: '',
                chatType: 'private',
                rawData: message,
                receivedAt: new Date().toISOString(),
                tenantId: botConfig.tenant_id,
                botConfigId: botConfig.id
              };

              // 保存消息到数据库
              const insertQuery = `
                INSERT INTO messages (
                  id, tenant_id, bot_config_id, external_id, platform, message_type,
                  content, media_url, sender_id, sender_username, sender_name,
                  chat_id, chat_title, chat_type, raw_data, received_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
                )
              `;

              await pool.query(insertQuery, [
                messageData.id, messageData.tenantId, messageData.botConfigId,
                messageData.externalId, messageData.platform, messageData.messageType,
                messageData.content, messageData.mediaUrl, messageData.senderId,
                messageData.senderUsername, messageData.senderName, messageData.chatId,
                messageData.chatTitle, messageData.chatType, messageData.rawData,
                messageData.receivedAt
              ]);

              // 发送到消息处理服务
              await processMessage(messageData, botConfig);

              logger.info('WhatsApp message processed', {
                messageId: messageData.id,
                tenantId: botConfig.tenant_id,
                chatId: messageData.chatId,
                messageType: messageData.messageType
              });
            }
          }
        }
      }
    }
  }

  res.json({ status: 'ok' });
}));

/**
 * @swagger
 * /api/webhooks/whatsapp:
 *   get:
 *     summary: WhatsApp webhook verification
 *     tags: [Webhooks]
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.verify_token
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.challenge
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification successful
 *       403:
 *         description: Invalid verification token
 */
router.get('/whatsapp', asyncHandler(async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe') {
    // 获取bot配置
    const botQuery = `
      SELECT bc.*
      FROM bot_configs bc
      WHERE bc.platform = 'whatsapp' AND bc.is_active = true
    `;
    
    const botResult = await pool.query(botQuery);
    
    if (botResult.rows.length === 0) {
      throw new AppError('No active WhatsApp bot found', 404);
    }

    const botConfig = botResult.rows[0];

    // 验证token
    if (token === botConfig.webhook_secret) {
      res.status(200).send(challenge);
    } else {
      throw new AppError('Invalid verification token', 403);
    }
  } else {
    throw new AppError('Invalid mode', 400);
  }
}));

/**
 * @swagger
 * /api/webhooks/slack:
 *   post:
 *     summary: Slack webhook endpoint
 *     tags: [Webhooks]
 *     parameters:
 *       - in: header
 *         name: X-Slack-Signature
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Slack-Request-Timestamp
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post('/slack', asyncHandler(async (req, res) => {
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const body = JSON.stringify(req.body);

  // 获取bot配置
  const botQuery = `
    SELECT bc.*, t.name as tenant_name
    FROM bot_configs bc
    JOIN tenants t ON bc.tenant_id = t.id
    WHERE bc.platform = 'slack' AND bc.is_active = true
  `;
  
  const botResult = await pool.query(botQuery);
  
  if (botResult.rows.length === 0) {
    throw new AppError('No active Slack bot found', 404);
  }

  const botConfig = botResult.rows[0];

  // 验证签名
  if (botConfig.webhook_secret && !verifySlackSignature(body, timestamp, signature, botConfig.webhook_secret)) {
    throw new AppError('Invalid signature', 401);
  }

  const event = req.body;
  
  // 处理URL验证
  if (event.type === 'url_verification') {
    return res.json({ challenge: event.challenge });
  }

  // 处理消息事件
  if (event.type === 'event_callback' && event.event) {
    const message = event.event;
    
    if (message.type === 'message' && !message.subtype) {
      // 构建标准消息格式
      const messageData = {
        id: uuidv4(),
        externalId: message.ts,
        platform: 'slack',
        messageType: 'text',
        content: message.text || '',
        mediaUrl: null,
        senderId: message.user,
        senderUsername: '',
        senderName: '',
        chatId: message.channel,
        chatTitle: '',
        chatType: message.channel_type || 'channel',
        rawData: message,
        receivedAt: new Date().toISOString(),
        tenantId: botConfig.tenant_id,
        botConfigId: botConfig.id
      };

      // 保存消息到数据库
      const insertQuery = `
        INSERT INTO messages (
          id, tenant_id, bot_config_id, external_id, platform, message_type,
          content, media_url, sender_id, sender_username, sender_name,
          chat_id, chat_title, chat_type, raw_data, received_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
      `;

      await pool.query(insertQuery, [
        messageData.id, messageData.tenantId, messageData.botConfigId,
        messageData.externalId, messageData.platform, messageData.messageType,
        messageData.content, messageData.mediaUrl, messageData.senderId,
        messageData.senderUsername, messageData.senderName, messageData.chatId,
        messageData.chatTitle, messageData.chatType, messageData.rawData,
        messageData.receivedAt
      ]);

      // 发送到消息处理服务
      await processMessage(messageData, botConfig);

      logger.info('Slack message processed', {
        messageId: messageData.id,
        tenantId: botConfig.tenant_id,
        chatId: messageData.chatId,
        messageType: messageData.messageType
      });
    }
  }

  res.json({ status: 'ok' });
}));

/**
 * @swagger
 * /api/webhooks/discord:
 *   post:
 *     summary: Discord webhook endpoint
 *     tags: [Webhooks]
 *     parameters:
 *       - in: header
 *         name: X-Signature-Ed25519
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Signature-Timestamp
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post('/discord', asyncHandler(async (req, res) => {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const body = JSON.stringify(req.body);

  // 获取bot配置
  const botQuery = `
    SELECT bc.*, t.name as tenant_name
    FROM bot_configs bc
    JOIN tenants t ON bc.tenant_id = t.id
    WHERE bc.platform = 'discord' AND bc.is_active = true
  `;
  
  const botResult = await pool.query(botQuery);
  
  if (botResult.rows.length === 0) {
    throw new AppError('No active Discord bot found', 404);
  }

  const botConfig = botResult.rows[0];

  // 验证签名
  if (botConfig.webhook_secret && !verifyDiscordSignature(body, timestamp, signature, botConfig.webhook_secret)) {
    throw new AppError('Invalid signature', 401);
  }

  const interaction = req.body;
  
  // 处理Ping事件
  if (interaction.type === 1) {
    return res.json({ type: 1 });
  }

  // 处理应用命令
  if (interaction.type === 2) {
    const commandData = {
      id: uuidv4(),
      externalId: interaction.id,
      platform: 'discord',
      messageType: 'command',
      content: `/${interaction.data.name}`,
      mediaUrl: null,
      senderId: interaction.member ? interaction.member.user.id : interaction.user.id,
      senderUsername: interaction.member ? interaction.member.user.username : interaction.user.username,
      senderName: interaction.member ? 
                 `${interaction.member.user.global_name || interaction.member.user.username}` :
                 `${interaction.user.global_name || interaction.user.username}`,
      chatId: interaction.channel_id,
      chatTitle: interaction.guild_id ? 'Guild Channel' : 'DM',
      chatType: interaction.guild_id ? 'guild' : 'dm',
      rawData: interaction,
      receivedAt: new Date().toISOString(),
      tenantId: botConfig.tenant_id,
      botConfigId: botConfig.id
    };

    // 保存命令到数据库
    const insertQuery = `
      INSERT INTO messages (
        id, tenant_id, bot_config_id, external_id, platform, message_type,
        content, media_url, sender_id, sender_username, sender_name,
        chat_id, chat_title, chat_type, raw_data, received_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
    `;

    await pool.query(insertQuery, [
      commandData.id, commandData.tenantId, commandData.botConfigId,
      commandData.externalId, commandData.platform, commandData.messageType,
      commandData.content, commandData.mediaUrl, commandData.senderId,
      commandData.senderUsername, commandData.senderName, commandData.chatId,
      commandData.chatTitle, commandData.chatType, commandData.rawData,
      commandData.receivedAt
    ]);

    // 发送到消息处理服务
    await processMessage(commandData, botConfig);

    logger.info('Discord command processed', {
      messageId: commandData.id,
      tenantId: botConfig.tenant_id,
      chatId: commandData.chatId,
      command: interaction.data.name
    });

    // 返回确认响应
    return res.json({
      type: 4,
      data: {
        content: '命令已接收并处理',
        flags: 64 // 仅对用户可见
      }
    });
  }

  // 处理消息组件交互（按钮点击等）
  if (interaction.type === 3) {
    const interactionData = {
      id: uuidv4(),
      externalId: interaction.id,
      platform: 'discord',
      messageType: 'interaction',
      content: `interaction:${interaction.data.custom_id}`,
      mediaUrl: null,
      senderId: interaction.member ? interaction.member.user.id : interaction.user.id,
      senderUsername: interaction.member ? interaction.member.user.username : interaction.user.username,
      senderName: interaction.member ? 
                 `${interaction.member.user.global_name || interaction.member.user.username}` :
                 `${interaction.user.global_name || interaction.user.username}`,
      chatId: interaction.channel_id,
      chatTitle: interaction.guild_id ? 'Guild Channel' : 'DM',
      chatType: interaction.guild_id ? 'guild' : 'dm',
      rawData: interaction,
      receivedAt: new Date().toISOString(),
      tenantId: botConfig.tenant_id,
      botConfigId: botConfig.id
    };

    // 保存交互到数据库
    const insertQuery = `
      INSERT INTO messages (
        id, tenant_id, bot_config_id, external_id, platform, message_type,
        content, media_url, sender_id, sender_username, sender_name,
        chat_id, chat_title, chat_type, raw_data, received_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
    `;

    await pool.query(insertQuery, [
      interactionData.id, interactionData.tenantId, interactionData.botConfigId,
      interactionData.externalId, interactionData.platform, interactionData.messageType,
      interactionData.content, interactionData.mediaUrl, interactionData.senderId,
      interactionData.senderUsername, interactionData.senderName, interactionData.chatId,
      interactionData.chatTitle, interactionData.chatType, interactionData.rawData,
      interactionData.receivedAt
    ]);

    // 发送到消息处理服务
    await processMessage(interactionData, botConfig);

    logger.info('Discord interaction processed', {
      messageId: interactionData.id,
      tenantId: botConfig.tenant_id,
      chatId: interactionData.chatId,
      customId: interaction.data.custom_id
    });

    // 返回确认响应
    return res.json({
      type: 4,
      data: {
        content: '交互已处理',
        flags: 64 // 仅对用户可见
      }
    });
  }

  res.json({ status: 'ok' });
}));

/**
 * @swagger
 * /api/webhooks/line:
 *   post:
 *     summary: Line webhook endpoint
 *     tags: [Webhooks]
 *     parameters:
 *       - in: header
 *         name: X-Line-Signature
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post('/line', asyncHandler(async (req, res) => {
  const signature = req.headers['x-line-signature'];
  const body = JSON.stringify(req.body);

  // 获取bot配置
  const botQuery = `
    SELECT bc.*, t.name as tenant_name
    FROM bot_configs bc
    JOIN tenants t ON bc.tenant_id = t.id
    WHERE bc.platform = 'line' AND bc.is_active = true
  `;
  
  const botResult = await pool.query(botQuery);
  
  if (botResult.rows.length === 0) {
    throw new AppError('No active Line bot found', 404);
  }

  const botConfig = botResult.rows[0];

  // 验证签名
  if (botConfig.webhook_secret && !verifyLineSignature(body, signature, botConfig.webhook_secret)) {
    throw new AppError('Invalid signature', 401);
  }

  const webhook = req.body;
  
  // 处理Line事件
  if (webhook.events) {
    for (const event of webhook.events) {
      if (event.type === 'message') {
        const message = event.message;
        
        // 构建标准消息格式
        const messageData = {
          id: uuidv4(),
          externalId: message.id,
          platform: 'line',
          messageType: message.type || 'text',
          content: message.text || message.fileName || '',
          mediaUrl: message.id && message.type !== 'text' ? message.id : null,
          senderId: event.source.userId,
          senderUsername: '',
          senderName: '',
          chatId: event.source.userId || event.source.groupId || event.source.roomId,
          chatTitle: event.source.type === 'group' ? 'Group' : 
                    event.source.type === 'room' ? 'Room' : 'Private',
          chatType: event.source.type,
          rawData: event,
          receivedAt: new Date().toISOString(),
          tenantId: botConfig.tenant_id,
          botConfigId: botConfig.id
        };

        // 保存消息到数据库
        const insertQuery = `
          INSERT INTO messages (
            id, tenant_id, bot_config_id, external_id, platform, message_type,
            content, media_url, sender_id, sender_username, sender_name,
            chat_id, chat_title, chat_type, raw_data, received_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
          )
        `;

        await pool.query(insertQuery, [
          messageData.id, messageData.tenantId, messageData.botConfigId,
          messageData.externalId, messageData.platform, messageData.messageType,
          messageData.content, messageData.mediaUrl, messageData.senderId,
          messageData.senderUsername, messageData.senderName, messageData.chatId,
          messageData.chatTitle, messageData.chatType, messageData.rawData,
          messageData.receivedAt
        ]);

        // 发送到消息处理服务
        await processMessage(messageData, botConfig);

        logger.info('Line message processed', {
          messageId: messageData.id,
          tenantId: botConfig.tenant_id,
          chatId: messageData.chatId,
          messageType: messageData.messageType
        });
      }
    }
  }

  res.json({ status: 'ok' });
}));

/**
 * @swagger
 * /api/webhooks/wework:
 *   post:
 *     summary: WeWork webhook endpoint
 *     tags: [Webhooks]
 *     parameters:
 *       - in: query
 *         name: msg_signature
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: timestamp
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: nonce
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post('/wework', asyncHandler(async (req, res) => {
  const { msg_signature, timestamp, nonce } = req.query;
  const body = JSON.stringify(req.body);

  // 获取bot配置
  const botQuery = `
    SELECT bc.*, t.name as tenant_name
    FROM bot_configs bc
    JOIN tenants t ON bc.tenant_id = t.id
    WHERE bc.platform = 'wework' AND bc.is_active = true
  `;
  
  const botResult = await pool.query(botQuery);
  
  if (botResult.rows.length === 0) {
    throw new AppError('No active WeWork bot found', 404);
  }

  const botConfig = botResult.rows[0];

  // 验证签名
  if (botConfig.webhook_secret && !verifyWeWorkSignature(timestamp, nonce, msg_signature, botConfig.webhook_secret)) {
    throw new AppError('Invalid signature', 401);
  }

  const messageData = req.body;
  
  // 处理企业微信消息
  if (messageData.MsgType) {
    // 构建标准消息格式
    const standardMessage = {
      id: uuidv4(),
      externalId: messageData.MsgId || Date.now().toString(),
      platform: 'wework',
      messageType: messageData.MsgType,
      content: messageData.Content || messageData.Recognition || messageData.Label || '',
      mediaUrl: messageData.MediaId || messageData.PicUrl || null,
      senderId: messageData.FromUserName,
      senderUsername: '',
      senderName: '',
      chatId: messageData.FromUserName,
      chatTitle: messageData.ToUserName,
      chatType: 'private',
      rawData: messageData,
      receivedAt: new Date().toISOString(),
      tenantId: botConfig.tenant_id,
      botConfigId: botConfig.id
    };

    // 保存消息到数据库
    const insertQuery = `
      INSERT INTO messages (
        id, tenant_id, bot_config_id, external_id, platform, message_type,
        content, media_url, sender_id, sender_username, sender_name,
        chat_id, chat_title, chat_type, raw_data, received_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
    `;

    await pool.query(insertQuery, [
      standardMessage.id, standardMessage.tenantId, standardMessage.botConfigId,
      standardMessage.externalId, standardMessage.platform, standardMessage.messageType,
      standardMessage.content, standardMessage.mediaUrl, standardMessage.senderId,
      standardMessage.senderUsername, standardMessage.senderName, standardMessage.chatId,
      standardMessage.chatTitle, standardMessage.chatType, standardMessage.rawData,
      standardMessage.receivedAt
    ]);

    // 发送到消息处理服务
    await processMessage(standardMessage, botConfig);

    logger.info('WeWork message processed', {
      messageId: standardMessage.id,
      tenantId: botConfig.tenant_id,
      chatId: standardMessage.chatId,
      messageType: standardMessage.messageType
    });
  }

  res.json({ status: 'ok' });
}));

/**
 * @swagger
 * /api/webhooks/wework:
 *   get:
 *     summary: WeWork webhook verification
 *     tags: [Webhooks]
 *     parameters:
 *       - in: query
 *         name: msg_signature
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: timestamp
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: nonce
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: echostr
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification successful
 *       403:
 *         description: Invalid verification
 */
router.get('/wework', asyncHandler(async (req, res) => {
  const { msg_signature, timestamp, nonce, echostr } = req.query;

  // 获取bot配置
  const botQuery = `
    SELECT bc.*
    FROM bot_configs bc
    WHERE bc.platform = 'wework' AND bc.is_active = true
  `;
  
  const botResult = await pool.query(botQuery);
  
  if (botResult.rows.length === 0) {
    throw new AppError('No active WeWork bot found', 404);
  }

  const botConfig = botResult.rows[0];

  // 验证签名
  if (verifyWeWorkSignature(timestamp, nonce, msg_signature, botConfig.webhook_secret)) {
    res.status(200).send(echostr);
  } else {
    throw new AppError('Invalid verification', 403);
  }
}));

/**
 * @swagger
 * /api/webhooks/intercom:
 *   post:
 *     summary: Intercom webhook endpoint
 *     tags: [Webhooks]
 *     parameters:
 *       - in: header
 *         name: X-Hub-Signature-256
 *         required: false
 *         schema:
 *           type: string
 *         description: Webhook signature for verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 *       500:
 *         description: Processing error
 */
router.post('/intercom', asyncHandler(async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const timestamp = req.headers['x-timestamp'] || Date.now();
  const body = JSON.stringify(req.body);

  // 获取bot配置
  const botQuery = `
    SELECT bc.*, t.name as tenant_name
    FROM bot_configs bc
    JOIN tenants t ON bc.tenant_id = t.id
    WHERE bc.platform = 'intercom' AND bc.is_active = true
  `;
  
  const botResult = await pool.query(botQuery);
  
  if (botResult.rows.length === 0) {
    throw new AppError('No active Intercom bot found', 404);
  }

  const botConfig = botResult.rows[0];
  const webhook = req.body;

  logger.info('Received Intercom webhook', {
    tenantId: botConfig.tenant_id,
    topic: webhook.topic,
    type: webhook.data?.type,
    conversationId: webhook.data?.item?.id
  });

  // 验证webhook（如果配置了secret）
  if (botConfig.webhook_secret && signature) {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', botConfig.webhook_secret)
      .update(body)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      throw new AppError('Invalid signature', 401);
    }
  }

  try {
    // 处理不同类型的webhook事件
    const eventType = webhook.topic;
    const eventData = webhook.data;

    let messageData = null;

    switch (eventType) {
      case 'conversation.user.created':
      case 'conversation.user.replied':
        messageData = await processIntercomConversationMessage(eventData, botConfig);
        break;

      case 'conversation.admin.replied':
        // 管理员回复，可以选择是否处理
        if (botConfig.process_admin_replies) {
          messageData = await processIntercomAdminMessage(eventData, botConfig);
        }
        break;

      case 'conversation.admin.assigned':
        await processIntercomAssignment(eventData, botConfig);
        break;

      case 'conversation.admin.closed':
        await processIntercomClose(eventData, botConfig);
        break;

      case 'contact.created':
      case 'contact.signed_up':
        await processIntercomContact(eventData, botConfig);
        break;

      default:
        logger.debug('Unhandled Intercom webhook event', {
          topic: eventType,
          tenantId: botConfig.tenant_id
        });
    }

    // 如果有消息数据，发送到消息处理器
    if (messageData) {
      await processMessage(messageData, botConfig);
    }

    res.json({ status: 'ok', processed: !!messageData });

  } catch (error) {
    logger.error('Intercom webhook processing failed', {
      tenantId: botConfig.tenant_id,
      error: error.message,
      topic: webhook.topic
    });

    res.status(500).json({
      status: 'error', 
      error: error.message
    });
  }
}));

// 处理Intercom对话消息
async function processIntercomConversationMessage(eventData, botConfig) {
  const conversation = eventData.item;
  const messageSource = conversation.source;

  if (!messageSource || !messageSource.body) {
    return null; // 没有消息内容
  }

  const messageData = {
    id: uuidv4(),
    externalId: conversation.id,
    platform: 'intercom',
    messageType: messageSource.type || 'conversation',
    content: messageSource.body.replace(/<[^>]*>/g, ''), // 去除HTML标签
    htmlContent: messageSource.body,
    mediaUrl: null,
    senderId: messageSource.author?.id || 'unknown',
    senderUsername: messageSource.author?.email || '',
    senderName: messageSource.author?.name || '',
    chatId: conversation.id,
    chatTitle: conversation.title || '',
    chatType: 'conversation',
    rawData: conversation,
    receivedAt: new Date().toISOString(),
    tenantId: botConfig.tenant_id,
    botConfigId: botConfig.id,
    
    // Intercom特有字段
    intercom: {
      conversationId: conversation.id,
      state: conversation.state,
      priority: conversation.priority,
      assigneeId: conversation.admin_assignee_id,
      teamId: conversation.team_assignee_id,
      tags: conversation.tags?.tags?.map(tag => tag.name) || [],
      contacts: conversation.contacts?.contacts || [],
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      waitingSince: conversation.waiting_since,
      open: conversation.open,
      read: conversation.read
    }
  };

  // 处理附件
  if (messageSource.attachments && messageSource.attachments.length > 0) {
    const firstAttachment = messageSource.attachments[0];
    if (firstAttachment.type === 'upload') {
      messageData.mediaUrl = firstAttachment.url;
      messageData.messageType = 'file';
    }
  }

  // 保存消息到数据库
  const insertQuery = `
    INSERT INTO messages (
      id, tenant_id, bot_config_id, external_id, platform, message_type,
      content, media_url, sender_id, sender_username, sender_name,
      chat_id, chat_title, chat_type, raw_data, received_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    )
  `;

  await pool.query(insertQuery, [
    messageData.id, messageData.tenantId, messageData.botConfigId,
    messageData.externalId, messageData.platform, messageData.messageType,
    messageData.content, messageData.mediaUrl, messageData.senderId,
    messageData.senderUsername, messageData.senderName, messageData.chatId,
    messageData.chatTitle, messageData.chatType, messageData.rawData,
    messageData.receivedAt
  ]);

  logger.info('Intercom conversation message processed', {
    messageId: messageData.id,
    tenantId: botConfig.tenant_id,
    conversationId: conversation.id,
    messageType: messageData.messageType
  });

  return messageData;
}

// 处理Intercom管理员消息
async function processIntercomAdminMessage(eventData, botConfig) {
  const conversation = eventData.item;
  const messageSource = conversation.source;

  if (!messageSource || !messageSource.body) {
    return null;
  }

  const messageData = {
    id: uuidv4(),
    externalId: `${conversation.id}_admin`,
    platform: 'intercom',
    messageType: 'admin_reply',
    content: messageSource.body.replace(/<[^>]*>/g, ''),
    htmlContent: messageSource.body,
    senderId: messageSource.author?.id || 'admin',
    senderUsername: messageSource.author?.email || '',
    senderName: messageSource.author?.name || 'Admin',
    chatId: conversation.id,
    chatTitle: conversation.title || '',
    chatType: 'conversation',
    rawData: conversation,
    receivedAt: new Date().toISOString(),
    tenantId: botConfig.tenant_id,
    botConfigId: botConfig.id,
    isFromAdmin: true
  };

  logger.info('Intercom admin message processed', {
    messageId: messageData.id,
    tenantId: botConfig.tenant_id,
    conversationId: conversation.id,
    adminId: messageSource.author?.id
  });

  return messageData;
}

// 处理Intercom分配事件
async function processIntercomAssignment(eventData, botConfig) {
  const conversation = eventData.item;
  
  logger.info('Intercom conversation assigned', {
    tenantId: botConfig.tenant_id,
    conversationId: conversation.id,
    adminId: conversation.admin_assignee_id,
    teamId: conversation.team_assignee_id
  });

  // 可以在这里触发自动化工作流或通知
  // 例如：通知被分配的管理员
}

// 处理Intercom关闭事件
async function processIntercomClose(eventData, botConfig) {
  const conversation = eventData.item;
  
  logger.info('Intercom conversation closed', {
    tenantId: botConfig.tenant_id,
    conversationId: conversation.id,
    closedBy: eventData.initiator
  });

  // 可以在这里触发关闭后的工作流
  // 例如：发送满意度调查
}

// 处理Intercom联系人事件
async function processIntercomContact(eventData, botConfig) {
  const contact = eventData.item;
  
  logger.info('Intercom contact event', {
    tenantId: botConfig.tenant_id,
    contactId: contact.id,
    email: contact.email,
    eventType: eventData.type
  });

  // 可以在这里同步联系人信息到CRM或其他系统
}

module.exports = router; 