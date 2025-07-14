const logger = require('./logger');

class CRMOptimizer {
    constructor(options = {}) {
        this.crmSystems = new Map();
        this.config = {
            maxConcurrentTasks: 1000,
            defaultTimeout: 30000, // 30 seconds
            healthCheckInterval: 60000, // 1 minute
            ...options
        };

        // CRM系统配置 (优先级：1=最高，9=最低)
        this.crmConfigs = {
            salesforce: { priority: 1, maxConcurrent: 200, timeout: 15000, weight: 10 },
            hubspot: { priority: 2, maxConcurrent: 150, timeout: 12000, weight: 8 },
            dingtalk: { priority: 3, maxConcurrent: 300, timeout: 10000, weight: 7 },
            wework: { priority: 4, maxConcurrent: 250, timeout: 10000, weight: 6 },
            lark: { priority: 5, maxConcurrent: 200, timeout: 8000, weight: 5 },
            notion: { priority: 6, maxConcurrent: 100, timeout: 20000, weight: 4 },
            monday: { priority: 7, maxConcurrent: 80, timeout: 15000, weight: 3 },
            jira: { priority: 8, maxConcurrent: 120, timeout: 25000, weight: 2 },
            asana: { priority: 9, maxConcurrent: 60, timeout: 18000, weight: 1 }
        };

        this.stats = {
            totalTasks: 0,
            crmStats: new Map(),
            routingDecisions: new Map(),
            performance: new Map()
        };

        this.taskQueue = [];
        this.isProcessing = false;
        this.healthCheckTimer = null;
    }

    async initialize() {
        try {
            // 初始化所有CRM配置
            for (const [crmName, config] of Object.entries(this.crmConfigs)) {
                this.crmSystems.set(crmName, {
                    ...config,
                    activeTasks: 0,
                    totalCompleted: 0,
                    errorCount: 0,
                    avgResponseTime: 0,
                    lastHealthCheck: new Date(),
                    status: 'initialized',
                    healthScore: 100
                });

                this.stats.crmStats.set(crmName, {
                    tasksProcessed: 0,
                    tasksSuccessful: 0,
                    tasksFailed: 0,
                    avgProcessingTime: 0,
                    uptime: 100,
                    lastUsed: null
                });
            }

            // 启动健康检查
            this.startHealthCheck();
            
            // 启动任务处理器
            this.startTaskProcessor();

            logger.info('CRMOptimizer initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize CRMOptimizer:', error);
            throw error;
        }
    }

    // 注册CRM实例
    registerCRM(crmName, crmInstance) {
        if (!this.crmSystems.has(crmName)) {
            logger.warn(`Unknown CRM system: ${crmName}`);
            return false;
        }

        const crm = this.crmSystems.get(crmName);
        crm.instance = crmInstance;
        crm.status = 'registered';
        
        logger.info(`CRM ${crmName} registered successfully`);
        return true;
    }

    // 智能CRM选择
    async selectOptimalCRM(taskData) {
        try {
            const {
                taskType,
                priority = 'normal',
                dataSize = 'small',
                deadline,
                preferredCRM
            } = taskData;

            // 如果指定了首选CRM且可用，优先使用
            if (preferredCRM && this.isCRMAvailable(preferredCRM)) {
                logger.debug(`Using preferred CRM: ${preferredCRM}`);
                return preferredCRM;
            }

            // 根据任务类型获取适合的CRM
            const suitableCRMs = this.getSuitableCRMs(taskType, priority, dataSize);
            
            if (suitableCRMs.length === 0) {
                throw new Error('No suitable CRM systems available');
            }

            // 计算每个CRM的得分
            const crmScores = suitableCRMs.map(crmName => {
                const crm = this.crmSystems.get(crmName);
                const stats = this.stats.crmStats.get(crmName);
                
                const score = this.calculateCRMScore(crm, stats, taskData);
                
                return { crmName, score, crm };
            });

            // 选择得分最高的CRM
            crmScores.sort((a, b) => b.score - a.score);
            const selectedCRM = crmScores[0].crmName;

            // 记录路由决策
            this.recordRoutingDecision(taskData, selectedCRM, crmScores);

            logger.debug(`Selected CRM: ${selectedCRM} for task type: ${taskType}`);
            return selectedCRM;

        } catch (error) {
            logger.error('Failed to select optimal CRM:', error);
            throw error;
        }
    }

