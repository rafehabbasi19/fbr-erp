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
const { User, AccessTokenBlacklist, Client } = require('../models')
const AuditLogger = require('../utils/auditLogger')

function buildAccessToken(payloadOverrides = {}) {
  return jwt.sign(
    {
      sub: '5f58d48a-9d9d-4ca4-a584-6937e8fb8111',
      company_id: 'efeb633d-aea0-46e4-a24f-7e23397c1111',
      role: 'seller',
      ...payloadOverrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )
}

describe('Client Phase 4 CSV import APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.JWT_SECRET = 'clients_import_phase4_test_secret'

    AccessTokenBlacklist.findOne.mockResolvedValue(null)
    User.findByPk.mockResolvedValue({
      id: '5f58d48a-9d9d-4ca4-a584-6937e8fb8111',
      company_id: 'efeb633d-aea0-46e4-a24f-7e23397c1111',
      role: 'seller',
      is_active: true,
      password_changed_at: null,
    })
  })

  it('GET /api/v1/clients/import-template returns downloadable CSV header row', async () => {
    const token = buildAccessToken()

    const res = await request(app)
      .get('/api/v1/clients/import-template')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('clients-import-template.csv')
    expect(res.text.trim()).toBe('name,email,phone,client_type,ntn,cnic,address,city')
  })

  it('POST /api/v1/clients/import validates file presence', async () => {
    const token = buildAccessToken()

    const res = await request(app)
      .post('/api/v1/clients/import')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe('CSV file is required')
  })

  it('POST /api/v1/clients/import imports valid rows and skips invalid rows', async () => {
    Client.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-client-for-cnic' })

    Client.create.mockResolvedValue({ id: 'imported-client-1' })

    const csv = [
      'name,email,phone,client_type,ntn,cnic,address,city',
      'Valid Traders,valid@example.com,03001234567,business,1234567,,Street 1,Islamabad',
      'Invalid Ntn,bad@example.com,03001112222,business,1234,,Street 2,Lahore',
      'Duplicate Cnic,dup@example.com,03009998888,individual,,3520212345678,Street 3,Karachi',
    ].join('\n')

    const token = buildAccessToken()
    const res = await request(app)
      .post('/api/v1/clients/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv, 'utf8'), 'clients.csv')

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({
      total_rows: 3,
      imported: 1,
      failed: 2,
    })

    expect(res.body.data.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row: 3,
          field: 'ntn',
          message: 'NTN must contain exactly 7 digits',
        }),
        expect.objectContaining({
          row: 4,
          field: 'cnic',
          message: 'CNIC is already registered for another client in your company',
        }),
      ])
    )

    expect(Client.create).toHaveBeenCalledTimes(1)
    expect(AuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLIENT_IMPORT_COMPLETED',
      })
    )
  })

  it('POST /api/v1/clients/import rejects CSV with missing required headers', async () => {
    const csv = [
      'name,email,phone,client_type,ntn,address,city',
      'Header Missing,missing@example.com,03001234567,business,1234567,Street 1,Islamabad',
    ].join('\n')

    const token = buildAccessToken()
    const res = await request(app)
      .post('/api/v1/clients/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv, 'utf8'), 'clients.csv')

    expect(res.statusCode).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toContain('Missing headers')
  })
})
