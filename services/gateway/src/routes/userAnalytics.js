const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/asyncHandler');
const { authMiddleware, rbacMiddleware } = require('../middleware/auth');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const pool = require('../config/database');

/**
 * @swagger
 * components:
 *   schemas:
 *     UserProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         user_identifier:
 *           type: string
 *         display_name:
 *           type: string
 *         estimated_value_tier:
 *           type: string
 *         total_messages:
 *           type: integer
 *         satisfaction_score:
 *           type: number
 *         tags:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/UserTag'
 *     
 *     UserTag:
 *       type: object
 *       properties:
 *         tag_name:
 *           type: string
 *         display_name:
 *           type: string
 *         category:
 *           type: string
 *         confidence:
 *           type: number
 *         source:
 *           type: string
 * 
 *     AnalysisReport:
 *       type: object
 *       properties:
 *         period:
 *           type: string
 *         summary:
 *           type: object
 *         users:
 *           type: array
 *         tagAnalysis:
 *           type: object
 *         behaviorInsights:
 *           type: object
 *         recommendations:
 *           type: array
 */

/**
 * @swagger
 * /api/user-analytics/profiles:
 *   get:
 *     summary: 获取用户档案列表
 *     tags: [User Analytics]
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
 *         name: tag
 *         schema:
 *           type: string
 *         description: 按标签筛选
 *       - in: query
 *         name: value_tier
 *         schema:
 *           type: string
 *         description: 按价值层级筛选
 *       - in: query
 *         name: activity
 *         schema:
 *           type: string
 *           enum: [active, dormant, new]
 *         description: 按活跃度筛选
 *     responses:
 *       200:
 *         description: 用户档案列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserProfile'
 *                 pagination:
 *                   type: object
 *                 filters:
 *                   type: object
 */
