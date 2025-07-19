# 🤖 Telegram AI Bot 集成

## 📖 概述
基于Webhook的Telegram AI机器人，使用OpenAI GPT-4o提供智能对话服务。

## 📁 文件结构
```
telegram/
├── ai-webhook-bot.js          # AI Webhook服务器 (核心文件)
├── start-telegram-ai.sh       # 一键启动脚本
└── README.md                  # 本文档
```

## 🚀 快速启动

### 一键启动
```bash
# 从项目根目录运行
./services/bot-manager/src/integrations/telegram/start-telegram-ai.sh
```

### 停止服务
```bash
pkill -f 'ai-webhook-bot.js' && pkill -f 'ngrok'
```


## 🔄 Webhook工作原理

```
用户发消息 → Telegram服务器 → POST /webhook → AI处理 → 回复用户
```

**关键步骤：**
1. 设置webhook：`POST https://api.telegram.org/bot{TOKEN}/setWebhook`
2. 接收消息：监听 `/webhook` 路径
3. 处理&回复：调用AI API生成回复并发送

## 🛠️ 启动脚本执行流程

```
1. 🧹 清理旧进程和端口占用
2. 🤖 启动AI服务器 (localhost:3000)
3. 🌐 启动ngrok隧道 (生成公网URL)
4. 🔧 自动配置Telegram webhook
5. ✅ 完成！机器人可用
```

## 📊 API端点

- `GET /` - 服务状态
- `GET /health` - 健康检查  
- `POST /webhook` - Telegram消息处理

## 🔧 配置修改

在 `ai-webhook-bot.js` 中可以修改：

```javascript
const config = {
  telegramToken: '8191216674:AAGSJmNEay6T4F266SyjpLAiTE2GfpWn_5M',
  openai: {
    apiKey: 'your_openai_api_key',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o'
  }
};
```

## 🧪 测试机器人

1. 打开Telegram搜索 `@Lavas_z_bot`
2. 发送任意消息测试AI回复

## 🔧 常用命令

```bash
# 启动服务
./start-telegram-ai.sh

# 检查状态
curl http://localhost:3000/health
curl http://localhost:4040/api/tunnels

# 查看进程
ps aux | grep ai-webhook-bot

# 查看ngrok管理界面
open http://localhost:4040
```

## 🛠️ 故障排除

- **端口占用**：脚本会自动清理端口3000和4040
- **ngrok失败**：检查免费账户限制（最多1个隧道）
- **无回复**：访问 http://localhost:4040 确认隧道状态
- **启动失败**：检查Node.js和ngrok是否正确安装

## 📝 依赖要求

- `node` - Node.js运行环境
- `ngrok` - 内网穿透工具
- `express` - Web服务器框架
- `axios` - HTTP客户端
- `openai` - OpenAI API客户端

## 🏗️ 核心原理

**数据流向**：本地服务器(3000) → ngrok公网隧道 → Telegram webhook → AI处理 → 用户收到回复

**为什么需要ngrok**：
- 本地服务器无法被Telegram直接访问
- ngrok提供公网URL映射到本地端口
- Telegram通过这个公网URL发送webhook消息 