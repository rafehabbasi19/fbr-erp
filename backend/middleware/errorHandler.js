'use strict'

const { appendServerErrorLog } = require('../utils/errorLogger')
const { sendError } = require('../utils/response')

/**
 * Global error handler middleware.
 * Returns a consistent JSON error envelope:
 *   { success: false, message: string, errors?: array }
 *
 * All 5xx errors are logged to stderr with stack trace.
 */
const errorHandler = (err, req, res, _next) => {
  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const errors = err.errors.map(e => ({ field: e.path, message: e.message }))
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, {
      statusCode: 401,
      message: 'Invalid token',
      errors: [{ code: 'INVALID_TOKEN', message: 'JWT is malformed or invalid' }],
    })
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, {
      statusCode: 401,
      message: 'Token expired',
      errors: [{ code: 'TOKEN_EXPIRED', message: 'JWT has expired' }],
    })
  }

  // Known operational errors (thrown with a statusCode)
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal server error'
  const runtimeEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development'

  // Log all 5xx errors
  if (statusCode >= 500) {
    appendServerErrorLog(req, err, statusCode)
    console.error(`[Error] ${req.method} ${req.originalUrl} — ${message}`)
    console.error(err.stack)
  }

  return sendError(res, {
    statusCode,
    message: statusCode >= 500 && runtimeEnv === 'production'
      ? 'Internal server error'
      : message,
    ...(err.errors && { errors: err.errors }),
  })
}

module.exports = errorHandler
