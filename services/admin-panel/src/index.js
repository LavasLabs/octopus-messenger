const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const cookieParser = require('cookie-parser');
const { engine } = require('express-handlebars');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');

// 导入配置和工具
const config = require('../../../config/config');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

// 导入管理器
const UserManager = require('./managers/UserManager');
const DashboardManager = require('./managers/DashboardManager');
const SystemManager = require('./managers/SystemManager');

// 导入工具
const DatabaseManager = require('./utils/DatabaseManager');
const CacheManager = require('./utils/CacheManager');
const APIClient = require('./utils/APIClient');

// 创建Express应用和HTTP服务器
const app = express();
const server = createServer(app);

// 初始化管理器
const userManager = new UserManager();
const dashboardManager = new DashboardManager();
const systemManager = new SystemManager();
const dbManager = new DatabaseManager();
const cacheManager = new CacheManager();
const apiClient = new APIClient();

// 配置Socket.IO
const io = new Server(server, {
    cors: {
        origin: process.env.ADMIN_PANEL_CORS_ORIGIN || "http://localhost:3005",
        methods: ["GET", "POST"]
    }
});

// 基础中间件
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));

app.use(cors({
    origin: process.env.ADMIN_PANEL_CORS_ORIGIN || "http://localhost:3005",
    credentials: true
}));

app.use(compression());
app.use(morgan('combined', { 
    stream: { 
        write: message => logger.info(message.trim()) 
    } 
}));

// 限流中间件
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 限制每个IP 15分钟内最多100个请求
    message: {
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

// 解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// 配置Handlebars模板引擎
app.engine('handlebars', engine({
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: {
        json: (context) => JSON.stringify(context),
        eq: (a, b) => a === b,
        ne: (a, b) => a !== b,
        formatDate: (date) => new Date(date).toLocaleDateString('zh-CN'),
        formatTime: (date) => new Date(date).toLocaleString('zh-CN'),
        substring: (str, start, length) => {
            if (!str) return '';
            return str.substring(start, start + length).toUpperCase();
        },
        unless: (condition, options) => {
            if (!condition) {
                return options.fn(this);
            }
            return options.inverse(this);
        }
    }
}));

app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// 静态文件
app.use('/static', express.static(path.join(__dirname, 'public')));

// Session配置
let sessionConfig = {
    secret: process.env.SESSION_SECRET || 'admin-panel-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24小时
    }
};

// 尝试使用Redis存储，如果失败则使用内存存储
try {
    sessionConfig.store = new RedisStore({
        client: cacheManager.client
    });
} catch (error) {
    logger.warn('Redis session store failed, using memory store:', error.message);
}

app.use(session(sessionConfig));

// 健康检查端点
app.get('/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            service: 'admin-panel',
            version: '1.0.0',
            checks: {
                database: await dbManager.healthCheck(),
                cache: await cacheManager.healthCheck(),
                gateway: (await apiClient.healthCheck()).status === 'healthy'
            }
        };

        const isHealthy = Object.values(health.checks).every(check => check === true);
        res.status(isHealthy ? 200 : 503).json(health);
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 登录页面路由
app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('auth/login', { 
        title: 'Octopus Messenger - 管理面板',
        layout: 'auth'
    });
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('auth/login', { 
        title: '登录 - Octopus Messenger',
        layout: 'auth'
    });
});

// 登录处理
app.post('/login', async (req, res) => {
    try {
        const { loginType, username, email, password } = req.body;
        
        logger.info('Login attempt:', { loginType, username, email: email ? email.substring(0, 5) + '***' : null });
        
        // 直接使用备用登录方法，因为gateway API只支持邮箱登录
        const loginResult = await apiClient.fallbackLogin(
            loginType === 'email' ? { email, password } : { username, password }
        );
        
        if (loginResult.success) {
            req.session.user = loginResult.user;
            req.session.token = loginResult.token;
            
            // 设置API客户端的认证token
            apiClient.setAuthToken(loginResult.token);
            
            logger.info('User logged in:', { 
                loginType, 
                identifier: loginType === 'email' ? email : username,
                userId: loginResult.user.id 
            });
            res.redirect('/dashboard');
        } else {
            res.render('auth/login', { 
                title: '登录 - Octopus Messenger',
                layout: 'auth',
                error: loginResult.message || '用户名/邮箱或密码错误',
                loginType,
                username,
                email
            });
        }
    } catch (error) {
        logger.error('Login error:', error);
        res.render('auth/login', { 
            title: '登录 - Octopus Messenger',
            layout: 'auth',
            error: '登录失败，请稍后重试',
            loginType: req.body.loginType,
            username: req.body.username,
            email: req.body.email
        });
    }
});

