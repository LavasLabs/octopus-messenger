# C端客服架构增强指南

## 概述

将Octopus Messenger应用于C端客服场景需要在现有架构基础上进行特定增强，以处理大量消费者咨询、提供实时客服支持和高质量的服务体验。

## C端客服与B端的差异

### 流量特征
- **消息量**: C端日均消息量可达数万至数十万条
- **并发峰值**: 业务高峰期并发可达数千条/分钟
- **响应要求**: 用户期望秒级响应，最多不超过30秒
- **会话特点**: 多轮对话，平均会话轮次5-10轮

### 服务要求
- **7x24小时服务**: 全天候客服支持
- **多语言支持**: 国际化场景需要多语言
- **情绪识别**: 识别用户情绪，优先处理投诉
- **满意度评价**: 服务质量评估和改进

## 架构增强方案

### 1. 高并发处理层

#### 消息队列优化
```javascript
// services/message-processor/src/queue/HighConcurrencyQueue.js
class HighConcurrencyQueue {
  constructor() {
    this.queues = {
      urgent: new Bull('urgent-queue', { redis: redisConfig }),
      normal: new Bull('normal-queue', { redis: redisConfig }),
      low: new Bull('low-queue', { redis: redisConfig })
    };
    
    // 配置并发处理
    this.setupConcurrency();
  }

  setupConcurrency() {
    // 紧急消息：高并发处理
    this.queues.urgent.process(50, async (job) => {
      return await this.processUrgentMessage(job.data);
    });
    
    // 普通消息：中等并发
    this.queues.normal.process(100, async (job) => {
      return await this.processNormalMessage(job.data);
    });
    
    // 低优先级：批量处理
    this.queues.low.process(200, async (job) => {
      return await this.processBatchMessages(job.data);
    });
  }

  async addMessage(message, priority = 'normal') {
    const queueData = {
      id: message.id,
      content: message.content,
      sender: message.sender,
      platform: message.platform,
      timestamp: new Date(),
      priority: priority
    };

    // 根据优先级和内容分配队列
    const targetQueue = this.determineQueue(message, priority);
    
    await this.queues[targetQueue].add(queueData, {
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: 100,
      removeOnFail: 50
    });
  }

  determineQueue(message, priority) {
    // 投诉、故障等紧急消息
    if (this.isUrgentMessage(message)) {
      return 'urgent';
    }
    
    // 明确指定的优先级
    if (priority === 'urgent') {
      return 'urgent';
    }
    
    if (priority === 'low') {
      return 'low';
    }
    
    return 'normal';
  }

  isUrgentMessage(message) {
    const urgentKeywords = ['投诉', '故障', '紧急', '退款', '无法使用'];
    return urgentKeywords.some(keyword => 
      message.content.toLowerCase().includes(keyword)
    );
  }
}
```

#### 负载均衡配置
```nginx
# nginx/c-end-customer-service.conf
upstream gateway_backend {
    least_conn;
    server gateway1:3000 weight=3 max_fails=3 fail_timeout=30s;
    server gateway2:3000 weight=3 max_fails=3 fail_timeout=30s;
    server gateway3:3000 weight=2 max_fails=3 fail_timeout=30s;
}

upstream websocket_backend {
    ip_hash;  # WebSocket需要会话保持
    server ws1:3006;
    server ws2:3006;
    server ws3:3006;
}

server {
    listen 80;
    server_name customer-service.example.com;

    # API请求负载均衡
    location /api/ {
        proxy_pass http://gateway_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # 客服场景的超时配置
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
    }

    # WebSocket连接（客服实时聊天）
    location /ws/ {
        proxy_pass http://websocket_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # WebSocket超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### 2. 实时客服系统

#### WebSocket服务
```javascript
// services/websocket-service/src/index.js
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const { logger } = require('./utils/logger');

class CustomerServiceWebSocket {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.connections = new Map(); // 存储客服连接
    this.customerQueues = new Map(); // 客户排队队列
    this.activeSessions = new Map(); // 活跃会话
    
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const userType = urlParams.get('type'); // 'customer' or 'agent'
      const userId = urlParams.get('userId');
      
      logger.info('WebSocket connection established', { userType, userId });
      
      if (userType === 'agent') {
        this.handleAgentConnection(ws, userId);
      } else {
        this.handleCustomerConnection(ws, userId);
      }
      
      ws.on('message', (data) => {
        this.handleMessage(ws, JSON.parse(data), userType, userId);
      });
      
