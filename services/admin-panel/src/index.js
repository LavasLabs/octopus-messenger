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

// 创建Express应用
const app = express();
const server = createServer(app);

// 配置Socket.IO
const io = new Server(server, {
  cors: {
    origin: config.security.corsOrigins,
    credentials: true
  }
});

// 模板引擎配置
app.engine('handlebars', engine({
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
    json: (obj) => JSON.stringify(obj),
    formatDate: (date) => new Date(date).toLocaleString('zh-CN'),
    formatNumber: (num) => num.toLocaleString('zh-CN'),
    statusBadge: (status) => {
      const badges = {
        active: 'success',
        inactive: 'secondary',
        error: 'danger',
        pending: 'warning',
        completed: 'success',
        failed: 'danger'
      };
      return badges[status] || 'secondary';
    }
  }
}));

app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// 静态文件
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// 基础中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(cors({
  origin: config.security.corsOrigins,
  credentials: true
}));
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(cookieParser());

// Session配置
let sessionStore;
if (config.database.redis) {
  const redis = require('redis');
  const redisClient = redis.createClient({
    host: config.database.redis.host,
    port: config.database.redis.port,
    password: config.database.redis.password
  });
  sessionStore = new RedisStore({ client: redisClient });
}

app.use(session({
  store: sessionStore,
  secret: config.auth.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.env === 'production',
    httpOnly: true,
    maxAge: config.auth.session.timeout
  }
}));

// 限流中间件
const limiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// 解析JSON和URL编码
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 用户认证中间件
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.isAuthenticated = !!req.session.user;
  res.locals.currentPath = req.path;
  next();
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'admin-panel',
    version: '1.0.0'
  });
});

// 主页
app.get('/', authMiddleware.requireAuth, async (req, res) => {
  try {
    const dashboardData = await dashboardManager.getDashboardData(req.session.user.tenantId);
    res.render('dashboard/index', {
      title: 'Octopus Messenger - 控制台',
      data: dashboardData
    });
  } catch (error) {
    logger.error('Dashboard error:', error);
    res.render('error', { 
      title: '错误',
      message: '加载控制台数据失败',
      error: error.message 
    });
  }
});

// 登录页面
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('auth/login', { 
    title: '登录 - Octopus Messenger',
    layout: 'auth' 
  });
});

// 登录处理
app.post('/login', async (req, res) => {
  try {
    const { email, password, remember } = req.body;
    
    if (!email || !password) {
      return res.render('auth/login', {
        title: '登录 - Octopus Messenger',
        layout: 'auth',
        error: '邮箱和密码为必填项',
        email
      });
    }

    const user = await userManager.authenticateUser(email, password);
    
    if (!user) {
      return res.render('auth/login', {
        title: '登录 - Octopus Messenger',
        layout: 'auth',
        error: '邮箱或密码错误',
        email
      });
    }

    // 设置会话
    req.session.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      tenantId: user.tenant_id
    };

    // 记住我功能
    if (remember) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
    }

    await userManager.updateLastLogin(user.id);
    
    logger.info('User logged in', { userId: user.id, email: user.email });
    res.redirect('/');
  } catch (error) {
    logger.error('Login error:', error);
    res.render('auth/login', {
      title: '登录 - Octopus Messenger',
      layout: 'auth',
      error: '登录失败，请稍后重试',
      email: req.body.email
    });
  }
});

// 退出登录
app.post('/logout', (req, res) => {
  const userId = req.session.user?.id;
  req.session.destroy((err) => {
    if (err) {
      logger.error('Logout error:', err);
    } else {
      logger.info('User logged out', { userId });
    }
    res.redirect('/login');
  });
});

// Bot管理页面
app.get('/bots', authMiddleware.requireAuth, async (req, res) => {
  try {
    const bots = await apiClient.getBots(req.session.user.tenantId);
    res.render('bots/index', {
      title: 'Bot管理',
      bots: bots
    });
  } catch (error) {
    logger.error('Get bots error:', error);
    res.render('error', { 
      title: '错误',
      message: '加载Bot列表失败',
      error: error.message 
    });
  }
});

// 任务管理页面
app.get('/tasks', authMiddleware.requireAuth, async (req, res) => {
  try {
    const { page = 1, status, priority, search } = req.query;
    const tasks = await apiClient.getTasks(req.session.user.tenantId, {
      page,
      status,
      priority,
      search
    });
    
    res.render('tasks/index', {
      title: '任务管理',
      tasks: tasks.tasks,
      pagination: tasks.pagination,
      filters: { status, priority, search }
    });
  } catch (error) {
    logger.error('Get tasks error:', error);
    res.render('error', { 
      title: '错误',
      message: '加载任务列表失败',
      error: error.message 
    });
  }
});

