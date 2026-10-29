/**
 * Request validation middlewares.
 */

function validateBody(requiredFields = []) {
  return (req, res, next) => {
    const missing = requiredFields.filter((field) => {
      const val = req.body?.[field];
      return val === undefined || val === null || val === '';
    });

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Missing required field(s): ${missing.join(', ')}`,
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
    }

    next();
  };
}

function validateParams(requiredParams = []) {
  return (req, res, next) => {
    const missing = requiredParams.filter((param) => {
      const val = req.params?.[param];
      return val === undefined || val === null || val === '';
    });

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Missing required route param(s): ${missing.join(', ')}`,
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        },
      });
    }

    next();
  };
}

module.exports = {
  validateBody,
  validateParams,
};
