'use strict'

const { Router } = require('express')
const { sendSuccess } = require('../utils/response')
const { requireAuth } = require('../middleware/auth')
const router = Router()

// ─── Health Check ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  return sendSuccess(res, {
    data: {
      service: 'FBR Invoicing API',
      version: 'v1',
      timestamp: new Date().toISOString(),
    },
    message: 'API v1 is running',
  })
})

// ─── Module Routes (to be mounted in Phase 2+) ────────────────────────────
router.use('/auth', require('./auth.routes'))

// All non-auth module routes are protected by default.
router.use(requireAuth)

// router.use('/companies',      require('./company.routes'))
router.use('/clients', require('./client.routes'))
router.use('/invoices', require('./invoice.routes'))
router.use('/tax-rates', require('./taxRate.routes'))
// router.use('/fbr',            require('./fbr.routes'))
// router.use('/csv',            require('./csv.routes'))
router.use('/dashboard', require('./dashboard.routes'))
// router.use('/reports',        require('./report.routes'))
// router.use('/notifications',  require('./notification.routes'))
// router.use('/audit-logs',     require('./auditLog.routes'))

module.exports = router
