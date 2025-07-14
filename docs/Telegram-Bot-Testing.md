# Telegram Bot 测试指南

## 🧪 快速测试步骤

### 1. 运行自动化测试脚本

```bash
# 设置环境变量（如果还没设置）
export TELEGRAM_BOT_TOKEN="8098345020:AAGdTTRkrjBo46BteA3qOwxgDOXUNhkUl5A"

# 运行测试脚本
chmod +x scripts/test-telegram-bot.sh
./scripts/test-telegram-bot.sh
```

### 2. 手动测试流程

#### 步骤1：检查基础状态
```bash
# 检查Webhook状态
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# 检查服务健康
curl http://localhost:3000/health

# 查看服务状态
cd ~/octopus-messenger
docker-compose ps
```

#### 步骤2：Telegram客户端测试
1. **打开Telegram应用**
2. **搜索您的Bot**：`@octopus_service_bot`
3. **点击"Start"按钮**或发送 `/start`
4. **发送测试消息**：
   - "Hello!"
   - "测试消息"
   - "/help"
   - "你好，机器人"

#### 步骤3：监控服务器日志
```bash
# 实时查看日志
cd ~/octopus-messenger
docker-compose logs -f gateway

# 或者在另一个终端窗口查看
tail -f ~/octopus-messenger/logs/gateway.log
```

## 🔍 预期结果

### 正常情况下应该看到：

#### 1. Webhook信息正常
```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain.com/webhooks/telegram",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": null,
    "last_error_message": null
  }
}
```

#### 2. 服务健康检查正常
```json
{
  "status": "healthy",
  "timestamp": "2023-12-01T12:00:00.000Z",
  "service": "gateway",
  "version": "1.0.0"
}
```

#### 3. 日志中显示收到消息
```
Gateway service running on port 3000
Telegram webhook received: {
  "update_id": 123456789,
  "message": {
    "message_id": 1,
    "from": {
      "id": 123456789,
      "is_bot": false,
      "first_name": "Your Name",
      "username": "your_username"
    },
    "chat": {
      "id": 123456789,
      "first_name": "Your Name",
      "username": "your_username",
      "type": "private"
    },
    "date": 1701432000,
    "text": "Hello!"
  }
}
收到消息: Hello! 来自用户: your_username
```

## 🚨 常见问题排查

### 问题1：Webhook设置失败
```bash
# 检查错误信息
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# 常见错误及解决方案：
# - "bad webhook: An HTTPS URL must be provided" 
#   解决：确保使用HTTPS URL
# - "bad webhook: Failed to resolve host"
#   解决：检查域名解析或ngrok状态
```

### 问题2：服务无响应
```bash
# 检查服务状态
docker-compose ps

# 重启服务
docker-compose restart gateway

# 查看详细日志
docker-compose logs gateway --tail=50
```

### 问题3：收不到消息
```bash
# 检查端口是否开放
netstat -tlnp | grep 3000

# 检查防火墙
sudo ufw status

# 测试本地连接
curl -X POST http://localhost:3000/webhooks/telegram \
     -H "Content-Type: application/json" \
     -d '{"message": {"text": "test"}}'
```

## 🔧 调试工具

### 1. 实时日志监控
```bash
# 监控所有服务日志
docker-compose logs -f

# 只监控Gateway服务
docker-compose logs -f gateway

# 监控特定时间段
docker-compose logs --since="5m" gateway
```

### 2. 网络连接测试
```bash
# 测试外部访问（替换为您的实际URL）
curl -I https://your-ngrok-url.ngrok.io/health

# 测试Webhook端点
curl -X POST https://your-ngrok-url.ngrok.io/webhooks/telegram \
     -H "Content-Type: application/json" \
     -d '{"test": "message"}'
```

### 3. Bot API测试
```bash
# 获取Bot信息
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# 获取更新
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates"

# 删除Webhook（如需重新设置）
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook"
```

## 📊 性能测试

### 1. 压力测试
```bash
# 发送多条测试消息
for i in {1..10}; do
  curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
       -H "Content-Type: application/json" \
       -d "{\"chat_id\": \"YOUR_CHAT_ID\", \"text\": \"测试消息 $i\"}"
  sleep 1
done
```

### 2. 响应时间测试
```bash
# 测试API响应时间
time curl http://localhost:3000/health

# 测试Webhook响应时间
time curl -X POST http://localhost:3000/webhooks/telegram \
          -H "Content-Type: application/json" \
          -d '{"message": {"text": "speed test"}}'
```

## 🎯 测试清单

### ✅ 基础功能测试
- [ ] Bot信息获取成功
- [ ] Webhook设置成功
- [ ] 服务健康检查通过
- [ ] 能够接收Telegram消息
- [ ] 日志正确记录消息内容

### ✅ 交互测试
- [ ] `/start` 命令响应
- [ ] 普通文本消息处理
- [ ] 表情符号消息处理
- [ ] 多语言消息处理（中英文）
- [ ] 长消息处理

### ✅ 错误处理测试
- [ ] 无效消息格式处理
- [ ] 网络中断恢复
- [ ] 服务重启后恢复
- [ ] 高并发消息处理

### ✅ 安全测试
- [ ] 恶意消息过滤
- [ ] 频率限制测试
- [ ] 权限验证测试

## 📱 移动端测试

### iOS/Android Telegram测试
1. **基础消息发送**
2. **图片发送**（如果支持）
3. **语音消息**（如果支持）
4. **位置信息**（如果支持）
5. **文件发送**（如果支持）

## 🔄 持续监控

### 设置监控脚本
```bash
# 创建健康检查脚本
cat > ~/bot-health-monitor.sh << 'EOF'
#!/bin/bash
WEBHOOK_STATUS=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | jq -r '.result.last_error_message')
if [ "$WEBHOOK_STATUS" != "null" ] && [ -n "$WEBHOOK_STATUS" ]; then
    echo "$(date): Webhook Error - $WEBHOOK_STATUS" >> ~/bot-health.log
fi

SERVICE_STATUS=$(curl -s http://localhost:3000/health | jq -r '.status')
if [ "$SERVICE_STATUS" != "healthy" ]; then
    echo "$(date): Service Unhealthy - $SERVICE_STATUS" >> ~/bot-health.log
fi
EOF

chmod +x ~/bot-health-monitor.sh

# 添加到crontab（每5分钟检查一次）
echo "*/5 * * * * /home/$(whoami)/bot-health-monitor.sh" | crontab -
```

## 🎉 测试成功标志

当您看到以下情况时，说明测试成功：

1. ✅ **Webhook状态正常**，无错误消息
2. ✅ **服务健康检查**返回"healthy"
3. ✅ **发送消息后**，服务器日志立即显示收到的消息
4. ✅ **消息内容完整**，包含用户信息和消息文本
5. ✅ **响应及时**，延迟在1秒以内

## 🆘 获取帮助

如果测试过程中遇到问题：

1. **查看详细日志**：`docker-compose logs gateway --tail=100`
2. **检查服务状态**：`docker-compose ps`
3. **重启服务**：`docker-compose restart`
4. **查看系统资源**：`htop` 和 `df -h`
5. **网络连接测试**：`ping 8.8.8.8`

记住：测试是确保系统稳定运行的关键步骤！ 