'use strict'

const { Op } = require('sequelize')
const { validationResult } = require('express-validator')

const { sendSuccess, sendError } = require('../utils/response')
const AuditLogger = require('../utils/auditLogger')
const { assignNextInvoiceNumber } = require('../services/invoiceNumberService')
const { calculateInvoiceAmounts } = require('../services/invoiceCalculationService')
const {
  persistInvoiceQrPng,
  persistInvoicePdf,
  resolveStorageAbsolutePath,
  fileExists,
} = require('../services/invoiceAssetService')
const {
  sequelize,
  Invoice,
  InvoiceItem,
  Payment,
  Client,
  User,
  Company,
  FbrSubmission,
} = require('../models')

const INVOICE_SORT_FIELDS = {
  invoice_number: 'invoice_number',
  issue_date: 'issue_date',
  due_date: 'due_date',
  status: 'status',
  total: 'total',
  amount_paid: 'amount_paid',
  created_at: 'created_at',
}

function validationErrors(req) {
  const errors = validationResult(req)

  if (errors.isEmpty()) {
    return null
  }

  return errors.array().map(error => ({
    field: error.path,
    message: error.msg,
  }))
}

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value) {
  return Number(toNumber(value).toFixed(2))
}

function roundQuantity(value) {
  return Number(toNumber(value).toFixed(3))
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeDateOnly(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
}

function dateOnlyToday() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateString, days) {
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime())) {
    return dateOnlyToday()
  }

  parsed.setDate(parsed.getDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function toInvoiceStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()

  if (!normalized) {
    return 'draft'
  }

  if (normalized === 'submitted') {
    return 'sent'
  }

  if (normalized === 'verified') {
    return 'paid'
  }

  if (normalized === 'failed') {
    return 'draft'
  }

  return normalized
}

function toFbrStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()

  if (!normalized) {
    return 'not_submitted'
  }

  if (normalized === 'verified') {
    return 'accepted'
  }

  if (normalized === 'failed') {
    return 'rejected'
  }

  return normalized
}

function computePaymentStatus({ status, total, amountPaid, dueDate }) {
  const normalizedStatus = String(status || '').trim().toLowerCase()
  const totalAmount = toNumber(total)
  const paidAmount = toNumber(amountPaid)

  if (normalizedStatus === 'cancelled') {
    return 'unpaid'
  }

  if (totalAmount > 0 && paidAmount >= totalAmount) {
    return 'paid'
  }

  if (paidAmount > 0) {
    return 'partial'
  }

  const due = new Date(dueDate)
  const today = new Date()
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dueDateOnly = Number.isNaN(due.getTime())
    ? null
    : new Date(due.getFullYear(), due.getMonth(), due.getDate())

  if (dueDateOnly && dueDateOnly < todayDateOnly) {
    return 'overdue'
  }

  return 'unpaid'
}

function isSellerRole(user) {
  return String(user?.role || '').trim().toLowerCase() === 'seller'
}

function applyScopedInvoiceWhere(user, where = {}) {
  const scopedWhere = {
    ...where,
    company_id: user.company_id,
  }

  if (isSellerRole(user)) {
    scopedWhere.seller_id = user.id
  }

  return scopedWhere
}

async function findScopedClient(companyId, clientId) {
  return Client.findOne({
    where: {
      id: clientId,
      company_id: companyId,
    },
  })
}

function buildQrCodeData({ invoiceNumber, issueDate, total, taxAmount, company, client }) {
  return JSON.stringify({
    v: '1',
    inv: invoiceNumber,
    seller_ntn: normalizeOptionalString(company?.ntn),
    buyer_ntn: normalizeOptionalString(client?.ntn),
    date: issueDate,
    total: roundCurrency(total).toFixed(2),
    tax: roundCurrency(taxAmount).toFixed(2),
    fbr_usin: null,
  })
}

function serializeInvoiceItem(item) {
  const plain = typeof item?.toJSON === 'function' ? item.toJSON() : item

  return {
    id: plain.id,
    sort_order: Number.parseInt(String(plain.sort_order || 0), 10),
    description: plain.description || plain.product_name,
    quantity: roundQuantity(plain.quantity),
    unit: plain.unit || null,
    unit_price: roundCurrency(plain.unit_price),
    tax_rate_id: plain.tax_rate_id || null,
    tax_rate_percentage: roundCurrency(plain.tax_rate_percentage ?? plain.tax_rate),
    tax_amount: roundCurrency(plain.tax_amount),
    line_total: roundCurrency(plain.line_total ?? plain.total_price),
  }
}

