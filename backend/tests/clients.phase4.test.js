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
  Client: {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
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
}))

jest.mock('../utils/auditLogger', () => ({
  log: jest.fn().mockResolvedValue(),
}))

const app = require('../app')
const {
  User,
  AccessTokenBlacklist,
  Client,
  Invoice,
  Payment,
} = require('../models')

function buildAccessToken(payloadOverrides = {}) {
  return jwt.sign(
    {
      sub: '2d4c6f83-b635-4f63-8f4e-6c10d22cf111',
      company_id: '63353e4d-caf3-4f4b-bca3-e8f2ca6d2111',
      role: 'seller',
      ...payloadOverrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )
}

function buildClientRow(overrides = {}) {
  return {
    id: '8c3978e7-c2a9-4af0-b86f-1c8f9243f111',
    company_id: '63353e4d-caf3-4f4b-bca3-e8f2ca6d2111',
    name: 'Alpha Traders',
    client_type: 'business',
    ntn: '1234567',
    cnic: null,
    email: 'alpha@example.com',
    phone: '03001234567',
    status: 'active',
    credit_limit: null,
    update: jest.fn(),
    destroy: jest.fn(),
    toJSON() {
      return {
        id: this.id,
        company_id: this.company_id,
        name: this.name,
        client_type: this.client_type,
        ntn: this.ntn,
        cnic: this.cnic,
        email: this.email,
        phone: this.phone,
        status: this.status,
        credit_limit: this.credit_limit,
      }
    },
    ...overrides,
  }
}

describe('Client Phase 4 APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.JWT_SECRET = 'clients_phase4_test_secret'

    AccessTokenBlacklist.findOne.mockResolvedValue(null)
    User.findByPk.mockResolvedValue({
      id: '2d4c6f83-b635-4f63-8f4e-6c10d22cf111',
      company_id: '63353e4d-caf3-4f4b-bca3-e8f2ca6d2111',
      role: 'seller',
      is_active: true,
      password_changed_at: null,
    })
  })

  it('POST /api/v1/clients validates NTN/CNIC requirement', async () => {
    const token = buildAccessToken()

    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Client A',
        client_type: 'business',
      })

    expect(res.statusCode).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe('Validation failed')
  })

  it('POST /api/v1/clients creates a scoped client', async () => {
    Client.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    Client.create.mockResolvedValue(
      buildClientRow({
        cnic: '3520212345678',
      })
    )

    const token = buildAccessToken()
    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Alpha Traders',
        client_type: 'business',
        ntn: '1234567',
        cnic: '3520212345678',
        email: 'alpha@example.com',
      })

    expect(res.statusCode).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.name).toBe('Alpha Traders')
    expect(Client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: '63353e4d-caf3-4f4b-bca3-e8f2ca6d2111',
        created_by: '2d4c6f83-b635-4f63-8f4e-6c10d22cf111',
      })
    )
  })

  it('GET /api/v1/clients returns paginated clients with totals', async () => {
    Client.findAndCountAll.mockResolvedValue({
      count: 2,
      rows: [
        buildClientRow({ id: 'client-1', name: 'Alpha Traders' }),
        buildClientRow({ id: 'client-2', name: 'Beta Stores', ntn: '7654321' }),
      ],
    })

    Invoice.findAll.mockResolvedValue([
      { client_id: 'client-1', invoice_count: '3', total_invoiced: '5000.00' },
      { client_id: 'client-2', invoice_count: '1', total_invoiced: '1200.00' },
    ])

    Payment.findAll.mockResolvedValue([
      { client_id: 'client-1', total_paid: '1500.00' },
      { client_id: 'client-2', total_paid: '200.00' },
    ])

    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/clients?search=alpha&page=1&per_page=10')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.data[0]).toMatchObject({
      id: 'client-1',
      total_invoices: 3,
      outstanding_balance: 3500,
    })
    expect(res.body.meta).toMatchObject({
      page: 1,
      per_page: 10,
      total: 2,
      total_pages: 1,
    })
  })

  it('GET /api/v1/clients/:id returns client details with invoice summary', async () => {
    Client.findOne.mockResolvedValue(buildClientRow({ id: 'client-1' }))
    Invoice.sum.mockResolvedValue('9000.00')
    Payment.sum.mockResolvedValue('2500.00')
    Invoice.findAll.mockResolvedValue([
      {
        id: 'inv-1',
        invoice_number: 'INV-0001',
        invoice_date: '2026-04-01',
        due_date: '2026-04-15',
        total_amount: '9000.00',
        status: 'submitted',
        payment_status: 'partial',
        fbr_status: 'pending',
      },
    ])

    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/clients/client-1')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(422)

    const validId = 'f5cb4e07-4c1f-429f-bda8-0c1f41e7e111'
    Client.findOne.mockResolvedValue(buildClientRow({ id: validId }))

    const validRes = await request(app)
      .get(`/api/v1/clients/${validId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(validRes.statusCode).toBe(200)
    expect(validRes.body.success).toBe(true)
    expect(validRes.body.data.invoice_summary).toEqual({
      total_invoiced: 9000,
      total_paid: 2500,
      outstanding: 6500,
    })
    expect(validRes.body.data.recent_invoices).toHaveLength(1)
  })

  it('PUT /api/v1/clients/:id returns 404 when client is outside company scope', async () => {
    Client.findOne.mockResolvedValue(null)

    const token = buildAccessToken()
    const res = await request(app)
      .put('/api/v1/clients/f5cb4e07-4c1f-429f-bda8-0c1f41e7e111')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Updated Name',
        client_type: 'business',
        ntn: '1234567',
      })

    expect(res.statusCode).toBe(404)
    expect(res.body.success).toBe(false)
  })

  it('DELETE /api/v1/clients/:id blocks deletion when non-cancelled invoices exist', async () => {
    const clientInstance = buildClientRow({ id: 'f5cb4e07-4c1f-429f-bda8-0c1f41e7e111' })
    clientInstance.destroy.mockResolvedValue()
    Client.findOne.mockResolvedValue(clientInstance)
    Invoice.count.mockResolvedValue(2)

    const token = buildAccessToken()
    const res = await request(app)
      .delete('/api/v1/clients/f5cb4e07-4c1f-429f-bda8-0c1f41e7e111')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(409)
    expect(res.body.success).toBe(false)
    expect(clientInstance.destroy).not.toHaveBeenCalled()
  })

  it('GET /api/v1/clients forbids accountant role', async () => {
    User.findByPk.mockResolvedValue({
      id: '2d4c6f83-b635-4f63-8f4e-6c10d22cf111',
      company_id: '63353e4d-caf3-4f4b-bca3-e8f2ca6d2111',
      role: 'accountant',
      is_active: true,
      password_changed_at: null,
    })

    const token = buildAccessToken({ role: 'accountant' })
    const res = await request(app).get('/api/v1/clients').set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(403)
    expect(res.body.success).toBe(false)
  })
})
