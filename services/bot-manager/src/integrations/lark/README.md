# Lark AI Bot

集成OpenAI的Lark（国际版飞书）AI机器人，支持智能对话和自动回复。

## 🚀 快速启动

```bash
cd services/bot-manager/src/integrations/lark
./start-lark-ai.sh
```

启动后获取webhook地址：
```
🎉 服务启动成功！
📡 Webhook URL: https://xxxx.ngrok-free.app/webhook
```

## 📋 Lark平台配置

### 1. 创建应用
- 访问：https://open.feishu.cn/
- 创建企业自建应用
- 记录App ID和App Secret

### 2. 配置权限
在"权限管理"页面添加：
- ✅ `im:message` - 接收消息  
- ✅ `im:message:send_as_bot` - 发送消息

### 3. 配置事件订阅
在"事件订阅"页面：
1. 启用事件订阅
2. 填写请求网址：`https://xxxx.ngrok-free.app/webhook`
3. 添加事件：`im.message.receive_v1`
4. 保存（自动验证URL）

### 4. 发布应用
在"版本管理与发布"页面创建版本并发布

## ⚙️ 配置说明

当前配置的应用信息：
- **App ID**: `cli_a8fdfbf9d9e2d029`
- **App Secret**: `S2m4GqEZ5LRnl8erNxDQv5qsqSkEvdaJ`

如需修改OpenAI配置，编辑`ai-webhook-bot.js`中的`config.openai`部分。

## 🛠️ 常用命令

```bash
# 一键启动（推荐）
./start-lark-ai.sh

# 手动启动
npm install
node ai-webhook-bot.js

# 停止服务
Ctrl+C 或 pkill -f "ai-webhook-bot.js"
```

## 🔧 故障排除

### "返回数据不是合法的JSON格式"
1. 确认服务正在运行：`curl http://127.0.0.1:3001/health`
2. 检查ngrok状态：访问 http://127.0.0.1:4040
3. 重新启动服务：`./start-lark-ai.sh`

### 无法启动服务
```bash
# 清理旧进程
pkill -f "ai-webhook-bot.js"
pkill -f "ngrok"

# 检查端口占用
lsof -i :3001
```

### 消息无回复
1. 检查机器人权限配置
2. 确认OpenAI API Key有效
3. 查看服务终端的错误日志

## ⚠️ 注意事项

1. **保持终端运行**：服务需持续运行
2. **ngrok地址变化**：重启后需更新Lark配置
3. **网络稳定**：确保ngrok连接正常
4. **权限完整**：检查Lark平台权限配置

## 🎯 测试方法

1. 在Lark中搜索机器人名称
2. 发起私聊或添加到群组  
3. 发送消息测试AI回复

---

更多详细配置请参考 `QUICK_START.md` 