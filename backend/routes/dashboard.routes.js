'use strict'

const { Router } = require('express')

const dashboardController = require('../controllers/dashboardController')
const { requirePermission } = require('../middleware/rbac')
const { PERMISSIONS } = require('../config/rbacMatrix')

const router = Router()

router.get('/summary', requirePermission(PERMISSIONS.VIEW_REPORTS), dashboardController.getSummary)

module.exports = router