      ws.on('close', () => {
        this.handleDisconnection(userId, userType);
      });
    });
  }

  handleAgentConnection(ws, agentId) {
    this.connections.set(agentId, {
      ws: ws,
      type: 'agent',
      status: 'available', // available, busy, away
      maxConcurrentChats: 5,
      currentChats: 0,
      skills: [], // 客服技能标签
      lastActivity: new Date()
    });
    
    // 自动分配等待中的客户
    this.assignWaitingCustomers(agentId);
  }

  handleCustomerConnection(ws, customerId) {
    this.connections.set(customerId, {
      ws: ws,
      type: 'customer',
      status: 'waiting', // waiting, chatting, ended
      priority: 'normal',
      waitStartTime: new Date(),
      lastActivity: new Date()
    });
    
    // 尝试分配客服
    this.assignCustomerToAgent(customerId);
  }

  async assignCustomerToAgent(customerId) {
    const customer = this.connections.get(customerId);
    if (!customer) return;
    
    // 查找可用客服
    const availableAgent = this.findAvailableAgent(customer);
    
    if (availableAgent) {
      // 创建会话
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      this.activeSessions.set(sessionId, {
        customerId: customerId,
        agentId: availableAgent.agentId,
        startTime: new Date(),
        status: 'active',
        messages: []
      });
      
      // 通知双方
      customer.ws.send(JSON.stringify({
        type: 'agent_assigned',
        sessionId: sessionId,
        agentInfo: {
          name: availableAgent.name,
          avatar: availableAgent.avatar
        }
      }));
      
      availableAgent.ws.send(JSON.stringify({
        type: 'customer_assigned',
        sessionId: sessionId,
        customerInfo: {
          id: customerId,
          name: customer.name,
          avatar: customer.avatar,
          priority: customer.priority
        }
      }));
      
      customer.status = 'chatting';
      availableAgent.currentChats++;
      
      logger.info('Customer assigned to agent', {
        customerId,
        agentId: availableAgent.agentId,
        sessionId
      });
    } else {
      // 加入等待队列
      this.addToWaitingQueue(customerId);
    }
  }

  findAvailableAgent(customer) {
    const agents = Array.from(this.connections.values())
      .filter(conn => 
        conn.type === 'agent' && 
        conn.status === 'available' &&
        conn.currentChats < conn.maxConcurrentChats
      )
      .sort((a, b) => a.currentChats - b.currentChats); // 按当前会话数排序
    
    return agents.length > 0 ? agents[0] : null;
  }

  addToWaitingQueue(customerId) {
    const customer = this.connections.get(customerId);
    if (!customer) return;
    
    // 按优先级排队
    const queueKey = customer.priority || 'normal';
    
    if (!this.customerQueues.has(queueKey)) {
      this.customerQueues.set(queueKey, []);
    }
    
    this.customerQueues.get(queueKey).push(customerId);
    
    // 通知客户排队位置
    const position = this.getQueuePosition(customerId);
    customer.ws.send(JSON.stringify({
      type: 'queue_position',
      position: position,
      estimatedWaitTime: this.calculateWaitTime(position)
    }));
    
    logger.info('Customer added to waiting queue', {
      customerId,
      priority: queueKey,
      position
    });
  }

  getQueuePosition(customerId) {
    let position = 0;
    
    // 按优先级计算位置
    const priorities = ['urgent', 'high', 'normal', 'low'];
    
    for (const priority of priorities) {
      const queue = this.customerQueues.get(priority) || [];
      const index = queue.indexOf(customerId);
      
      if (index !== -1) {
        return position + index + 1;
      }
      
      position += queue.length;
    }
    
    return position;
  }

  calculateWaitTime(position) {
    // 基于历史数据计算预计等待时间
    const avgServiceTime = 300; // 平均服务时间（秒）
    const avgAgentCount = this.getActiveAgentCount();
    
    if (avgAgentCount === 0) return 0;
    
    return Math.ceil((position * avgServiceTime) / avgAgentCount);
  }

  handleMessage(ws, message, userType, userId) {
    const { type, sessionId, content } = message;
    
    switch (type) {
      case 'chat_message':
        this.handleChatMessage(sessionId, userId, content, userType);
        break;
      case 'typing':
        this.handleTypingIndicator(sessionId, userId, userType);
        break;
      case 'end_session':
        this.handleEndSession(sessionId, userId);
        break;
      case 'agent_status':
        this.handleAgentStatusChange(userId, content.status);
        break;
    }
  }

  handleChatMessage(sessionId, senderId, content, senderType) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    
    const messageData = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: sessionId,
      senderId: senderId,
      senderType: senderType,
      content: content,
      timestamp: new Date()
    };
    
    // 保存消息
    session.messages.push(messageData);
    
    // 转发消息
    const recipientId = senderType === 'customer' ? session.agentId : session.customerId;
    const recipient = this.connections.get(recipientId);
    
    if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
      recipient.ws.send(JSON.stringify({
        type: 'chat_message',
        sessionId: sessionId,
        message: messageData
      }));
    }
    
    // 记录到数据库
    this.saveChatMessage(messageData);
    
    logger.info('Chat message handled', {
      sessionId,
      senderId,
      senderType,
      messageLength: content.length
    });
  }

  async saveChatMessage(messageData) {
    // 保存到数据库和搜索引擎
    try {
      await Promise.all([
        this.saveToDatabase(messageData),
        this.indexForSearch(messageData)
      ]);
    } catch (error) {
      logger.error('Failed to save chat message', {
        messageId: messageData.id,
        error: error.message
      });
    }
  }

  start(port = 3006) {
    this.server.listen(port, () => {
      logger.info(`Customer Service WebSocket server running on port ${port}`);
    });
  }
}

