'use strict'

const { sendError } = require('../utils/response')

const notFound = (req, res) => {
  return sendError(res, {
    statusCode: 404,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [{ code: 'NOT_FOUND', message: 'Requested route does not exist' }],
  })
}

module.exports = notFound
