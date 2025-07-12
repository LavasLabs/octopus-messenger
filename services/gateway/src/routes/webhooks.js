const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const config = require('../../../../config/config');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { authenticateApiKey } = require('../middleware/auth');
const { logger } = require('../utils/logger');

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

// 处理消息的通用函数
const processMessage = async (messageData, botConfig) => {
  try {
    // 发送消息到消息处理服务
    const messageProcessorUrl = `http://localhost:${config.services.messageProcessor.port}/process`;
    
    const response = await axios.post(messageProcessorUrl, {
      message: messageData,
      botConfig: botConfig
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': botConfig.tenant_id
      }
    });

    logger.info('Message sent to processor', {
      messageId: messageData.id,
      tenantId: botConfig.tenant_id,
      platform: messageData.platform,
      response: response.status
    });

    return response.data;
  } catch (error) {
    logger.error('Error processing message', {
      messageId: messageData.id,
      tenantId: botConfig.tenant_id,
      error: error.message
    });
    throw error;
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

module.exports = router; 