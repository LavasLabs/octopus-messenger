const express = require('express');
const router = express.Router();
const UserController = require('../controllers/UserController');
const { validate } = require('../middleware/validator');
const { body, param, query } = require('express-validator');

// 用户验证规则
const userValidation = {
  create: [
    body('email').isEmail().normalizeEmail(),
    body('username').isLength({ min: 3, max: 50 }).trim(),
    body('password').isLength({ min: 8 }),
    body('displayName').optional().isLength({ max: 100 }).trim(),
    body('role').optional().isIn(['admin', 'user', 'viewer'])
  ],
  update: [
    param('userId').isUUID(),
    body('email').optional().isEmail().normalizeEmail(),
    body('username').optional().isLength({ min: 3, max: 50 }).trim(),
    body('displayName').optional().isLength({ max: 100 }).trim(),
    body('role').optional().isIn(['admin', 'user', 'viewer'])
  ],
  get: [
    param('userId').isUUID()
  ],
  list: [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isLength({ max: 100 }).trim(),
    query('role').optional().isIn(['admin', 'user', 'viewer'])
  ]
};

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: 获取用户列表
 *     tags: [Users]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, user, viewer]
 *         description: 用户角色
 *     responses:
 *       200:
 *         description: 成功获取用户列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: 服务器错误
 */
router.get('/', userValidation.list, validate, UserController.getUsers);

/**
 * @swagger
 * /api/users/{userId}:
 *   get:
 *     summary: 获取用户详情
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 用户ID
 *     responses:
 *       200:
 *         description: 成功获取用户详情
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: 用户不存在
 *       500:
 *         description: 服务器错误
 */
router.get('/:userId', userValidation.get, validate, UserController.getUserById);

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: 创建用户
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - username
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *               password:
 *                 type: string
 *                 minLength: 8
 *               displayName:
 *                 type: string
 *                 maxLength: 100
 *               role:
 *                 type: string
 *                 enum: [admin, user, viewer]
 *                 default: user
 *     responses:
 *       201:
 *         description: 用户创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 服务器错误
 */
router.post('/', userValidation.create, validate, UserController.createUser);

/**
 * @swagger
 * /api/users/{userId}:
 *   put:
 *     summary: 更新用户
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 用户ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *               displayName:
 *                 type: string
 *                 maxLength: 100
 *               role:
 *                 type: string
 *                 enum: [admin, user, viewer]
 *     responses:
 *       200:
 *         description: 用户更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: 请求参数错误
 *       404:
 *         description: 用户不存在
 *       500:
 *         description: 服务器错误
 */
router.put('/:userId', userValidation.update, validate, UserController.updateUser);

/**
 * @swagger
 * /api/users/{userId}:
 *   delete:
 *     summary: 删除用户
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 用户ID
 *     responses:
 *       200:
 *         description: 用户删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: 用户不存在
 *       500:
 *         description: 服务器错误
 */
router.delete('/:userId', userValidation.get, validate, UserController.deleteUser);

/**
 * @swagger
 * /api/users/stats:
 *   get:
 *     summary: 获取用户统计信息
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取用户统计信息
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
 *                     active:
 *                       type: integer
 *                     inactive:
 *                       type: integer
 *                     byRole:
 *                       type: object
 *       500:
 *         description: 服务器错误
 */
router.get('/stats', UserController.getUserStats);

module.exports = router; 