// 登出处理
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            logger.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

// 认证中间件
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    // 设置API客户端的认证token
    apiClient.setAuthToken(req.session.token);
    
    // 设置模板变量
    res.locals.user = req.session.user;
    res.locals.currentPath = req.path;
    
    next();
};

// 仪表板路由
app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        let stats = { users: 0, messages: 0, tasks: 0, bots: 0 };
        let recentActivity = [];
        let systemHealth = { status: 'healthy', message: 'All systems operational' };
        
        try {
            // 尝试从API获取统计数据
            const statsResponse = await apiClient.getDashboardStats();
            stats = statsResponse.data || stats;
        } catch (apiError) {
            logger.warn('Failed to fetch dashboard stats from API, using fallback:', apiError);
            
            // 使用fallback方法获取统计数据
            try {
                const [fallbackStats, fallbackActivity, fallbackHealth] = await Promise.all([
                    dashboardManager.getSystemStats(),
                    dashboardManager.getRecentActivity(),
                    dashboardManager.getSystemHealth()
                ]);
                stats = fallbackStats;
                recentActivity = fallbackActivity;
                systemHealth = fallbackHealth;
            } catch (fallbackError) {
                logger.warn('Fallback dashboard data failed, using mock data:', fallbackError);
                // 使用模拟数据
                stats = { users: 3, messages: 156, tasks: 12, bots: 4 };
                recentActivity = [
                    {
                        type: 'message',
                        platform: 'telegram',
                        content: '新用户注册成功',
                        timestamp: new Date().toISOString()
                    },
                    {
                        type: 'task',
                        title: '处理客户投诉',
                        status: 'completed',
                        timestamp: new Date(Date.now() - 1800000).toISOString()
                    }
                ];
                systemHealth = { 
                    status: 'healthy', 
                    message: 'All systems operational',
                    timestamp: new Date().toISOString()
                };
            }
        }

        res.render('dashboard/index', {
            title: '仪表板 - Octopus Messenger',
            user: req.session.user,
            stats,
            recentActivity,
            systemHealth
        });
    } catch (error) {
        logger.error('Dashboard error:', error);
        res.render('dashboard/index', {
            title: '仪表板 - Octopus Messenger',
            user: req.session.user,
            stats: { users: 0, messages: 0, tasks: 0, bots: 0 },
            recentActivity: [],
            systemHealth: { status: 'error', message: 'Unable to load system health' },
            error: '加载仪表板数据失败'
        });
    }
});

// 用户管理路由
app.get('/users', requireAuth, async (req, res) => {
    try {
        // 获取用户数据（如果API失败，使用模拟数据）
        let users = [];
        let stats = {
            totalUsers: 1,
            activeUsers: 1,
            adminUsers: 1,
            newUsers: 1
        };
        
        try {
            const usersResponse = await apiClient.getUsers();
            users = usersResponse.data || [];
            
            // 计算统计数据
            stats = {
                totalUsers: users.length,
                activeUsers: users.filter(u => u.status === 'active').length,
                adminUsers: users.filter(u => u.role === 'admin').length,
                newUsers: users.filter(u => {
                    const createdAt = new Date(u.createdAt);
                    const now = new Date();
                    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                    return createdAt > monthAgo;
                }).length
            };
        } catch (apiError) {
            logger.warn('Failed to fetch users from API, using mock data:', apiError);
            // 使用模拟数据
            users = [
                {
                    id: 'ab45b5cb-0479-401a-9a8d-be6ba8b67fc9',
                    username: 'admin',
                    email: 'admin@octopus-messenger.com',
                    displayName: 'Admin User',
                    role: 'admin',
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    lastLoginAt: new Date().toISOString()
                }
            ];
        }
        
        res.render('users/index', {
            title: '用户管理 - Octopus Messenger',
            user: req.session.user,
            users: users,
            stats: stats
        });
    } catch (error) {
        logger.error('Users page error:', error);
        res.render('users/index', {
            title: '用户管理 - Octopus Messenger',
            user: req.session.user,
            users: [],
            stats: { totalUsers: 0, activeUsers: 0, adminUsers: 0, newUsers: 0 },
            error: '加载用户数据失败'
        });
    }
});