module.exports = CustomerServiceWebSocket;
```

### 3. 智能客服增强

#### 客户意图识别
```javascript
// services/ai-service/src/customerService/IntentRecognition.js
class CustomerServiceIntentRecognition {
  constructor() {
    this.intents = {
      // 售前咨询
      'product_inquiry': {
        keywords: ['产品', '功能', '价格', '购买', '咨询'],
        patterns: [/想了解.*产品/, /这个.*怎么样/, /价格.*多少/],
        confidence: 0.8
      },
      
      // 订单相关
      'order_status': {
        keywords: ['订单', '物流', '发货', '配送', '快递'],
        patterns: [/订单.*状态/, /什么时候.*发货/, /物流.*信息/],
        confidence: 0.9
      },
      
      // 售后服务
      'after_sales': {
        keywords: ['退换货', '维修', '保修', '质量问题'],
        patterns: [/退.*货/, /换.*货/, /质量.*问题/, /不.*好用/],
        confidence: 0.85
      },
      
      // 投诉建议
      'complaint': {
        keywords: ['投诉', '不满', '差评', '建议', '改进'],
        patterns: [/投诉.*/, /不满意.*/, /建议.*/, /希望.*改进/],
        confidence: 0.9,
        priority: 'urgent'
      },
      
      // 账户相关
      'account_support': {
        keywords: ['账户', '登录', '密码', '注册', '忘记'],
        patterns: [/登录.*不了/, /密码.*忘记/, /账户.*问题/],
        confidence: 0.8
      }
    };
    
    this.emotionAnalyzer = new EmotionAnalyzer();
  }

  async analyzeMessage(message) {
    const content = message.content.toLowerCase();
    
    // 意图识别
    const intent = this.recognizeIntent(content);
    
    // 情绪分析
    const emotion = await this.emotionAnalyzer.analyze(content);
    
    // 优先级判断
    const priority = this.determinePriority(intent, emotion);
    
    return {
      intent: intent,
      emotion: emotion,
      priority: priority,
      confidence: intent.confidence,
      suggestedActions: this.getSuggestedActions(intent, emotion)
    };
  }

  recognizeIntent(content) {
    let bestMatch = {
      intent: 'general_inquiry',
      confidence: 0.3
    };
    
    for (const [intentName, intentData] of Object.entries(this.intents)) {
      let score = 0;
      
      // 关键词匹配
      const keywordMatches = intentData.keywords.filter(keyword => 
        content.includes(keyword)
      ).length;
      score += keywordMatches * 0.3;
      
      // 模式匹配
      const patternMatches = intentData.patterns.filter(pattern => 
        pattern.test(content)
      ).length;
      score += patternMatches * 0.5;
      
      // 计算置信度
      const confidence = Math.min(score, 1.0);
      
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          intent: intentName,
          confidence: confidence,
          priority: intentData.priority || 'normal'
        };
      }
    }
    
    return bestMatch;
  }

  determinePriority(intent, emotion) {
    // 基于意图的优先级
    if (intent.priority === 'urgent') {
      return 'urgent';
    }
    
    // 基于情绪的优先级
    if (emotion.sentiment === 'negative' && emotion.intensity > 0.8) {
      return 'high';
    }
    
    if (emotion.sentiment === 'positive') {
      return 'normal';
    }
    
    // 特定意图的优先级
    const highPriorityIntents = ['complaint', 'after_sales', 'order_status'];
    if (highPriorityIntents.includes(intent.intent)) {
      return 'high';
    }
    
    return 'normal';
  }

  getSuggestedActions(intent, emotion) {
    const actions = [];
    
    // 基于意图的建议
    switch (intent.intent) {
      case 'product_inquiry':
        actions.push({
          type: 'send_product_catalog',
          description: '发送产品目录'
        });
        break;
        
      case 'order_status':
        actions.push({
          type: 'check_order_status',
          description: '查询订单状态'
        });
        break;
        
      case 'complaint':
        actions.push({
          type: 'escalate_to_supervisor',
          description: '升级给主管处理'
        });
        break;
    }
    
    // 基于情绪的建议
    if (emotion.sentiment === 'negative' && emotion.intensity > 0.7) {
      actions.push({
        type: 'empathetic_response',
        description: '使用同理心回应'
      });
    }
    
    return actions;
  }
}

class EmotionAnalyzer {
  constructor() {
    this.emotionKeywords = {
      positive: ['满意', '好', '棒', '优秀', '喜欢', '赞'],
      negative: ['不满', '差', '糟糕', '讨厌', '愤怒', '失望'],
      neutral: ['一般', '还好', '普通']
    };
  }

