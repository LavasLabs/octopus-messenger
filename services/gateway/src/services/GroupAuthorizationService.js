const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');
const pool = require('../config/database');

class GroupAuthorizationService {
  constructor() {
    this.logger = logger;
    this.policyCache = new Map(); // 缓存权限策略
    this.ruleCache = new Map(); // 缓存权限规则
    this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
  }

  // 检查群组是否有权限使用Bot
  async checkGroupPermission(botConfigId, groupData) {
    try {
      const {
        platformGroupId,
        groupName,
        groupType,
        memberCount,
        invitedByUserId,
        invitedByUsername,
        platform
      } = groupData;

      this.logger.info('Checking group permission', {
        botConfigId,
        platformGroupId,
        groupName,
        groupType,
        memberCount
      });

      // 1. 获取Bot权限策略
      const policy = await this.getBotAuthPolicy(botConfigId);
      if (!policy) {
        return {
          allowed: false,
          reason: 'No authorization policy found for this bot'
        };
      }

      // 2. 检查群组是否已存在
      const existingGroup = await this.getGroupInfo(botConfigId, platformGroupId);
      if (existingGroup) {
        return this.checkExistingGroupPermission(existingGroup, policy);
      }

      // 3. 检查群组类型限制
      const allowedTypes = JSON.parse(policy.allowed_group_types || '[]');
      if (allowedTypes.length > 0 && !allowedTypes.includes(groupType)) {
        return {
          allowed: false,
          reason: `Group type '${groupType}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`
        };
      }

      // 4. 检查群组成员数限制
      if (memberCount > policy.max_members_per_group) {
        return {
          allowed: false,
          reason: `Group has ${memberCount} members, exceeding limit of ${policy.max_members_per_group}`
        };
      }

      // 5. 检查群组数量限制
      const currentGroupCount = await this.getApprovedGroupCount(botConfigId);
      if (currentGroupCount >= policy.max_groups) {
        return {
          allowed: false,
          reason: `Maximum number of groups (${policy.max_groups}) reached`
        };
      }

      // 6. 检查权限规则
      const ruleResult = await this.checkPermissionRules(botConfigId, groupData);
      if (!ruleResult.allowed) {
        return ruleResult;
      }

      // 7. 根据权限策略类型决定是否允许
      switch (policy.policy_type) {
        case 'open':
          return await this.handleOpenPolicy(botConfigId, groupData, policy);
        
        case 'whitelist':
          return await this.handleWhitelistPolicy(botConfigId, groupData, policy);
        
        case 'blacklist':
          return await this.handleBlacklistPolicy(botConfigId, groupData, policy);
        
        case 'approval':
          return await this.handleApprovalPolicy(botConfigId, groupData, policy);
        
        default:
          return {
            allowed: false,
            reason: `Unknown policy type: ${policy.policy_type}`
          };
      }

    } catch (error) {
      this.logger.error('Error checking group permission', {
        error: error.message,
        botConfigId,
        platformGroupId: groupData.platformGroupId
      });
      
      return {
        allowed: false,
        reason: 'Internal error during permission check'
      };
    }
  }

  // 处理开放策略
  async handleOpenPolicy(botConfigId, groupData, policy) {
    // 开放策略：直接允许并记录
    await this.createGroupInfo(botConfigId, groupData, 'approved');
    
    await this.logGroupOperation({
      botConfigId,
      platformGroupId: groupData.platformGroupId,
      operationType: 'auto_approve',
      operatorType: 'system',
      result: 'success',
      platform: groupData.platform,
      metadata: { policy_type: 'open' }
    });

    return {
      allowed: true,
      reason: 'Open policy - automatically approved',
      requiresApproval: false
    };
  }

  // 处理白名单策略
  async handleWhitelistPolicy(botConfigId, groupData, policy) {
    // 白名单策略：只有在白名单中的群组才能使用
    const isWhitelisted = await this.checkWhitelist(botConfigId, groupData);
    
    if (!isWhitelisted) {
      return {
        allowed: false,
        reason: 'Group is not in whitelist'
      };
    }

    await this.createGroupInfo(botConfigId, groupData, 'approved');
    
    await this.logGroupOperation({
      botConfigId,
      platformGroupId: groupData.platformGroupId,
      operationType: 'auto_approve',
      operatorType: 'system',
      result: 'success',
      platform: groupData.platform,
      metadata: { policy_type: 'whitelist' }
    });

    return {
      allowed: true,
      reason: 'Group is whitelisted',
      requiresApproval: false
    };
  }