// Bot管理路由
app.get('/bots', requireAuth, async (req, res) => {
    try {
        // 获取Bot数据（如果API失败，使用模拟数据）
        let bots = [];
        let stats = {
            totalBots: 0,
            activeBots: 0,
            errorBots: 0,
            platforms: 0
        };
        
        try {
            const botsResponse = await apiClient.getBots();
            bots = botsResponse.data || [];
            
            // 计算统计数据
            const platforms = [...new Set(bots.map(b => b.platform))];
            stats = {
                totalBots: bots.length,
                activeBots: bots.filter(b => b.status === 'active').length,
                errorBots: bots.filter(b => b.status === 'error').length,
                platforms: platforms.length
            };
        } catch (apiError) {
            logger.warn('Failed to fetch bots from API, using mock data:', apiError);
            // 使用模拟数据
            bots = [
                {
                    id: 'bot-1',
                    name: 'Telegram Bot',
                    description: '处理Telegram消息',
                    platform: 'telegram',
                    status: 'active',
                    messageCount: 1250,
                    todayMessages: 45,
                    lastActivity: new Date().toISOString(),
                    webhookConfigured: true,
                    apiKeyValid: true
                },
                {
                    id: 'bot-2',
                    name: 'WhatsApp Bot',
                    description: '处理WhatsApp消息',
                    platform: 'whatsapp',
                    status: 'inactive',
                    messageCount: 890,
                    todayMessages: 12,
                    lastActivity: new Date(Date.now() - 3600000).toISOString(),
                    webhookConfigured: false,
                    apiKeyValid: true
                }
            ];
            stats = {
                totalBots: 2,
                activeBots: 1,
                errorBots: 0,
                platforms: 2
            };
        }
        
        res.render('bots/index', {
            title: 'Bot管理 - Octopus Messenger',
            user: req.session.user,
            bots: bots,
            stats: stats
        });
    } catch (error) {
        logger.error('Bots page error:', error);
        res.render('bots/index', {
            title: 'Bot管理 - Octopus Messenger',
            user: req.session.user,
            bots: [],
            stats: { totalBots: 0, activeBots: 0, errorBots: 0, platforms: 0 },
            error: '加载Bot数据失败'
        });
    }
});

// 用户API代理路由
app.get('/api/users/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.getUserById(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json({ success: false, message: error.error || '获取用户失败' });
    }
});

app.post('/api/users', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.createUser(req.body);
        res.json(result);
    } catch (error) {
        logger.error('Create user error:', error);
        res.status(500).json({ success: false, message: error.error || '创建用户失败' });
    }
});

app.put('/api/users/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.updateUser(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        logger.error('Update user error:', error);
        res.status(500).json({ success: false, message: error.error || '更新用户失败' });
    }
});

app.delete('/api/users/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.deleteUser(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Delete user error:', error);
        res.status(500).json({ success: false, message: error.error || '删除用户失败' });
    }
});