  async analyze(content) {
    // 简单的情绪分析实现
    // 实际应用中应该使用更复杂的NLP模型
    
    let positiveScore = 0;
    let negativeScore = 0;
    
    for (const word of this.emotionKeywords.positive) {
      if (content.includes(word)) {
        positiveScore += 1;
      }
    }
    
    for (const word of this.emotionKeywords.negative) {
      if (content.includes(word)) {
        negativeScore += 1;
      }
    }
    
    const totalScore = positiveScore + negativeScore;
    
    if (totalScore === 0) {
      return {
        sentiment: 'neutral',
        intensity: 0.5,
        confidence: 0.3
      };
    }
    
    const sentiment = positiveScore > negativeScore ? 'positive' : 'negative';
    const intensity = Math.max(positiveScore, negativeScore) / totalScore;
    
    return {
      sentiment: sentiment,
      intensity: intensity,
      confidence: Math.min(totalScore * 0.2, 1.0)
    };
  }
}

module.exports = { CustomerServiceIntentRecognition, EmotionAnalyzer };
```

### 4. 知识库系统

#### FAQ自动回复
```javascript
// services/knowledge-base/src/FAQManager.js
class FAQManager {
  constructor() {
    this.faqs = new Map();
    this.searchIndex = new Map();
    this.vectorStore = null; // 向量数据库用于语义搜索
    
    this.loadFAQs();
  }

  async loadFAQs() {
    // 从数据库加载FAQ
    const faqData = await this.loadFromDatabase();
    
    for (const faq of faqData) {
      this.faqs.set(faq.id, faq);
      
      // 建立搜索索引
      this.buildSearchIndex(faq);
    }
    
    logger.info('FAQ database loaded', { count: faqData.length });
  }

  buildSearchIndex(faq) {
    const keywords = this.extractKeywords(faq.question + ' ' + faq.answer);
    
    for (const keyword of keywords) {
      if (!this.searchIndex.has(keyword)) {
        this.searchIndex.set(keyword, new Set());
      }
      this.searchIndex.get(keyword).add(faq.id);
    }
  }

  async searchFAQ(query, limit = 5) {
    // 关键词搜索
    const keywordResults = this.keywordSearch(query);
    
    // 语义搜索（使用向量数据库）
    const semanticResults = await this.semanticSearch(query);
    
    // 合并结果并排序
    const combinedResults = this.mergeAndRankResults(
      keywordResults, 
      semanticResults
    );
    
    return combinedResults.slice(0, limit);
  }

  keywordSearch(query) {
    const queryKeywords = this.extractKeywords(query);
    const candidateIds = new Set();
    
    for (const keyword of queryKeywords) {
      const faqIds = this.searchIndex.get(keyword);
      if (faqIds) {
        faqIds.forEach(id => candidateIds.add(id));
      }
    }
    
    // 计算相关性得分
    const results = Array.from(candidateIds).map(id => {
      const faq = this.faqs.get(id);
      const score = this.calculateRelevanceScore(query, faq);
      
      return {
        faq: faq,
        score: score,
        source: 'keyword'
      };
    });
    
    return results.sort((a, b) => b.score - a.score);
  }

  async semanticSearch(query) {
    // 使用向量数据库进行语义搜索
    // 这里是伪代码，实际需要集成向量数据库
    if (!this.vectorStore) {
      return [];
    }
    
    try {
      const results = await this.vectorStore.search(query, {
        limit: 10,
        threshold: 0.7
      });
      
      return results.map(result => ({
        faq: this.faqs.get(result.id),
        score: result.score,
        source: 'semantic'
      }));
    } catch (error) {
      logger.error('Semantic search failed', { error: error.message });
      return [];
    }
  }

  mergeAndRankResults(keywordResults, semanticResults) {
    const mergedResults = new Map();
    
    // 合并关键词搜索结果
    for (const result of keywordResults) {
      const id = result.faq.id;
      mergedResults.set(id, {
        ...result,
        keywordScore: result.score,
        semanticScore: 0
      });
    }
    
    // 合并语义搜索结果
    for (const result of semanticResults) {
      const id = result.faq.id;
      
      if (mergedResults.has(id)) {
        const existing = mergedResults.get(id);
        existing.semanticScore = result.score;
        existing.score = (existing.keywordScore + result.score) / 2;
      } else {
        mergedResults.set(id, {
          ...result,
          keywordScore: 0,
          semanticScore: result.score
        });
      }
    }
    
    // 按综合得分排序
    return Array.from(mergedResults.values())
      .sort((a, b) => b.score - a.score);
  }

  calculateRelevanceScore(query, faq) {
    const queryWords = this.extractKeywords(query);
    const faqWords = this.extractKeywords(faq.question + ' ' + faq.answer);
    
    const intersection = queryWords.filter(word => faqWords.includes(word));
    const union = [...new Set([...queryWords, ...faqWords])];
    
    // Jaccard相似度
    return intersection.length / union.length;
  }

