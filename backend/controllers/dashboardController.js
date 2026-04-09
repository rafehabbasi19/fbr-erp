'use strict'

const { Op } = require('sequelize')

const { sendSuccess, sendError } = require('../utils/response')
const { Invoice, Payment, FbrSubmission, Client, AuditLog, User } = require('../models')

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

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function toWeekLabel(date) {
  const weekNumber = Math.floor((date.getDate() - 1) / 7) + 1
  return `W${weekNumber}`
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
      Payment.sum('amount_paid', {
        where: {
          payment_date: {
            [Op.between]: [monthStartStr, nowStr],
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
      Payment.sum('amount_paid', {
        where: {
          payment_date: {
            [Op.between]: [yearStartStr, nowStr],
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
      Invoice.sum('total_amount', { where: invoiceWhere }),
      Payment.sum('amount_paid', {
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
    ])

    const outstandingAmount = Math.max(0, toNumber(totalInvoiceAmount) - toNumber(totalPaidAmount))

    return sendSuccess(res, {
      data: {
        total_invoices: totalInvoices,
        draft_invoices: draftInvoices,
        pending_invoices: pendingInvoices,
        paid_invoices: paidInvoices,
        overdue_invoices: overdueInvoices,
        revenue_this_month: toNumber(revenueThisMonth),
        revenue_this_year: toNumber(revenueThisYear),
        outstanding_amount: outstandingAmount,
        fbr_pending_submissions: fbrPendingSubmissions,
      },
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
  let bucketResolver = null

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
    bucketResolver = date => toWeekLabel(date)
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
    bucketResolver = date => toMonthKey(date)
  } else {
    return sendError(res, {
      statusCode: 422,
      message: 'Invalid period. Supported values are monthly and weekly',
    })
  }

  try {
    const invoices = await Invoice.findAll({
      where: {
        ...invoiceWhere,
        invoice_date: {
          [Op.between]: [toDateOnlyString(startDate), toDateOnlyString(endDate)],
        },
      },
      attributes: ['invoice_date', 'total_amount'],
      order: [['invoice_date', 'ASC']],
    })

    const bucketMap = new Map(buckets.map(bucket => [bucket.label.startsWith('W') ? bucket.label : bucket.key, bucket]))

    invoices.forEach(invoice => {
      const invoiceDate = new Date(invoice.invoice_date)
      if (Number.isNaN(invoiceDate.getTime())) {
        return
      }

      const bucketKey = bucketResolver(invoiceDate)
      const bucket = bucketMap.get(bucketKey)

      if (!bucket) {
        return
      }

      bucket.revenue = roundCurrency(bucket.revenue + toNumber(invoice.total_amount))
      bucket.invoice_count += 1
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

  try {
    const invoices = await Invoice.findAll({
      where: {
        ...invoiceWhere,
        invoice_date: {
          [Op.between]: [toDateOnlyString(yearStart), toDateOnlyString(now)],
        },
      },
      attributes: ['id', 'client_id', 'total_amount'],
    })

    if (!invoices.length) {
      return sendSuccess(res, {
        data: [],
        message: 'Dashboard top clients retrieved successfully',
      })
    }

    const totalsByClient = new Map()
    const invoiceClientMap = new Map()

    invoices.forEach(invoice => {
      if (!invoice.client_id) {
        return
      }

      const current = totalsByClient.get(invoice.client_id) || {
        client_id: invoice.client_id,
        total_billed: 0,
        total_paid: 0,
      }

      current.total_billed += toNumber(invoice.total_amount)
      totalsByClient.set(invoice.client_id, current)
      invoiceClientMap.set(invoice.id, invoice.client_id)
    })

    const invoiceIds = Array.from(invoiceClientMap.keys())

    if (invoiceIds.length) {
      const payments = await Payment.findAll({
        where: {
          invoice_id: {
            [Op.in]: invoiceIds,
          },
        },
        attributes: ['invoice_id', 'amount_paid'],
      })

      payments.forEach(payment => {
        const clientId = invoiceClientMap.get(payment.invoice_id)
        if (!clientId) {
          return
        }

        const current = totalsByClient.get(clientId)
        if (!current) {
          return
        }

        current.total_paid += toNumber(payment.amount_paid)
      })
    }

    const clientIds = Array.from(totalsByClient.keys())
    const clients = await Client.findAll({
      where: {
        id: {
          [Op.in]: clientIds,
        },
      },
      attributes: ['id', 'name'],
    })

    const clientNameMap = new Map(clients.map(client => [client.id, client.name]))

    const data = Array.from(totalsByClient.values())
      .map(item => ({
        client_id: item.client_id,
        client_name: clientNameMap.get(item.client_id) || 'Unknown client',
        total_billed: roundCurrency(item.total_billed),
        total_paid: roundCurrency(item.total_paid),
      }))
      .sort((left, right) => {
        if (right.total_billed !== left.total_billed) {
          return right.total_billed - left.total_billed
        }

        return left.client_name.localeCompare(right.client_name)
      })
      .slice(0, 5)

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
      }),
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
