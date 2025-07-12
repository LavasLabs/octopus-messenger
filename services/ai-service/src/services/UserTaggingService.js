const logger = require('../utils/logger');
const DatabaseManager = require('../utils/DatabaseManager');

class UserTaggingService {
  constructor(dbManager) {
    this.db = dbManager;
    this.logger = logger;
    
    // 预定义的行为分析规则
    this.behaviorRules = {
      // 活跃度分析
      activity: {
        heavy_user: {
          condition: (profile) => profile.total_messages > 100 || 
                                 (profile.total_messages > 20 && this.daysSinceFirstSeen(profile) < 30),
          confidence: 0.9
        },
        active_user: {
          condition: (profile) => this.daysSinceLastSeen(profile) <= 7,
          confidence: 0.8
        },
        dormant_user: {
          condition: (profile) => this.daysSinceLastSeen(profile) > 90,
          confidence: 0.9
        }
      },
      
      // 沟通特征分析
      communication: {
        polite_user: {
          condition: (profile) => profile.politeness_score > 0.8,
          confidence: 0.85
        },
        question_asker: {
          condition: (profile) => profile.question_frequency > 2.0,
          confidence: 0.8
        },
        quick_responder: {
          condition: (profile) => profile.avg_response_time_minutes < 5,
          confidence: 0.7
        }
      },
      
      // 价值分析
      value: {
        vip_user: {
          condition: (profile) => (profile.total_messages > 50 && profile.satisfaction_score > 0.8) ||
                                 profile.estimated_value_tier === 'vip',
          confidence: 0.9
        },
        potential_customer: {
          condition: (profile) => profile.purchase_indicators?.interest_level > 0.7,
          confidence: 0.75
        }
      },
      
      // 时间模式分析
      timing: {
        night_owl: {
          condition: (profile) => this.isNightTimeUser(profile.active_hours),
          confidence: 0.8
        },
        business_hours_user: {
          condition: (profile) => this.isBusinessHoursUser(profile.active_hours),
          confidence: 0.8
        }
      }
    };
    
    // 情感和满意度关键词
    this.sentimentKeywords = {
      positive: ['谢谢', '感谢', '很好', '满意', '棒', '赞', '完美', '优秀', '快速', '专业'],
      negative: ['抱怨', '不满', '糟糕', '差劲', '慢', '错误', '问题', '失望', '生气', '投诉'],
      urgent: ['紧急', '急', '立即', '马上', '赶紧', '尽快', 'asap', 'urgent', 'emergency'],
      question: ['怎么', '如何', '为什么', '什么', '哪里', '吗', '？', '?']
    };
  }

  // 分析用户消息并更新档案
  async analyzeUserMessage(messageData) {
    try {
      const {
        tenantId,
        senderId,
        senderName,
        content,
        platform,
        conversationId,
        timestamp
      } = messageData;

      // 获取或创建用户档案
      let userProfile = await this.getOrCreateUserProfile({
        tenantId,
        userId: senderId,
        displayName: senderName,
        platform
      });

      // 分析消息内容
      const messageAnalysis = await this.analyzeMessageContent(content);
      
      // 记录行为事件
      await this.recordBehaviorEvent({
        tenantId,
        userProfileId: userProfile.id,
        eventType: 'message_sent',
        eventCategory: 'communication',
        platform,
        conversationId,
        messageId: messageData.id,
        eventData: {
          message_length: content.length,
          sentiment: messageAnalysis.sentiment,
          urgency: messageAnalysis.urgency,
          has_question: messageAnalysis.hasQuestion,
          politeness: messageAnalysis.politeness
        },
        sentimentScore: messageAnalysis.sentiment,
        urgencyLevel: messageAnalysis.urgency,
        eventTimestamp: timestamp
      });

      // 更新用户档案
      userProfile = await this.updateUserProfile(userProfile, {
        lastMessage: messageAnalysis,
        platform,
        timestamp
      });

      // 应用自动标签规则
      await this.applyAutoTagging(userProfile);

      return {
        success: true,
        userProfileId: userProfile.id,
        analysis: messageAnalysis,
        tagsApplied: userProfile.newTags || []
      };

    } catch (error) {
      this.logger.error('Error analyzing user message', {
        error: error.message,
        messageId: messageData.id
      });
      throw error;
    }
  }

