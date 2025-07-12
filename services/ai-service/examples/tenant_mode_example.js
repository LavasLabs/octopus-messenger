/**
 * 租户模式管理 API 使用示例
 * 
 * 此示例展示如何在训练模式和普通模式之间切换，以及两种模式的区别：
 * 
 * 📚 训练模式 (Training Mode):
 * - 存储聊天数据用于训练个性化AI模型
 * - 优先使用租户专属的自定义模型
 * - 提供详细的数据分析和统计
 * - 支持自动训练和模型优化
 * 
 * 🔒 普通模式 (Normal Mode):
 * - 使用通用AI模型，不存储聊天数据
 * - 完全保护用户隐私
 * - 即时响应，无需额外配置
 * - 适合临时使用或隐私敏感场景
 */

const axios = require('axios');

class TenantModeExample {
  constructor(baseUrl = 'http://localhost:3002', tenantId = 'demo_tenant') {
    this.baseUrl = baseUrl;
    this.tenantId = tenantId;
    this.token = 'your-jwt-token-here'; // 替换为实际的JWT令牌
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-Tenant-ID': this.tenantId
      }
    });
  }

  // 测试消息
  getTestMessages() {
    return [
      {
        id: 'msg_001',
        content: '我的账户无法登录，需要帮助',
        platform: 'discord',
        userId: 'user123',
        type: 'text'
      },
      {
        id: 'msg_002', 
        content: '想了解VIP会员的价格和功能',
        platform: 'slack',
        userId: 'user456',
        type: 'text'
      },
      {
        id: 'msg_003',
        content: '对服务质量不满意，要投诉',
        platform: 'whatsapp',
        userId: 'user789',
        type: 'text'
      },
      {
        id: 'msg_004',
        content: '如何修改个人资料信息',
        platform: 'telegram',
        userId: 'user101',
        type: 'text'
      }
    ];
  }

  // 1. 查看当前模式
  async getCurrentMode() {
    console.log('\n📋 查看当前租户模式...');
    
    try {
      const response = await this.client.get('/api/mode/current');
      
      console.log('✅ 当前模式信息:');
      console.log(`   模式: ${response.data.mode}`);
      console.log(`   配置: ${JSON.stringify(response.data.config, null, 4)}`);
      
      return response.data;
    } catch (error) {
      console.error('❌ 获取当前模式失败:', error.response?.data || error.message);
      return null;
    }
  }

  // 2. 获取详细模式信息
  async getModeInfo() {
    console.log('\n📊 获取模式详细信息...');
    
    try {
      const response = await this.client.get('/api/mode/info');
      
      console.log('✅ 模式详细信息:');
      console.log(`   当前模式: ${response.data.mode}`);
      console.log('   支持的模式:');
      
      Object.entries(response.data.supportedModes).forEach(([mode, info]) => {
        console.log(`     ${mode}: ${info.name}`);
        console.log(`       描述: ${info.description}`);
        console.log(`       数据保留: ${info.dataRetention ? '是' : '否'}`);
        console.log(`       需要订阅: ${info.requiresSubscription ? '是' : '否'}`);
      });
      
      if (response.data.statistics) {
        console.log('   统计信息:', JSON.stringify(response.data.statistics, null, 4));
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ 获取模式信息失败:', error.response?.data || error.message);
      return null;
    }
  }

  // 3. 切换到训练模式
  async switchToTrainingMode() {
    console.log('\n🔄 切换到训练模式...');
    
    try {
      const response = await this.client.post('/api/mode/switch', {
        mode: 'training',
        reason: '开启个性化AI训练，提升服务质量'
      });
      
      console.log('✅ 模式切换成功:');
      console.log(`   ${response.data.message}`);
      console.log(`   从 ${response.data.previousMode} 切换到 ${response.data.currentMode}`);
      
      return response.data;
    } catch (error) {
      console.error('❌ 切换到训练模式失败:', error.response?.data || error.message);
      return null;
    }
  }

  // 4. 切换到普通模式
  async switchToNormalMode() {
    console.log('\n🔄 切换到普通模式...');
    
    try {
      const response = await this.client.post('/api/mode/switch', {
        mode: 'normal',
        reason: '保护隐私，使用通用AI模型'
      });
      
      console.log('✅ 模式切换成功:');
      console.log(`   ${response.data.message}`);
      console.log(`   从 ${response.data.previousMode} 切换到 ${response.data.currentMode}`);
      
      return response.data;
    } catch (error) {
      console.error('❌ 切换到普通模式失败:', error.response?.data || error.message);
      return null;
    }
  }

  // 5. 智能消息分类测试
  async testSmartClassification() {
    console.log('\n🤖 测试智能消息分类...');
    
    const testMessages = this.getTestMessages();
    
    for (const message of testMessages.slice(0, 2)) { // 测试前两条消息
      console.log(`\n📝 分类消息: "${message.content}"`);
      
      try {
        const response = await this.client.post('/api/smart-classify/message', {
          message: message
        });
        
        const result = response.data.classification;
        console.log('✅ 分类结果:');
        console.log(`   类别: ${result.category}`);
        console.log(`   置信度: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`   使用模式: ${result.mode}`);
        console.log(`   使用自定义模型: ${result.usedCustomModel ? '是' : '否'}`);
        console.log(`   策略: ${response.data.explanation.strategy}`);
        console.log(`   处理时间: ${response.data.processingTime}ms`);
        
      } catch (error) {
        console.error(`❌ 分类失败: ${error.response?.data?.error || error.message}`);
      }
    }
  }

  // 6. 批量分类测试
  async testBatchClassification() {
    console.log('\n📦 测试批量消息分类...');
    
    const messages = this.getTestMessages();
    
    try {
      const response = await this.client.post('/api/smart-classify/batch', {
        messages: messages
      });
      
      console.log('✅ 批量分类完成:');
      console.log(`   总数: ${response.data.summary.total}`);
      console.log(`   成功: ${response.data.summary.successful}`);
      console.log(`   失败: ${response.data.summary.failed}`);
      console.log(`   总处理时间: ${response.data.summary.processingTime}ms`);
      console.log(`   平均每条: ${response.data.summary.averageTimePerMessage.toFixed(1)}ms`);
      
      console.log('\n   分类结果:');
      response.data.results.forEach((result, index) => {
        if (result.success) {
          const classification = result.classification;
          console.log(`     ${index + 1}. ${classification.category} (${(classification.confidence * 100).toFixed(1)}%) - ${classification.usedCustomModel ? '自定义' : '通用'}模型`);
        } else {
          console.log(`     ${index + 1}. 失败: ${result.error}`);
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ 批量分类失败:', error.response?.data || error.message);
      return null;
    }
  }

  // 7. 预览分类结果（不存储数据）
  async testPreviewClassification() {
    console.log('\n👀 测试预览分类（不存储数据）...');
    
    const testMessage = {
      content: '网站加载很慢，可能是服务器问题',
      platform: 'web',
      userId: 'preview_user'
    };
    
    try {
      const response = await this.client.post('/api/smart-classify/preview', {
        message: testMessage
      });
      
      console.log('✅ 预览结果:');
      console.log(`   模式: ${response.data.preview.mode}`);
      
      if (response.data.preview.customModel) {
        console.log('   自定义模型:');
        if (response.data.preview.customModel.available) {
          const custom = response.data.preview.customModel.classification;
          console.log(`     类别: ${custom.category} (${(custom.confidence * 100).toFixed(1)}%)`);
        } else {
          console.log(`     不可用: ${response.data.preview.customModel.reason}`);
        }
      }
      
      if (response.data.preview.generalModel) {
        console.log('   通用模型:');
        const general = response.data.preview.generalModel.classification;
        console.log(`     类别: ${general.category} (${(general.confidence * 100).toFixed(1)}%)`);
      }
      
      if (response.data.preview.recommended) {
        console.log(`   推荐使用: ${response.data.preview.recommended}`);
      }
      
      console.log(`   说明: ${response.data.message}`);
      
      return response.data;
    } catch (error) {
      console.error('❌ 预览分类失败:', error.response?.data || error.message);
      return null;
    }
  }

  // 8. 获取分类统计
  async getClassificationStats() {
    console.log('\n📈 获取分类统计...');
    
    try {
      const response = await this.client.get('/api/smart-classify/stats?timeRange=24h');
      
      console.log('✅ 24小时分类统计:');
      Object.entries(response.data.stats.summary).forEach(([mode, stats]) => {
        console.log(`   ${mode} 模式:`);
        console.log(`     总分类数: ${stats.totalClassifications}`);
        console.log(`     自定义模型使用: ${stats.customModelUsage}`);
        console.log(`     通用模型使用: ${stats.generalModelUsage}`);
        console.log(`     平均置信度: ${(stats.avgConfidence * 100).toFixed(1)}%`);
        console.log(`     类别数量: ${stats.uniqueCategories}`);
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ 获取统计失败:', error.response?.data || error.message);
      return null;
    }
  }

  // 9. 获取模式建议
  async getModeRecommendation() {
    console.log('\n💡 获取模式建议...');
    
    try {
      const response = await this.client.get('/api/mode/recommend');
      
      console.log('✅ 模式建议:');
      console.log(`   当前模式: ${response.data.recommendation.currentMode}`);
      console.log(`   推荐模式: ${response.data.recommendation.recommendedMode}`);
      console.log(`   推荐理由: ${response.data.recommendation.reason}`);
      
      if (response.data.recommendation.benefits.length > 0) {
        console.log('   优势:');
        response.data.recommendation.benefits.forEach(benefit => {
          console.log(`     - ${benefit}`);
        });
      }
      
      if (response.data.recommendation.considerations.length > 0) {
        console.log('   考虑因素:');
        response.data.recommendation.considerations.forEach(consideration => {
          console.log(`     - ${consideration}`);
        });
      }
      
      console.log('\n   使用情况:');
      console.log(`   总分类数: ${response.data.usage.totalClassifications}`);
      console.log(`   活跃天数: ${response.data.usage.activeDays}`);
      
      return response.data;
    } catch (error) {
      console.error('❌ 获取建议失败:', error.response?.data || error.message);
      return null;
    }
  }

  // 10. 获取模式比较
  async compareModes() {
    console.log('\n⚖️ 模式功能比较...');
    
    try {
      const response = await this.client.get('/api/mode/compare');
      
      console.log('✅ 模式比较:');
      console.log(`   当前模式: ${response.data.comparison.current}`);
      
      Object.entries(response.data.comparison.modes).forEach(([mode, info]) => {
        console.log(`\n   ${info.name} (${mode}):`);
        console.log(`     描述: ${info.description}`);
        console.log(`     优点:`);
        info.pros.forEach(pro => console.log(`       ${pro}`));
        console.log(`     缺点:`);
        info.cons.forEach(con => console.log(`       ${con}`));
        console.log(`     适用场景:`);
        info.suitableFor.forEach(scenario => console.log(`       - ${scenario}`));
        console.log(`     数据保留: ${info.dataRetention ? '是' : '否'}`);
        console.log(`     费用: ${info.cost}`);
        if (info.available !== undefined) {
          console.log(`     可用性: ${info.available ? '可用' : '需要升级订阅'}`);
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ 获取比较失败:', error.response?.data || error.message);
      return null;
    }
  }

  // 11. 获取模式切换历史
  async getModeHistory() {
    console.log('\n📚 查看模式切换历史...');
    
    try {
      const response = await this.client.get('/api/mode/history?limit=5');
      
      console.log('✅ 最近5次模式切换:');
      if (response.data.history.length === 0) {
        console.log('   暂无切换记录');
      } else {
        response.data.history.forEach((record, index) => {
          console.log(`   ${index + 1}. ${record.fromMode} → ${record.toMode}`);
          console.log(`      时间: ${new Date(record.switchedAt).toLocaleString()}`);
          if (record.reason) {
            console.log(`      原因: ${record.reason}`);
          }
        });
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ 获取历史失败:', error.response?.data || error.message);
      return null;
    }
  }

  // 12. 演示完整的模式切换流程
  async demonstrateModeSwitching() {
    console.log('\n🎭 演示完整的模式切换流程...');
    
    try {
      // 1. 查看当前模式
      await this.getCurrentMode();
      
      // 2. 切换到训练模式
      await this.switchToTrainingMode();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
      
      // 3. 在训练模式下测试分类
      console.log('\n📍 训练模式下的分类测试:');
      await this.testSmartClassification();
      
      // 4. 切换到普通模式
      await this.switchToNormalMode();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
      
      // 5. 在普通模式下测试分类
      console.log('\n📍 普通模式下的分类测试:');
      await this.testSmartClassification();
      
      // 6. 比较两种模式
      await this.compareModes();
      
      console.log('\n🎉 模式切换演示完成！');
      
    } catch (error) {
      console.error('💥 演示过程中出现错误:', error.message);
    }
  }

  // 运行完整示例
  async runCompleteExample() {
    console.log('🎯 开始租户模式管理完整示例');
    console.log(`📍 租户ID: ${this.tenantId}`);
    console.log(`🌐 服务地址: ${this.baseUrl}`);
    console.log('=' * 60);

    try {
      // 1. 基础信息查询
      await this.getCurrentMode();
      await this.getModeInfo();
      
      // 2. 智能分类测试
      await this.testSmartClassification();
      await this.testBatchClassification();
      await this.testPreviewClassification();
      
      // 3. 统计和建议
      await this.getClassificationStats();
      await this.getModeRecommendation();
      
      // 4. 模式比较和历史
      await this.compareModes();
      await this.getModeHistory();
      
      // 5. 完整的模式切换演示
      await this.demonstrateModeSwitching();
      
      console.log('\n🎉 租户模式管理示例运行完成！');
      console.log('\n💡 总结:');
      console.log('   - 训练模式: 存储数据，个性化AI，需要订阅');
      console.log('   - 普通模式: 隐私保护，通用AI，免费使用');
      console.log('   - 智能分类: 根据模式自动选择最佳策略');
      console.log('   - 灵活切换: 可随时根据需要切换模式');
      
    } catch (error) {
      console.error('💥 示例运行失败:', error.message);
    }
  }
}

// 使用示例
async function main() {
  // 创建示例实例
  const example = new TenantModeExample('http://localhost:3002', 'demo_tenant');
  
  // 运行完整示例
  await example.runCompleteExample();
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = TenantModeExample; 