  extractKeywords(text) {
    // 简单的中文分词和关键词提取
    // 实际应用中应该使用jieba等分词工具
    return text.toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1);
  }

  async addFAQ(question, answer, category, tags = []) {
    const faq = {
      id: `faq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      question: question,
      answer: answer,
      category: category,
      tags: tags,
      createdAt: new Date(),
      updatedAt: new Date(),
      useCount: 0,
      feedback: {
        helpful: 0,
        notHelpful: 0
      }
    };
    
    // 保存到数据库
    await this.saveToDatabase(faq);
    
    // 更新内存索引
    this.faqs.set(faq.id, faq);
    this.buildSearchIndex(faq);
    
    logger.info('FAQ added', { id: faq.id, category: category });
    
    return faq;
  }

  async updateFAQ(id, updates) {
    const faq = this.faqs.get(id);
    if (!faq) {
      throw new Error(`FAQ not found: ${id}`);
    }
    
    const updatedFAQ = {
      ...faq,
      ...updates,
      updatedAt: new Date()
    };
    
    // 更新数据库
    await this.updateInDatabase(id, updatedFAQ);
    
    // 更新内存索引
    this.faqs.set(id, updatedFAQ);
    this.buildSearchIndex(updatedFAQ);
    
    logger.info('FAQ updated', { id: id });
    
    return updatedFAQ;
  }

  async recordFAQUsage(id, helpful = true) {
    const faq = this.faqs.get(id);
    if (!faq) return;
    
    faq.useCount++;
    
    if (helpful) {
      faq.feedback.helpful++;
    } else {
      faq.feedback.notHelpful++;
    }
    
    await this.updateInDatabase(id, faq);
    
    logger.info('FAQ usage recorded', { 
      id: id, 
      helpful: helpful,
      totalUse: faq.useCount
    });
  }

  getPopularFAQs(limit = 10) {
    return Array.from(this.faqs.values())
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);
  }

  getFAQsByCategory(category) {
    return Array.from(this.faqs.values())
      .filter(faq => faq.category === category)
      .sort((a, b) => b.useCount - a.useCount);
  }
}

module.exports = FAQManager;
```

### 5. 工单系统

#### 工单管理
```javascript
// services/ticket-system/src/TicketManager.js
class TicketManager {
  constructor() {
    this.tickets = new Map();
    this.agents = new Map();
    this.queues = {
      urgent: [],
      high: [],
      normal: [],
      low: []
    };
    
    this.slaConfig = {
      urgent: { responseTime: 300, resolutionTime: 3600 }, // 5分钟响应，1小时解决
      high: { responseTime: 1800, resolutionTime: 14400 }, // 30分钟响应，4小时解决
      normal: { responseTime: 3600, resolutionTime: 86400 }, // 1小时响应，24小时解决
      low: { responseTime: 7200, resolutionTime: 172800 } // 2小时响应，48小时解决
    };
  }

  async createTicket(customerMessage, classification) {
    const ticket = {
      id: `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      customerId: customerMessage.senderId,
      customerInfo: {
        name: customerMessage.senderName,
        email: customerMessage.senderEmail,
        phone: customerMessage.senderPhone,
        platform: customerMessage.platform
      },
      
      // 工单基本信息
      subject: this.generateSubject(customerMessage, classification),
      description: customerMessage.content,
      category: classification.category,
      priority: classification.priority,
      status: 'new',
      
      // 时间信息
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: this.calculateDueDate(classification.priority),
      
      // 处理信息
      assignedAgent: null,
      assignedAt: null,
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      
      // 会话信息
      sessionId: null,
      messages: [{
        id: `msg_${Date.now()}`,
        senderId: customerMessage.senderId,
        senderType: 'customer',
        content: customerMessage.content,
        timestamp: new Date()
      }],
      
      // 标签和分类
      tags: classification.tags || [],
      department: this.determineDepartment(classification.category),
      
      // 满意度
      satisfaction: null,
      feedback: null,
      
      // 元数据
      metadata: {
        sourceMessage: customerMessage,
        classification: classification,
        autoReplySent: false,
        escalated: false
      }
    };
    
    // 保存工单
    this.tickets.set(ticket.id, ticket);
    
    // 添加到队列
    this.addToQueue(ticket);
    
    // 自动回复
    await this.sendAutoReply(ticket);
    
    // 尝试自动分配
    await this.autoAssign(ticket);
    
    logger.info('Ticket created', {
      ticketId: ticket.id,
      priority: ticket.priority,
      category: ticket.category
    });
    
    return ticket;
  }

  generateSubject(message, classification) {
    const category = classification.category;
    const content = message.content.substring(0, 50);
    
    return `【${category}】${content}...`;
  }

  calculateDueDate(priority) {
    const now = new Date();
    const sla = this.slaConfig[priority];
    
    return new Date(now.getTime() + sla.resolutionTime * 1000);
  }

  determineDepartment(category) {
    const departmentMapping = {
      '产品咨询': 'sales',
      '技术支持': 'technical',
      '订单问题': 'order',
      '售后服务': 'after_sales',
      '投诉建议': 'complaints',
      '账户问题': 'account'
    };
    
    return departmentMapping[category] || 'general';
  }

  addToQueue(ticket) {
    const priority = ticket.priority;
    
    if (this.queues[priority]) {
      this.queues[priority].push(ticket.id);
    } else {
      this.queues.normal.push(ticket.id);
    }
    
    // 按SLA排序
    this.queues[priority].sort((a, b) => {
      const ticketA = this.tickets.get(a);
      const ticketB = this.tickets.get(b);
      return ticketA.dueDate - ticketB.dueDate;
    });
  }

  async sendAutoReply(ticket) {
    // 查找相关FAQ
    const faqManager = new FAQManager();
    const faqs = await faqManager.searchFAQ(ticket.description, 1);
    
    if (faqs.length > 0 && faqs[0].score > 0.8) {
      // 发送FAQ回复
      await this.sendMessage(ticket.id, {
        type: 'faq_reply',
        content: faqs[0].faq.answer,
        faqId: faqs[0].faq.id,
        sender: 'system'
      });
      
      ticket.metadata.autoReplySent = true;
      
      logger.info('Auto-reply sent', {
        ticketId: ticket.id,
        faqId: faqs[0].faq.id
      });
    } else {
      // 发送标准确认回复
      await this.sendMessage(ticket.id, {
        type: 'confirmation',
        content: this.getConfirmationMessage(ticket.priority),
        sender: 'system'
      });
    }
  }

  async autoAssign(ticket) {
    // 查找最合适的客服
    const bestAgent = this.findBestAgent(ticket);
    
    if (bestAgent) {
      await this.assignTicket(ticket.id, bestAgent.id);
    }
  }

  findBestAgent(ticket) {
    const department = ticket.department;
    const priority = ticket.priority;
    
    // 筛选可用的客服
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => 
        agent.status === 'available' &&
        agent.departments.includes(department) &&
        agent.currentTickets < agent.maxTickets
      );
    
    if (availableAgents.length === 0) {
      return null;
    }
    
    // 按工作负载和技能匹配排序
    availableAgents.sort((a, b) => {
      // 优先考虑工作负载
      const loadDiff = a.currentTickets - b.currentTickets;
      if (loadDiff !== 0) return loadDiff;
      
      // 然后考虑技能匹配
      const skillScoreA = this.calculateSkillScore(a, ticket);
      const skillScoreB = this.calculateSkillScore(b, ticket);
      
      return skillScoreB - skillScoreA;
    });
    
    return availableAgents[0];
  }

  calculateSkillScore(agent, ticket) {
    let score = 0;
    
    // 部门匹配
    if (agent.departments.includes(ticket.department)) {
      score += 10;
    }
    
    // 标签匹配
    const matchingTags = agent.skills.filter(skill => 
      ticket.tags.includes(skill)
    );
    score += matchingTags.length * 5;
    
    // 历史处理该类问题的成功率
    const categoryStats = agent.stats.categories[ticket.category];
    if (categoryStats) {
      score += categoryStats.successRate * 10;
    }
    
    return score;
  }

  async assignTicket(ticketId, agentId) {
    const ticket = this.tickets.get(ticketId);
    const agent = this.agents.get(agentId);
    
    if (!ticket || !agent) {
      throw new Error('Ticket or agent not found');
    }
    
    // 更新工单状态
    ticket.assignedAgent = agentId;
    ticket.assignedAt = new Date();
    ticket.status = 'assigned';
    
    // 更新客服工作负载
    agent.currentTickets++;
    agent.assignedTickets.push(ticketId);
    
    // 从队列移除
    this.removeFromQueue(ticketId);
    
    // 通知客服
    await this.notifyAgent(agentId, {
      type: 'ticket_assigned',
      ticket: ticket
    });
    
    logger.info('Ticket assigned', {
      ticketId: ticketId,
      agentId: agentId
    });
    
    return ticket;
  }

  async escalateTicket(ticketId, reason) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    // 升级优先级
    const currentPriority = ticket.priority;
    const priorityLevels = ['low', 'normal', 'high', 'urgent'];
    const currentIndex = priorityLevels.indexOf(currentPriority);
    
    if (currentIndex < priorityLevels.length - 1) {
      ticket.priority = priorityLevels[currentIndex + 1];
      ticket.dueDate = this.calculateDueDate(ticket.priority);
    }
    
    // 标记为升级
    ticket.metadata.escalated = true;
    ticket.metadata.escalationReason = reason;
    ticket.metadata.escalatedAt = new Date();
    
    // 记录升级消息
    await this.addMessage(ticketId, {
      type: 'escalation',
      content: `工单已升级，原因：${reason}`,
      sender: 'system'
    });
    
    // 重新分配给高级客服
    if (ticket.assignedAgent) {
      await this.reassignToSupervisor(ticketId);
    }
    
    logger.info('Ticket escalated', {
      ticketId: ticketId,
      newPriority: ticket.priority,
      reason: reason
    });
    
    return ticket;
  }

  async resolveTicket(ticketId, resolution, agentId) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    // 更新工单状态
    ticket.status = 'resolved';
    ticket.resolvedAt = new Date();
    ticket.resolution = resolution;
    
    // 记录解决消息
    await this.addMessage(ticketId, {
      type: 'resolution',
      content: resolution,
      sender: 'agent',
      senderId: agentId
    });
    
    // 发送满意度调查
    await this.sendSatisfactionSurvey(ticketId);
    
    logger.info('Ticket resolved', {
      ticketId: ticketId,
      agentId: agentId,
      resolutionTime: ticket.resolvedAt - ticket.createdAt
    });
    
    return ticket;
  }

  async closeTicket(ticketId, reason = 'resolved') {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.closeReason = reason;
    
    // 释放客服资源
    if (ticket.assignedAgent) {
      const agent = this.agents.get(ticket.assignedAgent);
      if (agent) {
        agent.currentTickets--;
        const index = agent.assignedTickets.indexOf(ticketId);
        if (index > -1) {
          agent.assignedTickets.splice(index, 1);
        }
      }
    }
    
    // 更新统计信息
    await this.updateStats(ticket);
    
    logger.info('Ticket closed', {
      ticketId: ticketId,
      reason: reason,
      totalTime: ticket.closedAt - ticket.createdAt
    });
    
    return ticket;
  }

  getTicketStats(timeRange = '24h') {
    const now = new Date();
    const startTime = new Date(now.getTime() - this.parseTimeRange(timeRange));
    
    const tickets = Array.from(this.tickets.values())
      .filter(ticket => ticket.createdAt >= startTime);
    
    return {
      total: tickets.length,
      byStatus: this.groupByField(tickets, 'status'),
      byPriority: this.groupByField(tickets, 'priority'),
      byCategory: this.groupByField(tickets, 'category'),
      avgResponseTime: this.calculateAvgResponseTime(tickets),
      avgResolutionTime: this.calculateAvgResolutionTime(tickets),
      satisfactionScore: this.calculateSatisfactionScore(tickets)
    };
  }

  parseTimeRange(range) {
    const units = {
      'h': 3600000,
      'd': 86400000,
      'w': 604800000,
      'm': 2592000000
    };
    
    const match = range.match(/(\d+)([hdwm])/);
    if (match) {
      const [, number, unit] = match;
      return parseInt(number) * units[unit];
    }
    
    return 86400000; // 默认24小时
  }

  groupByField(tickets, field) {
    const grouped = {};
    
    for (const ticket of tickets) {
      const value = ticket[field];
      grouped[value] = (grouped[value] || 0) + 1;
    }
    
    return grouped;
  }

  calculateAvgResponseTime(tickets) {
    const respondedTickets = tickets.filter(ticket => ticket.firstResponseAt);
    
    if (respondedTickets.length === 0) return 0;
    
    const totalTime = respondedTickets.reduce((sum, ticket) => {
      return sum + (ticket.firstResponseAt - ticket.createdAt);
    }, 0);
    
    return totalTime / respondedTickets.length;
  }

  calculateAvgResolutionTime(tickets) {
    const resolvedTickets = tickets.filter(ticket => ticket.resolvedAt);
    
    if (resolvedTickets.length === 0) return 0;
    
    const totalTime = resolvedTickets.reduce((sum, ticket) => {
      return sum + (ticket.resolvedAt - ticket.createdAt);
    }, 0);
    
    return totalTime / resolvedTickets.length;
  }

  calculateSatisfactionScore(tickets) {
    const ratedTickets = tickets.filter(ticket => ticket.satisfaction !== null);
    
    if (ratedTickets.length === 0) return 0;
    
    const totalScore = ratedTickets.reduce((sum, ticket) => {
      return sum + ticket.satisfaction;
    }, 0);
    
    return totalScore / ratedTickets.length;
  }
}

