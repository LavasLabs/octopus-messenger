const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// JWT认证中间件
const authMiddleware = (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
        req.user = decoded;
        next();
    } catch (error) {
        logger.error('Authentication error:', error);
        return res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
};

// 管理员权限检查中间件
const adminMiddleware = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
    }
};

module.exports = authMiddleware;
module.exports.adminMiddleware = adminMiddleware; 