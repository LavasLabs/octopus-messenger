const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/asyncHandler');
const { authMiddleware, rbacMiddleware } = require('../middleware/auth');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const pool = require('../config/database');
const GroupAuthorizationService = require('../services/GroupAuthorizationService');

// 创建群组授权服务实例
const groupAuthService = new GroupAuthorizationService();

/**
 * @swagger
 * components:
 *   schemas:
 *     GroupInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         platform_group_id:
 *           type: string
 *         group_name:
 *           type: string
 *         group_type:
 *           type: string
 *         status:
 *           type: string
 *         member_count:
 *           type: integer
 *         message_quota:
 *           type: integer
 *         message_used:
 *           type: integer
 *         last_activity_at:
 *           type: string
 *           format: date-time
 * 
 *     AuthPolicy:
 *       type: object
 *       properties:
 *         policy_type:
 *           type: string
 *           enum: [whitelist, blacklist, approval, open]
 *         auto_approve:
 *           type: boolean
 *         max_groups:
 *           type: integer
 *         max_members_per_group:
 *           type: integer
 *         default_message_quota:
 *           type: integer
 */

/**
 * @swagger
 * /api/groups/check-permission:
 *   post:
 *     summary: 检查群组权限
 *     tags: [Group Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - botConfigId
 *               - platformGroupId
 *             properties:
 *               botConfigId:
 *                 type: string
 *               platformGroupId:
 *                 type: string
 *               groupName:
 *                 type: string
 *               groupType:
 *                 type: string
 *               memberCount:
 *                 type: integer
 *               invitedByUserId:
 *                 type: string
 *               invitedByUsername:
 *                 type: string
 *               platform:
 *                 type: string
 *     responses:
 *       200:
 *         description: 权限检查结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allowed:
 *                   type: boolean
 *                 reason:
 *                   type: string
 *                 requiresApproval:
 *                   type: boolean
 *                 pendingApproval:
 *                   type: boolean
 */