router.get('/profiles', authMiddleware, rbacMiddleware(['analytics:read']), asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const {
    page = 1,
    limit = 20,
    tag,
    value_tier,
    activity,
    search,
    sort_by = 'last_seen_at',
    sort_order = 'desc'
  } = req.query;

  const offset = (page - 1) * limit;

  // 构建查询条件
  let whereConditions = ['up.tenant_id = $1'];
  let queryParams = [tenantId];
  let paramIndex = 2;

  // 标签筛选
  if (tag) {
    whereConditions.push(`EXISTS (
      SELECT 1 FROM user_tags ut 
      JOIN tag_definitions td ON ut.tag_definition_id = td.id 
      WHERE ut.user_profile_id = up.id AND td.name = $${paramIndex}
    )`);
    queryParams.push(tag);
    paramIndex++;
  }

  // 价值层级筛选
  if (value_tier) {
    whereConditions.push(`up.estimated_value_tier = $${paramIndex}`);
    queryParams.push(value_tier);
    paramIndex++;
  }

  // 活跃度筛选
  if (activity) {
    switch (activity) {
      case 'active':
        whereConditions.push('up.last_seen_at >= NOW() - INTERVAL \'7 days\'');
        break;
      case 'dormant':
        whereConditions.push('up.last_seen_at < NOW() - INTERVAL \'90 days\'');
        break;
      case 'new':
        whereConditions.push('up.first_seen_at >= NOW() - INTERVAL \'7 days\'');
        break;
    }
  }

  // 搜索条件
  if (search) {
    whereConditions.push(`(
      up.display_name ILIKE $${paramIndex} OR 
      up.email ILIKE $${paramIndex} OR 
      up.user_identifier ILIKE $${paramIndex}
    )`);
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  // 构建排序
  const allowedSortFields = ['last_seen_at', 'total_messages', 'satisfaction_score', 'created_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'last_seen_at';
  const sortDirection = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // 主查询
  const mainQuery = `
    WITH user_with_tags AS (
      SELECT 
        up.*,
        array_agg(
          CASE WHEN td.id IS NOT NULL THEN 
            json_build_object(
              'tag_name', td.name,
              'display_name', td.display_name,
              'category', td.category,
              'confidence', ut.confidence_score,
              'source', ut.source,
              'created_at', ut.created_at
            )
          ELSE NULL END
        ) FILTER (WHERE td.id IS NOT NULL) as tags
      FROM user_profiles up
      LEFT JOIN user_tags ut ON up.id = ut.user_profile_id
      LEFT JOIN tag_definitions td ON ut.tag_definition_id = td.id AND td.is_active = true
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY up.id
    )
    SELECT *,
           CASE 
             WHEN last_seen_at >= NOW() - INTERVAL '7 days' THEN 'active'
             WHEN last_seen_at >= NOW() - INTERVAL '90 days' THEN 'inactive'
             ELSE 'dormant'
           END as activity_status,
           EXTRACT(DAYS FROM NOW() - last_seen_at) as days_since_last_seen
    FROM user_with_tags
    ORDER BY ${sortField} ${sortDirection}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  queryParams.push(limit, offset);

  // 计数查询
  const countQuery = `
    SELECT COUNT(DISTINCT up.id) as total
    FROM user_profiles up
    LEFT JOIN user_tags ut ON up.id = ut.user_profile_id
    LEFT JOIN tag_definitions td ON ut.tag_definition_id = td.id AND td.is_active = true
    WHERE ${whereConditions.join(' AND ')}
  `;

  const [usersResult, countResult] = await Promise.all([
    pool.query(mainQuery, queryParams),
    pool.query(countQuery, queryParams.slice(0, -2)) // 去除limit和offset参数
  ]);

  const users = usersResult.rows.map(user => ({
    ...user,
    tags: user.tags || [],
    estimated_value_tier: user.estimated_value_tier || 'unknown',
    satisfaction_score: parseFloat(user.satisfaction_score) || 0,
    overall_sentiment: parseFloat(user.overall_sentiment) || 0
  }));

  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  res.json({
    users,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    filters: {
      tag,
      value_tier,
      activity,
      search
    }
  });
}));

/**
 * @swagger
 * /api/user-analytics/profiles/{profileId}:
 *   get:
 *     summary: 获取用户详细档案
 *     tags: [User Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: profileId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 用户详细信息
 */
router.get('/profiles/:profileId', authMiddleware, rbacMiddleware(['analytics:read']), asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const tenantId = req.user.tenantId;

  // 获取用户基础信息
  const profileQuery = `
    SELECT up.*,
           CASE 
             WHEN last_seen_at >= NOW() - INTERVAL '7 days' THEN 'active'
             WHEN last_seen_at >= NOW() - INTERVAL '90 days' THEN 'inactive'
             ELSE 'dormant'
           END as activity_status,
           EXTRACT(DAYS FROM NOW() - first_seen_at) as days_since_first_seen,
           EXTRACT(DAYS FROM NOW() - last_seen_at) as days_since_last_seen
    FROM user_profiles up
    WHERE up.id = $1 AND up.tenant_id = $2
  `;

  const profileResult = await pool.query(profileQuery, [profileId, tenantId]);
  
  if (profileResult.rows.length === 0) {
    throw new AppError('User profile not found', 404);
  }

  const profile = profileResult.rows[0];

  // 获取用户标签
  const tagsQuery = `
    SELECT ut.*, td.name, td.display_name, td.category, td.color, td.description
    FROM user_tags ut
    JOIN tag_definitions td ON ut.tag_definition_id = td.id
    WHERE ut.user_profile_id = $1 AND td.is_active = true
    ORDER BY ut.confidence_score DESC, td.weight DESC
  `;

  const tagsResult = await pool.query(tagsQuery, [profileId]);

  // 获取最近的行为事件
  const eventsQuery = `
    SELECT *
    FROM user_behavior_events
    WHERE user_profile_id = $1
    ORDER BY event_timestamp DESC
    LIMIT 20
  `;

  const eventsResult = await pool.query(eventsQuery, [profileId]);

  // 获取分析摘要（最近30天）
  const summaryQuery = `
    SELECT *
    FROM user_analytics_summary
    WHERE user_profile_id = $1 AND period_type = 'monthly'
    ORDER BY period_start DESC
    LIMIT 3
  `;

  const summaryResult = await pool.query(summaryQuery, [profileId]);

  res.json({
    profile: {
      ...profile,
      satisfaction_score: parseFloat(profile.satisfaction_score) || 0,
      overall_sentiment: parseFloat(profile.overall_sentiment) || 0,
      politeness_score: parseFloat(profile.politeness_score) || 0.5
    },
    tags: tagsResult.rows,
    recentEvents: eventsResult.rows,
    monthlySummaries: summaryResult.rows
  });
}));

/**
 * @swagger
 * /api/user-analytics/tags:
 *   get:
 *     summary: 获取标签统计
 *     tags: [User Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 标签使用统计
 */
router.get('/tags', authMiddleware, rbacMiddleware(['analytics:read']), asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;

  const tagsStatsQuery = `
    SELECT 
      td.id,
      td.name,
      td.display_name,
      td.category,
      td.color,
      td.description,
      COUNT(ut.id) as usage_count,
      AVG(ut.confidence_score) as avg_confidence,
      COUNT(ut.id) FILTER (WHERE ut.source = 'auto_ai') as ai_generated_count,
      COUNT(ut.id) FILTER (WHERE ut.source = 'auto_behavior') as behavior_generated_count,
      COUNT(ut.id) FILTER (WHERE ut.source = 'manual') as manual_count,
      COUNT(ut.id) FILTER (WHERE ut.verified = true) as verified_count,
      MAX(ut.created_at) as last_used_at
    FROM tag_definitions td
    LEFT JOIN user_tags ut ON td.id = ut.tag_definition_id
    WHERE td.tenant_id = $1 AND td.is_active = true
    GROUP BY td.id, td.name, td.display_name, td.category, td.color, td.description
    ORDER BY usage_count DESC, td.weight DESC
  `;

  const result = await pool.query(tagsStatsQuery, [tenantId]);

  const tags = result.rows.map(row => ({
    ...row,
    avg_confidence: parseFloat(row.avg_confidence) || 0,
    usage_count: parseInt(row.usage_count) || 0
  }));

  // 按分类分组
  const categoriesStats = tags.reduce((acc, tag) => {
    if (!acc[tag.category]) {
      acc[tag.category] = {
        category: tag.category,
        total_tags: 0,
        total_usage: 0,
        tags: []
      };
    }
    
    acc[tag.category].total_tags++;
    acc[tag.category].total_usage += tag.usage_count;
    acc[tag.category].tags.push(tag);
    
    return acc;
  }, {});

  res.json({
    tags,
    categories: Object.values(categoriesStats),
    totalTags: tags.length,
    totalUsage: tags.reduce((sum, tag) => sum + tag.usage_count, 0)
  });
}));

/**
 * @swagger
 * /api/user-analytics/reports/summary:
 *   get:
 *     summary: 生成用户分析报告
 *     tags: [User Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: monthly
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: 分析报告
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalysisReport'
 */
router.get('/reports/summary', authMiddleware, rbacMiddleware(['analytics:read']), asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const {
    period = 'monthly',
    startDate,
    endDate = new Date().toISOString().split('T')[0]
  } = req.query;

  // 默认开始时间
  const defaultStartDate = new Date();
  defaultStartDate.setMonth(defaultStartDate.getMonth() - 1);
  const computedStartDate = startDate || defaultStartDate.toISOString().split('T')[0];

  // 用户总览
  const userSummaryQuery = `
    SELECT 
      COUNT(*) as total_users,
      COUNT(*) FILTER (WHERE first_seen_at >= $2) as new_users,
      COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '7 days') as active_last_7_days,
      COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '30 days') as active_last_30_days,
      COUNT(*) FILTER (WHERE estimated_value_tier = 'vip') as vip_users,
      COUNT(*) FILTER (WHERE estimated_value_tier = 'high') as high_value_users,
      AVG(total_messages) as avg_messages_per_user,
      AVG(satisfaction_score) as avg_satisfaction,
      AVG(overall_sentiment) as avg_sentiment,
      AVG(politeness_score) as avg_politeness
    FROM user_profiles 
    WHERE tenant_id = $1 AND created_at <= $3
  `;

  const summaryResult = await pool.query(userSummaryQuery, [tenantId, computedStartDate, endDate]);
  const summary = summaryResult.rows[0];

  // 平台分布
  const platformQuery = `
    SELECT 
      jsonb_array_elements_text(preferred_platforms) as platform,
      COUNT(*) as user_count
    FROM user_profiles 
    WHERE tenant_id = $1 AND preferred_platforms IS NOT NULL
    GROUP BY platform
    ORDER BY user_count DESC
  `;

  const platformResult = await pool.query(platformQuery, [tenantId]);

  // 行为趋势（按天）
  const trendQuery = `
    SELECT 
      DATE_TRUNC('day', event_timestamp) as date,
      COUNT(*) as event_count,
      COUNT(DISTINCT user_profile_id) as active_users,
      AVG(sentiment_score) as avg_sentiment
    FROM user_behavior_events ube
    JOIN user_profiles up ON ube.user_profile_id = up.id
    WHERE up.tenant_id = $1 
      AND ube.event_timestamp >= $2::date 
      AND ube.event_timestamp <= $3::date + INTERVAL '1 day'
    GROUP BY DATE_TRUNC('day', event_timestamp)
    ORDER BY date
  `;

  const trendResult = await pool.query(trendQuery, [tenantId, computedStartDate, endDate]);

  // 标签分布
  const tagDistributionQuery = `
    SELECT 
      td.category,
      td.name,
      td.display_name,
      COUNT(ut.id) as usage_count
    FROM tag_definitions td
    LEFT JOIN user_tags ut ON td.id = ut.tag_definition_id
    JOIN user_profiles up ON ut.user_profile_id = up.id
    WHERE td.tenant_id = $1 AND td.is_active = true
    GROUP BY td.category, td.name, td.display_name
    ORDER BY usage_count DESC
    LIMIT 20
  `;

  const tagDistResult = await pool.query(tagDistributionQuery, [tenantId]);

  // 生成建议
  const recommendations = [];

  // 活跃度建议
  const activeRate = summary.active_last_7_days / summary.total_users;
  if (activeRate < 0.3) {
    recommendations.push({
      type: 'engagement',
      priority: 'high',
      title: '用户活跃度偏低',
      description: `当前7天活跃率仅为${(activeRate * 100).toFixed(1)}%，建议制定用户激活策略`,
      actionItems: [
        '分析沉睡用户特征，制定唤醒策略',
        '优化产品体验，提高用户粘性',
        '设计个性化推送，增加用户触达'
      ]
    });
  }

  // 满意度建议
  if (summary.avg_satisfaction < 0.7) {
    recommendations.push({
      type: 'satisfaction',
      priority: 'high',
      title: '客户满意度有待提升',
      description: `平均满意度为${(summary.avg_satisfaction * 100).toFixed(1)}%，需要关注服务质量`,
      actionItems: [
        '分析客户投诉和负面反馈',
        '优化客服响应时间和质量',
        '建立客户满意度监控体系'
      ]
    });
  }

  // VIP用户建议
  const vipRate = summary.vip_users / summary.total_users;
  if (vipRate > 0.1) {
    recommendations.push({
      type: 'retention',
      priority: 'medium',
      title: 'VIP用户占比较高',
      description: `VIP用户占比达${(vipRate * 100).toFixed(1)}%，建议加强VIP服务`,
      actionItems: [
        '设计VIP专属服务和权益',
        '建立VIP客户成功管理体系',
        '定期收集VIP用户反馈和建议'
      ]
    });
  }

  const report = {
    period,
    startDate: computedStartDate,
    endDate,
    generatedAt: new Date().toISOString(),
    summary: {
      ...summary,
      avg_messages_per_user: parseFloat(summary.avg_messages_per_user) || 0,
      avg_satisfaction: parseFloat(summary.avg_satisfaction) || 0,
      avg_sentiment: parseFloat(summary.avg_sentiment) || 0,
      avg_politeness: parseFloat(summary.avg_politeness) || 0.5,
      active_rate_7_days: (summary.active_last_7_days / summary.total_users) || 0,
      active_rate_30_days: (summary.active_last_30_days / summary.total_users) || 0
    },
    platformDistribution: platformResult.rows,
    activityTrends: trendResult.rows.map(row => ({
      ...row,
      avg_sentiment: parseFloat(row.avg_sentiment) || 0
    })),
    topTags: tagDistResult.rows,
    recommendations
  };

  logger.info('Generated user analytics report', {
    tenantId,
    period,
    totalUsers: summary.total_users,
    reportId: `${tenantId}-${Date.now()}`
  });

  res.json(report);
}));

/**
 * @swagger
 * /api/user-analytics/profiles/{profileId}/tags:
 *   post:
 *     summary: 为用户添加标签
 *     tags: [User Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: profileId
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
 *               - tagId
 *             properties:
 *               tagId:
 *                 type: string
 *               confidence:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *               reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: 标签添加成功
 */
router.post('/profiles/:profileId/tags', authMiddleware, rbacMiddleware(['analytics:write']), asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const { tagId, confidence = 1.0, reason } = req.body;
  const tenantId = req.user.tenantId;
  const userId = req.user.id;

  // 验证用户档案存在
  const profileQuery = `
    SELECT id FROM user_profiles 
    WHERE id = $1 AND tenant_id = $2
  `;
  
  const profileResult = await pool.query(profileQuery, [profileId, tenantId]);
  
  if (profileResult.rows.length === 0) {
    throw new AppError('User profile not found', 404);
  }

  // 验证标签定义存在
  const tagQuery = `
    SELECT id, name, display_name FROM tag_definitions 
    WHERE id = $1 AND tenant_id = $2 AND is_active = true
  `;
  
  const tagResult = await pool.query(tagQuery, [tagId, tenantId]);
  
  if (tagResult.rows.length === 0) {
    throw new AppError('Tag definition not found', 404);
  }

  // 检查标签是否已存在
  const existingTagQuery = `
    SELECT id FROM user_tags 
    WHERE user_profile_id = $1 AND tag_definition_id = $2
  `;
  
  const existingResult = await pool.query(existingTagQuery, [profileId, tagId]);
  
  if (existingResult.rows.length > 0) {
    throw new AppError('Tag already exists for this user', 409);
  }

  // 添加标签
  const insertQuery = `
    INSERT INTO user_tags (
      tenant_id, user_profile_id, tag_definition_id, source,
      confidence_score, applied_reason, applied_by
    ) VALUES ($1, $2, $3, 'manual', $4, $5, $6)
    RETURNING *
  `;
  
  const result = await pool.query(insertQuery, [
    tenantId, profileId, tagId, confidence, reason, userId
  ]);

  logger.info('Manual tag added', {
    tenantId,
    userProfileId: profileId,
    tagId,
    addedBy: userId
  });

  res.status(201).json({
    success: true,
    tag: result.rows[0],
    tagInfo: tagResult.rows[0]
  });
}));

/**
 * @swagger
 * /api/user-analytics/profiles/{profileId}/tags/{tagId}:
 *   delete:
 *     summary: 移除用户标签
 *     tags: [User Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: profileId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tagId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 标签移除成功
 */
router.delete('/profiles/:profileId/tags/:tagId', authMiddleware, rbacMiddleware(['analytics:write']), asyncHandler(async (req, res) => {
  const { profileId, tagId } = req.params;
  const tenantId = req.user.tenantId;

  const deleteQuery = `
    DELETE FROM user_tags 
    WHERE user_profile_id = $1 AND tag_definition_id = $2 
      AND user_profile_id IN (
        SELECT id FROM user_profiles WHERE tenant_id = $3
      )
    RETURNING *
  `;
  
  const result = await pool.query(deleteQuery, [profileId, tagId, tenantId]);
  
  if (result.rows.length === 0) {
    throw new AppError('Tag not found for this user', 404);
  }

  logger.info('Tag removed', {
    tenantId,
    userProfileId: profileId,
    tagId,
    removedBy: req.user.id
  });

  res.json({
    success: true,
    message: 'Tag removed successfully'
  });
}));

/**
 * @swagger
 * /api/user-analytics/insights/demographics:
 *   get:
 *     summary: 获取人口统计学洞察
 *     tags: [User Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 人口统计学分析
 */
router.get('/insights/demographics', authMiddleware, rbacMiddleware(['analytics:read']), asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;

  // 年龄分布
  const ageQuery = `
    SELECT 
      estimated_age_range,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
    FROM user_profiles 
    WHERE tenant_id = $1 AND estimated_age_range IS NOT NULL
    GROUP BY estimated_age_range
    ORDER BY count DESC
  `;

  // 性别分布
  const genderQuery = `
    SELECT 
      estimated_gender,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
    FROM user_profiles 
    WHERE tenant_id = $1 AND estimated_gender IS NOT NULL
    GROUP BY estimated_gender
    ORDER BY count DESC
  `;

  // 地域分布
  const locationQuery = `
    SELECT 
      estimated_location,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
    FROM user_profiles 
    WHERE tenant_id = $1 AND estimated_location IS NOT NULL
    GROUP BY estimated_location
    ORDER BY count DESC
    LIMIT 10
  `;

  // 语言偏好
  const languageQuery = `
    SELECT 
      language_preference,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
    FROM user_profiles 
    WHERE tenant_id = $1 AND language_preference IS NOT NULL
    GROUP BY language_preference
    ORDER BY count DESC
  `;

  const [ageResult, genderResult, locationResult, languageResult] = await Promise.all([
    pool.query(ageQuery, [tenantId]),
    pool.query(genderQuery, [tenantId]),
    pool.query(locationQuery, [tenantId]),
    pool.query(languageQuery, [tenantId])
  ]);

  res.json({
    ageDistribution: ageResult.rows,
    genderDistribution: genderResult.rows,
    topLocations: locationResult.rows,
    languagePreferences: languageResult.rows,
    generatedAt: new Date().toISOString()
  });
}));

module.exports = router; 