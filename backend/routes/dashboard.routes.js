'use strict'

const { Router } = require('express')

const dashboardController = require('../controllers/dashboardController')
const { requirePermission } = require('../middleware/rbac')
const { PERMISSIONS } = require('../config/rbacMatrix')

const router = Router()

router.get('/summary', requirePermission(PERMISSIONS.VIEW_REPORTS), dashboardController.getSummary)
router.get('/revenue-chart', requirePermission(PERMISSIONS.VIEW_REPORTS), dashboardController.getRevenueChart)
router.get('/top-clients', requirePermission(PERMISSIONS.VIEW_REPORTS), dashboardController.getTopClients)
router.get('/recent-activity', requirePermission(PERMISSIONS.VIEW_REPORTS), dashboardController.getRecentActivity)
router.get('/recent-invoices', requirePermission(PERMISSIONS.VIEW_REPORTS), dashboardController.getRecentInvoices)
router.get('/fbr-status', requirePermission(PERMISSIONS.VIEW_REPORTS), dashboardController.getFbrStatus)

module.exports = router
