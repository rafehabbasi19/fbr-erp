'use strict'

/**
 * Creates a consistent API response envelope.
 */
function buildEnvelope({
  success,
  data = null,
  message,
  errors = null,
  meta = null,
}) {
  return {
    success,
    data,
    message,
    errors,
    meta,
  }
}

function sendSuccess(
  res,
  {
    statusCode = 200,
    data = null,
    message = 'Operation successful',
    meta = null,
  } = {}
) {
  return res.status(statusCode).json(
    buildEnvelope({
      success: true,
      data,
      message,
      errors: null,
      meta,
    })
  )
}

function sendError(
  res,
  {
    statusCode = 500,
    message = 'Internal server error',
    errors = null,
    data = null,
    meta = null,
  } = {}
) {
  return res.status(statusCode).json(
    buildEnvelope({
      success: false,
      data,
      message,
      errors,
      meta,
    })
  )
}

module.exports = {
  buildEnvelope,
  sendSuccess,
  sendError,
}