// 消息管理页面
app.get('/messages', authMiddleware.requireAuth, async (req, res) => {
  try {
    const { page = 1, platform, search } = req.query;
    const messages = await apiClient.getMessages(req.session.user.tenantId, {
      page,
      platform,
      search
    });
    
    res.render('messages/index', {
      title: '消息管理',
      messages: messages.messages,
      pagination: messages.pagination,
      filters: { platform, search }
    });
  } catch (error) {
    logger.error('Get messages error:', error);
    res.render('error', { 
      title: '错误',
      message: '加载消息列表失败',
      error: error.message 
    });
  }
});

// 系统设置页面
app.get('/settings', authMiddleware.requireAuth, authMiddleware.requireRole(['admin']), async (req, res) => {
  try {
    const settings = await systemManager.getSystemSettings(req.session.user.tenantId);
    res.render('settings/index', {
      title: '系统设置',
      settings: settings
    });
  } catch (error) {
    logger.error('Get settings error:', error);
    res.render('error', { 
      title: '错误',
      message: '加载系统设置失败',
      error: error.message 
    });
  }
});

// API路由
app.use('/api/users', authMiddleware.requireAuth, require('./routes/users'));
app.use('/api/bots', authMiddleware.requireAuth, require('./routes/bots'));
app.use('/api/tasks', authMiddleware.requireAuth, require('./routes/tasks'));
app.use('/api/messages', authMiddleware.requireAuth, require('./routes/messages'));
app.use('/api/settings', authMiddleware.requireAuth, require('./routes/settings'));
app.use('/api/dashboard', authMiddleware.requireAuth, require('./routes/dashboard'));

// Socket.IO连接处理
io.use((socket, next) => {
  // 这里可以添加Socket.IO认证逻辑
  next();
});

io.on('connection', (socket) => {
  logger.info('Socket.IO client connected', { socketId: socket.id });
  
  // 加入用户房间（基于租户ID）
  socket.on('join-tenant', (tenantId) => {
    socket.join(`tenant:${tenantId}`);
    logger.debug('Socket joined tenant room', { socketId: socket.id, tenantId });
  });
  
  socket.on('disconnect', () => {
    logger.info('Socket.IO client disconnected', { socketId: socket.id });
  });
});

// 全局变量
let userManager;
let dashboardManager;
let systemManager;
let dbManager;
let cacheManager;
let apiClient;

// 初始化服务
async function initializeService() {
  try {
    logger.info('Initializing Admin Panel Service...');
    
    // 初始化数据库管理器
    dbManager = new DatabaseManager(config.database);
    await dbManager.initialize();
    logger.info('Database manager initialized');

    // 初始化缓存管理器
    cacheManager = new CacheManager(config.database.redis);
    await cacheManager.initialize();
    logger.info('Cache manager initialized');

    // 初始化API客户端
    apiClient = new APIClient({
      gatewayUrl: `http://localhost:${config.services.gateway.port}`,
      serviceToken: process.env.SERVICE_TOKEN
    });
    logger.info('API client initialized');

    // 初始化管理器
    userManager = new UserManager({ dbManager, cacheManager });
    await userManager.initialize();
    logger.info('User manager initialized');

    dashboardManager = new DashboardManager({ dbManager, cacheManager, apiClient });
    await dashboardManager.initialize();
    logger.info('Dashboard manager initialized');

    systemManager = new SystemManager({ dbManager, cacheManager, apiClient });
    await systemManager.initialize();
    logger.info('System manager initialized');

    // 设置全局变量供路由使用
    app.locals.userManager = userManager;
    app.locals.dashboardManager = dashboardManager;
    app.locals.systemManager = systemManager;
    app.locals.dbManager = dbManager;
    app.locals.cacheManager = cacheManager;
    app.locals.apiClient = apiClient;
    app.locals.io = io;

    logger.info('Admin Panel Service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Admin Panel Service:', error);
    process.exit(1);
  }
}

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const PORT = config.services.adminPanel.port || 3005;
const HOST = config.services.adminPanel.host || '0.0.0.0';

async function startServer() {
  try {
    await initializeService();
    
    server.listen(PORT, HOST, () => {
      logger.info(`Admin Panel Service started on ${HOST}:${PORT}`);
      logger.info(`Dashboard available at http://${HOST}:${PORT}`);
      logger.info(`Health check available at http://${HOST}:${PORT}/health`);
    });

    // 优雅关闭
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      server.close(async () => {
        try {
          // 关闭Socket.IO
          io.close();
          logger.info('Socket.IO server closed');

          // 关闭数据库连接
          if (dbManager) {
            await dbManager.close();
            logger.info('Database connections closed');
          }

          // 关闭缓存连接
          if (cacheManager) {
            await cacheManager.close();
            logger.info('Cache connections closed');
          }

          logger.info('Admin Panel Service shut down successfully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    // 未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start Admin Panel Service:', error);
    process.exit(1);
  }
}

// 启动服务
startServer();

module.exports = app; 