  // 处理黑名单策略
  async handleBlacklistPolicy(botConfigId, groupData, policy) {
    // 黑名单策略：不在黑名单中的群组可以使用
    const isBlacklisted = await this.checkBlacklist(botConfigId, groupData);
    
    if (isBlacklisted) {
      return {
        allowed: false,
        reason: 'Group is blacklisted'
      };
    }

    const status = policy.auto_approve ? 'approved' : 'pending';
    await this.createGroupInfo(botConfigId, groupData, status);
    
    await this.logGroupOperation({
      botConfigId,
      platformGroupId: groupData.platformGroupId,
      operationType: policy.auto_approve ? 'auto_approve' : 'request_approval',
      operatorType: 'system',
      result: 'success',
      platform: groupData.platform,
      metadata: { policy_type: 'blacklist' }
    });

    return {
      allowed: true,
      reason: policy.auto_approve ? 'Not blacklisted - auto approved' : 'Not blacklisted - pending approval',
      requiresApproval: !policy.auto_approve
    };
  }

  // 处理审批策略
  async handleApprovalPolicy(botConfigId, groupData, policy) {
    // 审批策略：需要管理员审批
    const status = policy.auto_approve ? 'approved' : 'pending';
    await this.createGroupInfo(botConfigId, groupData, status);
    
    await this.logGroupOperation({
      botConfigId,
      platformGroupId: groupData.platformGroupId,
      operationType: policy.auto_approve ? 'auto_approve' : 'request_approval',
      operatorType: 'system',
      result: 'success',
      platform: groupData.platform,
      metadata: { policy_type: 'approval' }
    });

    if (policy.auto_approve) {
      return {
        allowed: true,
        reason: 'Auto-approved by policy',
        requiresApproval: false
      };
    } else {
      // 发送审批通知
      await this.sendApprovalNotification(botConfigId, groupData);
      
      return {
        allowed: false,
        reason: 'Approval required - request submitted',
        requiresApproval: true,
        pendingApproval: true
      };
    }
  }

  // 检查现有群组权限
  async checkExistingGroupPermission(groupInfo, policy) {
    switch (groupInfo.status) {
      case 'approved':
        // 检查配额
        if (groupInfo.message_used >= groupInfo.message_quota) {
          return {
            allowed: false,
            reason: 'Message quota exceeded'
          };
        }
        
        // 检查是否需要配额重置
        if (new Date() > new Date(groupInfo.quota_reset_at)) {
          await this.resetGroupQuota(groupInfo.id);
        }
        
        return {
          allowed: true,
          reason: 'Group previously approved',
          groupInfo
        };
        
      case 'pending':
        return {
          allowed: false,
          reason: 'Group approval pending',
          pendingApproval: true
        };
        
      case 'rejected':
        return {
          allowed: false,
          reason: 'Group access rejected'
        };
        
      case 'suspended':
        return {
          allowed: false,
          reason: 'Group access suspended'
        };
        
      case 'blacklisted':
        return {
          allowed: false,
          reason: 'Group is blacklisted'
        };
        
      default:
        return {
          allowed: false,
          reason: 'Unknown group status'
        };
    }
  }

  // 检查权限规则
  async checkPermissionRules(botConfigId, groupData) {
    try {
      const rules = await this.getPermissionRules(botConfigId);
      
      // 按优先级排序
      rules.sort((a, b) => b.priority - a.priority);
      
      for (const rule of rules) {
        const match = await this.evaluateRule(rule, groupData);
        
        if (match) {
          // 更新规则匹配统计
          await this.updateRuleMatchStats(rule.id);
          
          this.logger.info('Permission rule matched', {
            ruleId: rule.id,
            ruleName: rule.rule_name,
            action: rule.action,
            groupName: groupData.groupName
          });
          
          switch (rule.action) {
            case 'allow':
              return {
                allowed: true,
                reason: `Allowed by rule: ${rule.rule_name}`
              };
              
            case 'deny':
              return {
                allowed: false,
                reason: `Denied by rule: ${rule.rule_name}`
              };
              
            case 'require_approval':
              return {
                allowed: false,
                reason: `Approval required by rule: ${rule.rule_name}`,
                requiresApproval: true
              };
          }
        }
      }
      
      // 没有匹配的规则，返回允许
      return {
        allowed: true,
        reason: 'No matching permission rules'
      };
      
    } catch (error) {
      this.logger.error('Error checking permission rules', {
        error: error.message,
        botConfigId
      });
      
      return {
        allowed: true,
        reason: 'Error checking rules - defaulting to allow'
      };
    }
  }

