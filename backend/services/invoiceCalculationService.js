'use strict'

const { Op } = require('sequelize')

const { TaxRate, TaxExemption } = require('../models')

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function roundBankers(value, decimals = 2) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return 0
  }

  const factor = 10 ** decimals
  const scaled = numeric * factor
  const sign = scaled < 0 ? -1 : 1
  const absolute = Math.abs(scaled)
  const floorValue = Math.floor(absolute)
  const diff = absolute - floorValue
  const epsilon = 1e-8

  let roundedInteger = 0

  if (Math.abs(diff - 0.5) <= epsilon) {
    roundedInteger = floorValue % 2 === 0 ? floorValue : floorValue + 1
  } else {
    roundedInteger = Math.round(absolute)
  }

  return sign * (roundedInteger / factor)
}

function roundCurrency(value) {
  return roundBankers(toNumber(value), 2)
}

function roundQuantity(value) {
  return roundBankers(toNumber(value), 3)
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
    return 'invalid'
  }

  return normalized
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value === 1
  }

  const normalized = String(value || '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
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
    price_includes_tax: toBoolean(item.price_includes_tax),
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
    attributes: ['id', 'name', 'rate_percentage', 'tax_type'],
  })

  return new Map(
    taxRates.map(taxRate => [
      taxRate.id,
      {
        id: taxRate.id,
        name: taxRate.name,
        rate_percentage: Number(taxRate.rate_percentage),
        tax_type: taxRate.tax_type,
      },
    ])
  )
}

async function findActiveClientExemption({ companyId, clientId, effectiveDate }) {
  if (!clientId) {
    return null
  }

  // Keep calculation backward-compatible when exemption model is not loaded (e.g. narrow test mocks).
  if (!TaxExemption || typeof TaxExemption.findOne !== 'function') {
    return null
  }

  const dateKey = String(effectiveDate || '').trim() || new Date().toISOString().slice(0, 10)

  return TaxExemption.findOne({
    where: {
      company_id: companyId,
      client_id: clientId,
      valid_from: {
        [Op.lte]: dateKey,
      },
      [Op.or]: [{ valid_until: null }, { valid_until: { [Op.gte]: dateKey } }],
    },
    order: [['valid_from', 'DESC'], ['created_at', 'DESC']],
  })
}

function buildTaxBreakdownRows(lines) {
  const buckets = new Map()

  lines.forEach(line => {
    const rateLabel = roundCurrency(line.effective_tax_rate).toFixed(2)
    const bucketKey = `${line.tax_type}|${line.tax_rate_name}|${rateLabel}`

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        name: line.tax_rate_name,
        rate: roundCurrency(line.effective_tax_rate),
        tax_type: line.tax_type,
        taxable_amount: 0,
        tax_amount: 0,
      })
    }

    const bucket = buckets.get(bucketKey)
    bucket.taxable_amount = roundCurrency(bucket.taxable_amount + line.taxable_amount)
    bucket.tax_amount = roundCurrency(bucket.tax_amount + line.tax_amount)
  })

  return Array.from(buckets.values()).sort((left, right) => {
    if (right.rate !== left.rate) {
      return right.rate - left.rate
    }

    return String(left.name || '').localeCompare(String(right.name || ''))
  })
}

