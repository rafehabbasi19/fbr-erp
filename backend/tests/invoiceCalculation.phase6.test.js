'use strict'

jest.mock('../models', () => ({
  TaxRate: {
    findAll: jest.fn(),
  },
  TaxExemption: {
    findOne: jest.fn(),
  },
}))

const { TaxRate, TaxExemption } = require('../models')
const { calculateInvoiceAmounts } = require('../services/invoiceCalculationService')

describe('invoiceCalculationService Phase 6', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    TaxExemption.findOne.mockResolvedValue(null)
  })

  it('calculates multiple tax rates with discount and breakdown', async () => {
    TaxRate.findAll.mockResolvedValue([
      {
        id: 'tax-17',
        name: 'GST 17%',
        rate_percentage: '17.00',
        tax_type: 'GST',
      },
      {
        id: 'tax-3',
        name: 'WHT 3%',
        rate_percentage: '3.00',
        tax_type: 'WHT',
      },
    ])

    const result = await calculateInvoiceAmounts({
      companyId: 'company-1',
      clientId: 'client-1',
      discount_type: 'fixed',
      discount_value: 0,
      items: [
        {
          description: 'Line 1',
          quantity: 1,
          unit_price: 80000,
          tax_rate_id: 'tax-17',
        },
        {
          description: 'Line 2',
          quantity: 1,
          unit_price: 20000,
          tax_rate_id: 'tax-3',
        },
      ],
    })

    expect(result.subtotal).toBe(100000)
    expect(result.total_tax).toBe(14200)
    expect(result.grand_total).toBe(114200)
    expect(result.tax_breakdown).toHaveLength(2)
    expect(result.tax_breakdown[0]).toMatchObject({
      rate: 17,
      taxable_amount: 80000,
      tax_amount: 13600,
    })
    expect(result.tax_breakdown[1]).toMatchObject({
      rate: 3,
      taxable_amount: 20000,
      tax_amount: 600,
    })
  })

  it('supports price_includes_tax mode', async () => {
    TaxRate.findAll.mockResolvedValue([
      {
        id: 'tax-17',
        name: 'GST 17%',
        rate_percentage: '17.00',
        tax_type: 'GST',
      },
    ])

    const result = await calculateInvoiceAmounts({
      companyId: 'company-1',
      clientId: 'client-1',
      discount_type: null,
      discount_value: 0,
      items: [
        {
          description: 'Inclusive',
          quantity: 1,
          unit_price: 1170,
          tax_rate_id: 'tax-17',
          price_includes_tax: true,
        },
      ],
    })

    expect(result.subtotal).toBe(1000)
    expect(result.total_tax).toBe(170)
    expect(result.grand_total).toBe(1170)
  })

  it('overrides tax with active client exemption', async () => {
    TaxRate.findAll.mockResolvedValue([
      {
        id: 'tax-17',
        name: 'GST 17%',
        rate_percentage: '17.00',
        tax_type: 'GST',
      },
    ])

    TaxExemption.findOne.mockResolvedValue({
      id: 'ex-1',
      exemption_type: 'full',
      certificate_number: 'EXEMPT-1',
      valid_from: '2026-01-01',
      valid_until: null,
    })

    const result = await calculateInvoiceAmounts({
      companyId: 'company-1',
      clientId: 'client-1',
      discount_type: null,
      discount_value: 0,
      issue_date: '2026-04-10',
      items: [
        {
          description: 'Exempt line',
          quantity: 1,
          unit_price: 1000,
          tax_rate_id: 'tax-17',
        },
      ],
    })

    expect(result.is_client_tax_exempt).toBe(true)
    expect(result.total_tax).toBe(0)
    expect(result.grand_total).toBe(1000)
  })
})