router.post('/check-permission', authMiddleware, asyncHandler(async (req, res) => {
  const {
    botConfigId,
    platformGroupId,
    groupName,
    groupType,
    memberCount,
    invitedByUserId,
    invitedByUsername,
    platform
  } = req.body;

  if (!botConfigId || !platformGroupId) {
    throw new AppError('Bot config ID and platform group ID are required', 400);
  }

  // 验证Bot配置是否属于当前租户
  const botQuery = `
    SELECT id FROM bot_configs 
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;
  
  const botResult = await pool.query(botQuery, [botConfigId, req.user.tenantId]);
  
  if (botResult.rows.length === 0) {
    throw new AppError('Bot configuration not found', 404);
  }

  const groupData = {
    platformGroupId,
    groupName,
    groupType,
    memberCount,
    invitedByUserId,
    invitedByUsername,
    platform
  };

  const permissionResult = await groupAuthService.checkGroupPermission(botConfigId, groupData);

  logger.info('Group permission checked', {
    tenantId: req.user.tenantId,
    botConfigId,
    platformGroupId,
    allowed: permissionResult.allowed,
    reason: permissionResult.reason
  });

  res.json(permissionResult);
}));

/**
 * @swagger
 * /api/groups:
 *   get:
 *     summary: 获取群组列表
 *     tags: [Group Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, suspended, blacklisted]
 *       - in: query
 *         name: botConfigId
 *         schema:
 *           type: string
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 群组列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 groups:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/GroupInfo'
 *                 pagination:
 *                   type: object
 */
router.get('/', authMiddleware, rbacMiddleware(['groups:read']), asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const {
    page = 1,
    limit = 20,
    status,
    botConfigId,
    platform,
    search,
    sort_by = 'created_at',
    sort_order = 'desc'
  } = req.query;

  const offset = (page - 1) * limit;

  // 构建查询条件
  let whereConditions = ['gi.tenant_id = $1'];
  let queryParams = [tenantId];
  let paramIndex = 2;

  // 状态筛选
  if (status) {
    whereConditions.push(`gi.status = $${paramIndex}`);
    queryParams.push(status);
    paramIndex++;
  }

  // Bot配置筛选
  if (botConfigId) {
    whereConditions.push(`gi.bot_config_id = $${paramIndex}`);
    queryParams.push(botConfigId);
    paramIndex++;
  }

  // 平台筛选
  if (platform) {
    whereConditions.push(`bc.platform = $${paramIndex}`);
    queryParams.push(platform);
    paramIndex++;
  }

  // 搜索条件
  if (search) {
    whereConditions.push(`(
      gi.group_name ILIKE $${paramIndex} OR 
      gi.platform_group_id ILIKE $${paramIndex} OR
      gi.group_description ILIKE $${paramIndex}
    )`);
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  // 构建排序
  const allowedSortFields = ['created_at', 'group_name', 'member_count', 'message_used', 'last_activity_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
  const sortDirection = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // 主查询
  const mainQuery = `
    SELECT 
      gi.*,
      bc.name as bot_name,
      bc.platform,
      bap.policy_type,
      bap.auto_approve,
      CASE 
        WHEN gi.last_activity_at >= NOW() - INTERVAL '7 days' THEN 'active'
        WHEN gi.last_activity_at >= NOW() - INTERVAL '30 days' THEN 'inactive'
        ELSE 'dormant'
      END as activity_status,
      ROUND((gi.message_used::float / gi.message_quota::float) * 100, 2) as quota_usage_percent
    FROM group_info gi
    JOIN bot_configs bc ON gi.bot_config_id = bc.id
    LEFT JOIN bot_auth_policies bap ON gi.bot_config_id = bap.bot_config_id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY gi.${sortField} ${sortDirection}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  queryParams.push(limit, offset);

  // 计数查询
  const countQuery = `
    SELECT COUNT(*) as total
    FROM group_info gi
    JOIN bot_configs bc ON gi.bot_config_id = bc.id
    WHERE ${whereConditions.join(' AND ')}
  `;

  const [groupsResult, countResult] = await Promise.all([
    pool.query(mainQuery, queryParams),
    pool.query(countQuery, queryParams.slice(0, -2)) // 去除limit和offset参数
  ]);

  const groups = groupsResult.rows;
  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  res.json({
    groups,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    filters: {
      status,
      botConfigId,
      platform,
      search
    }
  });
}));

/**
 * @swagger
 * /api/groups/{groupId}:
 *   get:
 *     summary: 获取群组详情
 *     tags: [Group Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 群组详情
 */
