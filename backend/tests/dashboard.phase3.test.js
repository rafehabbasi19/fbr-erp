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
    findAll: jest.fn(),
  },
  Payment: {
    sum: jest.fn(),
    findAll: jest.fn(),
  },
  FbrSubmission: {
    count: jest.fn(),
  },
  Client: {
    findAll: jest.fn(),
  },
  AuditLog: {
    findAll: jest.fn(),
  },
}))

const app = require('../app')
const {
  User,
  AccessTokenBlacklist,
  Invoice,
  Payment,
  FbrSubmission,
  Client,
  AuditLog,
} = require('../models')
const { clearDashboardSummaryCache } = require('../services/dashboardCacheService')

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

describe('Dashboard phase 3 APIs', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    process.env.JWT_SECRET = 'dashboard_phase3_test_secret'
    await clearDashboardSummaryCache()

    AccessTokenBlacklist.findOne.mockResolvedValue(null)
    User.findByPk.mockResolvedValue({
      id: '24d3fef8-5a2c-44ca-87f2-4f9544fec111',
      company_id: 'd8d85d5a-e53c-4727-a3f2-b4f2f6a3f111',
      role: 'seller',
      is_active: true,
      password_changed_at: null,
    })
  })

  it('GET /api/v1/dashboard/revenue-chart requires authentication', async () => {
    const res = await request(app).get('/api/v1/dashboard/revenue-chart?period=monthly&year=2026')

    expect(res.statusCode).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('GET /api/v1/dashboard/revenue-chart returns monthly buckets with scoped data', async () => {
    Invoice.findAll.mockResolvedValue([
      { bucket_key: '2026-01', revenue: '3000.00', invoice_count: '2' },
      { bucket_key: '2026-02', revenue: '3500.50', invoice_count: '1' },
    ])

    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-chart?period=monthly&year=2026')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(12)

    const jan = res.body.data.find(item => item.label === 'Jan 2026')
    const feb = res.body.data.find(item => item.label === 'Feb 2026')

    expect(jan).toBeDefined()
    expect(jan.revenue).toBe(3000)
    expect(jan.invoice_count).toBe(2)

    expect(feb).toBeDefined()
    expect(feb.revenue).toBe(3500.5)
    expect(feb.invoice_count).toBe(1)

    const revenueWhere = Invoice.findAll.mock.calls[0][0].where
    expect(revenueWhere.company_id).toBe('d8d85d5a-e53c-4727-a3f2-b4f2f6a3f111')
    expect(revenueWhere.created_by).toBe('24d3fef8-5a2c-44ca-87f2-4f9544fec111')
  })

  it('GET /api/v1/dashboard/revenue-chart validates weekly month input', async () => {
    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-chart?period=weekly&month=2026-13')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it('GET /api/v1/dashboard/top-clients returns top 5 clients by billed amount', async () => {
    Invoice.findAll.mockResolvedValue([
      { client_id: 'client-1', total_billed: '7000.00' },
      { client_id: 'client-2', total_billed: '3000.00' },
      { client_id: 'client-3', total_billed: '1000.00' },
    ])
    Payment.findAll.mockResolvedValue([
      { client_id: 'client-1', total_paid: '2000.00' },
      { client_id: 'client-2', total_paid: '3000.00' },
    ])
    Client.findAll.mockResolvedValue([
      { id: 'client-1', name: 'Alpha Traders' },
      { id: 'client-2', name: 'Beta Retail' },
      { id: 'client-3', name: 'Gamma Foods' },
    ])

    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/dashboard/top-clients')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(3)
    expect(res.body.data[0]).toMatchObject({
      client_id: 'client-1',
      client_name: 'Alpha Traders',
      total_billed: 7000,
      total_paid: 2000,
    })
  })

  it('GET /api/v1/dashboard/recent-activity returns latest company activity for seller scope', async () => {
    AuditLog.findAll.mockResolvedValue([
      {
        id: 'log-1',
        action: 'invoice.created',
        entity_type: 'Invoice',
        entity_id: 'inv-1',
        created_at: '2026-04-09T08:00:00.000Z',
        user: { id: 'user-1', name: 'Zain' },
      },
      {
        id: 'log-2',
        action: 'payment.recorded',
        entity_type: 'Payment',
        entity_id: 'pay-1',
        created_at: '2026-04-09T09:00:00.000Z',
        user: null,
      },
    ])

    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/dashboard/recent-activity')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data[0]).toMatchObject({
      id: 'log-1',
      action: 'invoice.created',
      label: 'Invoice Created',
      actor_name: 'Zain',
    })

    const activityWhere = AuditLog.findAll.mock.calls[0][0].where
    expect(activityWhere.company_id).toBe('d8d85d5a-e53c-4727-a3f2-b4f2f6a3f111')
    expect(activityWhere.user_id).toBe('24d3fef8-5a2c-44ca-87f2-4f9544fec111')
  })

  it('GET /api/v1/dashboard/recent-invoices returns latest 10 invoices with client names', async () => {
    Invoice.findAll.mockResolvedValue([
      {
        id: 'inv-1',
        invoice_number: 'INV-2026-0001',
        invoice_date: '2026-04-08',
        total_amount: '12500.25',
        status: 'submitted',
        payment_status: 'partial',
        fbr_status: 'pending',
        client: { id: 'client-1', name: 'Alpha Traders' },
      },
    ])

    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/dashboard/recent-invoices')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data[0]).toMatchObject({
      invoice_number: 'INV-2026-0001',
      client_name: 'Alpha Traders',
      amount: 12500.25,
      payment_status: 'partial',
    })
  })

  it('GET /api/v1/dashboard/fbr-status returns submitted, pending, and rejected counts', async () => {
    FbrSubmission.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)

    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/dashboard/fbr-status')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual({
      submitted_today: 4,
      pending_submissions: 2,
      rejected_submissions: 1,
    })

    const includeWhere = FbrSubmission.count.mock.calls[0][0].include[0].where
    expect(includeWhere.company_id).toBe('d8d85d5a-e53c-4727-a3f2-b4f2f6a3f111')
    expect(includeWhere.created_by).toBe('24d3fef8-5a2c-44ca-87f2-4f9544fec111')
  })
})
