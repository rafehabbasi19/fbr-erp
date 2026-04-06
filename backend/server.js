'use strict'

require('dotenv').config()
const app = require('./app')
const { sequelize } = require('./models')

const PORT = process.env.PORT || 5000
const APP_ENV = process.env.APP_ENV || process.env.NODE_ENV || 'development'

async function startServer() {
  try {
    // Verify DB connection
    await sequelize.authenticate()
    console.info(`[DB] PostgreSQL connected successfully`)

    app.listen(PORT, () => {
      console.info(`[Server] Running in ${APP_ENV} mode on port ${PORT}`)
      console.info(`[Server] API available at http://localhost:${PORT}/api/v1`)
    })
  } catch (err) {
    console.error('[Server] Failed to start:', err.message)
    process.exit(1)
  }
}

startServer()