    // 计算CRM得分
    calculateCRMScore(crm, stats, taskData) {
        const { priority, dataSize, deadline } = taskData;
        
        // 基础得分（基于优先级权重）
        let score = crm.weight * 10;

        // 负载因子 (负载越低得分越高)
        const loadFactor = crm.activeTasks / crm.maxConcurrent;
        score *= (1 - loadFactor);

        // 健康因子
        score *= (crm.healthScore / 100);

        // 性能因子 (响应时间越短得分越高)
        if (crm.avgResponseTime > 0) {
            const performanceFactor = Math.max(0.1, 1 - (crm.avgResponseTime / 30000));
            score *= performanceFactor;
        }

        // 成功率因子
        if (stats.tasksProcessed > 0) {
            const successRate = stats.tasksSuccessful / stats.tasksProcessed;
            score *= successRate;
        }

        // 优先级调整
        if (priority === 'high') {
            score *= (10 - crm.priority) / 10; // 优先级越高得分越高
        }

        // 数据量调整
        if (dataSize === 'large' && crm.maxConcurrent > 150) {
            score *= 1.2; // 适合处理大数据量的CRM加分
        }

        // 截止时间调整
        if (deadline && crm.avgResponseTime > 0) {
            const timeToDeadline = new Date(deadline) - new Date();
            if (timeToDeadline < crm.avgResponseTime * 2) {
                score *= 1.5; // 紧急任务优先选择响应快的CRM
            }
        }

        return Math.max(0, score);
    }

    // 获取适合的CRM列表
    getSuitableCRMs(taskType, priority, dataSize) {
        const availableCRMs = Array.from(this.crmSystems.entries())
            .filter(([name, crm]) => this.isCRMAvailable(name))
            .map(([name]) => name);

        // 根据任务类型过滤
        switch (taskType) {
            case 'customer_management':
                return availableCRMs.filter(name => 
                    ['salesforce', 'hubspot', 'dingtalk'].includes(name)
                );
            case 'project_management':
                return availableCRMs.filter(name => 
                    ['notion', 'monday', 'jira', 'asana'].includes(name)
                );
            case 'communication':
                return availableCRMs.filter(name => 
                    ['dingtalk', 'wework', 'lark'].includes(name)
                );
            case 'data_sync':
                return availableCRMs.filter(name => 
                    ['salesforce', 'hubspot', 'notion'].includes(name)
                );
            default:
                return availableCRMs;
        }
    }

    // 检查CRM是否可用
    isCRMAvailable(crmName) {
        const crm = this.crmSystems.get(crmName);
        if (!crm) return false;

        return crm.status === 'registered' && 
               crm.activeTasks < crm.maxConcurrent &&
               crm.instance &&
               crm.healthScore > 30; // 健康分数阈值
    }

    // 处理任务
    async processTask(taskData) {
        const startTime = Date.now();
        let selectedCRM = null;

        try {
            // 选择最佳CRM
            selectedCRM = await this.selectOptimalCRM(taskData);
            const crm = this.crmSystems.get(selectedCRM);
            
            if (!crm || !crm.instance) {
                throw new Error(`CRM ${selectedCRM} not available`);
            }

            // 增加活跃任务数
            crm.activeTasks++;

            // 标准化任务数据
            const standardizedTask = this.standardizeTaskData(taskData, selectedCRM);

            // 执行任务
            const result = await this.executeTask(crm.instance, standardizedTask);

            // 更新统计
            this.updateStats(selectedCRM, 'success', Date.now() - startTime);
            
            logger.info(`Task processed successfully via ${selectedCRM}:`, result.taskId);
            return result;

        } catch (error) {
            if (selectedCRM) {
                this.updateStats(selectedCRM, 'error', Date.now() - startTime);
            }
            logger.error(`Failed to process task via ${selectedCRM}:`, error);
            throw error;
        } finally {
            // 减少活跃任务数
            if (selectedCRM) {
                const crm = this.crmSystems.get(selectedCRM);
                if (crm) {
                    crm.activeTasks = Math.max(0, crm.activeTasks - 1);
                }
            }
        }
    }

    // 标准化任务数据
    standardizeTaskData(taskData, crmName) {
        const standardized = {
            id: taskData.id || this.generateTaskId(),
            type: taskData.taskType || taskData.type,
            title: taskData.title || taskData.name,
            description: taskData.description,
            priority: taskData.priority || 'normal',
            assignee: taskData.assignee,
            deadline: taskData.deadline,
            metadata: taskData.metadata || {},
            timestamp: new Date(),
            targetCRM: crmName
        };

        // CRM特定处理
        switch (crmName) {
            case 'salesforce':
                standardized.sobject = taskData.sobject || 'Task';
                break;
            case 'hubspot':
                standardized.objectType = taskData.objectType || 'tasks';
                break;
            case 'jira':
                standardized.project = taskData.project;
                standardized.issueType = taskData.issueType || 'Task';
                break;
            case 'notion':
                standardized.database = taskData.database;
                break;
            case 'monday':
                standardized.board = taskData.board;
                break;
        }

        return standardized;
    }