  // 获取或创建用户档案
  async getOrCreateUserProfile({ tenantId, userId, displayName, platform, email, phone }) {
    try {
      // 构造用户标识符
      const userIdentifier = email || phone || `${platform}:${userId}`;
      const userIdHash = this.hashUserId(userId);

      // 查找现有档案
      const existingQuery = `
        SELECT * FROM user_profiles 
        WHERE tenant_id = $1 AND (user_identifier = $2 OR user_id_hash = $3)
        LIMIT 1
      `;
      
      const existingResult = await this.db.query(existingQuery, [tenantId, userIdentifier, userIdHash]);
      
      if (existingResult.rows.length > 0) {
        return existingResult.rows[0];
      }

      // 创建新档案
      const insertQuery = `
        INSERT INTO user_profiles (
          tenant_id, user_identifier, user_id_hash, display_name, email, phone,
          first_seen_at, last_seen_at, total_messages, total_conversations,
          preferred_platforms, custom_attributes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NOW(), NOW(), 0, 0, $7, $8
        ) RETURNING *
      `;

      const result = await this.db.query(insertQuery, [
        tenantId,
        userIdentifier,
        userIdHash,
        displayName,
        email,
        phone,
        JSON.stringify([platform]),
        JSON.stringify({})
      ]);

      this.logger.info('Created new user profile', {
        tenantId,
        userProfileId: result.rows[0].id,
        userIdentifier
      });

      return result.rows[0];

    } catch (error) {
      this.logger.error('Error getting or creating user profile', {
        error: error.message,
        tenantId,
        userId
      });
      throw error;
    }
  }

  // 分析消息内容
  async analyzeMessageContent(content) {
    const analysis = {
      sentiment: 0,
      urgency: 0,
      politeness: 0.5,
      hasQuestion: false,
      messageLength: content.length,
      keywordMatches: {
        positive: [],
        negative: [],
        urgent: [],
        question: []
      }
    };

    const lowerContent = content.toLowerCase();

    // 情感分析
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of this.sentimentKeywords.positive) {
      if (lowerContent.includes(word)) {
        analysis.keywordMatches.positive.push(word);
        positiveCount++;
      }
    }

    for (const word of this.sentimentKeywords.negative) {
      if (lowerContent.includes(word)) {
        analysis.keywordMatches.negative.push(word);
        negativeCount++;
      }
    }

    // 计算情感分数 (-1 到 1)
    if (positiveCount > 0 || negativeCount > 0) {
      analysis.sentiment = (positiveCount - negativeCount) / Math.max(positiveCount + negativeCount, 1);
    }

    // 紧急程度分析
    for (const word of this.sentimentKeywords.urgent) {
      if (lowerContent.includes(word)) {
        analysis.keywordMatches.urgent.push(word);
        analysis.urgency = Math.min(analysis.urgency + 1, 5);
      }
    }

    // 问题检测
    for (const word of this.sentimentKeywords.question) {
      if (lowerContent.includes(word)) {
        analysis.keywordMatches.question.push(word);
        analysis.hasQuestion = true;
        break;
      }
    }

    // 礼貌程度分析
    const politeWords = ['请', '谢谢', '麻烦', '打扰', 'please', 'thank', 'sorry'];
    let politeCount = 0;
    for (const word of politeWords) {
      if (lowerContent.includes(word)) {
        politeCount++;
      }
    }
    
    if (politeCount > 0) {
      analysis.politeness = Math.min(0.7 + (politeCount * 0.1), 1.0);
    }

