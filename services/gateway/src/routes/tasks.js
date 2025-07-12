const express = require('express');
const router = express.Router();
const TaskController = require('../controllers/TaskController');
const { validate } = require('../middleware/validator');
const { body, param, query } = require('express-validator');

// 任务验证规则
const taskValidation = {
  create: [
    body('title').notEmpty().isLength({ min: 1, max: 200 }),
    body('description').optional().isLength({ max: 2000 }),
    body('category').optional().isIn(['complaint', 'inquiry', 'support', 'feedback', 'other']),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    body('messageId').optional().isUUID(),
    body('classificationId').optional().isUUID()
  ],
  update: [
    param('taskId').isUUID(),
    body('title').optional().isLength({ min: 1, max: 200 }),
    body('description').optional().isLength({ max: 2000 }),
    body('status').optional().isIn(['pending', 'in_progress', 'completed', 'cancelled']),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    body('assignedTo').optional().isUUID()
  ],
  get: [
    param('taskId').isUUID()
  ],
  list: [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['pending', 'in_progress', 'completed', 'cancelled']),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    query('category').optional().isIn(['complaint', 'inquiry', 'support', 'feedback', 'other']),
    query('assignedTo').optional().isUUID(),
    query('search').optional().isLength({ max: 100 }).trim()
  ],
  sync: [
    param('taskId').isUUID(),
    body('integrationIds').optional().isArray(),
    body('strategy').optional().isIn(['create_new', 'update_existing', 'sync_all'])
  ],
  bulkOperate: [
    body('taskIds').isArray().custom((arr) => {
      return arr.every(id => typeof id === 'string' && id.length > 0);
    }),
    body('action').isIn(['complete', 'cancel', 'assign', 'sync', 'delete']),
    body('data').optional().isObject()
  ]
};

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: 获取任务列表
 *     tags: [Tasks]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, completed, cancelled]
 *         description: 任务状态
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: 优先级
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [complaint, inquiry, support, feedback, other]
 *         description: 任务分类
 *       - in: query
 *         name: assignedTo
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 分配给用户ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *     responses:
 *       200:
 *         description: 成功获取任务列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tasks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Task'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: 服务器错误
 */
router.get('/', taskValidation.list, validate, TaskController.getTasks);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   get:
 *     summary: 获取任务详情
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 任务ID
 *     responses:
 *       200:
 *         description: 成功获取任务详情
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 task:
 *                   $ref: '#/components/schemas/Task'
 *       404:
 *         description: 任务不存在
 *       500:
 *         description: 服务器错误
 */
router.get('/:taskId', taskValidation.get, validate, TaskController.getTaskById);

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: 创建任务
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 maxLength: 2000
 *               category:
 *                 type: string
 *                 enum: [complaint, inquiry, support, feedback, other]
 *                 default: other
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: medium
 *               messageId:
 *                 type: string
 *                 format: uuid
 *                 description: 关联的消息ID
 *               classificationId:
 *                 type: string
 *                 format: uuid
 *                 description: 关联的分类ID
 *     responses:
 *       201:
 *         description: 任务创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 task:
 *                   $ref: '#/components/schemas/Task'
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 服务器错误
 */
router.post('/', taskValidation.create, validate, TaskController.createTask);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   put:
 *     summary: 更新任务
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 任务ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 maxLength: 2000
 *               status:
 *                 type: string
 *                 enum: [pending, in_progress, completed, cancelled]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               assignedTo:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: 任务更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 task:
 *                   $ref: '#/components/schemas/Task'
 *       400:
 *         description: 请求参数错误
 *       404:
 *         description: 任务不存在
 *       500:
 *         description: 服务器错误
 */
router.put('/:taskId', taskValidation.update, validate, TaskController.updateTask);

/**
 * @swagger
 * /api/tasks/{taskId}/sync:
 *   post:
 *     summary: 同步任务到CRM
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 任务ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               integrationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 要同步的CRM集成ID列表
 *               strategy:
 *                 type: string
 *                 enum: [create_new, update_existing, sync_all]
 *                 default: create_new
 *                 description: 同步策略
 *     responses:
 *       200:
 *         description: 同步成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 syncResult:
 *                   type: object
 *                   properties:
 *                     successful:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           integrationId:
 *                             type: string
 *                           success:
 *                             type: boolean
 *                           externalId:
 *                             type: string
 *                           error:
 *                             type: string
 *       404:
 *         description: 任务不存在
 *       500:
 *         description: 服务器错误
 */
router.post('/:taskId/sync', taskValidation.sync, validate, TaskController.syncTaskToCRM);

/**
 * @swagger
 * /api/tasks/stats:
 *   get:
 *     summary: 获取任务统计信息
 *     tags: [Tasks]
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
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [status, priority, category, assignedTo]
 *           default: status
 *         description: 分组方式
 *     responses:
 *       200:
 *         description: 成功获取任务统计信息
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
 *                     completed:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     inProgress:
 *                       type: integer
 *                     cancelled:
 *                       type: integer
 *                     byGroup:
 *                       type: object
 *                     trends:
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
router.get('/stats', TaskController.getTaskStats);

/**
 * @swagger
 * /api/tasks/bulk:
 *   post:
 *     summary: 批量操作任务
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskIds
 *               - action
 *             properties:
 *               taskIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 任务ID数组
 *               action:
 *                 type: string
 *                 enum: [complete, cancel, assign, sync, delete]
 *                 description: 批量操作类型
 *               data:
 *                 type: object
 *                 description: 操作相关数据
 *     responses:
 *       200:
 *         description: 批量操作成功
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
 *                           taskId:
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
router.post('/bulk', taskValidation.bulkOperate, validate, TaskController.bulkOperateTasks);

/**
 * @swagger
 * /api/tasks/integrations:
 *   get:
 *     summary: 获取CRM集成状态
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取CRM集成状态
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 integrations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [active, inactive, error]
 *                       lastSync:
 *                         type: string
 *                         format: date-time
 *                       syncCount:
 *                         type: integer
 *       500:
 *         description: 服务器错误
 */
router.get('/integrations', TaskController.getCRMIntegrations);

module.exports = router; 