// 消息管理路由
app.get('/messages', requireAuth, async (req, res) => {
    try {
        // 获取消息数据（如果API失败，使用模拟数据）
        let messages = [];
        let stats = {
            totalMessages: 0,
            processedMessages: 0,
            pendingMessages: 0,
            todayMessages: 0
        };
        
        try {
            const messagesResponse = await apiClient.getMessages();
            messages = messagesResponse.data || [];
            
            // 计算统计数据
            const today = new Date().toDateString();
            stats = {
                totalMessages: messages.length,
                processedMessages: messages.filter(m => m.status === 'processed').length,
                pendingMessages: messages.filter(m => m.status === 'pending').length,
                todayMessages: messages.filter(m => new Date(m.timestamp).toDateString() === today).length
            };
        } catch (apiError) {
            logger.warn('Failed to fetch messages from API, using mock data:', apiError);
            // 使用模拟数据
            messages = [
                {
                    id: 'msg-1',
                    timestamp: new Date().toISOString(),
                    platform: 'telegram',
                    senderName: 'John Doe',
                    senderId: '@johndoe',
                    content: '你好，我需要帮助处理订单问题，这是一条比较长的消息内容，用来测试消息内容的显示效果和截断功能',
                    classification: '客服咨询',
                    confidence: 85,
                    status: 'processed',
                    processingTime: 1250
                },
                {
                    id: 'msg-2',
                    timestamp: new Date(Date.now() - 1800000).toISOString(),
                    platform: 'whatsapp',
                    senderName: 'Jane Smith',
                    senderId: '+1234567890',
                    content: '请问产品什么时候能发货？',
                    classification: '订单查询',
                    confidence: 92,
                    status: 'pending'
                },
                {
                    id: 'msg-3',
                    timestamp: new Date(Date.now() - 3600000).toISOString(),
                    platform: 'slack',
                    senderName: 'Bob Wilson',
                    senderId: 'bob.wilson',
                    content: '系统出现了一个bug，无法正常登录',
                    classification: '技术支持',
                    confidence: 78,
                    status: 'processed',
                    processingTime: 2100
                },
                {
                    id: 'msg-4',
                    timestamp: new Date(Date.now() - 7200000).toISOString(),
                    platform: 'discord',
                    senderName: 'Alice Chen',
                    senderId: 'alice#1234',
                    content: '对你们的服务很不满意，要求退款',
                    classification: '投诉建议',
                    confidence: 96,
                    status: 'processed',
                    processingTime: 890
                }
            ];
            stats = {
                totalMessages: 4,
                processedMessages: 3,
                pendingMessages: 1,
                todayMessages: 4
            };
        }
        
        res.render('messages/index', {
            title: '消息管理 - Octopus Messenger',
            user: req.session.user,
            messages: messages,
            stats: stats
        });
    } catch (error) {
        logger.error('Messages page error:', error);
        res.render('messages/index', {
            title: '消息管理 - Octopus Messenger',
            user: req.session.user,
            messages: [],
            stats: { totalMessages: 0, processedMessages: 0, pendingMessages: 0, todayMessages: 0 },
            error: '加载消息数据失败'
        });
    }
});

// 消息API代理路由
app.get('/api/messages/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.getMessageById(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Get message error:', error);
        res.status(500).json({ success: false, message: error.error || '获取消息失败' });
    }
});

app.post('/api/messages/:id/reprocess', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.reprocessMessage(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Reprocess message error:', error);
        res.status(500).json({ success: false, message: error.error || '重新处理失败' });
    }
});

app.post('/api/messages/:id/classify', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.classifyMessage(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        logger.error('Classify message error:', error);
        res.status(500).json({ success: false, message: error.error || '分类失败' });
    }
});

app.post('/api/messages/bulk', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.bulkProcessMessages(req.body.messageIds, req.body.action);
        res.json(result);
    } catch (error) {
        logger.error('Bulk process messages error:', error);
        res.status(500).json({ success: false, message: error.error || '批量操作失败' });
    }
});

app.delete('/api/messages/:id', requireAuth, async (req, res) => {
    try {
        // 模拟删除消息
        res.json({ success: true, message: '消息删除成功' });
    } catch (error) {
        logger.error('Delete message error:', error);
        res.status(500).json({ success: false, message: error.error || '删除消息失败' });
    }
});

