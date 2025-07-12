const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

// 验证结果处理中间件
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));

    logger.warn('Validation failed', {
      url: req.url,
      method: req.method,
      errors: validationErrors,
      body: req.body,
      params: req.params,
      query: req.query
    });

    return res.status(400).json({
      success: false,
      error: '请求参数验证失败',
      details: validationErrors,
      timestamp: new Date().toISOString()
    });
  }

  next();
};

module.exports = {
  validate
}; 