  // 评估权限规则
  async evaluateRule(rule, groupData) {
    const conditions = JSON.parse(rule.conditions);
    
    switch (rule.rule_type) {
      case 'keyword':
        return this.evaluateKeywordRule(conditions, groupData);
        
      case 'regex':
        return this.evaluateRegexRule(conditions, groupData);
        
      case 'whitelist':
        return this.evaluateWhitelistRule(conditions, groupData);
        
      case 'blacklist':
        return this.evaluateBlacklistRule(conditions, groupData);
        
      case 'member_count':
        return this.evaluateMemberCountRule(conditions, groupData);
        
      default:
        return false;
    }
  }

  // 评估关键词规则
  evaluateKeywordRule(conditions, groupData) {
    const { keywords, match_type = 'contains' } = conditions;
    const { groupName, groupDescription } = groupData;
    
    const text = `${groupName || ''} ${groupDescription || ''}`.toLowerCase();
    
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      
      switch (match_type) {
        case 'contains':
          if (text.includes(lowerKeyword)) return true;
          break;
        case 'starts_with':
          if (text.startsWith(lowerKeyword)) return true;
          break;
        case 'ends_with':
          if (text.endsWith(lowerKeyword)) return true;
          break;
        case 'exact':
          if (text === lowerKeyword) return true;
          break;
      }
    }
    
