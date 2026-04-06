'use strict'

const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(__dirname, '..', 'storage', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'errors.log')

/**
 * Appends 5xx errors to a file with timestamp + stack trace.
 */
function appendServerErrorLog(req, err, statusCode) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })

    const timestamp = new Date().toISOString()
    const stack = err && err.stack ? err.stack : 'No stack trace available'
    const method = req && req.method ? req.method : 'UNKNOWN'
    const url = req && req.originalUrl ? req.originalUrl : 'UNKNOWN_URL'

    const entry = [
      `[${timestamp}] ${statusCode} ${method} ${url}`,
      stack,
      '',
    ].join('\n')

    fs.appendFileSync(LOG_FILE, entry, 'utf8')
  } catch (logErr) {
    // Logging failures should never crash request handling
    console.error('[ErrorLogger] Failed writing server error log:', logErr.message)
  }
}

module.exports = {
  LOG_FILE,
  appendServerErrorLog,
}