router.get('/:groupId', authMiddleware, rbacMiddleware(['groups:read']), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const tenantId = req.user.tenantId;

  const groupQuery = `
    SELECT 
      gi.*,
      bc.name as bot_name,
      bc.platform,
      bap.policy_type,
      bap.auto_approve,
      bap.max_groups,
      bap.max_members_per_group,
      bap.default_message_quota,
      u.username as approved_by_username
    FROM group_info gi
    JOIN bot_configs bc ON gi.bot_config_id = bc.id
    LEFT JOIN bot_auth_policies bap ON gi.bot_config_id = bap.bot_config_id
    LEFT JOIN users u ON gi.approved_by = u.id
    WHERE gi.id = $1 AND gi.tenant_id = $2
  `;

  const groupResult = await pool.query(groupQuery, [groupId, tenantId]);

  if (groupResult.rows.length === 0) {
    throw new AppError('Group not found', 404);
  }

  const group = groupResult.rows[0];

  // 获取群组管理员
  const adminsQuery = `
    SELECT platform_user_id, username, full_name, admin_level, added_at
    FROM group_admins
    WHERE group_info_id = $1 AND is_active = true
    ORDER BY admin_level, added_at
  `;

  const adminsResult = await pool.query(adminsQuery, [groupId]);

  // 获取最近的使用统计
  const statsQuery = `
    SELECT 
      period_type,
      period_start,
      period_end,
      message_count,
      active_users,
      command_count,
      avg_response_time_ms
    FROM group_usage_stats
    WHERE group_info_id = $1
    ORDER BY period_start DESC
    LIMIT 6
  `;

  const statsResult = await pool.query(statsQuery, [groupId]);

  // 获取操作日志
  const logsQuery = `
    SELECT 
      operation_type,
      operator_type,
      operator_name,
      result,
      created_at,
      metadata
    FROM group_operation_logs
    WHERE group_info_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const logsResult = await pool.query(logsQuery, [groupId]);

  res.json({
    group,
    admins: adminsResult.rows,
    usageStats: statsResult.rows,
    operationLogs: logsResult.rows
  });
}));

/**
 * @swagger
 * /api/groups/{groupId}/approve:
 *   post:
 *     summary: 批准群组请求
 *     tags: [Group Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: 批准成功
 */
router.post('/:groupId/approve', authMiddleware, rbacMiddleware(['groups:write']), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { reason } = req.body;
  const tenantId = req.user.tenantId;
  const userId = req.user.id;

  // 验证群组是否属于当前租户
  const groupQuery = `
    SELECT gi.*, bc.name as bot_name
    FROM group_info gi
    JOIN bot_configs bc ON gi.bot_config_id = bc.id
    WHERE gi.id = $1 AND gi.tenant_id = $2
  `;

  const groupResult = await pool.query(groupQuery, [groupId, tenantId]);

  if (groupResult.rows.length === 0) {
    throw new AppError('Group not found', 404);
  }

  const group = groupResult.rows[0];

  if (group.status !== 'pending') {
    throw new AppError(`Cannot approve group with status: ${group.status}`, 400);
  }

  await groupAuthService.approveGroupRequest(groupId, userId, reason);

  logger.info('Group approved', {
    tenantId,
    groupId,
    groupName: group.group_name,
    approvedBy: userId,
    reason
  });

  res.json({
    success: true,
    message: 'Group approved successfully'
  });
}));

/**
 * @swagger
 * /api/groups/{groupId}/reject:
 *   post:
 *     summary: 拒绝群组请求
 *     tags: [Group Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: 拒绝成功
 */
router.post('/:groupId/reject', authMiddleware, rbacMiddleware(['groups:write']), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { reason } = req.body;
  const tenantId = req.user.tenantId;
  const userId = req.user.id;

  if (!reason) {
    throw new AppError('Rejection reason is required', 400);
  }

  // 验证群组是否属于当前租户
  const groupQuery = `
    SELECT gi.*, bc.name as bot_name
    FROM group_info gi
    JOIN bot_configs bc ON gi.bot_config_id = bc.id
    WHERE gi.id = $1 AND gi.tenant_id = $2
  `;

  const groupResult = await pool.query(groupQuery, [groupId, tenantId]);

  if (groupResult.rows.length === 0) {
    throw new AppError('Group not found', 404);
  }

  const group = groupResult.rows[0];

  if (group.status !== 'pending') {
    throw new AppError(`Cannot reject group with status: ${group.status}`, 400);
  }

  await groupAuthService.rejectGroupRequest(groupId, userId, reason);

  logger.info('Group rejected', {
    tenantId,
    groupId,
    groupName: group.group_name,
    rejectedBy: userId,
    reason
  });

  res.json({
    success: true,
    message: 'Group rejected successfully'
  });
}));

/**
 * @swagger
 * /api/groups/{groupId}/suspend:
 *   post:
 *     summary: 暂停群组服务
 *     tags: [Group Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: 暂停成功
 */
router.post('/:groupId/suspend', authMiddleware, rbacMiddleware(['groups:write']), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { reason } = req.body;
  const tenantId = req.user.tenantId;
  const userId = req.user.id;

  if (!reason) {
    throw new AppError('Suspension reason is required', 400);
  }

  const updateQuery = `
    UPDATE group_info 
    SET status = 'suspended', rejection_reason = $2, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $3
    RETURNING platform_group_id, bot_config_id, group_name
  `;

  const result = await pool.query(updateQuery, [groupId, reason, tenantId]);

  if (result.rows.length === 0) {
    throw new AppError('Group not found', 404);
  }

  const group = result.rows[0];

  // 记录操作日志
  await groupAuthService.logGroupOperation({
    botConfigId: group.bot_config_id,
    platformGroupId: group.platform_group_id,
    operationType: 'suspend',
    operatorType: 'admin',
    operatorId: userId,
    result: 'success',
    metadata: { reason }
  });

  logger.info('Group suspended', {
    tenantId,
    groupId,
    groupName: group.group_name,
    suspendedBy: userId,
    reason
  });

  res.json({
    success: true,
    message: 'Group suspended successfully'
  });
}));

/**
 * @swagger
 * /api/groups/{groupId}/quota:
 *   put:
 *     summary: 更新群组配额
 *     tags: [Group Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageQuota
 *             properties:
 *               messageQuota:
 *                 type: integer
 *                 minimum: 0
 *               resetUsage:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: 配额更新成功
 */
router.put('/:groupId/quota', authMiddleware, rbacMiddleware(['groups:write']), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { messageQuota, resetUsage = false } = req.body;
  const tenantId = req.user.tenantId;
  const userId = req.user.id;

  if (messageQuota === undefined || messageQuota < 0) {
    throw new AppError('Valid message quota is required', 400);
  }

  const updateFields = ['message_quota = $2', 'updated_at = NOW()'];
  const queryParams = [groupId, messageQuota];
  let paramIndex = 3;

  if (resetUsage) {
    updateFields.push(`message_used = 0`);
  }

  const updateQuery = `
    UPDATE group_info 
    SET ${updateFields.join(', ')}
    WHERE id = $1 AND tenant_id = $${paramIndex}
    RETURNING platform_group_id, bot_config_id, group_name, message_quota, message_used
  `;

  queryParams.push(tenantId);

  const result = await pool.query(updateQuery, queryParams);

  if (result.rows.length === 0) {
    throw new AppError('Group not found', 404);
  }

  const group = result.rows[0];

  // 记录操作日志
  await groupAuthService.logGroupOperation({
    botConfigId: group.bot_config_id,
    platformGroupId: group.platform_group_id,
    operationType: 'update_quota',
    operatorType: 'admin',
    operatorId: userId,
    result: 'success',
    metadata: { 
      new_quota: messageQuota, 
      reset_usage: resetUsage 
    }
  });

  logger.info('Group quota updated', {
    tenantId,
    groupId,
    groupName: group.group_name,
    newQuota: messageQuota,
    resetUsage,
    updatedBy: userId
  });

  res.json({
    success: true,
    message: 'Group quota updated successfully',
    group: {
      id: groupId,
      messageQuota: group.message_quota,
      messageUsed: group.message_used
    }
  });
}));

/**
 * @swagger
 * /api/groups/policies/{botConfigId}:
 *   get:
 *     summary: 获取Bot权限策略
 *     tags: [Group Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: botConfigId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bot权限策略
 */
router.get('/policies/:botConfigId', authMiddleware, rbacMiddleware(['groups:read']), asyncHandler(async (req, res) => {
  const { botConfigId } = req.params;
  const tenantId = req.user.tenantId;

  // 验证Bot配置是否属于当前租户
  const botQuery = `
    SELECT bc.id, bc.name, bc.platform
    FROM bot_configs bc
    WHERE bc.id = $1 AND bc.tenant_id = $2 AND bc.deleted_at IS NULL
  `;

  const botResult = await pool.query(botQuery, [botConfigId, tenantId]);

  if (botResult.rows.length === 0) {
    throw new AppError('Bot configuration not found', 404);
  }

  const bot = botResult.rows[0];

  // 获取权限策略
  const policyQuery = `
    SELECT * FROM bot_auth_policies 
    WHERE bot_config_id = $1 AND is_active = true
  `;

  const policyResult = await pool.query(policyQuery, [botConfigId]);

  // 获取权限规则
  const rulesQuery = `
    SELECT * FROM group_permission_rules 
    WHERE bot_config_id = $1 AND is_active = true
    ORDER BY priority DESC, created_at DESC
  `;

  const rulesResult = await pool.query(rulesQuery, [botConfigId]);

  res.json({
    bot,
    policy: policyResult.rows[0] || null,
    rules: rulesResult.rows
  });
}));

/**
 * @swagger
 * /api/groups/policies/{botConfigId}:
 *   put:
 *     summary: 更新Bot权限策略
 *     tags: [Group Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: botConfigId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthPolicy'
 *     responses:
 *       200:
 *         description: 策略更新成功
 */
router.put('/policies/:botConfigId', authMiddleware, rbacMiddleware(['groups:write']), asyncHandler(async (req, res) => {
  const { botConfigId } = req.params;
  const tenantId = req.user.tenantId;
  const {
    policy_type,
    auto_approve,
    require_admin_invite,
    max_groups,
    max_members_per_group,
    default_message_quota,
    quota_reset_period,
    service_hours,
    allowed_regions,
    blocked_regions,
    notifications
  } = req.body;

  // 验证Bot配置是否属于当前租户
  const botQuery = `
    SELECT id FROM bot_configs 
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;

  const botResult = await pool.query(botQuery, [botConfigId, tenantId]);

  if (botResult.rows.length === 0) {
    throw new AppError('Bot configuration not found', 404);
  }

  // 更新或创建权限策略
  const upsertQuery = `
    INSERT INTO bot_auth_policies (
      tenant_id, bot_config_id, policy_type, auto_approve, require_admin_invite,
      max_groups, max_members_per_group, default_message_quota, quota_reset_period,
      service_hours, allowed_regions, blocked_regions, notifications
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (tenant_id, bot_config_id)
    DO UPDATE SET
      policy_type = EXCLUDED.policy_type,
      auto_approve = EXCLUDED.auto_approve,
      require_admin_invite = EXCLUDED.require_admin_invite,
      max_groups = EXCLUDED.max_groups,
      max_members_per_group = EXCLUDED.max_members_per_group,
      default_message_quota = EXCLUDED.default_message_quota,
      quota_reset_period = EXCLUDED.quota_reset_period,
      service_hours = EXCLUDED.service_hours,
      allowed_regions = EXCLUDED.allowed_regions,
      blocked_regions = EXCLUDED.blocked_regions,
      notifications = EXCLUDED.notifications,
      updated_at = NOW()
    RETURNING *
  `;

  const result = await pool.query(upsertQuery, [
    tenantId,
    botConfigId,
    policy_type,
    auto_approve,
    require_admin_invite,
    max_groups,
    max_members_per_group,
    default_message_quota,
    quota_reset_period,
    JSON.stringify(service_hours || {}),
    JSON.stringify(allowed_regions || []),
    JSON.stringify(blocked_regions || []),
    JSON.stringify(notifications || {})
  ]);

  // 清理缓存
  groupAuthService.clearCache();

  logger.info('Bot auth policy updated', {
    tenantId,
    botConfigId,
    policyType: policy_type,
    updatedBy: req.user.id
  });

  res.json({
    success: true,
    message: 'Bot authorization policy updated successfully',
    policy: result.rows[0]
  });
}));