function serializePayment(payment) {
  const plain = typeof payment?.toJSON === 'function' ? payment.toJSON() : payment

  return {
    id: plain.id,
    invoice_id: plain.invoice_id,
    amount_paid: roundCurrency(plain.amount_paid),
    payment_date: plain.payment_date,
    payment_method: plain.payment_method,
    reference_number: plain.reference_number,
    notes: plain.notes,
    recorded_by: plain.recorded_by,
    created_at: plain.created_at,
  }
}

function serializeFbrSubmission(submission) {
  if (!submission) {
    return null
  }

  const plain = typeof submission.toJSON === 'function' ? submission.toJSON() : submission

  return {
    id: plain.id,
    invoice_id: plain.invoice_id,
    attempt_number: plain.attempt_number,
    status: plain.status,
    fbr_response: plain.fbr_response || null,
    submitted_at: plain.submitted_at || null,
    created_at: plain.created_at,
  }
}

function serializeInvoiceSummary(invoice) {
  const plain = typeof invoice?.toJSON === 'function' ? invoice.toJSON() : invoice

  const total = roundCurrency(plain.total ?? plain.total_amount)
  const amountPaid = roundCurrency(plain.amount_paid)

  return {
    id: plain.id,
    invoice_number: plain.invoice_number,
    issue_date: plain.issue_date || plain.invoice_date,
    due_date: plain.due_date,
    status: toInvoiceStatus(plain.status),
    currency: plain.currency || 'PKR',
    subtotal: roundCurrency(plain.subtotal),
    discount_amount: roundCurrency(plain.discount_amount ?? plain.discount),
    tax_amount: roundCurrency(plain.tax_amount),
    total,
    amount_paid: amountPaid,
    balance_due:
      plain.balance_due !== null && plain.balance_due !== undefined
        ? roundCurrency(plain.balance_due)
        : roundCurrency(Math.max(0, total - amountPaid)),
    fbr_status: toFbrStatus(plain.fbr_status),
    sent_at: plain.sent_at || null,
    client: plain.client
      ? {
          id: plain.client.id,
          name: plain.client.name,
          ntn: plain.client.ntn,
          cnic: plain.client.cnic,
        }
      : null,
    seller: plain.seller
      ? {
          id: plain.seller.id,
          name: plain.seller.name,
          email: plain.seller.email,
        }
      : null,
  }
}

function serializeInvoiceDetail(invoice, fbrSubmission = null) {
  const plain = typeof invoice?.toJSON === 'function' ? invoice.toJSON() : invoice

  const total = roundCurrency(plain.total ?? plain.total_amount)
  const amountPaid = roundCurrency(plain.amount_paid)

  return {
    id: plain.id,
    company_id: plain.company_id,
    client_id: plain.client_id,
    seller_id: plain.seller_id || plain.created_by || null,
    invoice_number: plain.invoice_number,
    issue_date: plain.issue_date || plain.invoice_date,
    due_date: plain.due_date,
    status: toInvoiceStatus(plain.status),
    currency: plain.currency || 'PKR',
    subtotal: roundCurrency(plain.subtotal),
    discount_type: plain.discount_type,
    discount_value: roundCurrency(plain.discount_value),
    discount_amount: roundCurrency(plain.discount_amount ?? plain.discount),
    tax_amount: roundCurrency(plain.tax_amount),
    total,
    amount_paid: amountPaid,
    balance_due:
      plain.balance_due !== null && plain.balance_due !== undefined
        ? roundCurrency(plain.balance_due)
        : roundCurrency(Math.max(0, total - amountPaid)),
    notes: plain.notes,
    terms: plain.terms,
    fbr_status: toFbrStatus(plain.fbr_status),
    fbr_usin: plain.fbr_usin || plain.fbr_invoice_number || null,
    fbr_pos_id: plain.fbr_pos_id || null,
    qr_code_data: plain.qr_code_data || null,
    qr_code_path: plain.qr_code_path || plain.qr_code_url || null,
    pdf_path: plain.pdf_path || null,
    sent_at: plain.sent_at || null,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
    client: plain.client
      ? {
          id: plain.client.id,
          name: plain.client.name,
          client_type: plain.client.client_type,
          ntn: plain.client.ntn,
          cnic: plain.client.cnic,
          email: plain.client.email,
          phone: plain.client.phone,
        }
      : null,
    seller: plain.seller
      ? {
          id: plain.seller.id,
          name: plain.seller.name,
          email: plain.seller.email,
        }
      : null,
    items: Array.isArray(plain.items) ? plain.items.map(serializeInvoiceItem) : [],
    payments: Array.isArray(plain.payments) ? plain.payments.map(serializePayment) : [],
    fbr_submission: serializeFbrSubmission(fbrSubmission),
  }
}

