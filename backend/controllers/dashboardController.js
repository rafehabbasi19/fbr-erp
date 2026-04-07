'use strict'

const { Op } = require('sequelize')

const { sendSuccess, sendError } = require('../utils/response')
const { Invoice, Payment, FbrSubmission } = require('../models')

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

module.exports = {
  getSummary,
}
