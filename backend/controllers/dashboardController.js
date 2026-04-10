'use strict'

const { Op, fn, col, literal } = require('sequelize')

const { sendSuccess, sendError } = require('../utils/response')
const { Invoice, Payment, FbrSubmission, Client, AuditLog, User } = require('../models')
const {
  buildDashboardSummaryCacheKey,
  getDashboardSummaryCache,
  setDashboardSummaryCache,
} = require('../services/dashboardCacheService')

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FBR_SUBMITTED_STATUSES = ['success', 'submitted', 'accepted']
const FBR_REJECTED_STATUSES = ['rejected', 'error', 'failed']

function toNumber(value) {
  if (value === null || value === undefined) {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toDateOnlyString(date) {
  return date.toISOString().slice(0, 10)
}

function readRowValue(row, key) {
  if (row && typeof row.get === 'function') {
    return row.get(key)
  }

  return row ? row[key] : undefined
}

async function sumPaymentsByInvoiceScope({ invoiceWhere, paymentDateWhere = null }) {
  const totalPaid = await Payment.sum('Payment.amount_paid', {
    where: paymentDateWhere ? { payment_date: paymentDateWhere } : undefined,
    include: [
      {
        model: Invoice,
        as: 'invoice',
        attributes: [],
        required: true,
        where: invoiceWhere,
      },
    ],
  })

  return toNumber(totalPaid)
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function roundCurrency(value) {
  return Number(toNumber(value).toFixed(2))
}

function parseYear(value, fallbackYear) {
  const parsedYear = Number.parseInt(String(value || ''), 10)
  if (!Number.isInteger(parsedYear) || parsedYear < 1970 || parsedYear > 3000) {
    return fallbackYear
  }

  return parsedYear
}

function parseMonth(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/)
  if (!match) {
    return null
  }

  const year = Number.parseInt(match[1], 10)
  const monthIndex = Number.parseInt(match[2], 10) - 1

  if (monthIndex < 0 || monthIndex > 11) {
    return null
  }

  return { year, monthIndex }
}

function parseDateValue(value) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, days) {
  const clone = new Date(date)
  clone.setDate(clone.getDate() + days)
  return clone
}

function humanizeAction(action) {
  if (!action) {
    return 'Unknown event'
  }

  const words = String(action)
    .replace(/[._]+/g, ' ')
    .trim()
    .split(/\s+/)

  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function buildMonthlyBuckets(startDate, endDate) {
  const buckets = []
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const endMarker = new Date(endDate.getFullYear(), endDate.getMonth(), 1)

  while (cursor <= endMarker) {
    buckets.push({
      key: toMonthKey(cursor),
      label: `${MONTH_LABELS[cursor.getMonth()]} ${cursor.getFullYear()}`,
      revenue: 0,
      invoice_count: 0,
    })

    cursor.setMonth(cursor.getMonth() + 1)
  }

  return buckets
}

function buildWeekBuckets() {
  return ['W1', 'W2', 'W3', 'W4', 'W5'].map(label => ({
    label,
    revenue: 0,
    invoice_count: 0,
  }))
}

function buildRangeFromPreset(preset) {
  const now = new Date()

  if (preset === 'last_6_months') {
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    return {
      start,
      end: now,
    }
  }

  return null
}

function scopedActivityWhere(user) {
  const where = {
    company_id: user.company_id,
  }

  if (String(user.role || '').toLowerCase() === 'seller') {
    where.user_id = user.id
  }

  return where
}

function scopedInvoiceWhere(user) {
  const where = {
    company_id: user.company_id,
  }

  if (String(user.role || '').toLowerCase() === 'seller') {
    where.created_by = user.id
  }

  return where
}

async function getSummary(req, res, next) {
  const user = req.user

  if (!user || !user.company_id) {
    return sendError(res, {
      statusCode: 400,
      message: 'Dashboard summary requires an authenticated company context',
    })
  }

  const invoiceWhere = scopedInvoiceWhere(user)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const monthStartStr = toDateOnlyString(monthStart)
  const yearStartStr = toDateOnlyString(yearStart)
  const nowStr = toDateOnlyString(now)
  const summaryCacheKey = buildDashboardSummaryCacheKey(user)

  const cachedSummary = await getDashboardSummaryCache(summaryCacheKey)
  if (cachedSummary) {
    return sendSuccess(res, {
      data: cachedSummary,
      message: 'Dashboard summary retrieved successfully',
    })
  }

  try {
    const [
      totalInvoices,
      draftInvoices,
      pendingInvoices,
      paidInvoices,
      overdueInvoices,
      revenueThisMonth,
      revenueThisYear,
      totalInvoiceAmount,
      totalPaidAmount,
      fbrPendingSubmissions,
    ] = await Promise.all([
      Invoice.count({ where: invoiceWhere }),
      Invoice.count({
        where: {
          ...invoiceWhere,
          status: 'draft',
        },
      }),
      Invoice.count({
        where: {
          ...invoiceWhere,
          payment_status: { [Op.in]: ['unpaid', 'partial'] },
        },
      }),
      Invoice.count({
        where: {
          ...invoiceWhere,
          payment_status: 'paid',
        },
      }),
      Invoice.count({
        where: {
          ...invoiceWhere,
          payment_status: 'overdue',
        },
      }),
      sumPaymentsByInvoiceScope({
        invoiceWhere,
        paymentDateWhere: {
          [Op.between]: [monthStartStr, nowStr],
        },
      }),
      sumPaymentsByInvoiceScope({
        invoiceWhere,
        paymentDateWhere: {
          [Op.between]: [yearStartStr, nowStr],
        },
      }),
      Invoice.sum('total_amount', { where: invoiceWhere }),
      sumPaymentsByInvoiceScope({ invoiceWhere }),
      FbrSubmission.count({
        where: {
          status: 'pending',
        },
        include: [
          {
            model: Invoice,
            as: 'invoice',
            attributes: [],
            required: true,
            where: invoiceWhere,
          },
        ],
      }),
    ])

    const outstandingAmount = Math.max(0, toNumber(totalInvoiceAmount) - toNumber(totalPaidAmount))

    const summaryData = {
      total_invoices: totalInvoices,
      draft_invoices: draftInvoices,
      pending_invoices: pendingInvoices,
      paid_invoices: paidInvoices,
      overdue_invoices: overdueInvoices,
      revenue_this_month: toNumber(revenueThisMonth),
      revenue_this_year: toNumber(revenueThisYear),
      outstanding_amount: outstandingAmount,
      fbr_pending_submissions: fbrPendingSubmissions,
    }

    await setDashboardSummaryCache(summaryCacheKey, summaryData)

    return sendSuccess(res, {
      data: summaryData,
      message: 'Dashboard summary retrieved successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function getRevenueChart(req, res, next) {
  const user = req.user

  if (!user || !user.company_id) {
    return sendError(res, {
      statusCode: 400,
      message: 'Revenue chart requires an authenticated company context',
    })
  }

  const invoiceWhere = scopedInvoiceWhere(user)
  const period = String(req.query.period || 'monthly').toLowerCase()
  const preset = String(req.query.preset || '').toLowerCase()
  const now = new Date()

  let startDate = null
  let endDate = null
  let buckets = []

  if (period === 'weekly') {
    const parsedMonth = parseMonth(req.query.month)

    if (!parsedMonth) {
      return sendError(res, {
        statusCode: 422,
        message: 'Invalid month. Expected format YYYY-MM for weekly period',
      })
    }

    startDate = new Date(parsedMonth.year, parsedMonth.monthIndex, 1)
    endDate = new Date(parsedMonth.year, parsedMonth.monthIndex + 1, 0)
    buckets = buildWeekBuckets()
  } else if (period === 'monthly') {
    const customStart = parseDateValue(req.query.date_from)
    const customEnd = parseDateValue(req.query.date_to)
    const presetRange = buildRangeFromPreset(preset)

    if (customStart && customEnd) {
      startDate = customStart
      endDate = customEnd
    } else if (presetRange) {
      startDate = presetRange.start
      endDate = presetRange.end
    } else {
      const year = parseYear(req.query.year, now.getFullYear())
      startDate = new Date(year, 0, 1)
      endDate = new Date(year, 11, 31)
    }

    if (startDate > endDate) {
      return sendError(res, {
        statusCode: 422,
        message: 'date_from cannot be greater than date_to',
      })
    }

    buckets = buildMonthlyBuckets(startDate, endDate)
  } else {
    return sendError(res, {
      statusCode: 422,
      message: 'Invalid period. Supported values are monthly and weekly',
    })
  }

  try {
    const chartWhere = {
      ...invoiceWhere,
      invoice_date: {
        [Op.between]: [toDateOnlyString(startDate), toDateOnlyString(endDate)],
      },
    }

    let aggregatedRows = []

    if (period === 'weekly') {
      const weeklyBucketExpression = literal("CEIL(EXTRACT(DAY FROM invoice_date)::numeric / 7)")

      aggregatedRows = await Invoice.findAll({
        where: chartWhere,
        attributes: [
          [weeklyBucketExpression, 'bucket_number'],
          [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'revenue'],
          [fn('COUNT', col('id')), 'invoice_count'],
        ],
        group: [weeklyBucketExpression],
        order: [[weeklyBucketExpression, 'ASC']],
        raw: true,
      })
    } else {
      const monthlyBucketExpression = fn('TO_CHAR', col('invoice_date'), 'YYYY-MM')

      aggregatedRows = await Invoice.findAll({
        where: chartWhere,
        attributes: [
          [monthlyBucketExpression, 'bucket_key'],
          [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'revenue'],
          [fn('COUNT', col('id')), 'invoice_count'],
        ],
        group: [monthlyBucketExpression],
        order: [[monthlyBucketExpression, 'ASC']],
        raw: true,
      })
    }

    const bucketMap = new Map(
      buckets.map(bucket => [period === 'weekly' ? bucket.label : bucket.key, bucket])
    )

    aggregatedRows.forEach(row => {
      const bucketIdentifier =
        period === 'weekly'
          ? `W${toNumber(readRowValue(row, 'bucket_number'))}`
          : String(readRowValue(row, 'bucket_key') || '')

      const bucket = bucketMap.get(bucketIdentifier)
      if (!bucket) {
        return
      }

      bucket.revenue = roundCurrency(readRowValue(row, 'revenue'))
      bucket.invoice_count = Number(readRowValue(row, 'invoice_count') || 0)
    })

    const data = buckets.map(bucket => ({
      label: bucket.label,
      revenue: roundCurrency(bucket.revenue),
      invoice_count: bucket.invoice_count,
    }))

    return sendSuccess(res, {
      data,
      message: 'Dashboard revenue chart retrieved successfully',
      meta: {
        period,
        start_date: toDateOnlyString(startDate),
        end_date: toDateOnlyString(endDate),
      },
    })
  } catch (err) {
    return next(err)
  }
}

async function getTopClients(req, res, next) {
  const user = req.user

  if (!user || !user.company_id) {
    return sendError(res, {
      statusCode: 400,
      message: 'Top clients requires an authenticated company context',
    })
  }

  const invoiceWhere = scopedInvoiceWhere(user)
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearStartStr = toDateOnlyString(yearStart)
  const nowStr = toDateOnlyString(now)

  try {
    const billedRows = await Invoice.findAll({
      where: {
        ...invoiceWhere,
        client_id: {
          [Op.ne]: null,
        },
        invoice_date: {
          [Op.between]: [yearStartStr, nowStr],
        },
      },
      attributes: [
        'client_id',
        [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'total_billed'],
      ],
      group: ['client_id'],
      order: [literal('SUM(total_amount) DESC')],
      limit: 5,
      raw: true,
    })

    if (!billedRows.length) {
      return sendSuccess(res, {
        data: [],
        message: 'Dashboard top clients retrieved successfully',
      })
    }

    const clientIds = billedRows.map(row => readRowValue(row, 'client_id')).filter(Boolean)

    const paidRows = clientIds.length
      ? await Payment.findAll({
          attributes: [
            [col('invoice.client_id'), 'client_id'],
            [fn('COALESCE', fn('SUM', col('Payment.amount_paid')), 0), 'total_paid'],
          ],
          include: [
            {
              model: Invoice,
              as: 'invoice',
              attributes: [],
              required: true,
              where: {
                ...invoiceWhere,
                client_id: {
                  [Op.in]: clientIds,
                },
                invoice_date: {
                  [Op.between]: [yearStartStr, nowStr],
                },
              },
            },
          ],
          group: [col('invoice.client_id')],
          raw: true,
        })
      : []

    const paidByClient = new Map(
      paidRows.map(row => [readRowValue(row, 'client_id'), toNumber(readRowValue(row, 'total_paid'))])
    )

    const clients = await Client.findAll({
      where: {
        id: {
          [Op.in]: clientIds,
        },
      },
      attributes: ['id', 'name'],
      raw: true,
    })

    const clientNameMap = new Map(clients.map(client => [client.id, client.name]))

    const data = billedRows.map(row => {
      const clientId = readRowValue(row, 'client_id')

      return {
        client_id: clientId,
        client_name: clientNameMap.get(clientId) || 'Unknown client',
        total_billed: roundCurrency(readRowValue(row, 'total_billed')),
        total_paid: roundCurrency(paidByClient.get(clientId) || 0),
      }
    })

    return sendSuccess(res, {
      data,
      message: 'Dashboard top clients retrieved successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function getRecentActivity(req, res, next) {
  const user = req.user

  if (!user || !user.company_id) {
    return sendError(res, {
      statusCode: 400,
      message: 'Recent activity requires an authenticated company context',
    })
  }

  try {
    const logs = await AuditLog.findAll({
      where: scopedActivityWhere(user),
      attributes: ['id', 'action', 'entity_type', 'entity_id', 'created_at'],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [['created_at', 'DESC']],
      limit: 15,
    })

    const data = logs.map(log => ({
      id: log.id,
      action: log.action,
      label: humanizeAction(log.action),
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      actor_name: log.user ? log.user.name : 'System',
      occurred_at: log.created_at,
    }))

    return sendSuccess(res, {
      data,
      message: 'Dashboard recent activity retrieved successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function getRecentInvoices(req, res, next) {
  const user = req.user

  if (!user || !user.company_id) {
    return sendError(res, {
      statusCode: 400,
      message: 'Recent invoices requires an authenticated company context',
    })
  }

  try {
    const invoices = await Invoice.findAll({
      where: scopedInvoiceWhere(user),
      attributes: ['id', 'invoice_number', 'invoice_date', 'total_amount', 'status', 'payment_status', 'fbr_status'],
      include: [
        {
          model: Client,
          as: 'client',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [
        ['invoice_date', 'DESC'],
        ['created_at', 'DESC'],
      ],
      limit: 10,
    })

    const data = invoices.map(invoice => ({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      client_name: invoice.client ? invoice.client.name : 'Unknown client',
      invoice_date: invoice.invoice_date,
      amount: roundCurrency(invoice.total_amount),
      status: invoice.status,
      payment_status: invoice.payment_status,
      fbr_status: invoice.fbr_status,
    }))

    return sendSuccess(res, {
      data,
      message: 'Dashboard recent invoices retrieved successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function getFbrStatus(req, res, next) {
  const user = req.user

  if (!user || !user.company_id) {
    return sendError(res, {
      statusCode: 400,
      message: 'FBR status requires an authenticated company context',
    })
  }

  const invoiceWhere = scopedInvoiceWhere(user)
  const today = new Date()
  const dayStart = startOfDay(today)
  const nextDayStart = addDays(dayStart, 1)

  try {
    const [submittedToday, pendingSubmissions, rejectedSubmissions] = await Promise.all([
      FbrSubmission.count({
        where: {
          status: {
            [Op.in]: FBR_SUBMITTED_STATUSES,
          },
          submitted_at: {
            [Op.gte]: dayStart,
            [Op.lt]: nextDayStart,
          },
        },
        include: [
          {
            model: Invoice,
            as: 'invoice',
            attributes: [],
            required: true,
            where: invoiceWhere,
          },
        ],
      }),
      FbrSubmission.count({
        where: {
          status: 'pending',
        },
        include: [
          {
            model: Invoice,
            as: 'invoice',
            attributes: [],
            required: true,
            where: invoiceWhere,
          },
        ],
      }),
      FbrSubmission.count({
        where: {
          status: {
            [Op.in]: FBR_REJECTED_STATUSES,
          },
        },
        include: [
          {
            model: Invoice,
            as: 'invoice',
            attributes: [],
            required: true,
            where: invoiceWhere,
          },
        ],
      })
    ])

    return sendSuccess(res, {
      data: {
        submitted_today: submittedToday,
        pending_submissions: pendingSubmissions,
        rejected_submissions: rejectedSubmissions,
      },
      message: 'Dashboard FBR status retrieved successfully',
    })
  } catch (err) {
    return next(err)
  }
}

module.exports = {
  getSummary,
  getRevenueChart,
  getTopClients,
  getRecentActivity,
  getRecentInvoices,
  getFbrStatus,
}
