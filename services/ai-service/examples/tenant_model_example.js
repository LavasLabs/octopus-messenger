/**
 * 租户模型管理 API 使用示例
 * 
 * 此示例展示如何使用租户专用AI模型功能，包括：
 * 1. 训练租户专用模型
 * 2. 使用模型进行预测
 * 3. 增量训练
 * 4. 模型评估
 * 5. 模型比较
 */

const axios = require('axios');

class TenantModelExample {
  constructor(baseUrl = 'http://localhost:3002', tenantId = 'tenant_001') {
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

  // 示例训练数据
  getTrainingData() {
    return [
      // 技术支持类
      { text: "网站打不开了", category: "support" },
      { text: "登录失败，密码忘记了", category: "support" },
      { text: "系统报错，无法提交订单", category: "support" },
      { text: "APP闪退，需要技术支持", category: "support" },
      { text: "页面加载很慢，有问题吗", category: "support" },
      
      // 销售咨询类
      { text: "想了解VIP会员的价格", category: "sales" },
      { text: "有什么优惠活动吗", category: "sales" },
      { text: "产品功能介绍", category: "sales" },
      { text: "可以试用吗", category: "sales" },
      { text: "支持哪些付款方式", category: "sales" },
      
      // 投诉建议类
      { text: "服务态度很差", category: "complaint" },
      { text: "要求退款", category: "complaint" },
      { text: "对产品不满意", category: "complaint" },
      { text: "客服回复太慢了", category: "complaint" },
      { text: "功能有bug，影响使用", category: "complaint" },
      
      // 账户相关
      { text: "如何修改密码", category: "account" },
      { text: "账户被锁定了", category: "account" },
      { text: "更新个人信息", category: "account" },
      { text: "注销账户流程", category: "account" },
      { text: "绑定手机号码", category: "account" }
    ];
  }

  // 获取测试数据
  getTestData() {
    return [
      { text: "系统无法登录", category: "support" },
      { text: "想购买企业版", category: "sales" },
      { text: "申请退款", category: "complaint" },
      { text: "修改用户名", category: "account" },
      { text: "网页加载错误", category: "support" }
    ];
  }

  // 1. 训练规则引擎模型
  async trainRuleEngineModel() {
    console.log('🚀 开始训练规则引擎模型...');
    
    try {
      const response = await this.client.post('/api/tenant/models/train', {
        modelType: 'rule-engine',
        examples: this.getTrainingData(),
        options: {
          priority: 'high',
          description: '客服分类规则引擎v1'
        }
      });
      
      console.log('✅ 规则引擎模型训练完成:');
      console.log(`   - 准确率: ${response.data.training.metrics.accuracy.toFixed(2)}`);
      console.log(`   - 训练时间: ${response.data.training.metrics.trainingTime}ms`);
      console.log(`   - 生成规则数: ${response.data.training.metrics.rulesGenerated}`);
      
      return response.data;
    } catch (error) {
      console.error('❌ 规则引擎模型训练失败:', error.response?.data || error.message);
    }
  }

  // 2. 训练朴素贝叶斯模型
  async trainLocalClassifier() {
    console.log('🚀 开始训练朴素贝叶斯模型...');
    
    try {
      const response = await this.client.post('/api/tenant/models/train', {
        modelType: 'local-classifier',
        examples: this.getTrainingData(),
        options: {
          algorithm: 'naive-bayes',
          description: '客服分类贝叶斯模型v1'
        }
      });
      
      console.log('✅ 朴素贝叶斯模型训练完成:');
      console.log(`   - 准确率: ${response.data.training.metrics.accuracy.toFixed(2)}`);
      console.log(`   - 训练时间: ${response.data.training.metrics.trainingTime}ms`);
      console.log(`   - 词汇量: ${response.data.training.metrics.vocabularySize}`);
      
      return response.data;
    } catch (error) {
      console.error('❌ 朴素贝叶斯模型训练失败:', error.response?.data || error.message);
    }
  }

  // 3. 使用模型进行预测
  async predictWithModels() {
    console.log('🔍 开始模型预测测试...');
    
    const testTexts = [
      "网站无法访问",
      "想了解产品价格",
      "要求退款处理",
      "忘记登录密码"
    ];

    for (const text of testTexts) {
      console.log(`\n📝 预测文本: "${text}"`);
      
      // 规则引擎预测
      try {
        const ruleResult = await this.client.post('/api/tenant/models/rule-engine/predict', {
          text: text
        });
        console.log(`   规则引擎: ${ruleResult.data.prediction.category} (${(ruleResult.data.prediction.confidence * 100).toFixed(1)}%)`);
      } catch (error) {
        console.log(`   规则引擎: 预测失败`);
      }

      // 朴素贝叶斯预测
      try {
        const classifierResult = await this.client.post('/api/tenant/models/local-classifier/predict', {
          text: text
        });
        console.log(`   朴素贝叶斯: ${classifierResult.data.prediction.category} (${(classifierResult.data.prediction.confidence * 100).toFixed(1)}%)`);
      } catch (error) {
        console.log(`   朴素贝叶斯: 预测失败`);
      }
    }
  }

  // 4. 批量预测
  async batchPredict() {
    console.log('\n📦 开始批量预测测试...');
    
    const testTexts = [
      "系统崩溃了",
      "想购买VIP",
      "服务太差了",
      "如何注销账户",
      "网页打不开"
    ];

    try {
      const response = await this.client.post('/api/tenant/models/rule-engine/predict/batch', {
        texts: testTexts
      });
      
      console.log('✅ 批量预测完成:');
      response.data.predictions.forEach((pred, index) => {
        if (pred.success) {
          console.log(`   "${testTexts[index]}" → ${pred.prediction.category} (${(pred.prediction.confidence * 100).toFixed(1)}%)`);
        } else {
          console.log(`   "${testTexts[index]}" → 预测失败: ${pred.error}`);
        }
      });
      
      console.log(`   平均预测时间: ${response.data.averageTimePerText.toFixed(1)}ms`);
    } catch (error) {
      console.error('❌ 批量预测失败:', error.response?.data || error.message);
    }
  }

  // 5. 模型比较
  async compareModels() {
    console.log('\n⚖️ 开始模型比较...');
    
    const testText = "网站登录有问题，需要技术支持";
    
    try {
      const response = await this.client.post('/api/tenant/models/compare', {
        modelTypes: ['rule-engine', 'local-classifier'],
        text: testText
      });
      
      console.log(`📝 测试文本: "${testText}"`);
      console.log('🔍 模型比较结果:');
      
      Object.entries(response.data.comparisons).forEach(([modelType, result]) => {
        if (result.error) {
          console.log(`   ${modelType}: 预测失败 - ${result.error}`);
        } else {
          console.log(`   ${modelType}: ${result.category} (${(result.confidence * 100).toFixed(1)}%)`);
        }
      });
      
    } catch (error) {
      console.error('❌ 模型比较失败:', error.response?.data || error.message);
    }
  }

  // 6. 模型评估
  async evaluateModel() {
    console.log('\n📊 开始模型评估...');
    
    try {
      const response = await this.client.post('/api/tenant/models/rule-engine/evaluate', {
        testData: this.getTestData()
      });
      
      console.log('✅ 模型评估完成:');
      console.log(`   总体准确率: ${(response.data.evaluation.accuracy * 100).toFixed(1)}%`);
      console.log(`   正确预测: ${response.data.evaluation.correct}/${response.data.evaluation.total}`);
      
      console.log('   分类别准确率:');
      Object.entries(response.data.evaluation.summary.byCategory).forEach(([category, stats]) => {
        console.log(`     ${category}: ${(stats.accuracy * 100).toFixed(1)}% (${stats.correct}/${stats.total})`);
      });
      
    } catch (error) {
      console.error('❌ 模型评估失败:', error.response?.data || error.message);
    }
  }

  // 7. 增量训练
  async incrementalTraining() {
    console.log('\n🔄 开始增量训练...');
    
    const newExamples = [
      { text: "API接口报错", category: "support" },
      { text: "企业版价格咨询", category: "sales" },
      { text: "功能建议", category: "feedback" },
      { text: "数据导出功能", category: "support" }
    ];

    try {
      const response = await this.client.post('/api/tenant/models/rule-engine/incremental-train', {
        examples: newExamples,
        retrain: true
      });
      
      console.log('✅ 增量训练完成:');
      console.log(`   新增样本: ${response.data.examplesAdded}`);
      if (response.data.training) {
        console.log(`   重训练准确率: ${response.data.training.metrics.accuracy.toFixed(2)}`);
        console.log(`   训练时间: ${response.data.trainingTime}ms`);
      }
      
    } catch (error) {
      console.error('❌ 增量训练失败:', error.response?.data || error.message);
    }
  }

  // 8. 获取租户统计
  async getTenantStats() {
    console.log('\n📈 获取租户统计信息...');
    
    try {
      const response = await this.client.get('/api/tenant/stats');
      
      console.log('✅ 租户统计信息:');
      console.log(`   模型总数: ${response.data.stats.models.total}`);
      console.log('   模型类型分布:');
      Object.entries(response.data.stats.models.byType).forEach(([type, count]) => {
        console.log(`     ${type}: ${count}`);
      });
      
      if (response.data.stats.training) {
        console.log(`   训练样本总数: ${response.data.stats.training.totalExamples}`);
        console.log(`   训练会话数: ${response.data.stats.training.sessions}`);
      }
      
    } catch (error) {
      console.error('❌ 获取统计信息失败:', error.response?.data || error.message);
    }
  }

  // 9. 获取模型列表
  async getModelList() {
    console.log('\n📋 获取模型列表...');
    
    try {
      const response = await this.client.get('/api/tenant/models');
      
      console.log('✅ 租户模型列表:');
      response.data.models.forEach(model => {
        console.log(`   ${model.modelType} v${model.version}:`);
        console.log(`     准确率: ${(model.metrics.accuracy || 0).toFixed(2)}`);
        console.log(`     创建时间: ${new Date(model.createdAt).toLocaleString()}`);
      });
      
    } catch (error) {
      console.error('❌ 获取模型列表失败:', error.response?.data || error.message);
    }
  }

  // 运行完整示例
  async runCompleteExample() {
    console.log('🎯 开始租户模型管理完整示例');
    console.log(`📍 租户ID: ${this.tenantId}`);
    console.log(`🌐 服务地址: ${this.baseUrl}`);
    console.log('=' * 50);

    try {
      // 1. 训练模型
      await this.trainRuleEngineModel();
      await this.trainLocalClassifier();
      
      // 等待一秒，确保模型训练完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 2. 预测测试
      await this.predictWithModels();
      await this.batchPredict();
      await this.compareModels();
      
      // 3. 模型评估
      await this.evaluateModel();
      
      // 4. 增量训练
      await this.incrementalTraining();
      
      // 5. 统计信息
      await this.getTenantStats();
      await this.getModelList();
      
      console.log('\n🎉 租户模型管理示例运行完成！');
      
    } catch (error) {
      console.error('💥 示例运行失败:', error.message);
    }
  }
}

// 使用示例
async function main() {
  // 创建示例实例
  const example = new TenantModelExample('http://localhost:3002', 'tenant_demo');
  
  // 运行完整示例
  await example.runCompleteExample();
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = TenantModelExample; 