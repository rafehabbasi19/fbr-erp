'use strict'

const jwt = require('jsonwebtoken')
const request = require('supertest')

jest.mock('../models', () => ({
  User: {
    findByPk: jest.fn(),
  },
  AccessTokenBlacklist: {
    findOne: jest.fn(),
  },
  Invoice: {
    count: jest.fn(),
    sum: jest.fn(),
  },
  Payment: {
    sum: jest.fn(),
  },
  FbrSubmission: {
    count: jest.fn(),
  },
}))

const app = require('../app')
const {
  User,
  AccessTokenBlacklist,
  Invoice,
  Payment,
  FbrSubmission,
} = require('../models')

function buildAccessToken(payloadOverrides = {}) {
  return jwt.sign(
    {
      sub: '24d3fef8-5a2c-44ca-87f2-4f9544fec111',
      company_id: 'd8d85d5a-e53c-4727-a3f2-b4f2f6a3f111',
      role: 'seller',
      ...payloadOverrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )
}

describe('Dashboard summary API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.JWT_SECRET = 'dashboard_test_secret'

    AccessTokenBlacklist.findOne.mockResolvedValue(null)
    User.findByPk.mockResolvedValue({
      id: '24d3fef8-5a2c-44ca-87f2-4f9544fec111',
      company_id: 'd8d85d5a-e53c-4727-a3f2-b4f2f6a3f111',
      role: 'seller',
      is_active: true,
      password_changed_at: null,
    })

    Invoice.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)

    Payment.sum
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(3500)

    Invoice.sum.mockResolvedValueOnce(8000)
    FbrSubmission.count.mockResolvedValueOnce(2)
  })

  it('GET /api/v1/dashboard/summary requires authentication', async () => {
    const res = await request(app).get('/api/v1/dashboard/summary')

    expect(res.statusCode).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('GET /api/v1/dashboard/summary returns scoped seller metrics', async () => {
    const token = buildAccessToken()

    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.total_invoices).toBe(10)
    expect(res.body.data.draft_invoices).toBe(2)
    expect(res.body.data.pending_invoices).toBe(3)
    expect(res.body.data.paid_invoices).toBe(4)
    expect(res.body.data.overdue_invoices).toBe(1)
    expect(res.body.data.revenue_this_month).toBe(1000)
    expect(res.body.data.revenue_this_year).toBe(5000)
    expect(res.body.data.outstanding_amount).toBe(4500)
    expect(res.body.data.fbr_pending_submissions).toBe(2)

    const sellerWhereChecks = Invoice.count.mock.calls.map(call => call[0].where)
    sellerWhereChecks.forEach(where => {
      expect(where.company_id).toBe('d8d85d5a-e53c-4727-a3f2-b4f2f6a3f111')
      expect(where.created_by).toBe('24d3fef8-5a2c-44ca-87f2-4f9544fec111')
    })

    const paymentIncludeWhere = Payment.sum.mock.calls[0][1].include[0].where
    expect(paymentIncludeWhere.company_id).toBe('d8d85d5a-e53c-4727-a3f2-b4f2f6a3f111')
    expect(paymentIncludeWhere.created_by).toBe('24d3fef8-5a2c-44ca-87f2-4f9544fec111')
  })

  it('GET /api/v1/dashboard/summary denies roles without view_reports permission', async () => {
    User.findByPk.mockResolvedValueOnce({
      id: '24d3fef8-5a2c-44ca-87f2-4f9544fec111',
      company_id: 'd8d85d5a-e53c-4727-a3f2-b4f2f6a3f111',
      role: 'unknown_role',
      is_active: true,
      password_changed_at: null,
    })

    const token = buildAccessToken({ role: 'unknown_role' })

    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(403)
    expect(res.body.success).toBe(false)
  })
})
