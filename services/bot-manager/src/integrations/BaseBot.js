const axios = require('axios');
const EventEmitter = require('events');
const logger = require('../utils/logger');

class BaseBot extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.id = config.id;
    this.platform = config.platform;
    this.token = config.token;
    this.tenantId = config.tenantId;
    this.logger = logger;
    this.isConnected = false;
    this.lastHeartbeat = null;
    
    // 群组权限检查配置
    this.groupAuthEnabled = config.groupAuthEnabled !== false; // 默认启用
    this.gatewayUrl = config.gatewayUrl || process.env.GATEWAY_URL || 'http://localhost:3000';
    this.authToken = config.authToken || process.env.AUTH_TOKEN;
    
    // 事件监听
    this.on('error', (error) => {
      this.logger.error(`Bot error [${this.platform}:${this.id}]`, {
        error: error.message,
        stack: error.stack
      });
    });
    
    this.on('message', (message) => {
      this.handleMessage(message);
    });
  }

  // 启动Bot
  async start() {
    try {
      this.logger.info(`Starting bot [${this.platform}:${this.id}]`);
      
      // 子类实现具体启动逻辑
      await this.initialize();
      
      this.isConnected = true;
      this.lastHeartbeat = new Date();
      
      this.logger.info(`Bot started successfully [${this.platform}:${this.id}]`);
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to start bot [${this.platform}:${this.id}]`, {
        error: error.message
      });
      throw error;
    }
  }

  // 停止Bot
  async stop() {
    try {
      this.logger.info(`Stopping bot [${this.platform}:${this.id}]`);
      
      // 子类实现具体停止逻辑
      await this.cleanup();
      
      this.isConnected = false;
      this.lastHeartbeat = null;
      
      this.logger.info(`Bot stopped successfully [${this.platform}:${this.id}]`);
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to stop bot [${this.platform}:${this.id}]`, {
        error: error.message
      });
      throw error;
    }
  }

  // 处理消息
  async handleMessage(message) {
    try {
      // 检查是否为群组消息
      if (message.isGroup) {
        const permissionCheck = await this.checkGroupPermission(message);
        
        if (!permissionCheck.allowed) {
          this.logger.info(`Group message blocked [${this.platform}:${this.id}]`, {
            groupId: message.groupId,
            reason: permissionCheck.reason
          });
          
          // 发送权限拒绝消息（如果需要）
          await this.sendPermissionDeniedMessage(message, permissionCheck);
          
          return;
        }
        
        // 更新消息使用计数
        await this.updateGroupMessageUsage(message);
      }
      
      // 处理消息
      await this.processMessage(message);
      
    } catch (error) {
      this.logger.error(`Error handling message [${this.platform}:${this.id}]`, {
        error: error.message,
        messageId: message.id
      });
      
      this.emit('error', error);
    }
  }

  // 检查群组权限
  async checkGroupPermission(message) {
    if (!this.groupAuthEnabled) {
      return { allowed: true, reason: 'Group auth disabled' };
    }
    
    try {
      const groupData = {
        botConfigId: this.id,
        platformGroupId: message.groupId,
        groupName: message.groupName,
        groupType: message.groupType,
        memberCount: message.memberCount,
        invitedByUserId: message.invitedByUserId,
        invitedByUsername: message.invitedByUsername,
        platform: this.platform
      };
      
      const response = await axios.post(
        `${this.gatewayUrl}/api/groups/check-permission`,
        groupData,
        {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000 // 5秒超时
        }
      );
      
      const result = response.data;
      
      this.logger.info(`Group permission check result [${this.platform}:${this.id}]`, {
        groupId: message.groupId,
        allowed: result.allowed,
        reason: result.reason,
        requiresApproval: result.requiresApproval
      });
      
      return result;
      
    } catch (error) {
      this.logger.error(`Error checking group permission [${this.platform}:${this.id}]`, {
        error: error.message,
        groupId: message.groupId
      });
      
      // 默认策略：出错时允许（避免阻塞正常服务）
      return { 
        allowed: true, 
        reason: 'Permission check failed - defaulting to allow'
      };
    }
  }

  // 更新群组消息使用计数
  async updateGroupMessageUsage(message) {
    try {
      await axios.post(
        `${this.gatewayUrl}/api/groups/update-usage`,
        {
          botConfigId: this.id,
          platformGroupId: message.groupId,
          messageCount: 1
        },
        {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 3000
        }
      );
      
    } catch (error) {
      this.logger.warn(`Failed to update group message usage [${this.platform}:${this.id}]`, {
        error: error.message,
        groupId: message.groupId
      });
    }
  }

  // 发送权限拒绝消息
  async sendPermissionDeniedMessage(message, permissionCheck) {
    try {
      let responseMessage = '';
      
      if (permissionCheck.pendingApproval) {
        responseMessage = `🔄 群组使用申请已提交，等待管理员审批。请耐心等待。`;
      } else if (permissionCheck.reason.includes('quota')) {
        responseMessage = `⚠️ 群组消息配额已用完，请联系管理员增加配额。`;
      } else if (permissionCheck.reason.includes('blacklist')) {
        responseMessage = `❌ 该群组已被加入黑名单，无法使用Bot服务。`;
      } else {
        responseMessage = `🚫 抱歉，该群组暂时无法使用Bot服务。原因：${permissionCheck.reason}`;
      }
      
      await this.sendMessage(message.groupId, responseMessage, { isGroup: true });
      
    } catch (error) {
      this.logger.error(`Failed to send permission denied message [${this.platform}:${this.id}]`, {
        error: error.message,
        groupId: message.groupId
      });
    }
  }

  // 处理Bot加入群组事件
  async handleBotJoinGroup(groupInfo) {
    try {
      this.logger.info(`Bot joined group [${this.platform}:${this.id}]`, {
        groupId: groupInfo.groupId,
        groupName: groupInfo.groupName,
        memberCount: groupInfo.memberCount
      });
      
      // 检查群组权限
      const permissionCheck = await this.checkGroupPermission({
        groupId: groupInfo.groupId,
        groupName: groupInfo.groupName,
        groupType: groupInfo.groupType,
        memberCount: groupInfo.memberCount,
        invitedByUserId: groupInfo.invitedByUserId,
        invitedByUsername: groupInfo.invitedByUsername,
        isGroup: true
      });
      
      if (!permissionCheck.allowed) {
        this.logger.info(`Leaving unauthorized group [${this.platform}:${this.id}]`, {
          groupId: groupInfo.groupId,
          reason: permissionCheck.reason
        });
        
        // 发送拒绝消息后离开群组
        await this.sendPermissionDeniedMessage({ groupId: groupInfo.groupId }, permissionCheck);
        
        // 延迟离开群组，确保消息能够发送
        setTimeout(async () => {
          await this.leaveGroup(groupInfo.groupId);
        }, 2000);
        
        return;
      }
      
      // 发送欢迎消息
      await this.sendWelcomeMessage(groupInfo);
      
    } catch (error) {
      this.logger.error(`Error handling bot join group [${this.platform}:${this.id}]`, {
        error: error.message,
        groupId: groupInfo.groupId
      });
    }
  }

  // 发送欢迎消息
  async sendWelcomeMessage(groupInfo) {
    try {
      const welcomeMessage = this.config.welcomeMessage || 
        `👋 大家好！我是 ${this.config.name || 'Bot'}，很高兴为大家服务！\n\n` +
        `🤖 我可以帮助您：\n` +
        `• 回答常见问题\n` +
        `• 提供客服支持\n` +
        `• 处理各种查询\n\n` +
        `如需帮助，请直接@我或发送 /help 查看可用命令。`;
      
      await this.sendMessage(groupInfo.groupId, welcomeMessage, { isGroup: true });
      
    } catch (error) {
      this.logger.error(`Failed to send welcome message [${this.platform}:${this.id}]`, {
        error: error.message,
        groupId: groupInfo.groupId
      });
    }
  }

  // 获取Bot状态
  getStatus() {
    return {
      id: this.id,
      platform: this.platform,
      isConnected: this.isConnected,
      lastHeartbeat: this.lastHeartbeat,
      uptime: this.isConnected ? Date.now() - this.lastHeartbeat : 0
    };
  }

  // 更新心跳
  updateHeartbeat() {
    this.lastHeartbeat = new Date();
  }

  // 子类需要实现的方法
  async initialize() {
    throw new Error('initialize() method must be implemented by subclass');
  }

  async cleanup() {
    throw new Error('cleanup() method must be implemented by subclass');
  }

  async processMessage(message) {
    throw new Error('processMessage() method must be implemented by subclass');
  }

  async sendMessage(chatId, text, options = {}) {
    throw new Error('sendMessage() method must be implemented by subclass');
  }

  async leaveGroup(groupId) {
    throw new Error('leaveGroup() method must be implemented by subclass');
  }

  // 通用工具方法
  isValidMessage(message) {
    return message && 
           message.id && 
           message.content && 
           message.senderId;
  }

  // 格式化消息
  formatMessage(rawMessage) {
    // 子类可以重写此方法来格式化平台特定的消息
    return {
      id: rawMessage.id,
      content: rawMessage.content,
      senderId: rawMessage.senderId,
      senderName: rawMessage.senderName,
      timestamp: rawMessage.timestamp || new Date(),
      isGroup: rawMessage.isGroup || false,
      groupId: rawMessage.groupId,
      groupName: rawMessage.groupName,
      groupType: rawMessage.groupType,
      memberCount: rawMessage.memberCount,
      invitedByUserId: rawMessage.invitedByUserId,
      invitedByUsername: rawMessage.invitedByUsername,
      metadata: rawMessage.metadata || {}
    };
  }

  // 错误处理
  handleError(error, context = {}) {
    this.logger.error(`Bot error [${this.platform}:${this.id}]`, {
      error: error.message,
      context,
      stack: error.stack
    });
    
    this.emit('error', error);
  }
}

module.exports = BaseBot; 