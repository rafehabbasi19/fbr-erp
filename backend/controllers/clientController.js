'use strict'

const { Readable } = require('stream')
const csvParser = require('csv-parser')
const { Op, fn, col } = require('sequelize')
const { validationResult } = require('express-validator')

const { sendSuccess, sendError } = require('../utils/response')
const AuditLogger = require('../utils/auditLogger')
const { Client, Invoice, Payment } = require('../models')

const CLIENT_IMPORT_MAX_ROWS = 100000
const CLIENT_IMPORT_TEMPLATE_HEADERS = [
  'name',
  'email',
  'phone',
  'client_type',
  'ntn',
  'cnic',
  'address',
  'city',
]
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  if (value === null || value === undefined) {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roundCurrency(value) {
  return Number(toNumber(value).toFixed(2))
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

function serializeClient(client) {
  const plain = typeof client?.toJSON === 'function' ? client.toJSON() : client

  return {
    ...plain,
    credit_limit:
      plain && plain.credit_limit !== null && plain.credit_limit !== undefined
        ? roundCurrency(plain.credit_limit)
        : null,
  }
}

function normalizeClientPayload(body) {
  return {
    name: String(body.name || '').trim(),
    client_type: String(body.client_type || '').trim().toLowerCase(),
    email: normalizeOptionalString(body.email)?.toLowerCase() || null,
    phone: normalizeOptionalString(body.phone),
    address: normalizeOptionalString(body.address),
    city: normalizeOptionalString(body.city),
    province: normalizeOptionalString(body.province),
    postal_code: normalizeOptionalString(body.postal_code),
    country: normalizeOptionalString(body.country) || 'Pakistan',
    ntn: normalizeOptionalString(body.ntn),
    cnic: normalizeOptionalString(body.cnic),
    strn: normalizeOptionalString(body.strn),
    credit_limit: toOptionalNumber(body.credit_limit),
    payment_terms_days:
      body.payment_terms_days === null ||
      body.payment_terms_days === undefined ||
      String(body.payment_terms_days).trim() === ''
        ? 30
        : Number.parseInt(String(body.payment_terms_days), 10),
    notes: normalizeOptionalString(body.notes),
    status: normalizeOptionalString(body.status)?.toLowerCase() || 'active',
  }
}

function validateClientImportRow(rawRow, rowNumber) {
  const payload = normalizeClientPayload(rawRow)
  const rowErrors = []

  if (!payload.name) {
    rowErrors.push({ row: rowNumber, field: 'name', message: 'Name is required' })
  } else if (payload.name.length > 200) {
    rowErrors.push({
      row: rowNumber,
      field: 'name',
      message: 'Name must not exceed 200 characters',
    })
  }

  if (!payload.client_type) {
    rowErrors.push({ row: rowNumber, field: 'client_type', message: 'Client type is required' })
  } else if (!['individual', 'business'].includes(payload.client_type)) {
    rowErrors.push({
      row: rowNumber,
      field: 'client_type',
      message: 'Client type must be either individual or business',
    })
  }

  if (payload.email && !EMAIL_PATTERN.test(payload.email)) {
    rowErrors.push({ row: rowNumber, field: 'email', message: 'Email must be valid' })
  }

  if (payload.ntn && !/^\d{7}$/.test(payload.ntn)) {
    rowErrors.push({
      row: rowNumber,
      field: 'ntn',
      message: 'NTN must contain exactly 7 digits',
    })
  }

  if (payload.cnic && !/^\d{13}$/.test(payload.cnic)) {
    rowErrors.push({
      row: rowNumber,
      field: 'cnic',
      message: 'CNIC must contain exactly 13 digits without dashes',
    })
  }

  if (!payload.ntn && !payload.cnic) {
    rowErrors.push({
      row: rowNumber,
      field: 'ntn',
      message: 'At least one of NTN or CNIC must be provided',
    })
  }

  if (payload.client_type === 'individual' && !payload.cnic) {
    rowErrors.push({
      row: rowNumber,
      field: 'cnic',
      message: 'CNIC is required for individual clients',
    })
  }

  return {
    payload,
    rowErrors,
  }
}

function parseCsvRows(fileBuffer) {
  return new Promise((resolve, reject) => {
    const rows = []
    const parsedHeaders = []
    let rowCount = 0
    let rowLimitExceeded = false

    const parser = csvParser({
      mapHeaders: ({ header }) => String(header || '').trim().toLowerCase(),
      mapValues: ({ value }) => String(value || '').trim(),
    })

    parser.on('headers', headers => {
      parsedHeaders.push(...headers)
    })

    parser.on('data', row => {
      rowCount += 1

      if (rowCount > CLIENT_IMPORT_MAX_ROWS) {
        rowLimitExceeded = true
        parser.destroy(new Error('CSV row limit exceeded'))
        return
      }

      rows.push(row)
    })

    parser.on('error', error => {
      if (rowLimitExceeded) {
        const limitError = new Error(
          `CSV exceeds maximum allowed rows (${CLIENT_IMPORT_MAX_ROWS.toLocaleString()})`
        )
        limitError.statusCode = 422
        reject(limitError)
        return
      }

      reject(error)
    })

    parser.on('end', () => {
      const missingHeaders = CLIENT_IMPORT_TEMPLATE_HEADERS.filter(
        header => !parsedHeaders.includes(header)
      )

      if (missingHeaders.length > 0) {
        const headerError = new Error(
          `CSV headers are invalid. Missing headers: ${missingHeaders.join(', ')}`
        )
        headerError.statusCode = 422
        reject(headerError)
        return
      }

      resolve(rows)
    })

    Readable.from(fileBuffer).pipe(parser)
  })
}

function readRowValue(row, key) {
  if (row && typeof row.get === 'function') {
    return row.get(key)
  }

  return row ? row[key] : undefined
}

async function findScopedClient(companyId, clientId) {
  return Client.findOne({
    where: {
      id: clientId,
      company_id: companyId,
    },
  })
}

async function findDuplicateTaxIdentifier({
  companyId,
  ntn = null,
  cnic = null,
  excludeClientId = null,
}) {
  if (ntn) {
    const ntnWhere = {
      company_id: companyId,
      ntn,
    }

    if (excludeClientId) {
      ntnWhere.id = { [Op.ne]: excludeClientId }
    }

    const existingNtn = await Client.findOne({ where: ntnWhere })

    if (existingNtn) {
      return {
        field: 'ntn',
        message: 'NTN is already registered for another client in your company',
      }
    }
  }

  if (cnic) {
    const cnicWhere = {
      company_id: companyId,
      cnic,
    }

    if (excludeClientId) {
      cnicWhere.id = { [Op.ne]: excludeClientId }
    }

    const existingCnic = await Client.findOne({ where: cnicWhere })

    if (existingCnic) {
      return {
        field: 'cnic',
        message: 'CNIC is already registered for another client in your company',
      }
    }
  }

  return null
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

async function getImportTemplate(_req, res) {
  const csvHeaderLine = `${CLIENT_IMPORT_TEMPLATE_HEADERS.join(',')}\n`

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="clients-import-template.csv"')

  return res.status(200).send(csvHeaderLine)
}

async function importClients(req, res, next) {
  const user = req.user

  if (!req.file || !req.file.buffer) {
    return sendError(res, {
      statusCode: 422,
      message: 'CSV file is required',
      errors: [{ field: 'file', message: 'Attach a CSV file using multipart/form-data' }],
    })
  }

  try {
    const rows = await parseCsvRows(req.file.buffer)
    const importReport = {
      total_rows: rows.length,
      imported: 0,
      failed: 0,
      errors: [],
    }

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2
      const { payload, rowErrors } = validateClientImportRow(rows[index], rowNumber)

      if (rowErrors.length > 0) {
        importReport.failed += 1
        importReport.errors.push(...rowErrors)
        continue
      }

      const duplicateError = await findDuplicateTaxIdentifier({
        companyId: user.company_id,
        ntn: payload.ntn,
        cnic: payload.cnic,
      })

      if (duplicateError) {
        importReport.failed += 1
        importReport.errors.push({
          row: rowNumber,
          field: duplicateError.field,
          message: duplicateError.message,
        })
        continue
      }

      try {
        await Client.create({
          ...payload,
          company_id: user.company_id,
          created_by: user.id,
          country: payload.country || 'Pakistan',
          status: payload.status || 'active',
        })

        importReport.imported += 1
      } catch (error) {
        importReport.failed += 1

        if (error.name === 'SequelizeUniqueConstraintError') {
          const firstConstraint = Array.isArray(error.errors) ? error.errors[0] : null

          importReport.errors.push({
            row: rowNumber,
            field: firstConstraint?.path || 'ntn',
            message: firstConstraint?.message || 'Duplicate value found for this client',
          })
          continue
        }

        importReport.errors.push({
          row: rowNumber,
          field: 'row',
          message: 'Unable to import this row due to an unexpected error',
        })
      }
    }

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'CLIENT_IMPORT_COMPLETED',
      entity_type: 'Client',
      entity_id: null,
      new_values: {
        total_rows: importReport.total_rows,
        imported: importReport.imported,
        failed: importReport.failed,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: importReport,
      message: 'Client CSV import completed',
    })
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, {
        statusCode: err.statusCode,
        message: err.message,
      })
    }

    if (String(err.message || '').toLowerCase().includes('csv')) {
      return sendError(res, {
        statusCode: 422,
        message: 'CSV parsing failed. Ensure the file is valid and matches the template headers.',
      })
    }

    return next(err)
  }
}