module.exports = TicketManager;
```

### 6. 性能监控和报警

#### 客服系统监控
```javascript
// services/monitoring/src/CustomerServiceMonitor.js
class CustomerServiceMonitor {
  constructor() {
    this.metrics = {
      activeConnections: 0,
      messagesPerMinute: 0,
      avgResponseTime: 0,
      queueLength: 0,
      agentUtilization: 0,
      customerSatisfaction: 0
    };
    
    this.alerts = {
      highQueueLength: { threshold: 50, enabled: true },
      slowResponseTime: { threshold: 30000, enabled: true }, // 30秒
      lowSatisfaction: { threshold: 3.5, enabled: true },
      highAgentUtilization: { threshold: 0.9, enabled: true }
    };
    
    this.startMonitoring();
  }

  startMonitoring() {
    // 每分钟收集指标
    setInterval(() => {
      this.collectMetrics();
    }, 60000);
    
    // 每10秒检查警报
    setInterval(() => {
      this.checkAlerts();
    }, 10000);
  }

  collectMetrics() {
    const now = new Date();
    
    // 收集各种指标
    this.metrics.activeConnections = this.getActiveConnections();
    this.metrics.messagesPerMinute = this.getMessagesPerMinute();
    this.metrics.avgResponseTime = this.getAvgResponseTime();
    this.metrics.queueLength = this.getQueueLength();
    this.metrics.agentUtilization = this.getAgentUtilization();
    this.metrics.customerSatisfaction = this.getCustomerSatisfaction();
    
    // 发送到监控系统
    this.sendToPrometheus(this.metrics);
    
    logger.info('Metrics collected', this.metrics);
  }