app.get('/api/messages/export', requireAuth, async (req, res) => {
    try {
        // 模拟导出功能
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="messages.csv"');
        res.send('ID,时间,平台,发送者,内容,分类,状态\n');
    } catch (error) {
        logger.error('Export messages error:', error);
        res.status(500).json({ success: false, message: error.error || '导出失败'         });
    }
});

// Bot API代理路由
app.get('/api/bots/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.getBotById(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Get bot error:', error);
        res.status(500).json({ success: false, message: error.error || '获取Bot失败' });
    }
});

app.post('/api/bots', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.createBot(req.body);
        res.json(result);
    } catch (error) {
        logger.error('Create bot error:', error);
        res.status(500).json({ success: false, message: error.error || '创建Bot失败' });
    }
});

app.put('/api/bots/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.updateBot(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        logger.error('Update bot error:', error);
        res.status(500).json({ success: false, message: error.error || '更新Bot失败' });
    }
});

app.delete('/api/bots/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.deleteBot(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Delete bot error:', error);
        res.status(500).json({ success: false, message: error.error || '删除Bot失败' });
    }
});

app.get('/api/bots/:id/status', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.getBotStatus(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Get bot status error:', error);
        res.status(500).json({ success: false, message: error.error || '获取Bot状态失败' });
    }
});

app.post('/api/bots/:id/start', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.startBot(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Start bot error:', error);
        res.status(500).json({ success: false, message: error.error || '启动Bot失败' });
    }
});

app.post('/api/bots/:id/stop', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.stopBot(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Stop bot error:', error);
        res.status(500).json({ success: false, message: error.error || '停止Bot失败' });
    }
});

// 系统设置路由
app.get('/settings', requireAuth, async (req, res) => {
    try {
        // 模拟系统设置数据
        const settings = {
            systemName: 'Octopus Messenger',
            systemVersion: '1.0.0',
            systemDescription: '多平台消息处理和任务管理系统',
            defaultLanguage: 'zh-CN',
            timezone: 'Asia/Shanghai',
            enableDebugMode: false,
            enableMaintenance: false,
            openaiApiKey: 'sk-fake-key-for-testing',
            openaiModel: 'gpt-4',
            claudeApiKey: 'fake-key-for-testing',
            claudeModel: 'claude-3-sonnet-20240229',
            aiTimeout: 30,
            maxRetries: 3,
            enableAiClassification: true,
            enableEmailNotifications: false,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpFrom: 'noreply@octopus-messenger.com',
            smtpPassword: '',
            notifyOnError: true,
            notifyOnNewUser: false,
            notifyOnBotError: true,
            notifyOnHighLoad: false,
            sessionTimeout: 60,
            maxLoginAttempts: 5,
            enableTwoFactor: false,
            enableIpWhitelist: false,
            ipWhitelist: '',
            enableAutoBackup: true,
            backupFrequency: 'daily',
            backupRetentionDays: 30
        };
        
        res.render('settings/index', {
            title: '系统设置 - Octopus Messenger',
            user: req.session.user,
            settings: settings
        });
    } catch (error) {
        logger.error('Settings page error:', error);
        res.render('settings/index', {
            title: '系统设置 - Octopus Messenger',
            user: req.session.user,
            settings: {},
            error: '加载设置数据失败'
        });
    }
});

// 任务管理路由
app.get('/tasks', requireAuth, async (req, res) => {
    try {
        const tasks = await apiClient.getTasks();
        res.render('tasks/index', {
            title: '任务管理 - Octopus Messenger',
            user: req.session.user,
            tasks: tasks.data || []
        });
    } catch (error) {
        logger.error('Tasks page error:', error);
        res.render('tasks/index', {
            title: '任务管理 - Octopus Messenger',
            user: req.session.user,
            tasks: [],
            error: '加载任务数据失败'
        });
    }
});