async function fetchInvoiceDetailById({ user, invoiceId, transaction = null }) {
  const invoice = await Invoice.findOne({
    where: applyScopedInvoiceWhere(user, { id: invoiceId }),
    include: [
      {
        model: Client,
        as: 'client',
        attributes: ['id', 'name', 'client_type', 'ntn', 'cnic', 'email', 'phone'],
      },
      {
        model: User,
        as: 'seller',
        attributes: ['id', 'name', 'email'],
      },
      {
        model: InvoiceItem,
        as: 'items',
      },
      {
        model: Payment,
        as: 'payments',
      },
    ],
    order: [
      [{ model: InvoiceItem, as: 'items' }, 'sort_order', 'ASC'],
      [{ model: InvoiceItem, as: 'items' }, 'created_at', 'ASC'],
      [{ model: Payment, as: 'payments' }, 'payment_date', 'DESC'],
      [{ model: Payment, as: 'payments' }, 'created_at', 'DESC'],
    ],
    transaction,
  })

  if (!invoice) {
    return null
  }

  const fbrSubmission = await FbrSubmission.findOne({
    where: {
      invoice_id: invoice.id,
    },
    order: [
      ['attempt_number', 'DESC'],
      ['created_at', 'DESC'],
    ],
    transaction,
  })

  return { invoice, fbrSubmission }
}

async function tryPersistQrAsset(invoice) {
  if (!invoice || !invoice.id || !invoice.company_id || !invoice.qr_code_data) {
    return null
  }

  try {
    const qrAsset = await persistInvoiceQrPng({
      companyId: invoice.company_id,
      invoiceId: invoice.id,
      qrCodeData: invoice.qr_code_data,
    })

    await invoice.update({
      qr_code_path: qrAsset.publicPath,
      qr_code_url: qrAsset.publicPath,
    })

    return qrAsset
  } catch (error) {
    console.warn(`[Invoice] QR asset generation failed for ${invoice.id}:`, error.message)
    return null
  }
}

function parsePagination(req) {
  const parsedPage = Number.parseInt(String(req.query.page || '1'), 10)
  const parsedPerPage = Number.parseInt(String(req.query.per_page || '10'), 10)
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const perPage = Number.isInteger(parsedPerPage) && parsedPerPage > 0 ? Math.min(parsedPerPage, 100) : 10

  return {
    page,
    perPage,
    offset: (page - 1) * perPage,
  }
}

function normalizePayload(body) {
  return {
    client_id: String(body.client_id || '').trim(),
    issue_date: normalizeDateOnly(body.issue_date),
    due_date: normalizeDateOnly(body.due_date),
    currency: (normalizeOptionalString(body.currency) || 'PKR').toUpperCase(),
    discount_type: normalizeOptionalString(body.discount_type)?.toLowerCase() || null,
    discount_value:
      body.discount_value === null || body.discount_value === undefined || String(body.discount_value).trim() === ''
        ? 0
        : Number(body.discount_value),
    notes: normalizeOptionalString(body.notes),
    terms: normalizeOptionalString(body.terms),
    items: Array.isArray(body.items) ? body.items : [],
  }
}

function validateChronologicalDates(issueDate, dueDate) {
  if (!issueDate || !dueDate) {
    return {
      statusCode: 422,
      message: 'Validation failed',
      errors: [
        ...(!issueDate ? [{ field: 'issue_date', message: 'Issue date must be a valid date' }] : []),
        ...(!dueDate ? [{ field: 'due_date', message: 'Due date must be a valid date' }] : []),
      ],
    }
  }

  if (new Date(dueDate) < new Date(issueDate)) {
    return {
      statusCode: 422,
      message: 'Validation failed',
      errors: [{ field: 'due_date', message: 'Due date cannot be earlier than issue date' }],
    }
  }

  return null
}

