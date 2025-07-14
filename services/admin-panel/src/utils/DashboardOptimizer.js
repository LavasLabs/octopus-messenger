const logger = require('./logger');

class DashboardOptimizer {
  constructor(options = {}) {
    this.dbManager = options.dbManager;
    this.cacheManager = options.cacheManager;
    this.config = options.config || {};
    
    // 仪表板配置
    this.dashboardConfig = {
      // 实时数据更新间隔
      realTimeInterval: this.config.realTimeInterval || 5000, // 5秒
      // 历史数据刷新间隔
      historicalInterval: this.config.historicalInterval || 60000, // 1分钟
      // 缓存有效期
      cacheTimeout: this.config.cacheTimeout || 30000, // 30秒
      // 数据聚合窗口
      aggregationWindows: {
        realtime: '1m',
        short: '1h',
        medium: '1d',
        long: '7d'
      }
    };
    
    // 监控指标定义
    this.metrics = {
      system: {
        // 系统性能指标
        cpu_usage: { threshold: 80, unit: '%', critical: 90 },
        memory_usage: { threshold: 85, unit: '%', critical: 95 },
        disk_usage: { threshold: 80, unit: '%', critical: 90 },
        network_io: { threshold: 1000, unit: 'MB/s', critical: 2000 },
        
        // 服务状态指标
        service_availability: { threshold: 99, unit: '%', critical: 95 },
        response_time: { threshold: 2000, unit: 'ms', critical: 5000 },
        error_rate: { threshold: 1, unit: '%', critical: 5 },
        throughput: { threshold: 1000, unit: 'req/min', critical: 500 }
      },
      
      business: {
        // 业务指标
        message_volume: { threshold: 10000, unit: 'msg/h', critical: 20000 },
        ai_classification_accuracy: { threshold: 90, unit: '%', critical: 80 },
        human_handoff_rate: { threshold: 10, unit: '%', critical: 20 },
        customer_satisfaction: { threshold: 4.0, unit: 'score', critical: 3.0 },
        
        // 运营指标
        platform_distribution: {},
        language_distribution: {},
        category_distribution: {},
        resolution_time: { threshold: 3600, unit: 'seconds', critical: 7200 }
      }
    };
    
    // 告警规则
    this.alertRules = {
      critical: {
        enabled: true,
        channels: ['email', 'slack', 'webhook'],
        cooldown: 300000, // 5分钟冷却
        escalation: true
      },
      warning: {
        enabled: true,
        channels: ['slack'],
        cooldown: 600000, // 10分钟冷却
        escalation: false
      },
      info: {
        enabled: false,
        channels: ['webhook'],
        cooldown: 1800000, // 30分钟冷却
        escalation: false
      }
    };
    
    // 数据缓存
    this.dataCache = new Map();
    this.alertCache = new Map();
    
    // 初始化
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('Initializing Dashboard Optimizer...');
      
      // 启动实时数据收集
      this.startRealTimeCollection();
      
      // 启动历史数据聚合
      this.startHistoricalAggregation();
      
      // 启动告警监控
      this.startAlertMonitoring();
      
      logger.info('Dashboard Optimizer initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Dashboard Optimizer', { error: error.message });
      throw error;
    }
  }

  // 实时数据收集
  startRealTimeCollection() {
    setInterval(async () => {
      try {
        await this.collectRealTimeMetrics();
      } catch (error) {
        logger.error('Real-time data collection failed', { error: error.message });
      }
    }, this.dashboardConfig.realTimeInterval);
    
    logger.info('Real-time data collection started');
  }

  async collectRealTimeMetrics() {
    const metrics = {
      timestamp: new Date(),
      system: await this.collectSystemMetrics(),
      services: await this.collectServiceMetrics(),
      business: await this.collectBusinessMetrics()
    };
    
    // 缓存实时数据
    this.dataCache.set('realtime', metrics);
    
    // 检查告警条件
    await this.checkAlertConditions(metrics);
    
    logger.debug('Real-time metrics collected', {
      timestamp: metrics.timestamp,
      systemHealth: this.calculateSystemHealth(metrics.system),
      serviceCount: Object.keys(metrics.services).length
    });
    
    return metrics;
  }

  async collectSystemMetrics() {
    const os = require('os');
    const process = require('process');
    
    const cpuUsage = await this.getCPUUsage();
    const memoryUsage = this.getMemoryUsage();
    const diskUsage = await this.getDiskUsage();
    
    return {
      cpu: {
        usage: cpuUsage,
        cores: os.cpus().length,
        loadAverage: os.loadavg()
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usage: memoryUsage,
        process: {
          heapUsed: process.memoryUsage().heapUsed,
          heapTotal: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external
        }
      },
      disk: diskUsage,
      network: await this.getNetworkStats(),
      uptime: os.uptime()
    };
  }

  async collectServiceMetrics() {
    const services = {};
    
    // 收集各个服务的健康状态
    const serviceUrls = {
      gateway: process.env.GATEWAY_URL || 'http://localhost:3000',
      'ai-service': process.env.AI_SERVICE_URL || 'http://localhost:3001',
      'message-processor': process.env.MESSAGE_PROCESSOR_URL || 'http://localhost:3002',
      'task-service': process.env.TASK_SERVICE_URL || 'http://localhost:3003',
      'bot-manager': process.env.BOT_MANAGER_URL || 'http://localhost:3004'
    };
    
    for (const [serviceName, url] of Object.entries(serviceUrls)) {
      try {
        const health = await this.checkServiceHealth(serviceName, url);
        services[serviceName] = health;
      } catch (error) {
        services[serviceName] = {
          status: 'unhealthy',
          error: error.message,
          lastCheck: new Date()
        };
      }
    }
    
    return services;
  }

  async checkServiceHealth(serviceName, url) {
    const axios = require('axios');
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${url}/health`, {
        timeout: 5000,
        headers: {
          'X-Service-Token': process.env.SERVICE_TOKEN
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: response.status === 200 ? 'healthy' : 'degraded',
        responseTime: responseTime,
        lastCheck: new Date(),
        details: response.data
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        responseTime: responseTime,
        lastCheck: new Date(),
        error: error.message
      };
    }
  }

  async collectBusinessMetrics() {
    try {
      // 查询最近1小时的业务数据
      const oneHourAgo = new Date(Date.now() - 3600000);
      
      const [
        messageStats,
        classificationStats,
        handoffStats,
        platformStats,
        languageStats
      ] = await Promise.all([
        this.getMessageStats(oneHourAgo),
        this.getClassificationStats(oneHourAgo),
        this.getHandoffStats(oneHourAgo),
        this.getPlatformStats(oneHourAgo),
        this.getLanguageStats(oneHourAgo)
      ]);
      
      return {
        messages: messageStats,
        classification: classificationStats,
        handoffs: handoffStats,
        platforms: platformStats,
        languages: languageStats,
        timestamp: new Date()
      };
      
    } catch (error) {
      logger.error('Business metrics collection failed', { error: error.message });
      return {};
    }
  }

  async getMessageStats(since) {
    const result = await this.dbManager.query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_messages,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_messages,
        AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time
      FROM messages 
      WHERE created_at >= $1
    `, [since]);
    
    const stats = result.rows[0];
    
    return {
      total: parseInt(stats.total_messages) || 0,
      processed: parseInt(stats.processed_messages) || 0,
      failed: parseInt(stats.failed_messages) || 0,
      processing_time: parseFloat(stats.avg_processing_time) || 0,
      success_rate: stats.total_messages > 0 ? 
        (stats.processed_messages / stats.total_messages) * 100 : 100
    };
  }

  async getClassificationStats(since) {
    const result = await this.dbManager.query(`
      SELECT 
        AVG(confidence) as avg_confidence,
        COUNT(CASE WHEN confidence >= 0.8 THEN 1 END) as high_confidence,
        COUNT(*) as total_classifications,
        COUNT(CASE WHEN escalate = true THEN 1 END) as escalations
      FROM message_classifications 
      WHERE created_at >= $1
    `, [since]);
    
    const stats = result.rows[0];
    
    return {
      avg_confidence: parseFloat(stats.avg_confidence) || 0,
      high_confidence_rate: stats.total_classifications > 0 ?
        (stats.high_confidence / stats.total_classifications) * 100 : 0,
      total: parseInt(stats.total_classifications) || 0,
      escalation_rate: stats.total_classifications > 0 ?
        (stats.escalations / stats.total_classifications) * 100 : 0
    };
  }

  async getHandoffStats(since) {
    const result = await this.dbManager.query(`
      SELECT 
        COUNT(*) as total_handoffs,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_handoffs,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_resolution_time
      FROM human_handoff_sessions 
      WHERE created_at >= $1
    `, [since]);
    
    const stats = result.rows[0];
    
    return {
      total: parseInt(stats.total_handoffs) || 0,
      resolved: parseInt(stats.resolved_handoffs) || 0,
      avg_resolution_time: parseFloat(stats.avg_resolution_time) || 0,
      resolution_rate: stats.total_handoffs > 0 ?
        (stats.resolved_handoffs / stats.total_handoffs) * 100 : 0
    };
  }

  async getPlatformStats(since) {
    const result = await this.dbManager.query(`
      SELECT 
        platform_id,
        COUNT(*) as message_count
      FROM messages 
      WHERE created_at >= $1
      GROUP BY platform_id
      ORDER BY message_count DESC
    `, [since]);
    
    return result.rows.reduce((acc, row) => {
      acc[row.platform_id] = parseInt(row.message_count);
      return acc;
    }, {});
  }

  async getLanguageStats(since) {
    const result = await this.dbManager.query(`
      SELECT 
        language,
        COUNT(*) as message_count
      FROM message_classifications 
      WHERE created_at >= $1 AND language IS NOT NULL
      GROUP BY language
      ORDER BY message_count DESC
    `, [since]);
    
    return result.rows.reduce((acc, row) => {
      acc[row.language] = parseInt(row.message_count);
      return acc;
    }, {});
  }

  // 历史数据聚合
  startHistoricalAggregation() {
    setInterval(async () => {
      try {
        await this.aggregateHistoricalData();
      } catch (error) {
        logger.error('Historical data aggregation failed', { error: error.message });
      }
    }, this.dashboardConfig.historicalInterval);
    
    logger.info('Historical data aggregation started');
  }

  async aggregateHistoricalData() {
    const timeWindows = {
      '1h': new Date(Date.now() - 3600000),
      '6h': new Date(Date.now() - 6 * 3600000),
      '24h': new Date(Date.now() - 24 * 3600000),
      '7d': new Date(Date.now() - 7 * 24 * 3600000),
      '30d': new Date(Date.now() - 30 * 24 * 3600000)
    };
    
    const aggregatedData = {};
    
    for (const [window, since] of Object.entries(timeWindows)) {
      aggregatedData[window] = {
        messages: await this.getMessageStats(since),
        classification: await this.getClassificationStats(since),
        handoffs: await this.getHandoffStats(since),
        platforms: await this.getPlatformStats(since),
        languages: await this.getLanguageStats(since)
      };
    }
    
    // 缓存聚合数据
    this.dataCache.set('historical', {
      timestamp: new Date(),
      data: aggregatedData
    });
    
    logger.debug('Historical data aggregated', {
      windows: Object.keys(timeWindows),
      timestamp: new Date()
    });
  }

  // 告警监控
  startAlertMonitoring() {
    setInterval(async () => {
      try {
        const currentMetrics = this.dataCache.get('realtime');
        if (currentMetrics) {
          await this.checkAlertConditions(currentMetrics);
        }
      } catch (error) {
        logger.error('Alert monitoring failed', { error: error.message });
      }
    }, this.dashboardConfig.realTimeInterval);
    
    logger.info('Alert monitoring started');
  }

  async checkAlertConditions(metrics) {
    const alerts = [];
    
    // 检查系统指标
    for (const [metricName, config] of Object.entries(this.metrics.system)) {
      const value = this.extractMetricValue(metrics.system, metricName);
      if (value !== null) {
        const alert = this.evaluateMetric(metricName, value, config, 'system');
        if (alert) alerts.push(alert);
      }
    }
    
    // 检查业务指标
    for (const [metricName, config] of Object.entries(this.metrics.business)) {
      const value = this.extractMetricValue(metrics.business, metricName);
      if (value !== null) {
        const alert = this.evaluateMetric(metricName, value, config, 'business');
        if (alert) alerts.push(alert);
      }
    }
    
    // 处理告警
    for (const alert of alerts) {
      await this.handleAlert(alert);
    }
  }

  extractMetricValue(data, metricName) {
    switch (metricName) {
      case 'cpu_usage':
        return data.cpu?.usage;
      case 'memory_usage':
        return data.memory?.usage;
      case 'response_time':
        return data.averageResponseTime;
      case 'error_rate':
        return data.errorRate;
      case 'message_volume':
        return data.messages?.total;
      case 'ai_classification_accuracy':
        return data.classification?.avg_confidence;
      case 'human_handoff_rate':
        return data.handoffs?.total;
      default:
        return null;
    }
  }

  evaluateMetric(metricName, value, config, category) {
    if (!config.threshold) return null;
    
    let severity = null;
    let message = null;
    
    if (config.critical && value >= config.critical) {
      severity = 'critical';
      message = `${metricName} is critically high: ${value}${config.unit}`;
    } else if (value >= config.threshold) {
      severity = 'warning';
      message = `${metricName} exceeds threshold: ${value}${config.unit}`;
    }
    
    if (severity) {
      return {
        id: `${category}_${metricName}_${Date.now()}`,
        severity: severity,
        category: category,
        metric: metricName,
        value: value,
        threshold: config.threshold,
        critical: config.critical,
        unit: config.unit,
        message: message,
        timestamp: new Date()
      };
    }
    
    return null;
  }

  async handleAlert(alert) {
    const alertKey = `${alert.category}_${alert.metric}_${alert.severity}`;
    const lastAlert = this.alertCache.get(alertKey);
    
    // 检查冷却时间
    const cooldown = this.alertRules[alert.severity]?.cooldown || 300000;
    if (lastAlert && (Date.now() - lastAlert.timestamp) < cooldown) {
      return;
    }
    
    // 记录告警
    this.alertCache.set(alertKey, alert);
    
    // 发送告警通知
    const channels = this.alertRules[alert.severity]?.channels || [];
    for (const channel of channels) {
      try {
        await this.sendAlert(alert, channel);
      } catch (error) {
        logger.error('Failed to send alert', {
          alertId: alert.id,
          channel: channel,
          error: error.message
        });
      }
    }
    
    logger.warn('Alert triggered', {
      alertId: alert.id,
      severity: alert.severity,
      metric: alert.metric,
      value: alert.value,
      message: alert.message
    });
  }

  async sendAlert(alert, channel) {
    switch (channel) {
      case 'email':
        await this.sendEmailAlert(alert);
        break;
      case 'slack':
        await this.sendSlackAlert(alert);
        break;
      case 'webhook':
        await this.sendWebhookAlert(alert);
        break;
      default:
        logger.warn('Unknown alert channel', { channel });
    }
  }

  async sendEmailAlert(alert) {
    // 实现邮件告警
    logger.info('Email alert sent', { alertId: alert.id });
  }

  async sendSlackAlert(alert) {
    // 实现Slack告警
    logger.info('Slack alert sent', { alertId: alert.id });
  }

  async sendWebhookAlert(alert) {
    // 实现Webhook告警
    logger.info('Webhook alert sent', { alertId: alert.id });
  }

  // 获取仪表板数据
  async getDashboardData(timeRange = '1h') {
    try {
      const cacheKey = `dashboard_${timeRange}`;
      let cached = this.dataCache.get(cacheKey);
      
      if (!cached || (Date.now() - cached.timestamp) > this.dashboardConfig.cacheTimeout) {
        const data = await this.buildDashboardData(timeRange);
        cached = {
          timestamp: Date.now(),
          data: data
        };
        this.dataCache.set(cacheKey, cached);
      }
      
      return cached.data;
      
    } catch (error) {
      logger.error('Failed to get dashboard data', { error: error.message, timeRange });
      throw error;
    }
  }

  async buildDashboardData(timeRange) {
    const realtime = this.dataCache.get('realtime');
    const historical = this.dataCache.get('historical');
    
    const data = {
      overview: {
        systemHealth: this.calculateSystemHealth(realtime?.system),
        serviceHealth: this.calculateServiceHealth(realtime?.services),
        businessHealth: this.calculateBusinessHealth(realtime?.business),
        activeAlerts: this.getActiveAlerts(),
        lastUpdated: realtime?.timestamp
      },
      
      metrics: {
        realtime: realtime,
        historical: historical?.data?.[timeRange] || {}
      },
      
      charts: await this.buildChartData(timeRange),
      
      trends: this.calculateTrends(timeRange),
      
      alerts: this.getRecentAlerts(24) // 最近24小时的告警
    };
    
    return data;
  }

  calculateSystemHealth(systemMetrics) {
    if (!systemMetrics) return 'unknown';
    
    const cpuHealth = systemMetrics.cpu?.usage < 80 ? 100 : (100 - systemMetrics.cpu.usage);
    const memoryHealth = systemMetrics.memory?.usage < 85 ? 100 : (100 - systemMetrics.memory.usage);
    
    const overallHealth = (cpuHealth + memoryHealth) / 2;
    
    if (overallHealth >= 90) return 'excellent';
    if (overallHealth >= 75) return 'good';
    if (overallHealth >= 60) return 'fair';
    if (overallHealth >= 40) return 'poor';
    return 'critical';
  }

  calculateServiceHealth(serviceMetrics) {
    if (!serviceMetrics) return 'unknown';
    
    const services = Object.values(serviceMetrics);
    const healthyServices = services.filter(s => s.status === 'healthy').length;
    const totalServices = services.length;
    
    if (totalServices === 0) return 'unknown';
    
    const healthRate = (healthyServices / totalServices) * 100;
    
    if (healthRate === 100) return 'excellent';
    if (healthRate >= 80) return 'good';
    if (healthRate >= 60) return 'fair';
    if (healthRate >= 40) return 'poor';
    return 'critical';
  }

  calculateBusinessHealth(businessMetrics) {
    if (!businessMetrics) return 'unknown';
    
    const factors = [];
    
    // 消息处理成功率
    if (businessMetrics.messages?.success_rate) {
      factors.push(businessMetrics.messages.success_rate);
    }
    
    // AI分类准确率
    if (businessMetrics.classification?.avg_confidence) {
      factors.push(businessMetrics.classification.avg_confidence * 100);
    }
    
    // 人工介入解决率
    if (businessMetrics.handoffs?.resolution_rate) {
      factors.push(businessMetrics.handoffs.resolution_rate);
    }
    
    if (factors.length === 0) return 'unknown';
    
    const avgHealth = factors.reduce((sum, factor) => sum + factor, 0) / factors.length;
    
    if (avgHealth >= 90) return 'excellent';
    if (avgHealth >= 75) return 'good';
    if (avgHealth >= 60) return 'fair';
    if (avgHealth >= 40) return 'poor';
    return 'critical';
  }

  getActiveAlerts() {
    const activeAlerts = [];
    const now = Date.now();
    
    this.alertCache.forEach((alert, key) => {
      // 告警在1小时内都算活跃
      if ((now - alert.timestamp) < 3600000) {
        activeAlerts.push(alert);
      }
    });
    
    return activeAlerts.sort((a, b) => {
      const severityOrder = { critical: 3, warning: 2, info: 1 };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });
  }

  getRecentAlerts(hours) {
    const cutoff = Date.now() - (hours * 3600000);
    const recentAlerts = [];
    
    this.alertCache.forEach((alert, key) => {
      if (alert.timestamp >= cutoff) {
        recentAlerts.push(alert);
      }
    });
    
    return recentAlerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  async buildChartData(timeRange) {
    // 构建图表数据
    return {
      messageVolume: await this.getMessageVolumeChart(timeRange),
      responseTime: await this.getResponseTimeChart(timeRange),
      errorRate: await this.getErrorRateChart(timeRange),
      platformDistribution: await this.getPlatformDistributionChart(timeRange),
      classificationAccuracy: await this.getClassificationAccuracyChart(timeRange)
    };
  }

  calculateTrends(timeRange) {
    // 计算趋势数据
    return {
      messageVolume: this.calculateMessageVolumeTrend(timeRange),
      responseTime: this.calculateResponseTimeTrend(timeRange),
      errorRate: this.calculateErrorRateTrend(timeRange)
    };
  }

  // 辅助方法
  async getCPUUsage() {
    return new Promise((resolve) => {
      const os = require('os');
      const startMeasures = os.cpus().map(cpu => {
        return {
          idle: cpu.times.idle,
          total: Object.values(cpu.times).reduce((acc, time) => acc + time, 0)
        };
      });
      
      setTimeout(() => {
        const endMeasures = os.cpus().map(cpu => {
          return {
            idle: cpu.times.idle,
            total: Object.values(cpu.times).reduce((acc, time) => acc + time, 0)
          };
        });
        
        const totalUsage = startMeasures.map((start, index) => {
          const end = endMeasures[index];
          const idleDiff = end.idle - start.idle;
          const totalDiff = end.total - start.total;
          const usage = 100 - (100 * idleDiff / totalDiff);
          return usage;
        });
        
        const avgUsage = totalUsage.reduce((acc, usage) => acc + usage, 0) / totalUsage.length;
        resolve(Math.round(avgUsage * 100) / 100);
      }, 1000);
    });
  }

  getMemoryUsage() {
    const os = require('os');
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return Math.round((usedMem / totalMem) * 100 * 100) / 100;
  }

  async getDiskUsage() {
    // 简化的磁盘使用率检查
    const fs = require('fs').promises;
    try {
      const stats = await fs.statSync('/');
      // 这里需要根据实际环境实现磁盘使用率检查
      return {
        total: 1000000000, // 示例值
        used: 500000000,   // 示例值
        free: 500000000,   // 示例值
        usage: 50          // 示例值
      };
    } catch (error) {
      return { usage: 0 };
    }
  }

  async getNetworkStats() {
    // 简化的网络统计
    return {
      bytesReceived: 0,
      bytesSent: 0,
      packetsReceived: 0,
      packetsSent: 0
    };
  }

  // 获取优化统计
  getOptimizerStats() {
    return {
      cacheSize: this.dataCache.size,
      alertCount: this.alertCache.size,
      lastUpdate: this.dataCache.get('realtime')?.timestamp,
      activeServices: Object.keys(this.dataCache.get('realtime')?.services || {}).length,
      healthStatus: {
        system: this.calculateSystemHealth(this.dataCache.get('realtime')?.system),
        services: this.calculateServiceHealth(this.dataCache.get('realtime')?.services),
        business: this.calculateBusinessHealth(this.dataCache.get('realtime')?.business)
      }
    };
  }
}

module.exports = DashboardOptimizer; 