'use strict'

const { validationResult } = require('express-validator')

const { sendSuccess, sendError } = require('../utils/response')
const AuditLogger = require('../utils/auditLogger')
const { sequelize, TaxRate, InvoiceItem } = require('../models')
const { calculateInvoiceAmounts } = require('../services/invoiceCalculationService')

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

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeTaxType(value) {
  const normalized = String(value || '').trim()

  if (!normalized) {
    return 'GST'
  }

  return normalized
}

function serializeTaxRate(rate) {
  const plain = typeof rate?.toJSON === 'function' ? rate.toJSON() : rate

  return {
    id: plain.id,
    company_id: plain.company_id,
    name: plain.name,
    rate_percentage: roundCurrency(plain.rate_percentage),
    tax_type: plain.tax_type,
    description: plain.description,
    is_default: Boolean(plain.is_default),
    is_active: Boolean(plain.is_active),
    created_at: plain.created_at,
    updated_at: plain.updated_at,
  }
}

async function findScopedTaxRate(companyId, taxRateId) {
  return TaxRate.findOne({
    where: {
      id: taxRateId,
      company_id: companyId,
    },
  })
}

async function countTaxRateUsage(taxRateId) {
  return InvoiceItem.count({
    where: {
      tax_rate_id: taxRateId,
    },
  })
}

async function listTaxRates(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const includeInactive = ['1', 'true', 'yes'].includes(
    String(req.query.include_inactive || '').trim().toLowerCase()
  )

  try {
    const where = {
      company_id: req.user.company_id,
    }

    if (!includeInactive) {
      where.is_active = true
    }

    const rates = await TaxRate.findAll({
      where,
      order: [
        ['is_default', 'DESC'],
        ['rate_percentage', 'ASC'],
        ['name', 'ASC'],
      ],
    })

    return sendSuccess(res, {
      data: rates.map(serializeTaxRate),
      message: 'Tax rates retrieved successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function createTaxRate(req, res, next) {
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
    const created = await sequelize.transaction(async transaction => {
      const rate = await TaxRate.create(
        {
          company_id: user.company_id,
          name: String(req.body.name || '').trim(),
          rate_percentage: roundCurrency(req.body.rate_percentage),
          tax_type: normalizeTaxType(req.body.tax_type),
          description: normalizeOptionalString(req.body.description),
          is_default: Boolean(req.body.is_default),
          is_active:
            req.body.is_active === null || req.body.is_active === undefined
              ? true
              : Boolean(req.body.is_active),
        },
        { transaction }
      )

      return rate
    })

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'TAX_RATE_CREATED',
      entity_type: 'TaxRate',
      entity_id: created.id,
      new_values: serializeTaxRate(created),
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      statusCode: 201,
      data: serializeTaxRate(created),
      message: 'Tax rate created successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function updateTaxRate(req, res, next) {
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
    const taxRate = await findScopedTaxRate(user.company_id, req.params.id)

    if (!taxRate) {
      return sendError(res, {
        statusCode: 404,
        message: 'Tax rate not found',
      })
    }

    const oldValues = serializeTaxRate(taxRate)

    const requestedRatePercentage =
      req.body.rate_percentage === null || req.body.rate_percentage === undefined
        ? roundCurrency(taxRate.rate_percentage)
        : roundCurrency(req.body.rate_percentage)

    const hasRateChanged = requestedRatePercentage !== roundCurrency(taxRate.rate_percentage)

    if (hasRateChanged) {
      const usageCount = await countTaxRateUsage(taxRate.id)

      if (usageCount > 0) {
        return sendError(res, {
          statusCode: 409,
          message:
            'Cannot change rate percentage for a tax rate that is already used in invoices. Create a new tax rate instead.',
        })
      }
    }

    await sequelize.transaction(async transaction => {
      await taxRate.update(
        {
          name:
            req.body.name === null || req.body.name === undefined
              ? taxRate.name
              : String(req.body.name).trim(),
          rate_percentage: requestedRatePercentage,
          tax_type:
            req.body.tax_type === null || req.body.tax_type === undefined
              ? taxRate.tax_type
              : normalizeTaxType(req.body.tax_type),
          description:
            req.body.description === undefined
              ? taxRate.description
              : normalizeOptionalString(req.body.description),
          is_default:
            req.body.is_default === undefined
              ? taxRate.is_default
              : Boolean(req.body.is_default),
          is_active:
            req.body.is_active === undefined
              ? taxRate.is_active
              : Boolean(req.body.is_active),
        },
        { transaction }
      )
    })

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'TAX_RATE_UPDATED',
      entity_type: 'TaxRate',
      entity_id: taxRate.id,
      old_values: oldValues,
      new_values: serializeTaxRate(taxRate),
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: serializeTaxRate(taxRate),
      message: 'Tax rate updated successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function deleteTaxRate(req, res, next) {
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
    const taxRate = await findScopedTaxRate(user.company_id, req.params.id)

    if (!taxRate) {
      return sendError(res, {
        statusCode: 404,
        message: 'Tax rate not found',
      })
    }

    const usageCount = await countTaxRateUsage(taxRate.id)

    if (usageCount > 0) {
      return sendError(res, {
        statusCode: 409,
        message:
          'Cannot delete tax rate because it is used in existing invoices. Mark it inactive instead.',
      })
    }

    const oldValues = serializeTaxRate(taxRate)

    await taxRate.update({
      is_active: false,
      is_default: false,
    })

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'TAX_RATE_DELETED',
      entity_type: 'TaxRate',
      entity_id: taxRate.id,
      old_values: oldValues,
      new_values: serializeTaxRate(taxRate),
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: {
        id: taxRate.id,
        deleted: true,
      },
      message: 'Tax rate deleted successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function previewTaxCalculation(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  try {
    const calculation = await calculateInvoiceAmounts({
      companyId: req.user.company_id,
      clientId: req.body.client_id || null,
      items: req.body.items,
      discount_type: req.body.discount_type,
      discount_value: req.body.discount_value,
      issue_date: req.body.issue_date || null,
    })

    return sendSuccess(res, {
      data: {
        items: calculation.items,
        subtotal: calculation.subtotal,
        discount_amount: calculation.discount_amount,
        tax_breakdown: calculation.tax_breakdown,
        total_tax: calculation.total_tax,
        grand_total: calculation.grand_total,
      },
      message: 'Tax preview calculated successfully',
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

module.exports = {
  listTaxRates,
  createTaxRate,
  updateTaxRate,
  deleteTaxRate,
  previewTaxCalculation,
}
