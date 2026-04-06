'use strict'

/**
 * Tax Calculation Utility
 *
 * Formula per item:
 *   item_net   = (quantity × unit_price) - item_discount
 *   item_tax   = item_net × (tax_rate / 100)
 *   item_total = item_net + item_tax
 *
 * Invoice totals:
 *   subtotal        = sum(item_net)
 *   invoice_tax     = sum(item_tax)
 *   invoice_total   = subtotal - invoice_level_discount + invoice_tax
 *
 * All monetary values rounded to 2 decimal places.
 */

/**
 * @param {number} value
 * @returns {number}
 */
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Calculate totals for a single invoice.
 *
 * @param {Array<{quantity: number, unit_price: number, discount?: number, tax_rate?: number}>} items
 * @param {number} invoiceDiscount  Invoice-level discount amount (applied after subtotal)
 * @returns {{
 *   items: Array,
 *   subtotal: number,
 *   invoice_discount: number,
 *   tax_amount: number,
 *   total_amount: number
 * }}
 */
function calculateInvoiceTotals(items, invoiceDiscount = 0) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Invoice must have at least one item')
  }

  let subtotal = 0
  let totalTax = 0

  const calculatedItems = items.map((item, idx) => {
    const quantity = parseFloat(item.quantity) || 0
    const unitPrice = parseFloat(item.unit_price) || 0
    const itemDiscount = parseFloat(item.discount) || 0
    const taxRate = parseFloat(item.tax_rate) || 0

    if (quantity <= 0) { throw new Error(`Item ${idx + 1}: quantity must be positive`) }
    if (unitPrice < 0) { throw new Error(`Item ${idx + 1}: unit_price must not be negative`) }

    const itemNet = round2(quantity * unitPrice - itemDiscount)
    const itemTax = round2(itemNet * (taxRate / 100))
    const itemTotal = round2(itemNet + itemTax)

    subtotal += itemNet
    totalTax += itemTax

    return {
      ...item,
      tax_amount: itemTax,
      total_price: itemTotal,
    }
  })

  subtotal = round2(subtotal)
  totalTax = round2(totalTax)
  const discount = round2(parseFloat(invoiceDiscount) || 0)
  const totalAmount = round2(subtotal - discount + totalTax)

  return {
    items: calculatedItems,
    subtotal,
    invoice_discount: discount,
    tax_amount: totalTax,
    total_amount: totalAmount,
  }
}

module.exports = { calculateInvoiceTotals, round2 }
