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
        const [stats, recentActivity, systemHealth] = await Promise.all([
            dashboardManager.getSystemStats(),
            dashboardManager.getRecentActivity(),
            dashboardManager.getSystemHealth()
        ]);

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
                    content: '你好，我需要帮助处理订单问题',
                    classification: '客服咨询',
                    status: 'processed'
                },
                {
                    id: 'msg-2',
                    timestamp: new Date(Date.now() - 1800000).toISOString(),
                    platform: 'whatsapp',
                    senderName: 'Jane Smith',
                    senderId: '+1234567890',
                    content: '请问产品什么时候能发货？',
                    classification: '订单查询',
                    status: 'pending'
                }
            ];
            stats = {
                totalMessages: 2,
                processedMessages: 1,
                pendingMessages: 1,
                todayMessages: 2
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

// 商户管理路由
app.get('/merchants', requireAuth, async (req, res) => {
    try {
        const merchants = await apiClient.getMerchants();
        res.render('merchants/index', {
            title: '商户管理 - Octopus Messenger',
            user: req.session.user,
            merchants: merchants.data || []
        });
    } catch (error) {
        logger.error('Merchants page error:', error);
        res.render('merchants/index', {
            title: '商户管理 - Octopus Messenger',
            user: req.session.user,
            merchants: [],
            error: '加载商户数据失败'
        });
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