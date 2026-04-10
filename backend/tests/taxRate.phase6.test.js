'use strict'

const jwt = require('jsonwebtoken')
const request = require('supertest')

jest.mock('../models', () => ({
  sequelize: {
    transaction: jest.fn(),
  },
  User: {
    findByPk: jest.fn(),
  },
  AccessTokenBlacklist: {
    findOne: jest.fn(),
  },
  TaxRate: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  TaxExemption: {
    findOne: jest.fn(),
  },
  InvoiceItem: {
    count: jest.fn(),
  },
}))

jest.mock('../utils/auditLogger', () => ({
  log: jest.fn().mockResolvedValue(),
}))

const app = require('../app')
const {
  sequelize,
  User,
  AccessTokenBlacklist,
  TaxRate,
  TaxExemption,
  InvoiceItem,
} = require('../models')

function buildAccessToken(payloadOverrides = {}) {
  return jwt.sign(
    {
      sub: '6a6fcb65-6ebf-4f0a-8614-1bf2e7fb8111',
      company_id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
      role: 'company_admin',
      ...payloadOverrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )
}

describe('Tax Rates Phase 6 APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.JWT_SECRET = 'tax_rates_phase6_test_secret'

    AccessTokenBlacklist.findOne.mockResolvedValue(null)
    User.findByPk.mockResolvedValue({
      id: '6a6fcb65-6ebf-4f0a-8614-1bf2e7fb8111',
      company_id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
      role: 'company_admin',
      is_active: true,
      password_changed_at: null,
    })

    sequelize.transaction.mockImplementation(async callback => callback({}))
    InvoiceItem.count.mockResolvedValue(0)
    TaxExemption.findOne.mockResolvedValue(null)
  })

  it('GET /api/v1/tax-rates returns company tax rates', async () => {
    TaxRate.findAll.mockResolvedValue([
      {
        id: 'tax-1',
        company_id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
        name: 'Standard GST 17%',
        rate_percentage: '17.00',
        tax_type: 'GST',
        description: null,
        is_default: true,
        is_active: true,
        created_at: '2026-04-10T10:00:00.000Z',
        updated_at: '2026-04-10T10:00:00.000Z',
        toJSON() {
          return this
        },
      },
    ])

    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/tax-rates')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({
      name: 'Standard GST 17%',
      rate_percentage: 17,
      tax_type: 'GST',
    })
  })

  it('POST /api/v1/tax-rates/preview supports multi-rate tax breakdown', async () => {
    TaxRate.findAll.mockResolvedValue([
      {
        id: '8fdcbfab-2fd0-4a11-b9d4-f2f8d6f8f117',
        name: 'GST 17%',
        rate_percentage: '17.00',
        tax_type: 'GST',
      },
      {
        id: '50d71f3f-7ee6-4eb7-a7ff-774ecf0f5003',
        name: 'WHT 3%',
        rate_percentage: '3.00',
        tax_type: 'WHT',
      },
    ])

    const token = buildAccessToken()
    const res = await request(app)
      .post('/api/v1/tax-rates/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: '9f93389e-0e5c-4137-b3b4-cad603f89da4',
        discount_type: 'fixed',
        discount_value: 0,
        items: [
          {
            description: 'GST line',
            quantity: 1,
            unit_price: 80000,
            tax_rate_id: '8fdcbfab-2fd0-4a11-b9d4-f2f8d6f8f117',
          },
          {
            description: 'WHT line',
            quantity: 1,
            unit_price: 20000,
            tax_rate_id: '50d71f3f-7ee6-4eb7-a7ff-774ecf0f5003',
          },
        ],
      })

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.tax_breakdown).toHaveLength(2)
    expect(res.body.data.subtotal).toBe(100000)
    expect(res.body.data.total_tax).toBe(14200)
    expect(res.body.data.grand_total).toBe(114200)
  })

  it('POST /api/v1/tax-rates/preview applies client exemption and tax-inclusive pricing', async () => {
    TaxRate.findAll.mockResolvedValue([
      {
        id: '8fdcbfab-2fd0-4a11-b9d4-f2f8d6f8f117',
        name: 'GST 17%',
        rate_percentage: '17.00',
        tax_type: 'GST',
      },
    ])

    TaxExemption.findOne.mockResolvedValue({
      id: 'ex-1',
      exemption_type: 'full',
      certificate_number: 'CERT-42',
      valid_from: '2026-01-01',
      valid_until: null,
    })

    const token = buildAccessToken()
    const res = await request(app)
      .post('/api/v1/tax-rates/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: 'bb1da887-2965-49f7-b01c-fbe3f329975c',
        discount_type: 'fixed',
        discount_value: 0,
        items: [
          {
            description: 'Inclusive line',
            quantity: 1,
            unit_price: 1170,
            tax_rate_id: '8fdcbfab-2fd0-4a11-b9d4-f2f8d6f8f117',
            price_includes_tax: true,
          },
        ],
      })

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.total_tax).toBe(0)
    expect(res.body.data.grand_total).toBe(1170)
  })
})