  checkAlerts() {
    // 检查队列长度
    if (this.alerts.highQueueLength.enabled && 
        this.metrics.queueLength > this.alerts.highQueueLength.threshold) {
      this.sendAlert('high_queue_length', {
        current: this.metrics.queueLength,
        threshold: this.alerts.highQueueLength.threshold
      });
    }
    
    // 检查响应时间
    if (this.alerts.slowResponseTime.enabled && 
        this.metrics.avgResponseTime > this.alerts.slowResponseTime.threshold) {
      this.sendAlert('slow_response_time', {
        current: this.metrics.avgResponseTime,
        threshold: this.alerts.slowResponseTime.threshold
      });
    }
    
    // 检查满意度
    if (this.alerts.lowSatisfaction.enabled && 
        this.metrics.customerSatisfaction < this.alerts.lowSatisfaction.threshold) {
      this.sendAlert('low_satisfaction', {
        current: this.metrics.customerSatisfaction,
        threshold: this.alerts.lowSatisfaction.threshold
      });
    }
    
    // 检查客服利用率
    if (this.alerts.highAgentUtilization.enabled && 
        this.metrics.agentUtilization > this.alerts.highAgentUtilization.threshold) {
      this.sendAlert('high_agent_utilization', {
        current: this.metrics.agentUtilization,
        threshold: this.alerts.highAgentUtilization.threshold
      });
    }
  }

