const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requirePermission, auditLog, requireTenant } = require('../middleware/auth');
const logger = require('../utils/logger');

// 获取当前租户模式
router.get('/current', 
  requirePermission('mode:read'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { tenantModeManager } = req.app.locals;
    
    const modeConfig = await tenantModeManager.getTenantMode(req.tenantId);
    
    res.json({
      success: true,
      mode: modeConfig.mode,
      config: modeConfig.config,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取模式详细信息和统计
router.get('/info', 
  requirePermission('mode:read'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { tenantModeManager } = req.app.locals;
    
    const modeConfig = await tenantModeManager.getTenantMode(req.tenantId);
    const statistics = await tenantModeManager.getModeStatistics(req.tenantId);
    
    res.json({
      success: true,
      mode: modeConfig.mode,
      config: modeConfig.config,
      statistics,
      supportedModes: {
        training: {
          name: '训练模式',
          description: '存储聊天数据，训练个性化AI模型',
          features: ['数据存储', '模型训练', '个性化分析', '高级统计'],
          dataRetention: true,
          requiresSubscription: true
        },
        normal: {
          name: '普通模式',
          description: '使用通用AI模型，不存储聊天数据',
          features: ['通用分类', '隐私保护', '即时响应'],
          dataRetention: false,
          requiresSubscription: false
        }
      },
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  })
);

// 切换模式
router.post('/switch', 
  requirePermission('mode:write'),
  requireTenant,
  auditLog('switch_tenant_mode'),
  asyncHandler(async (req, res) => {
    const { mode, reason } = req.body;
    const { tenantModeManager } = req.app.locals;
    
    if (!mode) {
      return res.status(400).json({
        success: false,
        error: 'Mode is required'
      });
    }

    // 检查模式是否有效
    const validModes = ['training', 'normal'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid mode. Valid modes are: ${validModes.join(', ')}`
      });
    }

    logger.info('Switching tenant mode', {
      tenantId: req.tenantId,
      userId: req.user.id,
      requestedMode: mode,
      reason: reason || 'User requested'
    });

    const result = await tenantModeManager.switchMode(
      req.tenantId, 
      mode, 
      reason || `Switched by user ${req.user.id}`
    );

    // 根据模式切换结果返回相应的提示信息
    let message = result.message;
    if (mode === 'training' && result.success) {
      message += '\n⚠️  训练模式已启用：\n- 您的聊天数据将被存储用于训练个性化AI模型\n- 这有助于提高AI回复的准确性\n- 您可以随时切换回普通模式';
    } else if (mode === 'normal' && result.success) {
      message += '\n✅ 普通模式已启用：\n- 您的聊天数据将不会被存储\n- 使用通用AI模型进行回复\n- 保护您的隐私安全';
    }

    res.json({
      success: result.success,
      message,
      previousMode: result.previousMode,
      currentMode: result.newMode,
      timestamp: new Date().toISOString()
    });
  })
);

// 设置模式配置
router.post('/config', 
  requirePermission('mode:write'),
  requireTenant,
  auditLog('update_mode_config'),
  asyncHandler(async (req, res) => {
    const { config } = req.body;
    const { tenantModeManager } = req.app.locals;
    
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Config object is required'
      });
    }

    // 获取当前模式
    const currentMode = await tenantModeManager.getTenantMode(req.tenantId);
    
    // 更新配置
    const result = await tenantModeManager.setTenantMode(
      req.tenantId, 
      currentMode.mode, 
      config
    );

    logger.info('Mode configuration updated', {
      tenantId: req.tenantId,
      userId: req.user.id,
      mode: currentMode.mode,
      config
    });

    res.json({
      success: true,
      message: 'Mode configuration updated successfully',
      mode: currentMode.mode,
      config,
      timestamp: new Date().toISOString()
    });
  })
);

// 获取模式切换历史
router.get('/history', 
  requirePermission('mode:read'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;
    const { tenantModeManager } = req.app.locals;
    
    const history = await tenantModeManager.getModeHistory(req.tenantId, parseInt(limit));
    
    res.json({
      success: true,
      history,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  })
);

// 检查训练模式权限
router.get('/training-permission', 
  requirePermission('mode:read'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { tenantModeManager } = req.app.locals;
    
    const canEnable = await tenantModeManager.canEnableTrainingMode(req.tenantId);
    
    res.json({
      success: true,
      canEnableTraining: canEnable,
      tenantId: req.tenantId,
      message: canEnable ? 
        'Training mode is available for your subscription' : 
        'Training mode requires premium or enterprise subscription',
      timestamp: new Date().toISOString()
    });
  })
);

// 获取训练模式数据统计
router.get('/training-stats', 
  requirePermission('mode:read'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { tenantModeManager } = req.app.locals;
    
    const isTrainingMode = await tenantModeManager.isTrainingMode(req.tenantId);
    
    if (!isTrainingMode) {
      return res.status(400).json({
        success: false,
        error: 'Training statistics are only available in training mode'
      });
    }

    const statistics = await tenantModeManager.getModeStatistics(req.tenantId);
    
    res.json({
      success: true,
      statistics,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  })
);

// 清理过期数据（训练模式）
router.post('/cleanup', 
  requirePermission('mode:write'),
  requireTenant,
  auditLog('cleanup_training_data'),
  asyncHandler(async (req, res) => {
    const { tenantModeManager } = req.app.locals;
    
    const isTrainingMode = await tenantModeManager.isTrainingMode(req.tenantId);
    
    if (!isTrainingMode) {
      return res.status(400).json({
        success: false,
        error: 'Data cleanup is only available in training mode'
      });
    }

    const result = await tenantModeManager.cleanupExpiredData(req.tenantId);
    
    logger.info('Training data cleanup completed', {
      tenantId: req.tenantId,
      userId: req.user.id,
      cleanedRecords: result.cleaned
    });

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  })
);

// 模式推荐接口
router.get('/recommend', 
  requirePermission('mode:read'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { tenantModeManager, dbManager } = req.app.locals;
    
    try {
      const currentMode = await tenantModeManager.getTenantMode(req.tenantId);
      
      // 获取使用情况统计
      const usageQuery = `
        SELECT 
          COUNT(*) as total_classifications,
          COUNT(DISTINCT DATE(created_at)) as active_days,
          MIN(created_at) as first_classification,
          MAX(created_at) as last_classification
        FROM ai_classifications 
        WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      `;
      
      const usageResult = await dbManager.query(usageQuery, [req.tenantId]);
      const usage = usageResult.rows[0];
      
      let recommendation = {
        currentMode: currentMode.mode,
        recommendedMode: currentMode.mode,
        reason: '',
        benefits: [],
        considerations: []
      };

      // 推荐逻辑
      if (currentMode.mode === 'normal') {
        const dailyUsage = parseInt(usage.total_classifications) / Math.max(parseInt(usage.active_days), 1);
        
        if (dailyUsage > 50) {
          recommendation.recommendedMode = 'training';
          recommendation.reason = '基于您的高使用频率，训练模式可以提供更个性化的AI回复';
          recommendation.benefits = [
            '个性化AI模型训练',
            '提高回复准确性',
            '详细使用分析',
            '自定义分类规则'
          ];
          recommendation.considerations = [
            '会存储您的聊天数据',
            '需要一定时间进行模型训练',
            '可能需要升级订阅计划'
          ];
        } else {
          recommendation.reason = '当前普通模式适合您的使用情况，保护隐私的同时提供良好的AI服务';
          recommendation.benefits = [
            '完全隐私保护',
            '即时响应',
            '无需额外配置'
          ];
        }
      } else {
        // 训练模式
        const trainingStats = await tenantModeManager.getModeStatistics(req.tenantId);
        
        if (trainingStats.trainingData && trainingStats.trainingData.totalMessages > 100) {
          recommendation.reason = '训练模式运行良好，已收集足够数据进行模型优化';
          recommendation.benefits = [
            '持续模型优化',
            '个性化程度不断提升',
            '详细数据分析'
          ];
        } else {
          recommendation.reason = '训练模式刚开始，需要更多数据来改善AI效果';
          recommendation.benefits = [
            '数据收集中',
            '模型将逐步优化',
            '长期使用效果更佳'
          ];
        }
      }

      res.json({
        success: true,
        recommendation,
        usage: {
          totalClassifications: parseInt(usage.total_classifications),
          activeDays: parseInt(usage.active_days),
          firstClassification: usage.first_classification,
          lastClassification: usage.last_classification
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to generate mode recommendation', {
        tenantId: req.tenantId,
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to generate recommendation'
      });
    }
  })
);

// 模式比较接口
router.get('/compare', 
  requirePermission('mode:read'),
  requireTenant,
  asyncHandler(async (req, res) => {
    const { tenantModeManager } = req.app.locals;
    
    const currentMode = await tenantModeManager.getTenantMode(req.tenantId);
    const canEnableTraining = await tenantModeManager.canEnableTrainingMode(req.tenantId);
    
    const comparison = {
      current: currentMode.mode,
      modes: {
        normal: {
          name: '普通模式',
          description: '使用通用AI模型，保护用户隐私',
          pros: [
            '✅ 完全隐私保护',
            '✅ 即时响应',
            '✅ 无需配置',
            '✅ 免费使用'
          ],
          cons: [
            '❌ 无法个性化',
            '❌ 无法记住对话历史',
            '❌ 分析功能有限'
          ],
          suitableFor: [
            '重视隐私的用户',
            '临时使用场景',
            '简单咨询需求'
          ],
          dataRetention: false,
          cost: '免费'
        },
        training: {
          name: '训练模式',
          description: '存储数据训练个性化AI模型',
          pros: [
            '✅ 个性化AI回复',
            '✅ 持续学习改进',
            '✅ 详细数据分析',
            '✅ 自定义分类规则'
          ],
          cons: [
            '❌ 需要存储聊天数据',
            '❌ 训练需要时间',
            '❌ 可能需要付费订阅'
          ],
          suitableFor: [
            '频繁使用的用户',
            '需要个性化服务',
            '企业级应用'
          ],
          dataRetention: true,
          cost: '需要订阅计划',
          available: canEnableTraining
        }
      }
    };

    res.json({
      success: true,
      comparison,
      timestamp: new Date().toISOString()
    });
  })
);

module.exports = router; 