// 任务管理路由
app.get('/tasks', requireAuth, async (req, res) => {
    try {
        // 获取任务数据
        let tasks = [];
        let stats = {
            totalTasks: 0,
            pendingTasks: 0,
            inProgressTasks: 0,
            completedTasks: 0
        };
        
        try {
            const tasksResponse = await apiClient.getTasks({
                page: req.query.page || 1,
                limit: req.query.limit || 20,
                status: req.query.status,
                priority: req.query.priority,
                category: req.query.category,
                assignedTo: req.query.assignedTo,
                search: req.query.search
            });
            tasks = tasksResponse.data.tasks || [];
            
            // 计算统计数据
            stats = {
                totalTasks: tasks.length,
                pendingTasks: tasks.filter(t => t.status === 'pending').length,
                inProgressTasks: tasks.filter(t => t.status === 'in_progress').length,
                completedTasks: tasks.filter(t => t.status === 'completed').length
            };
        } catch (apiError) {
            logger.warn('Failed to fetch tasks from API, using mock data:', apiError);
            // 使用模拟数据
            tasks = [
                {
                    id: 'task-1',
                    title: '处理客户投诉 - 订单延迟问题',
                    description: '客户反映订单已下单3天但仍未发货，需要紧急处理并给出合理解释',
                    status: 'pending',
                    priority: 'high',
                    category: 'complaint',
                    assignee: {
                        id: 'admin',
                        name: 'Admin User',
                        email: 'admin@example.com'
                    },
                    messageId: 'msg-1',
                    dueDate: new Date(Date.now() + 86400000).toISOString(),
                    createdAt: new Date().toISOString(),
                    isOverdue: false,
                    isDueSoon: true
                },
                {
                    id: 'task-2',
                    title: '技术支持 - 系统登录问题',
                    description: '用户无法正常登录系统，需要检查账户状态和系统配置',
                    status: 'in_progress',
                    priority: 'medium',
                    category: 'support',
                    assignee: {
                        id: 'user1',
                        name: 'User 1',
                        email: 'user1@example.com'
                    },
                    messageId: 'msg-3',
                    dueDate: new Date(Date.now() + 172800000).toISOString(),
                    createdAt: new Date(Date.now() - 3600000).toISOString(),
                    isOverdue: false,
                    isDueSoon: false
                },
                {
                    id: 'task-3',
                    title: '产品咨询回复',
                    description: '客户咨询产品功能和价格，需要提供详细的产品信息',
                    status: 'completed',
                    priority: 'low',
                    category: 'inquiry',
                    assignee: {
                        id: 'user2',
                        name: 'User 2',
                        email: 'user2@example.com'
                    },
                    messageId: 'msg-2',
                    dueDate: new Date(Date.now() - 86400000).toISOString(),
                    createdAt: new Date(Date.now() - 7200000).toISOString(),
                    completedAt: new Date(Date.now() - 3600000).toISOString(),
                    isOverdue: false,
                    isDueSoon: false
                },
                {
                    id: 'task-4',
                    title: '用户反馈处理',
                    description: '用户对界面设计提出改进建议，需要评估可行性',
                    status: 'pending',
                    priority: 'low',
                    category: 'feedback',
                    assignee: null,
                    dueDate: new Date(Date.now() + 259200000).toISOString(),
                    createdAt: new Date(Date.now() - 1800000).toISOString(),
                    isOverdue: false,
                    isDueSoon: false
                }
            ];
            stats = {
                totalTasks: 4,
                pendingTasks: 2,
                inProgressTasks: 1,
                completedTasks: 1
            };
        }
        
        res.render('tasks/index', {
            title: '任务管理 - Octopus Messenger',
            user: req.session.user,
            tasks: tasks,
            stats: stats
        });
    } catch (error) {
        logger.error('Tasks page error:', error);
        res.render('tasks/index', {
            title: '任务管理 - Octopus Messenger',
            user: req.session.user,
            tasks: [],
            stats: { totalTasks: 0, pendingTasks: 0, inProgressTasks: 0, completedTasks: 0 },
            error: '加载任务数据失败'
        });
    }
});