    return false;
  }

  // 评估正则表达式规则
  evaluateRegexRule(conditions, groupData) {
    const { patterns } = conditions;
    const { groupName, groupDescription } = groupData;
    
    const text = `${groupName || ''} ${groupDescription || ''}`;
    
    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) return true;
      } catch (error) {
        this.logger.warn('Invalid regex pattern', { pattern, error: error.message });
      }
    }
    
    return false;
  }

  // 评估成员数规则
  evaluateMemberCountRule(conditions, groupData) {
    const { min_members, max_members } = conditions;
    const { memberCount } = groupData;
    
    if (min_members !== undefined && memberCount < min_members) return false;
    if (max_members !== undefined && memberCount > max_members) return false;
    
    return true;
  }

  // 获取Bot权限策略
  async getBotAuthPolicy(botConfigId) {
    // 先从缓存获取
    const cacheKey = `policy:${botConfigId}`;
    const cached = this.policyCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    
    // 从数据库获取
    const query = `
      SELECT * FROM bot_auth_policies 
      WHERE bot_config_id = $1 AND is_active = true
    `;
    
    const result = await pool.query(query, [botConfigId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const policy = result.rows[0];
    
    // 缓存结果
    this.policyCache.set(cacheKey, {
      data: policy,
      timestamp: Date.now()
    });
    
    return policy;
  }

  // 获取权限规则
  async getPermissionRules(botConfigId) {
    const cacheKey = `rules:${botConfigId}`;
    const cached = this.ruleCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    
    const query = `
      SELECT * FROM group_permission_rules 
      WHERE bot_config_id = $1 AND is_active = true
      AND (valid_until IS NULL OR valid_until > NOW())
      ORDER BY priority DESC
    `;
    
    const result = await pool.query(query, [botConfigId]);
    
    const rules = result.rows;
    
    // 缓存结果
    this.ruleCache.set(cacheKey, {
      data: rules,
      timestamp: Date.now()
    });
    
    return rules;
  }

  // 获取群组信息
  async getGroupInfo(botConfigId, platformGroupId) {
    const query = `
      SELECT * FROM group_info 
      WHERE bot_config_id = $1 AND platform_group_id = $2
    `;
    
    const result = await pool.query(query, [botConfigId, platformGroupId]);
    
    return result.rows[0] || null;
  }

  // 创建群组信息
  async createGroupInfo(botConfigId, groupData, status) {
    const {
      platformGroupId,
      groupName,
      groupType,
      groupDescription,
      memberCount,
      invitedByUserId,
      invitedByUsername,
      platform
    } = groupData;
    
    // 获取租户ID
    const tenantQuery = `
      SELECT tenant_id FROM bot_configs WHERE id = $1
    `;
    const tenantResult = await pool.query(tenantQuery, [botConfigId]);
    const tenantId = tenantResult.rows[0].tenant_id;
    
    // 获取默认配额
    const policy = await this.getBotAuthPolicy(botConfigId);
    const defaultQuota = policy ? policy.default_message_quota : 1000;
    
    // 计算配额重置时间
    const resetPeriod = policy ? policy.quota_reset_period : 'monthly';
    const quotaResetAt = this.calculateQuotaResetTime(resetPeriod);
    
    const insertQuery = `
      INSERT INTO group_info (
        tenant_id, bot_config_id, platform_group_id, group_name, group_type,
        group_description, member_count, status, message_quota, quota_reset_at,
        invited_by_user_id, invited_by_username, invite_timestamp, bot_join_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING id
    `;
    
    const result = await pool.query(insertQuery, [
      tenantId,
      botConfigId,
      platformGroupId,
      groupName,
      groupType,
      groupDescription,
      memberCount,
      status,
      defaultQuota,
      quotaResetAt,
      invitedByUserId,
      invitedByUsername
    ]);
    
    return result.rows[0].id;
  }

  // 记录群组操作日志
  async logGroupOperation(operationData) {
    const {
      botConfigId,
      platformGroupId,
      operationType,
      operatorType,
      operatorId,
      operatorName,
      result,
      errorMessage,
      platform,
      metadata
    } = operationData;
    
    // 获取租户ID
    const tenantQuery = `
      SELECT tenant_id FROM bot_configs WHERE id = $1
    `;
    const tenantResult = await pool.query(tenantQuery, [botConfigId]);
    const tenantId = tenantResult.rows[0].tenant_id;
    
    // 获取群组信息ID
    const groupQuery = `
      SELECT id FROM group_info 
      WHERE bot_config_id = $1 AND platform_group_id = $2
    `;
    const groupResult = await pool.query(groupQuery, [botConfigId, platformGroupId]);
    const groupInfoId = groupResult.rows[0]?.id;
    
    const insertQuery = `
      INSERT INTO group_operation_logs (
        tenant_id, bot_config_id, group_info_id, operation_type, operator_type,
        operator_id, operator_name, result, error_message, platform,
        platform_group_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;
    
    await pool.query(insertQuery, [
      tenantId,
      botConfigId,
      groupInfoId,
      operationType,
      operatorType,
      operatorId,
      operatorName,
      result,
      errorMessage,
      platform,
      platformGroupId,
      JSON.stringify(metadata || {})
    ]);
  }

  // 审批群组请求
  async approveGroupRequest(groupInfoId, approvedBy, reason) {
    const updateQuery = `
      UPDATE group_info 
      SET status = 'approved', approved_by = $2, approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING bot_config_id, platform_group_id
    `;
    
    const result = await pool.query(updateQuery, [groupInfoId, approvedBy]);
    
    if (result.rows.length === 0) {
      throw new AppError('Group not found', 404);
    }
    
    const { bot_config_id, platform_group_id } = result.rows[0];
    
    // 记录操作日志
    await this.logGroupOperation({
      botConfigId: bot_config_id,
      platformGroupId: platform_group_id,
      operationType: 'approve',
      operatorType: 'admin',
      operatorId: approvedBy,
      result: 'success',
      metadata: { reason }
    });
    
    return true;
  }

  // 拒绝群组请求
  async rejectGroupRequest(groupInfoId, rejectedBy, reason) {
    const updateQuery = `
      UPDATE group_info 
      SET status = 'rejected', rejection_reason = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING bot_config_id, platform_group_id
    `;
    
    const result = await pool.query(updateQuery, [groupInfoId, reason]);
    
    if (result.rows.length === 0) {
      throw new AppError('Group not found', 404);
    }
    
    const { bot_config_id, platform_group_id } = result.rows[0];
    
    // 记录操作日志
    await this.logGroupOperation({
      botConfigId: bot_config_id,
      platformGroupId: platform_group_id,
      operationType: 'reject',
      operatorType: 'admin',
      operatorId: rejectedBy,
      result: 'success',
      metadata: { reason }
    });
    
    return true;
  }

  // 更新消息使用计数
  async updateMessageUsage(botConfigId, platformGroupId, messageCount = 1) {
    const updateQuery = `
      UPDATE group_info 
      SET message_used = message_used + $3, last_activity_at = NOW()
      WHERE bot_config_id = $1 AND platform_group_id = $2
      RETURNING message_used, message_quota
    `;
    
    const result = await pool.query(updateQuery, [botConfigId, platformGroupId, messageCount]);
    
    if (result.rows.length === 0) {
      this.logger.warn('Group not found for message usage update', {
        botConfigId,
        platformGroupId
      });
      return false;
    }
    
    const { message_used, message_quota } = result.rows[0];
    
    // 检查是否接近配额限制
    const usagePercentage = (message_used / message_quota) * 100;
    if (usagePercentage >= 90) {
      this.logger.warn('Group approaching message quota limit', {
        botConfigId,
        platformGroupId,
        usagePercentage
      });
      
      // 发送配额警告通知
      await this.sendQuotaWarning(botConfigId, platformGroupId, usagePercentage);
    }
    
    return true;
  }

  // 计算配额重置时间
  calculateQuotaResetTime(resetPeriod) {
    const now = new Date();
    
    switch (resetPeriod) {
      case 'daily':
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow;
        
      case 'weekly':
        const nextWeek = new Date(now);
        nextWeek.setDate(now.getDate() + (7 - now.getDay()));
        nextWeek.setHours(0, 0, 0, 0);
        return nextWeek;
        
      case 'monthly':
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return nextMonth;
        
      default:
        return new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
  }

  // 重置群组配额
  async resetGroupQuota(groupInfoId) {
    const query = `
      UPDATE group_info 
      SET message_used = 0, 
          quota_reset_at = $2,
          updated_at = NOW()
      WHERE id = $1
    `;
    
    // 重新计算下次重置时间
    const policy = await this.getBotAuthPolicy(groupInfoId);
    const resetPeriod = policy ? policy.quota_reset_period : 'monthly';
    const nextResetTime = this.calculateQuotaResetTime(resetPeriod);
    
    await pool.query(query, [groupInfoId, nextResetTime]);
  }

  // 获取已批准的群组数量
  async getApprovedGroupCount(botConfigId) {
    const query = `
      SELECT COUNT(*) as count 
      FROM group_info 
      WHERE bot_config_id = $1 AND status = 'approved'
    `;
    
    const result = await pool.query(query, [botConfigId]);
    return parseInt(result.rows[0].count);
  }

  // 发送审批通知
  async sendApprovalNotification(botConfigId, groupData) {
    // 这里可以发送邮件、短信或其他通知
    this.logger.info('Approval notification sent', {
      botConfigId,
      groupName: groupData.groupName,
      platformGroupId: groupData.platformGroupId
    });
  }

  // 发送配额警告
  async sendQuotaWarning(botConfigId, platformGroupId, usagePercentage) {
    this.logger.warn('Quota warning sent', {
      botConfigId,
      platformGroupId,
      usagePercentage
    });
  }

  // 更新规则匹配统计
  async updateRuleMatchStats(ruleId) {
    const updateQuery = `
      UPDATE group_permission_rules 
      SET match_count = match_count + 1, last_matched_at = NOW()
      WHERE id = $1
    `;
    
    await pool.query(updateQuery, [ruleId]);
  }

  // 检查白名单（简化实现）
  async checkWhitelist(botConfigId, groupData) {
    const rules = await this.getPermissionRules(botConfigId);
    return rules.some(rule => 
      rule.rule_type === 'whitelist' && 
      rule.action === 'allow' && 
      this.evaluateRule(rule, groupData)
    );
  }

  // 检查黑名单（简化实现）
  async checkBlacklist(botConfigId, groupData) {
    const rules = await this.getPermissionRules(botConfigId);
    return rules.some(rule => 
      rule.rule_type === 'blacklist' && 
      rule.action === 'deny' && 
      this.evaluateRule(rule, groupData)
    );
  }

  // 清理缓存
  clearCache() {
    this.policyCache.clear();
    this.ruleCache.clear();
  }
}

module.exports = GroupAuthorizationService; 