/**
 * @swagger
 * /api/groups/stats/overview:
 *   get:
 *     summary: 获取群组统计概览
 *     tags: [Group Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d]
 *           default: 30d
 *     responses:
 *       200:
 *         description: 统计概览
 */
router.get('/stats/overview', authMiddleware, rbacMiddleware(['groups:read']), asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { period = '30d' } = req.query;

  // 计算时间范围
  const periodMap = {
    '7d': 7,
    '30d': 30,
    '90d': 90
  };

  const days = periodMap[period] || 30;

  // 群组总体统计
  const overviewQuery = `
    SELECT 
      COUNT(*) as total_groups,
      COUNT(*) FILTER (WHERE status = 'approved') as approved_groups,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_groups,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected_groups,
      COUNT(*) FILTER (WHERE status = 'suspended') as suspended_groups,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '${days} days') as new_groups,
      COUNT(*) FILTER (WHERE last_activity_at >= NOW() - INTERVAL '7 days') as active_groups,
      SUM(message_used) as total_messages,
      SUM(message_quota) as total_quota,
      AVG(member_count) as avg_members_per_group
    FROM group_info gi
    JOIN bot_configs bc ON gi.bot_config_id = bc.id
    WHERE gi.tenant_id = $1 AND bc.deleted_at IS NULL
  `;

  const overviewResult = await pool.query(overviewQuery, [tenantId]);

  // 按平台分组统计
  const platformQuery = `
    SELECT 
      bc.platform,
      COUNT(gi.id) as group_count,
      COUNT(gi.id) FILTER (WHERE gi.status = 'approved') as approved_count,
      SUM(gi.message_used) as total_messages,
      AVG(gi.member_count) as avg_members
    FROM group_info gi
    JOIN bot_configs bc ON gi.bot_config_id = bc.id
    WHERE gi.tenant_id = $1 AND bc.deleted_at IS NULL
    GROUP BY bc.platform
    ORDER BY group_count DESC
  `;

  const platformResult = await pool.query(platformQuery, [tenantId]);

  // 按Bot分组统计
  const botQuery = `
    SELECT 
      bc.id,
      bc.name,
      bc.platform,
      COUNT(gi.id) as group_count,
      COUNT(gi.id) FILTER (WHERE gi.status = 'approved') as approved_count,
      COUNT(gi.id) FILTER (WHERE gi.status = 'pending') as pending_count,
      SUM(gi.message_used) as total_messages,
      bap.max_groups,
      bap.policy_type
    FROM bot_configs bc
    LEFT JOIN group_info gi ON bc.id = gi.bot_config_id
    LEFT JOIN bot_auth_policies bap ON bc.id = bap.bot_config_id
    WHERE bc.tenant_id = $1 AND bc.deleted_at IS NULL
    GROUP BY bc.id, bc.name, bc.platform, bap.max_groups, bap.policy_type
    ORDER BY group_count DESC
  `;

  const botResult = await pool.query(botQuery, [tenantId]);

  // 活跃度趋势
  const trendQuery = `
    SELECT 
      DATE_TRUNC('day', gus.period_start) as date,
      SUM(gus.message_count) as message_count,
      SUM(gus.active_users) as active_users,
      COUNT(DISTINCT gus.group_info_id) as active_groups
    FROM group_usage_stats gus
    JOIN group_info gi ON gus.group_info_id = gi.id
    WHERE gi.tenant_id = $1 
      AND gus.period_start >= NOW() - INTERVAL '${days} days'
      AND gus.period_type = 'daily'
    GROUP BY DATE_TRUNC('day', gus.period_start)
    ORDER BY date
  `;

  const trendResult = await pool.query(trendQuery, [tenantId]);

  const stats = {
    overview: {
      ...overviewResult.rows[0],
      avg_members_per_group: parseFloat(overviewResult.rows[0].avg_members_per_group) || 0
    },
    platformStats: platformResult.rows.map(row => ({
      ...row,
      avg_members: parseFloat(row.avg_members) || 0
    })),
    botStats: botResult.rows,
    activityTrends: trendResult.rows,
    period,
    generatedAt: new Date().toISOString()
  };

  res.json(stats);
}));

module.exports = router; 