// 任务API代理路由
app.get('/api/tasks/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.getTaskById(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Get task error:', error);
        res.status(500).json({ success: false, message: error.error || '获取任务失败' });
    }
});

app.post('/api/tasks', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.createTask(req.body);
        res.json(result);
    } catch (error) {
        logger.error('Create task error:', error);
        res.status(500).json({ success: false, message: error.error || '创建任务失败' });
    }
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.updateTask(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        logger.error('Update task error:', error);
        res.status(500).json({ success: false, message: error.error || '更新任务失败' });
    }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.deleteTask(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Delete task error:', error);
        res.status(500).json({ success: false, message: error.error || '删除任务失败' });
    }
});

app.post('/api/tasks/:id/assign', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.assignTask(req.params.id, req.body.assigneeId);
        res.json(result);
    } catch (error) {
        logger.error('Assign task error:', error);
        res.status(500).json({ success: false, message: error.error || '分配任务失败' });
    }
});

app.post('/api/tasks/:id/sync', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.syncTask(req.params.id, req.body.integrationIds);
        res.json(result);
    } catch (error) {
        logger.error('Sync task error:', error);
        res.status(500).json({ success: false, message: error.error || '同步任务失败' });
    }
});

// 商户管理路由
app.get('/merchants', requireAuth, async (req, res) => {
    try {
        // 获取商户数据
        let merchants = [];
        let stats = {
            totalMerchants: 0,
            activeMerchants: 0,
            totalBots: 0,
            totalMessages: 0
        };
        
        try {
            const merchantsResponse = await apiClient.getMerchants();
            merchants = merchantsResponse.data.merchants || [];
            
            // 计算统计数据
            stats = {
                totalMerchants: merchants.length,
                activeMerchants: merchants.filter(m => m.status === 'active').length,
                totalBots: merchants.reduce((sum, m) => sum + (m.totalBots || 0), 0),
                totalMessages: merchants.reduce((sum, m) => sum + (m.totalMessages || 0), 0)
            };
        } catch (apiError) {
            logger.warn('Failed to fetch merchants from API, using mock data:', apiError);
            // 使用模拟数据
            merchants = [
                {
                    id: 'SHOP001',
                    name: '小王奶茶店',
                    businessType: '餐饮服务',
                    industry: '奶茶',
                    status: 'active',
                    totalBots: 2,
                    activeBots: 2,
                    totalMessages: 150,
                    platforms: ['telegram', 'whatsapp'],
                    createdAt: new Date().toISOString()
                },
                {
                    id: 'SHOP002',
                    name: '张三手机维修',
                    businessType: '服务业',
                    industry: '手机维修',
                    status: 'active',
                    totalBots: 1,
                    activeBots: 1,
                    totalMessages: 89,
                    platforms: ['telegram'],
                    createdAt: new Date(Date.now() - 86400000).toISOString()
                }
            ];
            stats = {
                totalMerchants: 2,
                activeMerchants: 2,
                totalBots: 3,
                totalMessages: 239
            };
        }
        
        res.render('merchants/index', {
            title: '商户管理 - Octopus Messenger',
            user: req.session.user,
            merchants: merchants,
            stats: stats
        });
    } catch (error) {
        logger.error('Merchants page error:', error);
        res.render('merchants/index', {
            title: '商户管理 - Octopus Messenger',
            user: req.session.user,
            merchants: [],
            stats: { totalMerchants: 0, activeMerchants: 0, totalBots: 0, totalMessages: 0 },
            error: '加载商户数据失败'
        });
    }
});

// 商户API代理路由
app.post('/api/merchants', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.createMerchant(req.body);
        res.json(result);
    } catch (error) {
        logger.error('Create merchant error:', error);
        res.status(500).json({ success: false, message: error.error || '创建商户失败' });
    }
});

app.get('/api/merchants/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.getMerchantById(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Get merchant error:', error);
        res.status(500).json({ success: false, message: error.error || '获取商户信息失败' });
    }
});

app.put('/api/merchants/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.updateMerchant(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        logger.error('Update merchant error:', error);
        res.status(500).json({ success: false, message: error.error || '更新商户失败' });
    }
});