async function createInvoice(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user
  const payload = normalizePayload(req.body)
  const dateError = validateChronologicalDates(payload.issue_date, payload.due_date)

  if (dateError) {
    return sendError(res, dateError)
  }

  try {
    const client = await findScopedClient(user.company_id, payload.client_id)

    if (!client) {
      return sendError(res, {
        statusCode: 422,
        message: 'Validation failed',
        errors: [{ field: 'client_id', message: 'Client not found in your company' }],
      })
    }

    const company = await Company.findByPk(user.company_id, {
      attributes: ['id', 'ntn'],
    })

    const createdInvoiceId = await sequelize.transaction(async transaction => {
      const calculated = await calculateInvoiceAmounts({
        companyId: user.company_id,
        items: payload.items,
        discount_type: payload.discount_type,
        discount_value: payload.discount_value,
      })

      const invoiceNumber = await assignNextInvoiceNumber({
        companyId: user.company_id,
        issueDate: payload.issue_date,
        transaction,
      })

      const invoiceRecord = await Invoice.create(
        {
          company_id: user.company_id,
          client_id: payload.client_id,
          seller_id: user.id,
          created_by: user.id,
          invoice_number: invoiceNumber,
          issue_date: payload.issue_date,
          invoice_date: payload.issue_date,
          due_date: payload.due_date,
          status: 'draft',
          payment_status: 'unpaid',
          currency: payload.currency,
          subtotal: calculated.subtotal,
          discount_type: calculated.discount_type,
          discount_value: calculated.discount_value,
          discount_amount: calculated.discount_amount,
          discount: calculated.discount_amount,
          tax_amount: calculated.tax_amount,
          total: calculated.total,
          total_amount: calculated.total,
          amount_paid: 0,
          notes: payload.notes,
          terms: payload.terms,
          fbr_status: 'not_submitted',
          fbr_usin: null,
          fbr_invoice_number: null,
          qr_code_data: buildQrCodeData({
            invoiceNumber,
            issueDate: payload.issue_date,
            total: calculated.total,
            taxAmount: calculated.tax_amount,
            company,
            client,
          }),
          qr_code_path: null,
          qr_code_url: null,
          pdf_path: null,
        },
        { transaction }
      )

      await InvoiceItem.bulkCreate(
        calculated.items.map(item => ({
          invoice_id: invoiceRecord.id,
          sort_order: item.sort_order,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          tax_rate_id: item.tax_rate_id,
          tax_rate_percentage: item.tax_rate_percentage,
          tax_amount: item.tax_amount,
          line_total: item.line_total,
          product_name: item.product_name,
          hsn_code: item.hsn_code,
          discount: item.discount,
          tax_rate: item.tax_rate,
          total_price: item.total_price,
        })),
        { transaction }
      )

      return invoiceRecord.id
    })

    const invoiceDetail = await fetchInvoiceDetailById({
      user,
      invoiceId: createdInvoiceId,
    })

    if (invoiceDetail?.invoice) {
      await tryPersistQrAsset(invoiceDetail.invoice)
    }

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'INVOICE_CREATED',
      entity_type: 'Invoice',
      entity_id: createdInvoiceId,
      new_values: {
        invoice_number: invoiceDetail?.invoice?.invoice_number || null,
        status: 'draft',
        total: roundCurrency(invoiceDetail?.invoice?.total),
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      statusCode: 201,
      data: serializeInvoiceDetail(invoiceDetail.invoice, invoiceDetail.fbrSubmission),
      message: 'Invoice created successfully',
    })
  } catch (err) {
    if (err.statusCode === 422) {
      return sendError(res, {
        statusCode: 422,
        message: err.message || 'Validation failed',
        errors: err.errors || null,
      })
    }

    return next(err)
  }
}

