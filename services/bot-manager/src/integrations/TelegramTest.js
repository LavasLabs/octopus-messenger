#!/usr/bin/env node

// 这个没用本地webhook用的node的
const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');

// 配置信息
const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN',
  openai: {
    apiKey: process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o'
  }
};

// 初始化OpenAI客户端
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseURL
});

// 创建Telegram机器人实例
const bot = new TelegramBot(config.telegramToken, { polling: true });

console.log('🤖 Z-Bot 正在启动...');

// 错误处理
bot.on('error', (error) => {
  console.error('❌ Telegram Bot 错误:', error.message);
});

// 启动成功
bot.on('polling_error', (error) => {
  console.error('❌ Polling 错误:', error.message);
});

// 处理 /start 命令
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
🎉 欢迎使用 Z-Bot！

我是一个智能助手，可以帮助您：
• 回答问题
• 提供信息
• 进行对话
• 协助解决问题

发送任何消息给我，我会尽力帮助您！

输入 /help 查看更多命令
  `;
  
  bot.sendMessage(chatId, welcomeMessage);
});

// 处理 /help 命令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
📋 Z-Bot 命令帮助：

/start - 开始使用机器人
/help - 显示帮助信息
/ping - 测试机器人响应
/about - 关于机器人

💬 您也可以直接发送消息与我对话！
  `;
  
  bot.sendMessage(chatId, helpMessage);
});

// 处理 /ping 命令
bot.onText(/\/ping/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '🏓 Pong! 机器人运行正常！');
});

// 处理 /about 命令
bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  const aboutMessage = `
ℹ️ 关于 Z-Bot：

版本: 1.0.0
技术: Node.js + OpenAI GPT-4
功能: 智能对话助手

由 Octopus Messenger 驱动 🐙
  `;
  
  bot.sendMessage(chatId, aboutMessage);
});

// 处理普通消息
bot.on('message', async (msg) => {
  // 忽略命令消息
  if (msg.text && msg.text.startsWith('/')) {
    return;
  }

  const chatId = msg.chat.id;
  const userMessage = msg.text;
  
  if (!userMessage) {
    return;
  }

  console.log(`📨 收到消息 [${msg.from.first_name}]: ${userMessage}`);

  try {
    // 发送"正在输入"状态
    await bot.sendChatAction(chatId, 'typing');

    // 调用OpenAI API
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
    
    // 发送AI回复
    await bot.sendMessage(chatId, aiResponse);
    
    console.log(`🤖 AI回复: ${aiResponse.substring(0, 100)}...`);
    
  } catch (error) {
    console.error('❌ OpenAI API 错误:', error.message);
    
    // 发送错误消息给用户
    const errorMessage = '抱歉，我现在遇到了一些技术问题。请稍后再试。';
    await bot.sendMessage(chatId, errorMessage);
  }
});

// 启动成功消息
console.log('✅ Z-Bot 已成功启动！');
console.log('📱 在Telegram中搜索您的机器人并发送 /start 开始使用');
console.log('🔄 按 Ctrl+C 停止机器人');

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n⏹️  正在关闭 Z-Bot...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  正在关闭 Z-Bot...');
  bot.stopPolling();
  process.exit(0);
});