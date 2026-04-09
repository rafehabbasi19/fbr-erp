'use strict'

const { TaxRate } = require('../models')

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function roundCurrency(value) {
  return Number(toNumber(value).toFixed(2))
}

function buildValidationError(errors, fallbackMessage = 'Validation failed') {
  const error = new Error(fallbackMessage)
  error.statusCode = 422
  error.errors = errors
  return error
}

function normalizeDiscountType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized !== 'percentage' && normalized !== 'fixed') {
    return null
  }

  return normalized
}

function normalizeInvoiceItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw buildValidationError([{ field: 'items', message: 'At least one invoice item is required' }])
  }

  return items.map((item, index) => ({
    index,
    description: String(item.description || item.product_name || '').trim(),
    quantity: toNumber(item.quantity),
    unit: item.unit ? String(item.unit).trim() || null : null,
    unit_price: toNumber(item.unit_price),
    tax_rate_id: item.tax_rate_id || null,
    tax_rate_percentage:
      item.tax_rate_percentage !== undefined && item.tax_rate_percentage !== null
        ? toNumber(item.tax_rate_percentage)
        : null,
    sort_order: Number.isInteger(item.sort_order)
      ? item.sort_order
      : Number.parseInt(String(item.sort_order || `${index}`), 10),
  }))
}

function validateNormalizedItems(items) {
  const errors = []

  items.forEach(item => {
    const itemLabel = `items[${item.index}]`

    if (!item.description) {
      errors.push({
        field: `${itemLabel}.description`,
        message: 'Description is required',
      })
    } else if (item.description.length > 500) {
      errors.push({
        field: `${itemLabel}.description`,
        message: 'Description must not exceed 500 characters',
      })
    }

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      errors.push({
        field: `${itemLabel}.quantity`,
        message: 'Quantity must be greater than 0',
      })
    }

    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) {
      errors.push({
        field: `${itemLabel}.unit_price`,
        message: 'Unit price must be a non-negative number',
      })
    }

    if (
      item.tax_rate_percentage !== null &&
      (!Number.isFinite(item.tax_rate_percentage) || item.tax_rate_percentage < 0 || item.tax_rate_percentage > 100)
    ) {
      errors.push({
        field: `${itemLabel}.tax_rate_percentage`,
        message: 'Tax rate percentage must be between 0 and 100',
      })
    }

    if (!Number.isInteger(item.sort_order) || item.sort_order < 0) {
      errors.push({
        field: `${itemLabel}.sort_order`,
        message: 'Sort order must be a non-negative integer',
      })
    }
  })

  if (errors.length > 0) {
    throw buildValidationError(errors)
  }
}

async function loadTaxRateMap(companyId, taxRateIds) {
  if (taxRateIds.length === 0) {
    return new Map()
  }

  const taxRates = await TaxRate.findAll({
    where: {
      company_id: companyId,
      id: taxRateIds,
      is_active: true,
    },
    attributes: ['id', 'rate'],
  })

  return new Map(taxRates.map(taxRate => [taxRate.id, Number(taxRate.rate)]))
}

async function calculateInvoiceAmounts({ companyId, items, discount_type, discount_value }) {
  const normalizedItems = normalizeInvoiceItems(items)
  validateNormalizedItems(normalizedItems)

  const normalizedDiscountType = normalizeDiscountType(discount_type)
  const parsedDiscountValue = toNumber(discount_value)
  const discountValue = Number.isFinite(parsedDiscountValue) ? parsedDiscountValue : Number.NaN

  if (normalizedDiscountType && (!Number.isFinite(discountValue) || discountValue < 0)) {
    throw buildValidationError([
      {
        field: 'discount_value',
        message: 'Discount value must be a non-negative number',
      },
    ])
  }

  if (normalizedDiscountType === 'percentage' && discountValue > 100) {
    throw buildValidationError([
      {
        field: 'discount_value',
        message: 'Percentage discount cannot exceed 100',
      },
    ])
  }

  const taxRateIds = [...new Set(normalizedItems.map(item => item.tax_rate_id).filter(Boolean))]
  const taxRateMap = await loadTaxRateMap(companyId, taxRateIds)

  const taxRateErrors = []
  taxRateIds.forEach(taxRateId => {
    if (!taxRateMap.has(taxRateId)) {
      taxRateErrors.push({
        field: 'items.tax_rate_id',
        message: `Tax rate (${taxRateId}) is invalid or inactive for this company`,
      })
    }
  })

  if (taxRateErrors.length > 0) {
    throw buildValidationError(taxRateErrors)
  }

  let subtotal = 0
  let taxAmount = 0

  const calculatedItems = normalizedItems.map(item => {
    const effectiveTaxRate =
      item.tax_rate_percentage !== null
        ? item.tax_rate_percentage
        : item.tax_rate_id
          ? taxRateMap.get(item.tax_rate_id)
          : 0

    const lineSubTotal = roundCurrency(item.quantity * item.unit_price)
    const lineTaxAmount = roundCurrency(lineSubTotal * (effectiveTaxRate / 100))
    const lineTotal = roundCurrency(lineSubTotal + lineTaxAmount)

    subtotal = roundCurrency(subtotal + lineSubTotal)
    taxAmount = roundCurrency(taxAmount + lineTaxAmount)

    return {
      sort_order: item.sort_order,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      tax_rate_id: item.tax_rate_id,
      tax_rate_percentage: roundCurrency(effectiveTaxRate),
      tax_amount: lineTaxAmount,
      line_total: lineTotal,
      product_name: item.description,
      hsn_code: null,
      discount: 0,
      tax_rate: roundCurrency(effectiveTaxRate),
      total_price: lineTotal,
    }
  })

  const safeDiscountValue = normalizedDiscountType ? roundCurrency(discountValue) : 0
  const discountAmount =
    normalizedDiscountType === 'percentage'
      ? roundCurrency((subtotal * safeDiscountValue) / 100)
      : normalizedDiscountType === 'fixed'
        ? roundCurrency(Math.min(safeDiscountValue, subtotal))
        : 0

  const total = roundCurrency(subtotal - discountAmount + taxAmount)

  if (total <= 0) {
    throw buildValidationError([
      {
        field: 'total',
        message: 'Invoice total must be greater than 0',
      },
    ])
  }

  return {
    items: calculatedItems,
    subtotal,
    discount_type: normalizedDiscountType,
    discount_value: safeDiscountValue,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    total,
  }
}

module.exports = {
  calculateInvoiceAmounts,
}
