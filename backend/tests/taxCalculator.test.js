'use strict'

const { calculateInvoiceTotals } = require('../utils/taxCalculator')

describe('taxCalculator', () => {
  it('calculates a single item correctly', () => {
    const result = calculateInvoiceTotals([
      { quantity: 2, unit_price: 1000, discount: 0, tax_rate: 17 },
    ], 0)

    expect(result.subtotal).toBe(2000)
    expect(result.tax_amount).toBe(340)
    expect(result.total_amount).toBe(2340)
  })

  it('applies item-level discount before tax', () => {
    const result = calculateInvoiceTotals([
      { quantity: 1, unit_price: 1000, discount: 100, tax_rate: 17 },
    ], 0)

    // net = 1000 - 100 = 900; tax = 900 * 0.17 = 153; total = 1053
    expect(result.subtotal).toBe(900)
    expect(result.tax_amount).toBe(153)
    expect(result.total_amount).toBe(1053)
  })

  it('applies invoice-level discount after subtotal', () => {
    const result = calculateInvoiceTotals([
      { quantity: 1, unit_price: 1000, discount: 0, tax_rate: 17 },
    ], 200)

    // subtotal=1000, tax=170, total = 1000 - 200 + 170 = 970
    expect(result.total_amount).toBe(970)
    expect(result.invoice_discount).toBe(200)
  })

  it('handles multiple items with different tax rates', () => {
    const result = calculateInvoiceTotals([
      { quantity: 1, unit_price: 1000, discount: 0, tax_rate: 17 },
      { quantity: 1, unit_price: 500, discount: 0, tax_rate: 0 },
    ], 0)

    expect(result.subtotal).toBe(1500)
    expect(result.tax_amount).toBe(170)
    expect(result.total_amount).toBe(1670)
  })

  it('throws on empty items array', () => {
    expect(() => calculateInvoiceTotals([])).toThrow()
  })
})