app.delete('/api/merchants/:id', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.deleteMerchant(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Delete merchant error:', error);
        res.status(500).json({ success: false, message: error.error || '删除商户失败' });
    }
});

app.get('/api/merchants/:id/stats', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.getMerchantStats(req.params.id, req.query);
        res.json(result);
    } catch (error) {
        logger.error('Get merchant stats error:', error);
        res.status(500).json({ success: false, message: error.error || '获取统计数据失败' });
    }
});

app.post('/api/merchants/:id/invite-codes', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.createMerchantInviteCode(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        logger.error('Create invite code error:', error);
        res.status(500).json({ success: false, message: error.error || '生成邀请码失败' });
    }
});

app.get('/api/merchants/:id/invite-codes', requireAuth, async (req, res) => {
    try {
        const result = await apiClient.getMerchantInviteCodes(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Get invite codes error:', error);
        res.status(500).json({ success: false, message: error.error || '获取邀请码失败' });
    }
});

// 系统设置路由
app.get('/settings', requireAuth, async (req, res) => {
    try {
        const systemConfig = await systemManager.getSystemConfig();
        res.render('settings/index', {
            title: '系统设置 - Octopus Messenger',
            user: req.session.user,
            config: systemConfig
        });
    } catch (error) {
        logger.error('Settings page error:', error);
        res.render('settings/index', {
            title: '系统设置 - Octopus Messenger',
            user: req.session.user,
            config: {},
            error: '加载系统配置失败'
        });
    }
});

// API路由
app.use('/api', requireAuth);

// 用户API
app.get('/api/users', async (req, res) => {
    try {
        const users = await apiClient.getUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = await apiClient.createUser(req.body);
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Socket.IO连接处理
io.on('connection', (socket) => {
    logger.info('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        logger.info('Client disconnected:', socket.id);
    });
    
    // 实时系统状态更新
    socket.on('requestSystemStatus', async () => {
        try {
            const health = await dashboardManager.getSystemHealth();
            socket.emit('systemStatus', health);
        } catch (error) {
            logger.error('System status error:', error);
        }
    });
});

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// 服务初始化
async function initializeService() {
    try {
        logger.info('Initializing Admin Panel service...');
        
        // 尝试初始化缓存管理器
        try {
            await cacheManager.connect();
            logger.info('Cache manager connected');
        } catch (error) {
            logger.warn('Cache manager connection failed, continuing without cache:', error.message);
        }
        
        // 测试数据库连接
        const dbHealthy = await dbManager.healthCheck();
        if (!dbHealthy) {
            throw new Error('Database connection failed');
        }
        logger.info('Database connection verified');
        
        // 测试Gateway连接
        try {
            const gatewayHealth = await apiClient.healthCheck();
            if (gatewayHealth.status !== 'healthy') {
                logger.warn('Gateway connection failed, but continuing...');
            } else {
                logger.info('Gateway connection verified');
            }
        } catch (error) {
            logger.warn('Gateway connection test failed:', error.message);
        }
        
        logger.info('Admin Panel service initialized successfully');
    } catch (error) {
        logger.error('Service initialization failed:', error);
        throw error;
    }
}

// 启动服务器
async function startServer() {
    try {
        await initializeService();
        
        const PORT = process.env.ADMIN_PANEL_PORT || 3005;
        server.listen(PORT, () => {
            logger.info(`Admin Panel server running on port ${PORT}`);
            logger.info(`Dashboard available at: http://localhost:${PORT}`);
        });
        
        // 优雅关闭处理
        const gracefulShutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully...`);
            
            server.close(async () => {
                logger.info('HTTP server closed');
                
                try {
                    await dbManager.close();
                    await cacheManager.close();
                    logger.info('Database and cache connections closed');
                } catch (error) {
                    logger.error('Error during shutdown:', error);
                }
                
                process.exit(0);
            });
        };
        
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// 启动服务器
if (require.main === module) {
    startServer();
}

module.exports = { app, server, io }; 