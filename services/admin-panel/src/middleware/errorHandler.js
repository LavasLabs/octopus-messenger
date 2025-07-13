const logger = require('../utils/logger');

// 错误处理中间件
const errorHandler = (err, req, res, next) => {
    logger.error('Error occurred:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    });

    // 默认错误状态码
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    // 根据错误类型设置状态码
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation Error';
    } else if (err.name === 'UnauthorizedError') {
        statusCode = 401;
        message = 'Unauthorized';
    } else if (err.name === 'ForbiddenError') {
        statusCode = 403;
        message = 'Forbidden';
    } else if (err.name === 'NotFoundError') {
        statusCode = 404;
        message = 'Not Found';
    }

    // 在开发环境中返回详细错误信息
    const response = {
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    };

    res.status(statusCode).json(response);
};

// 404处理中间件
const notFoundHandler = (req, res) => {
    logger.warn('Route not found:', {
        url: req.url,
        method: req.method,
        ip: req.ip
    });

    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
};

module.exports = {
    errorHandler,
    notFoundHandler
}; 