async function listInvoices(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user
  const { page, perPage, offset } = parsePagination(req)
  const where = applyScopedInvoiceWhere(user)
  const include = [
    {
      model: Client,
      as: 'client',
      attributes: ['id', 'name', 'ntn', 'cnic'],
      required: false,
    },
    {
      model: User,
      as: 'seller',
      attributes: ['id', 'name', 'email'],
      required: false,
    },
  ]

  const status = normalizeOptionalString(req.query.status)?.toLowerCase()
  const clientId = normalizeOptionalString(req.query.client_id)
  const sellerId = normalizeOptionalString(req.query.seller_id)
  const dateFrom = normalizeDateOnly(req.query.date_from)
  const dateTo = normalizeDateOnly(req.query.date_to)
  const search = normalizeOptionalString(req.query.search)

  if (status) {
    where.status = status
  }

  if (clientId) {
    where.client_id = clientId
  }

  if (sellerId && !isSellerRole(user)) {
    where.seller_id = sellerId
  }

  if (dateFrom || dateTo) {
    where.issue_date = {}

    if (dateFrom) {
      where.issue_date[Op.gte] = dateFrom
    }

    if (dateTo) {
      where.issue_date[Op.lte] = dateTo
    }
  }

  const amountMinRaw = normalizeOptionalString(req.query.amount_min)
  const amountMaxRaw = normalizeOptionalString(req.query.amount_max)
  const amountMin = amountMinRaw !== null ? Number(amountMinRaw) : null
  const amountMax = amountMaxRaw !== null ? Number(amountMaxRaw) : null

  if ((amountMinRaw !== null && Number.isFinite(amountMin)) || (amountMaxRaw !== null && Number.isFinite(amountMax))) {
    where.total = {}

    if (amountMinRaw !== null && Number.isFinite(amountMin)) {
      where.total[Op.gte] = amountMin
    }

    if (amountMaxRaw !== null && Number.isFinite(amountMax)) {
      where.total[Op.lte] = amountMax
    }
  }

  if (search) {
    const searchPattern = `%${search}%`
    where[Op.or] = [
      { invoice_number: { [Op.iLike]: searchPattern } },
      { '$client.name$': { [Op.iLike]: searchPattern } },
    ]
  }

  const sortBy = INVOICE_SORT_FIELDS[String(req.query.sort_by || '').trim().toLowerCase()] || 'created_at'
  const sortDir = String(req.query.sort_dir || 'desc').trim().toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  try {
    const { count, rows } = await Invoice.findAndCountAll({
      where,
      include,
      distinct: true,
      limit: perPage,
      offset,
      order: [[sortBy, sortDir]],
      subQuery: false,
      attributes: [
        'id',
        'company_id',
        'client_id',
        'seller_id',
        'created_by',
        'invoice_number',
        'issue_date',
        'invoice_date',
        'due_date',
        'status',
        'currency',
        'subtotal',
        'discount_amount',
        'discount',
        'tax_amount',
        'total',
        'total_amount',
        'amount_paid',
        'balance_due',
        'fbr_status',
        'sent_at',
        'created_at',
      ],
    })

    const totalRecords = Array.isArray(count) ? count.length : count
    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / perPage) : 0

    return sendSuccess(res, {
      data: rows.map(serializeInvoiceSummary),
      message: 'Invoices retrieved successfully',
      meta: {
        page,
        per_page: perPage,
        total: totalRecords,
        total_pages: totalPages,
      },
    })
  } catch (err) {
    return next(err)
  }
}