async function createClient(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user
  const payload = normalizeClientPayload(req.body)

  try {
    const duplicateError = await findDuplicateTaxIdentifier({
      companyId: user.company_id,
      ntn: payload.ntn,
      cnic: payload.cnic,
    })

    if (duplicateError) {
      return sendError(res, {
        statusCode: 422,
        message: 'Validation failed',
        errors: [duplicateError],
      })
    }

    const client = await Client.create({
      ...payload,
      company_id: user.company_id,
      created_by: user.id,
    })

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'CLIENT_CREATED',
      entity_type: 'Client',
      entity_id: client.id,
      new_values: {
        name: payload.name,
        client_type: payload.client_type,
        ntn: payload.ntn,
        cnic: payload.cnic,
        status: payload.status,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      statusCode: 201,
      data: serializeClient(client),
      message: 'Client created successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function listClients(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user
  const search = normalizeOptionalString(req.query.search)
  const type = normalizeOptionalString(req.query.type)?.toLowerCase()
  const status = normalizeOptionalString(req.query.status)?.toLowerCase()
  const { page, perPage, offset } = parsePagination(req)

  const where = {
    company_id: user.company_id,
  }

  if (type) {
    where.client_type = type
  }

  if (status) {
    where.status = status
  }

  if (search) {
    const searchPattern = `%${search}%`
    where[Op.or] = [
      { name: { [Op.iLike]: searchPattern } },
      { email: { [Op.iLike]: searchPattern } },
      { ntn: { [Op.iLike]: searchPattern } },
      { cnic: { [Op.iLike]: searchPattern } },
    ]
  }

  try {
    const { count, rows } = await Client.findAndCountAll({
      where,
      attributes: ['id', 'name', 'client_type', 'ntn', 'cnic', 'email', 'phone', 'status'],
      order: [['created_at', 'DESC']],
      limit: perPage,
      offset,
    })

    const clientIds = rows.map(client => client.id)

    let invoiceTotals = []
    let paymentTotals = []

    if (clientIds.length > 0) {
      invoiceTotals = await Invoice.findAll({
        where: {
          company_id: user.company_id,
          client_id: { [Op.in]: clientIds },
          status: { [Op.ne]: 'cancelled' },
        },
        attributes: [
          'client_id',
          [fn('COUNT', col('id')), 'invoice_count'],
          [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'total_invoiced'],
        ],
        group: ['client_id'],
        raw: true,
      })

      paymentTotals = await Payment.findAll({
        attributes: [
          [col('invoice.client_id'), 'client_id'],
          [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'total_paid'],
        ],
        include: [
          {
            model: Invoice,
            as: 'invoice',
            attributes: [],
            required: true,
            where: {
              company_id: user.company_id,
              client_id: { [Op.in]: clientIds },
              status: { [Op.ne]: 'cancelled' },
            },
          },
        ],
        group: [col('invoice.client_id')],
        raw: true,
      })
    }

    const billedByClient = new Map()
    const invoiceCountByClient = new Map()
    invoiceTotals.forEach(row => {
      const key = String(readRowValue(row, 'client_id'))
      invoiceCountByClient.set(key, Number.parseInt(String(readRowValue(row, 'invoice_count') || '0'), 10))
      billedByClient.set(key, roundCurrency(readRowValue(row, 'total_invoiced')))
    })

    const paidByClient = new Map()
    paymentTotals.forEach(row => {
      const clientId = readRowValue(row, 'client_id') || readRowValue(row, 'invoice.client_id')
      paidByClient.set(String(clientId), roundCurrency(readRowValue(row, 'total_paid')))
    })

    const data = rows.map(client => {
      const plain = typeof client.toJSON === 'function' ? client.toJSON() : client
      const totalInvoices = invoiceCountByClient.get(String(client.id)) || 0
      const totalInvoiced = billedByClient.get(String(client.id)) || 0
      const totalPaid = paidByClient.get(String(client.id)) || 0
      const outstanding = Math.max(0, totalInvoiced - totalPaid)

      return {
        id: plain.id,
        name: plain.name,
        client_type: plain.client_type,
        ntn: plain.ntn,
        cnic: plain.cnic,
        email: plain.email,
        phone: plain.phone,
        status: plain.status,
        total_invoices: totalInvoices,
        outstanding_balance: roundCurrency(outstanding),
      }
    })

    const totalRecords = Array.isArray(count) ? count.length : count
    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / perPage) : 0

    return sendSuccess(res, {
      data,
      message: 'Clients retrieved successfully',
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

async function getClientById(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user
  const clientId = req.params.id

  try {
    const client = await findScopedClient(user.company_id, clientId)

    if (!client) {
      return sendError(res, {
        statusCode: 404,
        message: 'Client not found',
      })
    }

    const nonCancelledInvoiceWhere = {
      company_id: user.company_id,
      client_id: client.id,
      status: { [Op.ne]: 'cancelled' },
    }

    const [totalInvoiced, totalPaid, recentInvoices] = await Promise.all([
      Invoice.sum('total_amount', {
        where: nonCancelledInvoiceWhere,
      }),
      Payment.sum('amount_paid', {
        include: [
          {
            model: Invoice,
            as: 'invoice',
            attributes: [],
            required: true,
            where: nonCancelledInvoiceWhere,
          },
        ],
      }),
      Invoice.findAll({
        where: {
          company_id: user.company_id,
          client_id: client.id,
        },
        attributes: [
          'id',
          'invoice_number',
          'invoice_date',
          'due_date',
          'total_amount',
          'status',
          'payment_status',
          'fbr_status',
        ],
        order: [['created_at', 'DESC']],
        limit: 5,
      }),
    ])

    const totalInvoicedValue = roundCurrency(totalInvoiced)
    const totalPaidValue = roundCurrency(totalPaid)
    const outstandingValue = roundCurrency(Math.max(0, totalInvoicedValue - totalPaidValue))

    return sendSuccess(res, {
      data: {
        client: serializeClient(client),
        invoice_summary: {
          total_invoiced: totalInvoicedValue,
          total_paid: totalPaidValue,
          outstanding: outstandingValue,
        },
        recent_invoices: recentInvoices.map(invoice => ({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          total_amount: roundCurrency(invoice.total_amount),
          status: invoice.status,
          payment_status: invoice.payment_status,
          fbr_status: invoice.fbr_status,
        })),
      },
      message: 'Client details retrieved successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function updateClient(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user
  const clientId = req.params.id
  const payload = normalizeClientPayload(req.body)

  try {
    const client = await findScopedClient(user.company_id, clientId)

    if (!client) {
      return sendError(res, {
        statusCode: 404,
        message: 'Client not found',
      })
    }

    const duplicateError = await findDuplicateTaxIdentifier({
      companyId: user.company_id,
      ntn: payload.ntn,
      cnic: payload.cnic,
      excludeClientId: client.id,
    })

    if (duplicateError) {
      return sendError(res, {
        statusCode: 422,
        message: 'Validation failed',
        errors: [duplicateError],
      })
    }

    const oldValues = serializeClient(client)

    await client.update(payload)

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'CLIENT_UPDATED',
      entity_type: 'Client',
      entity_id: client.id,
      old_values: {
        name: oldValues.name,
        client_type: oldValues.client_type,
        ntn: oldValues.ntn,
        cnic: oldValues.cnic,
        status: oldValues.status,
      },
      new_values: {
        name: client.name,
        client_type: client.client_type,
        ntn: client.ntn,
        cnic: client.cnic,
        status: client.status,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: serializeClient(client),
      message: 'Client updated successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function deleteClient(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user
  const clientId = req.params.id

  try {
    const client = await findScopedClient(user.company_id, clientId)

    if (!client) {
      return sendError(res, {
        statusCode: 404,
        message: 'Client not found',
      })
    }

    const blockingInvoices = await Invoice.count({
      where: {
        company_id: user.company_id,
        client_id: client.id,
        status: { [Op.ne]: 'cancelled' },
      },
    })

    if (blockingInvoices > 0) {
      return sendError(res, {
        statusCode: 409,
        message: 'Client cannot be deleted because it has non-cancelled invoices',
      })
    }

    await client.destroy()

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'CLIENT_DELETED',
      entity_type: 'Client',
      entity_id: client.id,
      old_values: {
        name: client.name,
        client_type: client.client_type,
        ntn: client.ntn,
        cnic: client.cnic,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: {
        id: client.id,
        deleted: true,
      },
      message: 'Client deleted successfully',
    })
  } catch (err) {
    return next(err)
  }
}

module.exports = {
  getImportTemplate,
  importClients,
  createClient,
  listClients,
  getClientById,
  updateClient,
  deleteClient,
}