    return analysis;
  }

  // 记录行为事件
  async recordBehaviorEvent(eventData) {
    const insertQuery = `
      INSERT INTO user_behavior_events (
        tenant_id, user_profile_id, event_type, event_category, platform,
        event_data, conversation_id, message_id, sentiment_score,
        urgency_level, event_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    await this.db.query(insertQuery, [
      eventData.tenantId,
      eventData.userProfileId,
      eventData.eventType,
      eventData.eventCategory,
      eventData.platform,
      JSON.stringify(eventData.eventData),
      eventData.conversationId,
      eventData.messageId,
      eventData.sentimentScore,
      eventData.urgencyLevel,
      eventData.eventTimestamp
    ]);
  }

  // 更新用户档案
  async updateUserProfile(profile, updateData) {
    const { lastMessage, platform, timestamp } = updateData;
    
    // 计算更新的统计数据
    const updates = {
      last_seen_at: timestamp,
      total_messages: profile.total_messages + 1
    };

    // 更新情感分数（移动平均）
    if (lastMessage.sentiment !== 0) {
      const currentSentiment = profile.overall_sentiment || 0;
      updates.overall_sentiment = (currentSentiment * 0.8 + lastMessage.sentiment * 0.2);
    }

    // 更新礼貌度分数
    if (lastMessage.politeness !== 0.5) {
      const currentPoliteness = profile.politeness_score || 0.5;
      updates.politeness_score = (currentPoliteness * 0.8 + lastMessage.politeness * 0.2);
    }

    // 更新平均消息长度
    const currentAvgLength = profile.message_length_avg || 0;
    updates.message_length_avg = Math.round(
      (currentAvgLength * profile.total_messages + lastMessage.messageLength) / 
      (profile.total_messages + 1)
    );

    // 更新问题频率
    if (lastMessage.hasQuestion) {
      const currentQuestionFreq = profile.question_frequency || 0;
      updates.question_frequency = (currentQuestionFreq * 0.9 + 1 * 0.1);
    }

    // 更新偏好平台
    const preferredPlatforms = JSON.parse(profile.preferred_platforms || '[]');
    if (!preferredPlatforms.includes(platform)) {
      preferredPlatforms.push(platform);
      updates.preferred_platforms = JSON.stringify(preferredPlatforms);
    }

    // 执行更新
    const updateQuery = `
      UPDATE user_profiles 
      SET ${Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ')},
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query(updateQuery, [profile.id, ...Object.values(updates)]);
    return result.rows[0];
  }

  // 应用自动标签规则
  async applyAutoTagging(userProfile) {
    const newTags = [];

    try {
      // 获取活跃的标签定义和规则
      const rulesQuery = `
        SELECT tar.*, td.name as tag_name, td.display_name, td.category
        FROM tag_application_rules tar
        JOIN tag_definitions td ON tar.tag_definition_id = td.id
        WHERE tar.tenant_id = $1 AND tar.is_active = true AND td.is_active = true
        ORDER BY tar.priority DESC
      `;

      const rulesResult = await this.db.query(rulesQuery, [userProfile.tenant_id]);

      for (const rule of rulesResult.rows) {
        const shouldApplyTag = await this.evaluateTagRule(userProfile, rule);
        
        if (shouldApplyTag.apply) {
          const applied = await this.applyTag(
            userProfile.id,
            rule.tag_definition_id,
            'auto_behavior',
            shouldApplyTag.confidence,
            `Auto-applied based on rule: ${rule.rule_name}`
          );

          if (applied) {
            newTags.push({
              tagId: rule.tag_definition_id,
              tagName: rule.tag_name,
              displayName: rule.display_name,
              confidence: shouldApplyTag.confidence
            });
          }
        }
      }

      // 应用基于行为的标签
      const behaviorTags = await this.applyBehaviorBasedTags(userProfile);
      newTags.push(...behaviorTags);

      userProfile.newTags = newTags;

    } catch (error) {
      this.logger.error('Error applying auto tagging', {
        error: error.message,
        userProfileId: userProfile.id
      });
    }

    return newTags;
  }

  // 评估标签规则
  async evaluateTagRule(userProfile, rule) {
    try {
      const conditions = JSON.parse(rule.conditions);
      
      switch (rule.rule_type) {
        case 'threshold':
          return this.evaluateThresholdRule(userProfile, conditions, rule.confidence_threshold);
          
        case 'behavior':
          return this.evaluateBehaviorRule(userProfile, conditions, rule.confidence_threshold);
          
        case 'keyword':
          return this.evaluateKeywordRule(userProfile, conditions, rule.confidence_threshold);
          
        default:
          return { apply: false, confidence: 0 };
      }
    } catch (error) {
      this.logger.error('Error evaluating tag rule', {
        error: error.message,
        ruleId: rule.id
      });
      return { apply: false, confidence: 0 };
    }
  }

  // 阈值规则评估
  evaluateThresholdRule(profile, conditions, threshold) {
    const { field, operator, value } = conditions;
    const profileValue = this.getProfileValue(profile, field);
    
    let result = false;
    
    switch (operator) {
      case '>':
        result = profileValue > value;
        break;
      case '>=':
        result = profileValue >= value;
        break;
      case '<':
        result = profileValue < value;
        break;
      case '<=':
        result = profileValue <= value;
        break;
      case '=':
        result = profileValue === value;
        break;
    }

    return {
      apply: result,
      confidence: result ? threshold : 0
    };
  }

  // 行为规则评估
  async evaluateBehaviorRule(profile, conditions, threshold) {
    const { conditions: ruleConditions, logic } = conditions;
    
    let results = [];
    
    for (const condition of ruleConditions) {
      const conditionResult = this.evaluateThresholdRule(profile, condition, 1.0);
      results.push(conditionResult.apply);
    }

    let finalResult;
    if (logic === 'AND') {
      finalResult = results.every(r => r);
    } else if (logic === 'OR') {
      finalResult = results.some(r => r);
    } else {
      finalResult = results[0];
    }

    return {
      apply: finalResult,
      confidence: finalResult ? threshold : 0
    };
  }

  // 关键词规则评估
  async evaluateKeywordRule(profile, conditions, threshold) {
    // 需要查询最近的消息内容进行关键词匹配
    const recentMessagesQuery = `
      SELECT event_data FROM user_behavior_events
      WHERE user_profile_id = $1 AND event_type = 'message_sent'
      ORDER BY event_timestamp DESC
      LIMIT 10
    `;

    const result = await this.db.query(recentMessagesQuery, [profile.id]);
    const recentMessages = result.rows.map(row => row.event_data);

    // 这里可以实现关键词匹配逻辑
    // 暂时返回false
    return { apply: false, confidence: 0 };
  }

  // 应用基于行为的标签
  async applyBehaviorBasedTags(userProfile) {
    const appliedTags = [];

    for (const category in this.behaviorRules) {
      for (const tagName in this.behaviorRules[category]) {
        const rule = this.behaviorRules[category][tagName];
        
        if (rule.condition(userProfile)) {
          // 检查标签是否已存在
          const tagExists = await this.checkTagExists(userProfile.id, tagName);
          
          if (!tagExists) {
            const tagDefinition = await this.getTagDefinitionByName(userProfile.tenant_id, tagName);
            
            if (tagDefinition) {
              const applied = await this.applyTag(
                userProfile.id,
                tagDefinition.id,
                'auto_behavior',
                rule.confidence,
                `Auto-applied based on behavior analysis`
              );

              if (applied) {
                appliedTags.push({
                  tagId: tagDefinition.id,
                  tagName: tagDefinition.name,
                  displayName: tagDefinition.display_name,
                  confidence: rule.confidence
                });
              }
            }
          }
        }
      }
    }

    return appliedTags;
  }

  // 应用标签
  async applyTag(userProfileId, tagDefinitionId, source, confidence, reason) {
    try {
      // 检查标签是否已存在
      const existsQuery = `
        SELECT id FROM user_tags 
        WHERE user_profile_id = $1 AND tag_definition_id = $2
      `;
      
      const existsResult = await this.db.query(existsQuery, [userProfileId, tagDefinitionId]);
      
      if (existsResult.rows.length > 0) {
        // 更新现有标签的置信度
        const updateQuery = `
          UPDATE user_tags 
          SET confidence_score = GREATEST(confidence_score, $3),
              applied_reason = $4,
              updated_at = NOW()
          WHERE user_profile_id = $1 AND tag_definition_id = $2
        `;
        
        await this.db.query(updateQuery, [userProfileId, tagDefinitionId, confidence, reason]);
        return false; // 表示没有新增标签
      } else {
        // 插入新标签
        const insertQuery = `
          INSERT INTO user_tags (
            tenant_id, user_profile_id, tag_definition_id, source,
            confidence_score, applied_reason
          ) VALUES (
            (SELECT tenant_id FROM user_profiles WHERE id = $1),
            $1, $2, $3, $4, $5
          )
        `;
        
        await this.db.query(insertQuery, [
          userProfileId, tagDefinitionId, source, confidence, reason
        ]);
        
        return true; // 表示新增了标签
      }
    } catch (error) {
      this.logger.error('Error applying tag', {
        error: error.message,
        userProfileId,
        tagDefinitionId
      });
      return false;
    }
  }

  // 生成用户分析报告
  async generateUserAnalysisReport(tenantId, options = {}) {
    const {
      period = 'monthly',
      startDate,
      endDate,
      userProfileIds,
      includeTagStats = true,
      includeBehaviorAnalysis = true
    } = options;

    try {
      const report = {
        period,
        startDate,
        endDate,
        generatedAt: new Date().toISOString(),
        summary: {},
        users: [],
        tagAnalysis: {},
        behaviorInsights: {},
        recommendations: []
      };

      // 生成用户概览
      report.summary = await this.generateUserSummary(tenantId, { startDate, endDate });

      // 生成标签分析
      if (includeTagStats) {
        report.tagAnalysis = await this.generateTagAnalysis(tenantId, { startDate, endDate });
      }

      // 生成行为洞察
      if (includeBehaviorAnalysis) {
        report.behaviorInsights = await this.generateBehaviorInsights(tenantId, { startDate, endDate });
      }

      // 生成建议
      report.recommendations = await this.generateRecommendations(tenantId, report);

      return report;

    } catch (error) {
      this.logger.error('Error generating user analysis report', {
        error: error.message,
        tenantId
      });
      throw error;
    }
  }

  // 生成用户概览
  async generateUserSummary(tenantId, { startDate, endDate }) {
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE first_seen_at >= $2) as new_users,
        COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '7 days') as active_last_7_days,
        COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '30 days') as active_last_30_days,
        COUNT(*) FILTER (WHERE estimated_value_tier = 'vip') as vip_users,
        AVG(total_messages) as avg_messages_per_user,
        AVG(satisfaction_score) as avg_satisfaction,
        AVG(overall_sentiment) as avg_sentiment
      FROM user_profiles 
      WHERE tenant_id = $1
      ${endDate ? 'AND created_at <= $3' : ''}
    `;

    const params = [tenantId, startDate];
    if (endDate) params.push(endDate);

    const result = await this.db.query(summaryQuery, params);
    return result.rows[0];
  }

  // 生成标签分析
  async generateTagAnalysis(tenantId, { startDate, endDate }) {
    const tagStatsQuery = `
      SELECT 
        td.name,
        td.display_name,
        td.category,
        COUNT(ut.id) as usage_count,
        AVG(ut.confidence_score) as avg_confidence,
        COUNT(ut.id) FILTER (WHERE ut.source = 'auto_ai') as ai_generated,
        COUNT(ut.id) FILTER (WHERE ut.source = 'manual') as manual_added
      FROM tag_definitions td
      LEFT JOIN user_tags ut ON td.id = ut.tag_definition_id
      WHERE td.tenant_id = $1 AND td.is_active = true
      ${startDate ? 'AND (ut.created_at IS NULL OR ut.created_at >= $2)' : ''}
      ${endDate ? `AND (ut.created_at IS NULL OR ut.created_at <= $${endDate ? 3 : 2})` : ''}
      GROUP BY td.id, td.name, td.display_name, td.category
      ORDER BY usage_count DESC
    `;

    const params = [tenantId];
    if (startDate) params.push(startDate);
    if (endDate) params.push(endDate);

    const result = await this.db.query(tagStatsQuery, params);
    return {
      topTags: result.rows.slice(0, 10),
      categoryDistribution: this.groupBy(result.rows, 'category'),
      totalTags: result.rows.length
    };
  }

  // 生成行为洞察
  async generateBehaviorInsights(tenantId, { startDate, endDate }) {
    const behaviorQuery = `
      SELECT 
        event_type,
        event_category,
        platform,
        COUNT(*) as event_count,
        AVG(sentiment_score) as avg_sentiment,
        AVG(urgency_level) as avg_urgency
      FROM user_behavior_events ube
      JOIN user_profiles up ON ube.user_profile_id = up.id
      WHERE up.tenant_id = $1
      ${startDate ? 'AND ube.event_timestamp >= $2' : ''}
      ${endDate ? `AND ube.event_timestamp <= $${endDate ? 3 : 2}` : ''}
      GROUP BY event_type, event_category, platform
      ORDER BY event_count DESC
    `;

    const params = [tenantId];
    if (startDate) params.push(startDate);
    if (endDate) params.push(endDate);

    const result = await this.db.query(behaviorQuery, params);
    
    return {
      topEvents: result.rows.slice(0, 10),
      platformActivity: this.groupBy(result.rows, 'platform'),
      sentimentTrends: result.rows.map(row => ({
        type: row.event_type,
        sentiment: parseFloat(row.avg_sentiment) || 0
      }))
    };
  }

  // 生成建议
  async generateRecommendations(tenantId, report) {
    const recommendations = [];

    // 基于用户活跃度的建议
    if (report.summary.active_last_7_days < report.summary.total_users * 0.3) {
      recommendations.push({
        type: 'engagement',
        priority: 'high',
        title: '用户活跃度偏低',
        description: '建议制定用户激活策略，提高用户参与度',
        metrics: {
          current_active_rate: (report.summary.active_last_7_days / report.summary.total_users * 100).toFixed(1) + '%'
        }
      });
    }

    // 基于满意度的建议
    if (report.summary.avg_satisfaction < 0.7) {
      recommendations.push({
        type: 'satisfaction',
        priority: 'high',
        title: '客户满意度需要改善',
        description: '建议优化服务质量，关注客户反馈',
        metrics: {
          current_satisfaction: (report.summary.avg_satisfaction * 100).toFixed(1) + '%'
        }
      });
    }

    // 基于标签使用的建议
    if (report.tagAnalysis.topTags.length < 5) {
      recommendations.push({
        type: 'tagging',
        priority: 'medium',
        title: '标签系统利用不足',
        description: '建议完善用户标签，提高客户分析精度',
        metrics: {
          active_tags: report.tagAnalysis.totalTags
        }
      });
    }

    return recommendations;
  }

  // 辅助方法
  hashUserId(userId) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(userId.toString()).digest('hex');
  }

  daysSinceFirstSeen(profile) {
    if (!profile.first_seen_at) return 0;
    const firstSeen = new Date(profile.first_seen_at);
    const now = new Date();
    return Math.floor((now - firstSeen) / (1000 * 60 * 60 * 24));
  }

  daysSinceLastSeen(profile) {
    if (!profile.last_seen_at) return 999;
    const lastSeen = new Date(profile.last_seen_at);
    const now = new Date();
    return Math.floor((now - lastSeen) / (1000 * 60 * 60 * 24));
  }

  isNightTimeUser(activeHours) {
    if (!activeHours || activeHours.length === 0) return false;
    const hours = JSON.parse(activeHours);
    return hours.some(period => period.start >= 22 || period.end <= 6);
  }

  isBusinessHoursUser(activeHours) {
    if (!activeHours || activeHours.length === 0) return false;
    const hours = JSON.parse(activeHours);
    return hours.some(period => period.start >= 9 && period.end <= 18);
  }

  getProfileValue(profile, field) {
    const fieldMap = {
      'days_since_first_seen': this.daysSinceFirstSeen(profile),
      'days_since_last_seen': this.daysSinceLastSeen(profile),
      'total_messages': profile.total_messages,
      'total_conversations': profile.total_conversations,
      'satisfaction_score': profile.satisfaction_score,
      'messages_per_week': profile.total_messages / Math.max(this.daysSinceFirstSeen(profile) / 7, 1)
    };

    return fieldMap[field] || profile[field] || 0;
  }

  async checkTagExists(userProfileId, tagName) {
    const query = `
      SELECT ut.id FROM user_tags ut
      JOIN tag_definitions td ON ut.tag_definition_id = td.id
      WHERE ut.user_profile_id = $1 AND td.name = $2
    `;
    
    const result = await this.db.query(query, [userProfileId, tagName]);
    return result.rows.length > 0;
  }

  async getTagDefinitionByName(tenantId, tagName) {
    const query = `
      SELECT * FROM tag_definitions 
      WHERE tenant_id = $1 AND name = $2 AND is_active = true
    `;
    
    const result = await this.db.query(query, [tenantId, tagName]);
    return result.rows[0] || null;
  }

  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key];
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {});
  }
}

module.exports = UserTaggingService; 