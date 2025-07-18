const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
const port = 3000;

// 配置
const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN',
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

app.use(express.json());

app.get('/health', (req, res) => {
  console.log('健康检查');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ message: 'Z-Bot AI服务器', status: 'running', ai: 'enabled' });
});

// 发送Telegram消息
async function sendTelegramMessage(chatId, text) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${config.telegramToken}/sendMessage`,
      {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      }
    );
    console.log('✅ 消息发送成功');
    return response.data;
  } catch (error) {
    console.error('❌ 发送Telegram消息失败:', error.message);
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
          content: '你是Z-Bot，一个友好、有帮助的AI助手。请用中文回答问题，保持简洁和有用。'
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

app.post('/webhook', async (req, res) => {
  try {
    console.log('📨 收到webhook请求:', new Date().toISOString());
    console.log('数据:', JSON.stringify(req.body, null, 2));
    
    const { message } = req.body;
    if (message && message.text) {
      const chatId = message.chat.id;
      const userMessage = message.text;
      const userName = message.from.first_name || 'User';
      
      console.log(`👤 [${userName}]: ${userMessage}`);
      console.log(`💬 Chat ID: ${chatId}`);
      
      // 发送"正在输入"状态
      try {
        await axios.post(
          `https://api.telegram.org/bot${config.telegramToken}/sendChatAction`,
          {
            chat_id: chatId,
            action: 'typing'
          }
        );
      } catch (error) {
        console.log('⚠️ 无法发送输入状态');
      }
      
      // 获取AI回复
      const aiResponse = await getAIResponse(userMessage);
      
      // 发送回复
      await sendTelegramMessage(chatId, aiResponse);
      
      console.log(`🤖 [Bot]: ${aiResponse.substring(0, 100)}...`);
      console.log('----------------------------------------');
    }
    
    res.json({ status: 'ok', received: true });
  } catch (error) {
    console.error('❌ 处理webhook失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, '127.0.0.1', () => {
  console.log(`🚀 Z-Bot AI服务器启动: http://127.0.0.1:${port}`);
  console.log(`🤖 AI模型: ${config.openai.model}`);
  console.log(`📡 Webhook端点: /webhook`);
  console.log(`💚 健康检查: /health`);
  console.log('----------------------------------------');
});

process.on('SIGINT', () => {
  console.log('\n⏹️ 停止服务器');
  process.exit(0);
});