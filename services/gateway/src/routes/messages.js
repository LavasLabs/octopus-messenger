const express = require('express');
const router = express.Router();
const MessageController = require('../controllers/MessageController');
const { validate } = require('../middleware/validator');
const { body, param, query } = require('express-validator');

// 消息验证规则
const messageValidation = {
  process: [
    body('platform').isIn(['telegram', 'discord', 'slack', 'whatsapp']),
    body('content').notEmpty().isLength({ max: 4000 }),
    body('channelId').notEmpty(),
    body('fromUserId').notEmpty(),
    body('messageId').notEmpty()
  ],
  get: [
    param('messageId').isUUID()
  ],
  list: [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('platform').optional().isIn(['telegram', 'discord', 'slack', 'whatsapp']),
    query('search').optional().isLength({ max: 100 }).trim(),
    query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ],
  bulkProcess: [
    body('messageIds').isArray().custom((arr) => {
      return arr.every(id => typeof id === 'string' && id.length > 0);
    }),
    body('action').isIn(['reprocess', 'delete', 'mark_completed'])
  ]
};

/**
 * @swagger
 * /api/messages:
 *   get:
 *     summary: 获取消息列表
 *     tags: [Messages]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: 每页数量
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *           enum: [telegram, discord, slack, whatsapp]
 *         description: 平台类型
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *         description: 处理状态
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 开始日期
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 结束日期
 *     responses:
 *       200:
 *         description: 成功获取消息列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: 服务器错误
 */
router.get('/', messageValidation.list, validate, MessageController.getMessages);

/**
 * @swagger
 * /api/messages/{messageId}:
 *   get:
 *     summary: 获取消息详情
 *     tags: [Messages]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 消息ID
 *     responses:
 *       200:
 *         description: 成功获取消息详情
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *       404:
 *         description: 消息不存在
 *       500:
 *         description: 服务器错误
 */
router.get('/:messageId', messageValidation.get, validate, MessageController.getMessageById);

/**
 * @swagger
 * /api/messages/process:
 *   post:
 *     summary: 处理消息
 *     tags: [Messages]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - platform
 *               - content
 *               - channelId
 *               - fromUserId
 *               - messageId
 *             properties:
 *               platform:
 *                 type: string
 *                 enum: [telegram, discord, slack, whatsapp]
 *               content:
 *                 type: string
 *                 maxLength: 4000
 *               channelId:
 *                 type: string
 *               fromUserId:
 *                 type: string
 *               messageId:
 *                 type: string
 *               metadata:
 *                 type: object
 *                 description: 平台特定的元数据
 *     responses:
 *       201:
 *         description: 消息处理成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *                 taskId:
 *                   type: string
 *                   description: 创建的任务ID
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 服务器错误
 */
router.post('/process', messageValidation.process, validate, MessageController.processMessage);

/**
 * @swagger
 * /api/messages/{messageId}/reprocess:
 *   post:
 *     summary: 重新处理消息
 *     tags: [Messages]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 消息ID
 *     responses:
 *       200:
 *         description: 重新处理成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *                 taskId:
 *                   type: string
 *                   description: 创建的任务ID
 *       404:
 *         description: 消息不存在
 *       500:
 *         description: 服务器错误
 */
router.post('/:messageId/reprocess', messageValidation.get, validate, MessageController.reprocessMessage);

/**
 * @swagger
 * /api/messages/stats:
 *   get:
 *     summary: 获取消息统计信息
 *     tags: [Messages]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [1d, 7d, 30d, 90d]
 *           default: 7d
 *         description: 统计时间段
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *           enum: [telegram, discord, slack, whatsapp]
 *         description: 平台类型
 *     responses:
 *       200:
 *         description: 成功获取消息统计信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     processed:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     byPlatform:
 *                       type: object
 *                     byDay:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           count:
 *                             type: integer
 *       500:
 *         description: 服务器错误
 */
router.get('/stats', MessageController.getMessageStats);

/**
 * @swagger
 * /api/messages/bulk:
 *   post:
 *     summary: 批量处理消息
 *     tags: [Messages]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageIds
 *               - action
 *             properties:
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 消息ID数组
 *               action:
 *                 type: string
 *                 enum: [reprocess, delete, mark_completed]
 *                 description: 批量操作类型
 *     responses:
 *       200:
 *         description: 批量处理成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 results:
 *                   type: object
 *                   properties:
 *                     processed:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           messageId:
 *                             type: string
 *                           success:
 *                             type: boolean
 *                           error:
 *                             type: string
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 服务器错误
 */
router.post('/bulk', messageValidation.bulkProcess, validate, MessageController.bulkProcessMessages);

module.exports = router; 