async function calculateInvoiceAmounts({
  companyId,
  clientId = null,
  items,
  discount_type,
  discount_value,
  issue_date = null,
}) {
  const normalizedItems = normalizeInvoiceItems(items)
  validateNormalizedItems(normalizedItems)

  const normalizedDiscountType = normalizeDiscountType(discount_type)

  if (normalizedDiscountType === 'invalid') {
    throw buildValidationError([
      {
        field: 'discount_type',
        message: 'Discount type must be either percentage or fixed',
      },
    ])
  }

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

  const activeExemption = await findActiveClientExemption({
    companyId,
    clientId,
    effectiveDate: issue_date,
  })
  const isClientTaxExempt = Boolean(activeExemption)

  const preDiscountLines = normalizedItems.map(item => {
    const taxRateRecord = item.tax_rate_id ? taxRateMap.get(item.tax_rate_id) : null
    const fallbackTaxRate = item.tax_rate_percentage !== null ? item.tax_rate_percentage : 0

    let effectiveTaxRate = taxRateRecord ? taxRateRecord.rate_percentage : fallbackTaxRate
    let taxRateName = taxRateRecord ? taxRateRecord.name : `Tax ${roundCurrency(effectiveTaxRate).toFixed(2)}%`
    let taxType = taxRateRecord ? taxRateRecord.tax_type : 'GST'

    if (isClientTaxExempt) {
      effectiveTaxRate = 0
      taxRateName = 'Exempt (Client)'
      taxType = 'Exempt'
    }

    const quantity = roundQuantity(item.quantity)
    const unitPrice = roundCurrency(item.unit_price)
    const listedAmount = roundCurrency(quantity * unitPrice)

    const taxableBaseBeforeDiscount =
      item.price_includes_tax && effectiveTaxRate > 0
        ? roundCurrency(listedAmount / (1 + effectiveTaxRate / 100))
        : listedAmount

    return {
      ...item,
      quantity,
      unit_price: unitPrice,
      listed_amount: listedAmount,
      taxable_base_before_discount: taxableBaseBeforeDiscount,
      effective_tax_rate: roundCurrency(effectiveTaxRate),
      tax_rate_name: taxRateName,
      tax_type: taxType,
    }
  })

  const subtotal = roundCurrency(
    preDiscountLines.reduce((sum, line) => sum + line.taxable_base_before_discount, 0)
  )

  const safeDiscountValue = normalizedDiscountType ? roundCurrency(discountValue) : 0
  const requestedDiscountAmount =
    normalizedDiscountType === 'percentage'
      ? roundCurrency((subtotal * safeDiscountValue) / 100)
      : normalizedDiscountType === 'fixed'
        ? roundCurrency(Math.min(safeDiscountValue, subtotal))
        : 0

  let allocatedDiscount = 0

  const discountedLines = preDiscountLines.map((line, index) => {
    let lineDiscount = 0

    if (requestedDiscountAmount > 0 && subtotal > 0) {
      if (index === preDiscountLines.length - 1) {
        lineDiscount = roundCurrency(requestedDiscountAmount - allocatedDiscount)
      } else {
        lineDiscount = roundCurrency(
          (requestedDiscountAmount * line.taxable_base_before_discount) / subtotal
        )
      }
    }

    lineDiscount = roundCurrency(
      Math.min(Math.max(lineDiscount, 0), line.taxable_base_before_discount)
    )
    allocatedDiscount = roundCurrency(allocatedDiscount + lineDiscount)

    const taxableAmount = roundCurrency(
      Math.max(0, line.taxable_base_before_discount - lineDiscount)
    )
    const lineTaxAmount = roundCurrency(
      taxableAmount * (line.effective_tax_rate / 100)
    )
    const lineTotal = roundCurrency(taxableAmount + lineTaxAmount)

    return {
      ...line,
      line_discount: lineDiscount,
      taxable_amount: taxableAmount,
      tax_amount: lineTaxAmount,
      line_total: lineTotal,
    }
  })

  const discountAmount = roundCurrency(
    discountedLines.reduce((sum, line) => sum + line.line_discount, 0)
  )
  const totalTax = roundCurrency(
    discountedLines.reduce((sum, line) => sum + line.tax_amount, 0)
  )
  const grandTotal = roundCurrency(subtotal - discountAmount + totalTax)

  if (grandTotal <= 0) {
    throw buildValidationError([
      {
        field: 'grand_total',
        message: 'Invoice total must be greater than 0',
      },
    ])
  }

  const taxBreakdown = buildTaxBreakdownRows(discountedLines)

  const calculatedItems = discountedLines.map(line => ({
    sort_order: line.sort_order,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unit_price: line.unit_price,
    tax_rate_id: line.tax_rate_id,
    tax_rate_percentage: roundCurrency(line.effective_tax_rate),
    tax_amount: line.tax_amount,
    line_total: line.line_total,
    tax_rate_name: line.tax_rate_name,
    tax_type: line.tax_type,
    taxable_amount: line.taxable_amount,
    price_includes_tax: line.price_includes_tax,
    product_name: line.description,
    hsn_code: null,
    discount: line.line_discount,
    tax_rate: roundCurrency(line.effective_tax_rate),
    total_price: line.line_total,
  }))

  return {
    items: calculatedItems,
    subtotal,
    discount_type: normalizedDiscountType,
    discount_value: safeDiscountValue,
    discount_amount: discountAmount,
    tax_breakdown: taxBreakdown,
    total_tax: totalTax,
    grand_total: grandTotal,
    is_client_tax_exempt: isClientTaxExempt,
    applied_exemption: activeExemption
      ? {
          id: activeExemption.id,
          exemption_type: activeExemption.exemption_type,
          certificate_number: activeExemption.certificate_number,
          valid_from: activeExemption.valid_from,
          valid_until: activeExemption.valid_until,
        }
      : null,
    // Backward-compatible aliases used by existing invoice flows.
    tax_amount: totalTax,
    total: grandTotal,
  }
}

module.exports = {
  calculateInvoiceAmounts,
  roundBankers,
}