  sendAlert(type, data) {
    const alert = {
      type: type,
      severity: this.getAlertSeverity(type),
      message: this.getAlertMessage(type, data),
      timestamp: new Date(),
      data: data
    };
    
    // 发送到不同的告警渠道
    this.sendToSlack(alert);
    this.sendToEmail(alert);
    this.sendToSMS(alert);
    
    logger.warn('Alert sent', alert);
  }

  getAlertSeverity(type) {
    const severityMap = {
      'high_queue_length': 'warning',
      'slow_response_time': 'warning',
      'low_satisfaction': 'critical',
      'high_agent_utilization': 'warning'
    };
    
    return severityMap[type] || 'info';
  }

  getAlertMessage(type, data) {
    const messages = {
      'high_queue_length': `客服队列长度过高：${data.current}（阈值：${data.threshold}）`,
      'slow_response_time': `客服响应时间过慢：${data.current}ms（阈值：${data.threshold}ms）`,
      'low_satisfaction': `客户满意度过低：${data.current}（阈值：${data.threshold}）`,
      'high_agent_utilization': `客服利用率过高：${(data.current * 100).toFixed(1)}%（阈值：${(data.threshold * 100).toFixed(1)}%）`
    };
    
    return messages[type] || `未知告警类型：${type}`;
  }

  generateDashboard() {
    return {
      realTime: {
        activeConnections: this.metrics.activeConnections,
        queueLength: this.metrics.queueLength,
        avgResponseTime: this.metrics.avgResponseTime,
        agentUtilization: this.metrics.agentUtilization
      },
      
      daily: {
        totalMessages: this.getDailyMessages(),
        resolvedTickets: this.getDailyResolvedTickets(),
        avgSatisfaction: this.getDailySatisfaction(),
        peakHours: this.getPeakHours()
      },
      
      weekly: {
        messagesTrend: this.getWeeklyMessagesTrend(),
        satisfactionTrend: this.getWeeklySatisfactionTrend(),
        agentPerformance: this.getWeeklyAgentPerformance()
      }
    };
  }
}

module.exports = CustomerServiceMonitor;
```

## 部署配置

### Docker Compose 增强
```yaml
# docker-compose.customer-service.yml
version: '3.8'

services:
  # 原有服务...
  
  # WebSocket服务
  websocket-service:
    build: ./services/websocket-service
    ports:
      - "3006:3006"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M

  # 知识库服务
  knowledge-base:
    build: ./services/knowledge-base
    ports:
      - "3007:3007"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:password@postgres:5432/knowledge_base
      - ELASTICSEARCH_URL=http://elasticsearch:9200
    depends_on:
      - postgres
      - elasticsearch
    deploy:
      replicas: 2

  # 工单系统
  ticket-system:
    build: ./services/ticket-system
    ports:
      - "3008:3008"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:password@postgres:5432/tickets
    depends_on:
      - postgres
    deploy:
      replicas: 2

  # Elasticsearch (用于搜索)
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  # Kibana (用于日志分析)
  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch

volumes:
  elasticsearch_data:
```

## 总结

现有架构**完全可以**处理C端客服场景，通过以上增强后：

### ✅ 具备的核心能力：
1. **高并发处理** - 支持数万条/日消息量
2. **实时客服** - WebSocket实时通信
3. **智能路由** - AI分类+优先级处理
4. **多渠道接入** - 微信、Telegram、WhatsApp等
5. **工单系统** - 完整的工单生命周期管理
6. **知识库** - FAQ自动回复+语义搜索
7. **监控告警** - 实时性能监控和告警

### 🚀 相比传统客服系统的优势：
- **AI智能分类**自动识别客户意图
- **多CRM集成**无缝对接现有系统
- **微服务架构**易于扩展和维护
- **全渠道统一**一套系统管理多个平台

这个架构既能处理B端企业客户的需求，也完全适合C端大规模客服场景！ 