    // 执行任务
    async executeTask(crmInstance, taskData) {
        const timeout = this.crmConfigs[taskData.targetCRM]?.timeout || this.config.defaultTimeout;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Task execution timeout for ${taskData.targetCRM}`));
            }, timeout);

            crmInstance.executeTask(taskData)
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    // 更新统计数据
    updateStats(crmName, operation, processingTime) {
        const crm = this.crmSystems.get(crmName);
        const stats = this.stats.crmStats.get(crmName);
        
        if (!crm || !stats) return;

        switch (operation) {
            case 'success':
                stats.tasksProcessed++;
                stats.tasksSuccessful++;
                crm.totalCompleted++;
                stats.lastUsed = new Date();
                break;
            case 'error':
                stats.tasksProcessed++;
                stats.tasksFailed++;
                crm.errorCount++;
                break;
        }

        // 更新平均处理时间
        if (processingTime > 0) {
            stats.avgProcessingTime = (stats.avgProcessingTime + processingTime) / 2;
            crm.avgResponseTime = (crm.avgResponseTime + processingTime) / 2;
        }

        this.stats.totalTasks++;
    }

    // 记录路由决策
    recordRoutingDecision(taskData, selectedCRM, crmScores) {
        const decision = {
            timestamp: new Date(),
            taskType: taskData.taskType,
            selectedCRM,
            alternatives: crmScores.map(score => ({
                crm: score.crmName,
                score: score.score
            })),
            criteria: {
                priority: taskData.priority,
                dataSize: taskData.dataSize,
                hasDeadline: !!taskData.deadline
            }
        };

        // 保存最近100个决策
        if (!this.stats.routingDecisions.has(taskData.taskType)) {
            this.stats.routingDecisions.set(taskData.taskType, []);
        }
        
        const decisions = this.stats.routingDecisions.get(taskData.taskType);
        decisions.push(decision);
        
        if (decisions.length > 100) {
            decisions.shift();
        }
    }

    // 开始健康检查
    startHealthCheck() {
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, this.config.healthCheckInterval);
    }

    // 执行健康检查
    async performHealthCheck() {
        try {
            for (const [crmName, crm] of this.crmSystems) {
                if (crm.instance && typeof crm.instance.healthCheck === 'function') {
                    try {
                        const healthResult = await crm.instance.healthCheck();
                        
                        if (typeof healthResult === 'boolean') {
                            crm.healthScore = healthResult ? 100 : 0;
                            crm.status = healthResult ? 'healthy' : 'unhealthy';
                        } else if (typeof healthResult === 'object') {
                            crm.healthScore = healthResult.score || 0;
                            crm.status = healthResult.status || 'unknown';
                        }
                        
                    } catch (error) {
                        crm.healthScore = Math.max(0, crm.healthScore - 20);
                        crm.status = 'error';
                        logger.error(`Health check error for ${crmName}:`, error);
                    }
                }
                
                crm.lastHealthCheck = new Date();
            }

        } catch (error) {
            logger.error('Health check failed:', error);
        }
    }

    // 启动任务处理器
    startTaskProcessor() {
        setInterval(() => {
            if (!this.isProcessing && this.taskQueue.length > 0) {
                this.processBatchTasks();
            }
        }, 1000);
    }

    // 批量处理任务
    async processBatchTasks() {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        
        try {
            const batchSize = Math.min(10, this.taskQueue.length);
            const batch = this.taskQueue.splice(0, batchSize);
            
            const promises = batch.map(task => this.processTask(task));
            await Promise.allSettled(promises);
            
        } catch (error) {
            logger.error('Batch task processing failed:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    // 添加任务到队列
    addTaskToQueue(taskData) {
        this.taskQueue.push(taskData);
        logger.debug(`Task added to queue. Queue size: ${this.taskQueue.length}`);
    }

    // 获取CRM统计
    getCRMStats() {
        const stats = {};
        
        for (const [crmName, crm] of this.crmSystems) {
            const crmStats = this.stats.crmStats.get(crmName);
            stats[crmName] = {
                ...crmStats,
                status: crm.status,
                activeTasks: crm.activeTasks,
                maxConcurrent: crm.maxConcurrent,
                healthScore: crm.healthScore,
                lastHealthCheck: crm.lastHealthCheck
            };
        }

        return {
            overall: {
                totalTasks: this.stats.totalTasks,
                totalCRMs: this.crmSystems.size,
                healthyCRMs: Array.from(this.crmSystems.values())
                    .filter(crm => crm.healthScore > 70).length,
                queueSize: this.taskQueue.length
            },
            crms: stats
        };
    }

    // 生成任务ID
    generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // 清理资源
    async cleanup() {
        try {
            if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
                this.healthCheckTimer = null;
            }

            for (const [crmName, crm] of this.crmSystems) {
                if (crm.instance && typeof crm.instance.cleanup === 'function') {
                    await crm.instance.cleanup();
                }
            }

            logger.info('CRMOptimizer cleanup completed');
        } catch (error) {
            logger.error('CRMOptimizer cleanup failed:', error);
        }
    }
}

module.exports = CRMOptimizer; 