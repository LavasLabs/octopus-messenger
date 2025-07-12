const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');

const config = require('../../../../config/config');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
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

// 验证模式
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  fullName: Joi.string().min(2).max(100).required(),
  tenantName: Joi.string().min(2).max(100).required(),
  tenantSlug: Joi.string().alphanum().min(3).max(50).required()
});

// JWT生成函数
const generateToken = (userId, tenantId) => {
  return jwt.sign(
    { userId, tenantId },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 用户登录
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *       400:
 *         description: 验证错误
 *       401:
 *         description: 认证失败
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { error } = loginSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  const { email, password } = req.body;

  // 查找用户
  const userQuery = `
    SELECT u.*, t.name as tenant_name, t.slug as tenant_slug,
           t.subscription_status, t.subscription_plan
    FROM users u
    JOIN tenants t ON u.tenant_id = t.id
    WHERE u.email = $1 AND u.is_active = true AND t.deleted_at IS NULL
  `;

  const result = await pool.query(userQuery, [email.toLowerCase()]);

  if (result.rows.length === 0) {
    throw new AppError('Invalid credentials', 401);
  }

  const user = result.rows[0];

  // 验证密码
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new AppError('Invalid credentials', 401);
  }

  // 检查租户状态
  if (user.subscription_status !== 'active') {
    throw new AppError('Account suspended', 403);
  }

  // 生成JWT token
  const token = generateToken(user.id, user.tenant_id);

  // 更新最后登录时间
  await pool.query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.id]
  );

  logger.info('User logged in successfully', {
    userId: user.id,
    tenantId: user.tenant_id,
    email: user.email
  });

  res.json({
    status: 'success',
    message: 'Login successful',
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        permissions: user.permissions,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        tenantSlug: user.tenant_slug,
        subscriptionStatus: user.subscription_status,
        subscriptionPlan: user.subscription_plan
      }
    }
  });
}));

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: 用户注册
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - fullName
 *               - tenantName
 *               - tenantSlug
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 30
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               fullName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               tenantName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               tenantSlug:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *     responses:
 *       201:
 *         description: 注册成功
 *       400:
 *         description: 验证错误
 *       409:
 *         description: 用户或租户已存在
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { error } = registerSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  const { username, email, password, fullName, tenantName, tenantSlug } = req.body;

  // 开始事务
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 检查邮箱是否已存在
    const emailCheck = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (emailCheck.rows.length > 0) {
      throw new AppError('Email already registered', 409);
    }

    // 检查租户slug是否已存在
    const slugCheck = await client.query(
      'SELECT id FROM tenants WHERE slug = $1',
      [tenantSlug.toLowerCase()]
    );

    if (slugCheck.rows.length > 0) {
      throw new AppError('Tenant slug already exists', 409);
    }

    // 创建租户
    const tenantId = uuidv4();
    await client.query(
      `INSERT INTO tenants (id, name, slug, subscription_status, subscription_plan)
       VALUES ($1, $2, $3, 'active', 'basic')`,
      [tenantId, tenantName, tenantSlug.toLowerCase()]
    );

    // 加密密码
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 创建用户
    const userId = uuidv4();
    await client.query(
      `INSERT INTO users (id, tenant_id, username, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5, $6, 'admin')`,
      [userId, tenantId, username, email.toLowerCase(), passwordHash, fullName]
    );

    // 提交事务
    await client.query('COMMIT');

    logger.info('User registered successfully', {
      userId,
      tenantId,
      email: email.toLowerCase(),
      tenantSlug: tenantSlug.toLowerCase()
    });

    res.status(201).json({
      status: 'success',
      message: 'Registration successful',
      data: {
        userId,
        tenantId,
        message: 'Please login with your credentials'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: 用户登出
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: 登出成功
 */
router.post('/logout', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    // 将token加入黑名单（这里简化处理，实际应该用Redis）
    // await redisClient.setex(`blacklist:${token}`, 3600 * 24 * 7, 'true');
  }

  res.json({
    status: 'success',
    message: 'Logout successful'
  });
}));

/**
 * @swagger
 * /api/auth/verify:
 *   get:
 *     summary: 验证token
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Token有效
 *       401:
 *         description: Token无效
 */
router.get('/verify', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw new AppError('Token required', 401);
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // 验证用户是否仍然有效
    const userQuery = `
      SELECT u.*, t.name as tenant_name, t.slug as tenant_slug
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = $1 AND u.is_active = true AND t.deleted_at IS NULL
    `;
    
    const result = await pool.query(userQuery, [decoded.userId]);
    
    if (result.rows.length === 0) {
      throw new AppError('User not found or inactive', 401);
    }

    const user = result.rows[0];

    res.json({
      status: 'success',
      message: 'Token is valid',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          tenantId: user.tenant_id,
          tenantName: user.tenant_name,
          tenantSlug: user.tenant_slug
        }
      }
    });

  } catch (error) {
    throw new AppError('Invalid token', 401);
  }
}));

module.exports = router; 