async function getInvoiceById(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user

  try {
    const invoiceDetail = await fetchInvoiceDetailById({
      user,
      invoiceId: req.params.id,
    })

    if (!invoiceDetail) {
      return sendError(res, {
        statusCode: 404,
        message: 'Invoice not found',
      })
    }

    return sendSuccess(res, {
      data: serializeInvoiceDetail(invoiceDetail.invoice, invoiceDetail.fbrSubmission),
      message: 'Invoice retrieved successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function updateInvoice(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user
  const payload = normalizePayload(req.body)
  const dateError = validateChronologicalDates(payload.issue_date, payload.due_date)

  if (dateError) {
    return sendError(res, dateError)
  }

  try {
    const currentInvoice = await Invoice.findOne({
      where: applyScopedInvoiceWhere(user, { id: req.params.id }),
      include: [
        {
          model: InvoiceItem,
          as: 'items',
        },
      ],
    })

    if (!currentInvoice) {
      return sendError(res, {
        statusCode: 404,
        message: 'Invoice not found',
      })
    }

    if (toFbrStatus(currentInvoice.fbr_status) !== 'not_submitted') {
      return sendError(res, {
        statusCode: 409,
        message: 'Invoice has been submitted to FBR and cannot be modified.',
      })
    }

    if (toInvoiceStatus(currentInvoice.status) !== 'draft') {
      return sendError(res, {
        statusCode: 409,
        message: 'Only draft invoices can be edited',
      })
    }

    const client = await findScopedClient(user.company_id, payload.client_id)
    if (!client) {
      return sendError(res, {
        statusCode: 422,
        message: 'Validation failed',
        errors: [{ field: 'client_id', message: 'Client not found in your company' }],
      })
    }

    const company = await Company.findByPk(user.company_id, {
      attributes: ['id', 'ntn'],
    })

    const updatedInvoiceId = await sequelize.transaction(async transaction => {
      const calculated = await calculateInvoiceAmounts({
        companyId: user.company_id,
        items: payload.items,
        discount_type: payload.discount_type,
        discount_value: payload.discount_value,
      })

      await currentInvoice.update(
        {
          client_id: payload.client_id,
          issue_date: payload.issue_date,
          invoice_date: payload.issue_date,
          due_date: payload.due_date,
          currency: payload.currency,
          subtotal: calculated.subtotal,
          discount_type: calculated.discount_type,
          discount_value: calculated.discount_value,
          discount_amount: calculated.discount_amount,
          discount: calculated.discount_amount,
          tax_amount: calculated.tax_amount,
          total: calculated.total,
          total_amount: calculated.total,
          amount_paid: 0,
          payment_status: computePaymentStatus({
            status: 'draft',
            total: calculated.total,
            amountPaid: 0,
            dueDate: payload.due_date,
          }),
          notes: payload.notes,
          terms: payload.terms,
          qr_code_data: buildQrCodeData({
            invoiceNumber: currentInvoice.invoice_number,
            issueDate: payload.issue_date,
            total: calculated.total,
            taxAmount: calculated.tax_amount,
            company,
            client,
          }),
        },
        { transaction }
      )

      await InvoiceItem.destroy({
        where: {
          invoice_id: currentInvoice.id,
        },
        transaction,
        force: true,
      })

      await InvoiceItem.bulkCreate(
        calculated.items.map(item => ({
          invoice_id: currentInvoice.id,
          sort_order: item.sort_order,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          tax_rate_id: item.tax_rate_id,
          tax_rate_percentage: item.tax_rate_percentage,
          tax_amount: item.tax_amount,
          line_total: item.line_total,
          product_name: item.product_name,
          hsn_code: item.hsn_code,
          discount: item.discount,
          tax_rate: item.tax_rate,
          total_price: item.total_price,
        })),
        { transaction }
      )

      return currentInvoice.id
    })

    const invoiceDetail = await fetchInvoiceDetailById({
      user,
      invoiceId: updatedInvoiceId,
    })

    if (invoiceDetail?.invoice) {
      await tryPersistQrAsset(invoiceDetail.invoice)
    }

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'INVOICE_UPDATED',
      entity_type: 'Invoice',
      entity_id: currentInvoice.id,
      new_values: {
        invoice_number: currentInvoice.invoice_number,
        issue_date: payload.issue_date,
        due_date: payload.due_date,
        total: roundCurrency(invoiceDetail?.invoice?.total),
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: serializeInvoiceDetail(invoiceDetail.invoice, invoiceDetail.fbrSubmission),
      message: 'Invoice updated successfully',
    })
  } catch (err) {
    if (err.statusCode === 422) {
      return sendError(res, {
        statusCode: 422,
        message: err.message || 'Validation failed',
        errors: err.errors || null,
      })
    }

    return next(err)
  }
}

async function deleteInvoice(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user

  try {
    const invoice = await Invoice.findOne({
      where: applyScopedInvoiceWhere(user, { id: req.params.id }),
    })

    if (!invoice) {
      return sendError(res, {
        statusCode: 404,
        message: 'Invoice not found',
      })
    }

    if (toInvoiceStatus(invoice.status) !== 'draft') {
      return sendError(res, {
        statusCode: 409,
        message: 'Only draft invoices can be deleted',
      })
    }

    const paymentsCount = await Payment.count({
      where: {
        invoice_id: invoice.id,
      },
    })

    if (paymentsCount > 0 || roundCurrency(invoice.amount_paid) > 0) {
      return sendError(res, {
        statusCode: 409,
        message: 'Invoice cannot be deleted because payments are already recorded',
      })
    }

    await invoice.destroy()

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'INVOICE_DELETED',
      entity_type: 'Invoice',
      entity_id: invoice.id,
      old_values: {
        invoice_number: invoice.invoice_number,
        status: invoice.status,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: {
        id: invoice.id,
        deleted: true,
      },
      message: 'Invoice deleted successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function duplicateInvoice(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user

  try {
    const source = await Invoice.findOne({
      where: applyScopedInvoiceWhere(user, { id: req.params.id }),
      include: [
        {
          model: InvoiceItem,
          as: 'items',
        },
        {
          model: Client,
          as: 'client',
          attributes: ['id', 'ntn'],
        },
      ],
      order: [[{ model: InvoiceItem, as: 'items' }, 'sort_order', 'ASC']],
    })

    if (!source) {
      return sendError(res, {
        statusCode: 404,
        message: 'Invoice not found',
      })
    }

    const sourceIssueDate = normalizeDateOnly(source.issue_date || source.invoice_date) || dateOnlyToday()
    const sourceDueDate = normalizeDateOnly(source.due_date) || sourceIssueDate
    const dueDays = Math.max(
      0,
      Math.round((new Date(sourceDueDate).getTime() - new Date(sourceIssueDate).getTime()) / (1000 * 60 * 60 * 24))
    )

    const duplicateIssueDate = dateOnlyToday()
    const duplicateDueDate = addDays(duplicateIssueDate, dueDays)

    const itemPayload = (source.items || []).map((item, index) => ({
      description: item.description || item.product_name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      tax_rate_id: null,
      tax_rate_percentage: item.tax_rate_percentage ?? item.tax_rate,
      sort_order: Number.isInteger(item.sort_order) ? item.sort_order : index,
    }))

    const company = await Company.findByPk(user.company_id, {
      attributes: ['id', 'ntn'],
    })

    const duplicatedInvoiceId = await sequelize.transaction(async transaction => {
      const calculated = await calculateInvoiceAmounts({
        companyId: user.company_id,
        items: itemPayload,
        discount_type: source.discount_type,
        discount_value: source.discount_value,
      })

      const invoiceNumber = await assignNextInvoiceNumber({
        companyId: user.company_id,
        issueDate: duplicateIssueDate,
        transaction,
      })

      const duplicatedInvoice = await Invoice.create(
        {
          company_id: user.company_id,
          client_id: source.client_id,
          seller_id: user.id,
          created_by: user.id,
          invoice_number: invoiceNumber,
          issue_date: duplicateIssueDate,
          invoice_date: duplicateIssueDate,
          due_date: duplicateDueDate,
          status: 'draft',
          payment_status: 'unpaid',
          currency: source.currency || 'PKR',
          subtotal: calculated.subtotal,
          discount_type: calculated.discount_type,
          discount_value: calculated.discount_value,
          discount_amount: calculated.discount_amount,
          discount: calculated.discount_amount,
          tax_amount: calculated.tax_amount,
          total: calculated.total,
          total_amount: calculated.total,
          amount_paid: 0,
          notes: source.notes,
          terms: source.terms,
          fbr_status: 'not_submitted',
          fbr_usin: null,
          fbr_invoice_number: null,
          fbr_pos_id: null,
          qr_code_data: buildQrCodeData({
            invoiceNumber,
            issueDate: duplicateIssueDate,
            total: calculated.total,
            taxAmount: calculated.tax_amount,
            company,
            client: source.client,
          }),
          qr_code_path: null,
          qr_code_url: null,
          pdf_path: null,
          sent_at: null,
        },
        { transaction }
      )

      await InvoiceItem.bulkCreate(
        calculated.items.map(item => ({
          invoice_id: duplicatedInvoice.id,
          sort_order: item.sort_order,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          tax_rate_id: item.tax_rate_id,
          tax_rate_percentage: item.tax_rate_percentage,
          tax_amount: item.tax_amount,
          line_total: item.line_total,
          product_name: item.product_name,
          hsn_code: item.hsn_code,
          discount: item.discount,
          tax_rate: item.tax_rate,
          total_price: item.total_price,
        })),
        { transaction }
      )

      return duplicatedInvoice.id
    })

    const invoiceDetail = await fetchInvoiceDetailById({
      user,
      invoiceId: duplicatedInvoiceId,
    })

    if (invoiceDetail?.invoice) {
      await tryPersistQrAsset(invoiceDetail.invoice)
    }

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'INVOICE_DUPLICATED',
      entity_type: 'Invoice',
      entity_id: duplicatedInvoiceId,
      new_values: {
        source_invoice_id: source.id,
        source_invoice_number: source.invoice_number,
        duplicated_invoice_number: invoiceDetail?.invoice?.invoice_number || null,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      statusCode: 201,
      data: serializeInvoiceDetail(invoiceDetail.invoice, invoiceDetail.fbrSubmission),
      message: 'Invoice duplicated successfully',
    })
  } catch (err) {
    if (err.statusCode === 422) {
      return sendError(res, {
        statusCode: 422,
        message: err.message || 'Validation failed',
        errors: err.errors || null,
      })
    }

    return next(err)
  }
}

async function sendInvoice(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user

  try {
    const invoice = await Invoice.findOne({
      where: applyScopedInvoiceWhere(user, { id: req.params.id }),
      include: [
        {
          model: InvoiceItem,
          as: 'items',
          attributes: ['id'],
        },
      ],
    })

    if (!invoice) {
      return sendError(res, {
        statusCode: 404,
        message: 'Invoice not found',
      })
    }

    if (toInvoiceStatus(invoice.status) !== 'draft') {
      return sendError(res, {
        statusCode: 409,
        message: 'Only draft invoices can be sent',
      })
    }

    if (!invoice.items || invoice.items.length === 0) {
      return sendError(res, {
        statusCode: 409,
        message: 'Invoice must include at least one line item before sending',
      })
    }

    const nextStatus =
      roundCurrency(invoice.amount_paid) >= roundCurrency(invoice.total)
        ? 'paid'
        : roundCurrency(invoice.amount_paid) > 0
          ? 'partially_paid'
          : computePaymentStatus({
              status: 'sent',
              total: invoice.total,
              amountPaid: invoice.amount_paid,
              dueDate: invoice.due_date,
            }) === 'overdue'
            ? 'overdue'
            : 'sent'

    await invoice.update({
      status: nextStatus,
      sent_at: new Date(),
      payment_status: computePaymentStatus({
        status: nextStatus,
        total: invoice.total,
        amountPaid: invoice.amount_paid,
        dueDate: invoice.due_date,
      }),
    })

    const invoiceDetail = await fetchInvoiceDetailById({
      user,
      invoiceId: invoice.id,
    })

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'INVOICE_SENT',
      entity_type: 'Invoice',
      entity_id: invoice.id,
      new_values: {
        status: nextStatus,
        sent_at: invoice.sent_at,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: serializeInvoiceDetail(invoiceDetail.invoice, invoiceDetail.fbrSubmission),
      message: 'Invoice sent successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function cancelInvoice(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user
  const reason = normalizeOptionalString(req.body.reason)

  try {
    const invoice = await Invoice.findOne({
      where: applyScopedInvoiceWhere(user, { id: req.params.id }),
    })

    if (!invoice) {
      return sendError(res, {
        statusCode: 404,
        message: 'Invoice not found',
      })
    }

    const paymentsCount = await Payment.count({
      where: {
        invoice_id: invoice.id,
      },
    })

    if (paymentsCount > 0 || roundCurrency(invoice.amount_paid) > 0) {
      return sendError(res, {
        statusCode: 409,
        message: 'Invoice cannot be cancelled because payments are already recorded',
      })
    }

    await invoice.update({
      status: 'cancelled',
      payment_status: 'unpaid',
    })

    const invoiceDetail = await fetchInvoiceDetailById({
      user,
      invoiceId: invoice.id,
    })

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'INVOICE_CANCELLED',
      entity_type: 'Invoice',
      entity_id: invoice.id,
      new_values: {
        status: 'cancelled',
        reason,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: serializeInvoiceDetail(invoiceDetail.invoice, invoiceDetail.fbrSubmission),
      message: 'Invoice cancelled successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function getInvoicePdf(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user

  try {
    const invoiceDetail = await fetchInvoiceDetailById({
      user,
      invoiceId: req.params.id,
    })

    if (!invoiceDetail) {
      return sendError(res, {
        statusCode: 404,
        message: 'Invoice not found',
      })
    }

    const invoice = invoiceDetail.invoice

    const company = await Company.findByPk(invoice.company_id, {
      attributes: ['id', 'name', 'ntn', 'strn', 'address', 'email', 'phone'],
    })

    let qrCodeAbsolutePath = resolveStorageAbsolutePath(invoice.qr_code_path)
    if (!(await fileExists(qrCodeAbsolutePath))) {
      const qrAsset = await tryPersistQrAsset(invoice)
      qrCodeAbsolutePath = qrAsset?.absolutePath || resolveStorageAbsolutePath(invoice.qr_code_path)
    }

    const pdfAsset = await persistInvoicePdf({
      invoice,
      company,
      client: invoice.client,
      items: invoice.items,
      payments: invoice.payments,
      qrCodeAbsolutePath,
    })

    await invoice.update({
      pdf_path: pdfAsset.publicPath,
    })

    const download = String(req.query.download || '').trim() === '1'
    const disposition = download ? 'attachment' : 'inline'
    const safeInvoiceNumber = String(invoice.invoice_number || 'invoice').replace(/[^a-zA-Z0-9_-]+/g, '_')

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeInvoiceNumber}.pdf"`)

    return res.sendFile(pdfAsset.absolutePath)
  } catch (err) {
    return next(err)
  }
}

module.exports = {
  createInvoice,
  listInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  duplicateInvoice,
  sendInvoice,
  cancelInvoice,
  getInvoicePdf,
}
