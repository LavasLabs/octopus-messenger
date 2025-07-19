const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const crypto = require('crypto');

const app = express();
const port = 3001;

// 配置
const config = {
  lark: {
    appId: process.env.LARK_APP_ID || 'YOUR_LARK_APP_ID',
    appSecret: process.env.LARK_APP_SECRET || 'YOUR_LARK_APP_SECRET',
    verificationToken: process.env.LARK_VERIFICATION_TOKEN || 'YOUR_LARK_VERIFICATION_TOKEN',
    // encryptKey: process.env.LARK_ENCRYPT_KEY // 可选，用于加密验证
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o'
  }
};

// 初始化OpenAI
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseURL
});

// 存储access token
let accessToken = '';
let tokenExpireTime = 0;

app.use(express.json());

app.get('/health', (req, res) => {
  console.log('健康检查');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ message: 'Lark AI Bot服务器', status: 'running', ai: 'enabled' });
});

// 获取tenant access token
async function getTenantAccessToken() {
  try {
    if (Date.now() < tokenExpireTime && accessToken) {
      return accessToken;
    }

    const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: config.lark.appId,
      app_secret: config.lark.appSecret
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data.code === 0) {
      accessToken = response.data.tenant_access_token;
      tokenExpireTime = Date.now() + (response.data.expire - 300) * 1000; // 提前5分钟刷新
      console.log('✅ 获取access token成功');
      return accessToken;
    } else {
      throw new Error(`获取token失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('❌ 获取Lark access token失败:', error.message);
    throw error;
  }
}

// 发送Lark消息
async function sendLarkMessage(receiveId, text, receiveIdType = 'chat_id') {
  try {
    const token = await getTenantAccessToken();
    
    const response = await axios.post(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
      {
        receive_id: receiveId,
        content: JSON.stringify({
          text: text
        }),
        msg_type: 'text'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.code === 0) {
      console.log('✅ Lark消息发送成功');
      return response.data;
    } else {
      throw new Error(`发送消息失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('❌ 发送Lark消息失败:', error.message);
    throw error;
  }
}

// 获取AI回复
async function getAIResponse(userMessage) {
  try {
    console.log('🤖 正在生成AI回复...');
    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: '你是Lark AI助手，一个友好、有帮助的AI助手。请用中文回答问题，保持简洁和有用。'
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('✅ AI回复生成成功');
    return aiResponse;
  } catch (error) {
    console.error('❌ OpenAI API错误:', error.message);
    return '抱歉，我现在遇到了一些技术问题，请稍后再试。';
  }
}

// 验证请求签名（可选）
function verifySignature(timestamp, nonce, encryptKey, body) {
  if (!encryptKey) return true;
  
  const signature = crypto
    .createHmac('sha256', encryptKey)
    .update(timestamp + nonce + JSON.stringify(body))
    .digest('hex');
  
  return signature;
}

app.post('/webhook', async (req, res) => {
  // 确保总是返回JSON格式
  res.setHeader('Content-Type', 'application/json');
  
  try {
    console.log('📨 收到Lark webhook请求:', new Date().toISOString());
    console.log('请求头:', JSON.stringify(req.headers, null, 2));
    console.log('请求体:', JSON.stringify(req.body, null, 2));
    
    const { challenge, header, event } = req.body;
    const type = header ? header.event_type : undefined;
    
    // URL验证挑战
    if (type === 'url_verification') {
      console.log('🔐 URL验证挑战, challenge:', challenge);
      const response = { challenge };
      console.log('🔄 返回验证响应:', JSON.stringify(response));
      return res.status(200).json(response);
    }
    
    // 处理消息事件
    console.log('🔍 检查事件类型:', type);
    if (type === 'im.message.receive_v1' && event) {
      const eventType = header.event_type;
        const { message } = event;
      
      if (eventType === 'im.message.receive_v1' && message) {
        console.log('🔍 处理消息事件:', eventType);
        console.log('📝 消息详情:', JSON.stringify(message, null, 2));
        const { chat_id, content, message_type } = message;
	const { sender } = event;
        
        // 只处理文本消息，且不是机器人自己发的
        if (message_type === 'text' && event.sender.sender_type && event.sender.sender_type === 'user') {
          const textContent = JSON.parse(content);
          const userMessage = textContent.text;
          const userName = event.sender.sender_id.user_id || 'User';
          
          console.log(`👤 [${userName}]: ${userMessage}`);
          console.log(`💬 Chat ID: ${chat_id}`);
          
          // 获取AI回复
          const aiResponse = await getAIResponse(userMessage);
          
          // 发送回复
          await sendLarkMessage(chat_id, aiResponse);
          
          console.log(`🤖 [Bot]: ${aiResponse.substring(0, 100)}...`);
          console.log('----------------------------------------');
        }
      }
    }
    
    return res.status(200).json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('❌ 处理Lark webhook失败:', error.message);
    return res.status(200).json({ code: 500, msg: 'error', error: error.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Lark AI Bot服务器启动: http://0.0.0.0:${port}`);
  console.log(`🤖 AI模型: ${config.openai.model}`);
  console.log(`📡 Webhook端点: /webhook`);
  console.log(`💚 健康检查: /health`);
  console.log('----------------------------------------');
  
  // 启动时获取一次token
  getTenantAccessToken().catch(console.error);
});

process.on('SIGINT', () => {
  console.log('\n⏹️ 停止服务器');
  process.exit(0);
}); 
