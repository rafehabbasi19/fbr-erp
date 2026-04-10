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
  Invoice: {
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
  InvoiceItem: {
    bulkCreate: jest.fn(),
    destroy: jest.fn(),
  },
  Payment: {
    count: jest.fn(),
  },
  Client: {
    findOne: jest.fn(),
  },
  Company: {
    findByPk: jest.fn(),
  },
  FbrSubmission: {
    findOne: jest.fn(),
  },
  TaxRate: {
    findAll: jest.fn(),
  },
  CompanySetting: {
    findOne: jest.fn(),
    update: jest.fn(),
  },
  InvoiceNumberSequence: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}))

jest.mock('../utils/auditLogger', () => ({
  log: jest.fn().mockResolvedValue(),
}))

jest.mock('../services/invoiceAssetService', () => ({
  persistInvoiceQrPng: jest.fn().mockResolvedValue({
    absolutePath: '/tmp/mock-qr.png',
    publicPath: '/storage/qrcodes/mock-company/mock-invoice.png',
  }),
  persistInvoicePdf: jest.fn().mockResolvedValue({
    absolutePath: '/tmp/mock-pdf.pdf',
    publicPath: '/storage/pdfs/mock-company/mock-invoice.pdf',
  }),
  resolveStorageAbsolutePath: jest.fn().mockReturnValue('/tmp/mock-file'),
  fileExists: jest.fn().mockResolvedValue(true),
}))

const app = require('../app')
const {
  sequelize,
  User,
  AccessTokenBlacklist,
  Invoice,
  InvoiceItem,
  Payment,
  Client,
  Company,
  FbrSubmission,
  CompanySetting,
  InvoiceNumberSequence,
} = require('../models')
const AuditLogger = require('../utils/auditLogger')

function buildAccessToken(payloadOverrides = {}) {
  return jwt.sign(
    {
      sub: '6a6fcb65-6ebf-4f0a-8614-1bf2e7fb8111',
      company_id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
      role: 'seller',
      ...payloadOverrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )
}

function buildSequence(overrides = {}) {
  return {
    id: '1f67893a-62a9-4f81-bd2f-5ed31aaee111',
    company_id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
    prefix: 'INV',
    next_number: 1,
    padding: 4,
    format: '{prefix}-{year}-{number}',
    update: jest.fn().mockResolvedValue(),
    ...overrides,
  }
}

function buildInvoiceRow(overrides = {}) {
  const row = {
    id: 'f4dc454d-5890-4a62-9859-4c7bea4b0111',
    company_id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
    client_id: '2b1cbf95-5f80-4df5-a9aa-5ba35989d111',
    seller_id: '6a6fcb65-6ebf-4f0a-8614-1bf2e7fb8111',
    created_by: '6a6fcb65-6ebf-4f0a-8614-1bf2e7fb8111',
    invoice_number: 'INV-2026-0001',
    issue_date: '2026-04-10',
    invoice_date: '2026-04-10',
    due_date: '2026-04-30',
    status: 'draft',
    payment_status: 'unpaid',
    currency: 'PKR',
    subtotal: '1000.00',
    discount_type: 'fixed',
    discount_value: '50.00',
    discount_amount: '50.00',
    discount: '50.00',
    tax_amount: '170.00',
    total: '1120.00',
    total_amount: '1120.00',
    amount_paid: '0.00',
    balance_due: '1120.00',
    notes: 'Seed note',
    terms: 'Standard terms',
    fbr_status: 'not_submitted',
    fbr_usin: null,
    fbr_invoice_number: null,
    sent_at: null,
    client: {
      id: '2b1cbf95-5f80-4df5-a9aa-5ba35989d111',
      name: 'Alpha Traders',
      client_type: 'business',
      ntn: '1234567',
      cnic: null,
      email: 'alpha@example.com',
      phone: '03001234567',
    },
    seller: {
      id: '6a6fcb65-6ebf-4f0a-8614-1bf2e7fb8111',
      name: 'Seller User',
      email: 'seller@demo.pk',
    },
    items: [
      {
        id: 'item-1',
        sort_order: 0,
        description: 'Web Design',
        quantity: '1.000',
        unit: 'project',
        unit_price: '1000.00',
        tax_rate_id: null,
        tax_rate_percentage: '17.00',
        tax_amount: '170.00',
        line_total: '1170.00',
      },
    ],
    payments: [],
    update: jest.fn().mockImplementation(async values => {
      Object.assign(row, values)
      return row
    }),
    destroy: jest.fn().mockResolvedValue(),
    toJSON() {
      return {
        id: this.id,
        company_id: this.company_id,
        client_id: this.client_id,
        seller_id: this.seller_id,
        created_by: this.created_by,
        invoice_number: this.invoice_number,
        issue_date: this.issue_date,
        invoice_date: this.invoice_date,
        due_date: this.due_date,
        status: this.status,
        payment_status: this.payment_status,
        currency: this.currency,
        subtotal: this.subtotal,
        discount_type: this.discount_type,
        discount_value: this.discount_value,
        discount_amount: this.discount_amount,
        discount: this.discount,
        tax_amount: this.tax_amount,
        total: this.total,
        total_amount: this.total_amount,
        amount_paid: this.amount_paid,
        balance_due: this.balance_due,
        notes: this.notes,
        terms: this.terms,
        fbr_status: this.fbr_status,
        fbr_usin: this.fbr_usin,
        fbr_invoice_number: this.fbr_invoice_number,
        sent_at: this.sent_at,
        client: this.client,
        seller: this.seller,
        items: this.items,
        payments: this.payments,
        created_at: '2026-04-10T10:00:00.000Z',
        updated_at: '2026-04-10T10:00:00.000Z',
      }
    },
    ...overrides,
  }

  return row
}

describe('Invoice Phase 5 APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.JWT_SECRET = 'invoices_phase5_test_secret'

    AccessTokenBlacklist.findOne.mockResolvedValue(null)
    User.findByPk.mockResolvedValue({
      id: '6a6fcb65-6ebf-4f0a-8614-1bf2e7fb8111',
      company_id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
      role: 'seller',
      is_active: true,
      password_changed_at: null,
    })

    sequelize.transaction.mockImplementation(async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }))
    CompanySetting.update.mockResolvedValue([1])
    CompanySetting.findOne.mockResolvedValue(null)
    InvoiceNumberSequence.create.mockResolvedValue()
    InvoiceNumberSequence.findOne.mockResolvedValue(buildSequence())

    InvoiceItem.bulkCreate.mockResolvedValue([])
    InvoiceItem.destroy.mockResolvedValue(1)
    Payment.count.mockResolvedValue(0)
    FbrSubmission.findOne.mockResolvedValue(null)

    Company.findByPk.mockResolvedValue({
      id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
      ntn: '7654321',
    })

    Client.findOne.mockResolvedValue({
      id: '2b1cbf95-5f80-4df5-a9aa-5ba35989d111',
      company_id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
      ntn: '1234567',
    })
  })

  it('POST /api/v1/invoices creates an invoice with items and totals', async () => {
    Invoice.create.mockResolvedValue({
      id: 'new-invoice-id',
    })

    Invoice.findOne.mockResolvedValue(buildInvoiceRow({ id: 'new-invoice-id' }))

    const token = buildAccessToken()
    const res = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: '2b1cbf95-5f80-4df5-a9aa-5ba35989d111',
        issue_date: '2026-04-10',
        due_date: '2026-04-30',
        currency: 'PKR',
        discount_type: 'fixed',
        discount_value: 50,
        items: [
          {
            description: 'Web Design',
            quantity: 1,
            unit_price: 1000,
            tax_rate_percentage: 17,
          },
        ],
      })

    expect(res.statusCode).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.invoice_number).toContain('INV')
    expect(Invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
        seller_id: '6a6fcb65-6ebf-4f0a-8614-1bf2e7fb8111',
        status: 'draft',
      }),
      expect.any(Object)
    )
    expect(InvoiceItem.bulkCreate).toHaveBeenCalledTimes(1)
    expect(AuditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'INVOICE_CREATED' }))
  })

  it('GET /api/v1/invoices returns paginated invoice summaries', async () => {
    Invoice.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [buildInvoiceRow()],
    })

    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/invoices?page=1&per_page=10&sort_by=issue_date&sort_dir=desc')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({
      invoice_number: 'INV-2026-0001',
      total: 1120,
      amount_paid: 0,
      balance_due: 1120,
    })
    expect(res.body.meta).toMatchObject({
      page: 1,
      per_page: 10,
      total: 1,
      total_pages: 1,
    })
  })

  it('GET /api/v1/invoices/:id returns invoice detail including fbr_submission', async () => {
    const invoiceRow = buildInvoiceRow()
    Invoice.findOne.mockResolvedValue(invoiceRow)
    FbrSubmission.findOne.mockResolvedValue({
      id: 'sub-1',
      invoice_id: invoiceRow.id,
      attempt_number: 1,
      status: 'pending',
      submitted_at: '2026-04-10T10:00:00.000Z',
      toJSON() {
        return {
          id: this.id,
          invoice_id: this.invoice_id,
          attempt_number: this.attempt_number,
          status: this.status,
          submitted_at: this.submitted_at,
          created_at: '2026-04-10T10:00:00.000Z',
          fbr_response: null,
        }
      },
    })

    const token = buildAccessToken()
    const res = await request(app)
      .get('/api/v1/invoices/f4dc454d-5890-4a62-9859-4c7bea4b0111')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.fbr_submission).toMatchObject({
      id: 'sub-1',
      status: 'pending',
    })
  })

  it('PUT /api/v1/invoices/:id blocks edits when invoice is already submitted to FBR', async () => {
    Invoice.findOne.mockResolvedValue(
      buildInvoiceRow({
        fbr_status: 'submitted',
      })
    )

    const token = buildAccessToken()
    const res = await request(app)
      .put('/api/v1/invoices/f4dc454d-5890-4a62-9859-4c7bea4b0111')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: '2b1cbf95-5f80-4df5-a9aa-5ba35989d111',
        issue_date: '2026-04-10',
        due_date: '2026-04-30',
        currency: 'PKR',
        items: [{ description: 'Updated', quantity: 1, unit_price: 1000 }],
      })

    expect(res.statusCode).toBe(409)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe('Invoice has been submitted to FBR and cannot be modified.')
  })

  it('DELETE /api/v1/invoices/:id blocks delete if payments are recorded', async () => {
    const draftInvoice = buildInvoiceRow()
    Invoice.findOne.mockResolvedValue(draftInvoice)
    Payment.count.mockResolvedValue(1)

    User.findByPk.mockResolvedValue({
      id: '6a6fcb65-6ebf-4f0a-8614-1bf2e7fb8111',
      company_id: '20f2cd5a-3418-4fd4-aec2-c7f9f0802111',
      role: 'company_admin',
      is_active: true,
      password_changed_at: null,
    })

    const token = buildAccessToken({ role: 'company_admin' })
    const res = await request(app)
      .delete('/api/v1/invoices/f4dc454d-5890-4a62-9859-4c7bea4b0111')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(409)
    expect(res.body.success).toBe(false)
    expect(draftInvoice.destroy).not.toHaveBeenCalled()
  })

  it('POST /api/v1/invoices/:id/duplicate clones invoice into a new draft', async () => {
    const sourceInvoice = buildInvoiceRow()
    const duplicatedInvoice = buildInvoiceRow({
      id: 'duplicated-id',
      invoice_number: 'INV-2026-0002',
      status: 'draft',
    })

    Invoice.findOne
      .mockResolvedValueOnce(sourceInvoice)
      .mockResolvedValueOnce(duplicatedInvoice)

    Invoice.create.mockResolvedValue({
      id: 'duplicated-id',
    })

    const token = buildAccessToken()
    const res = await request(app)
      .post('/api/v1/invoices/f4dc454d-5890-4a62-9859-4c7bea4b0111/duplicate')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe('duplicated-id')
    expect(res.body.data.status).toBe('draft')
    expect(Invoice.create).toHaveBeenCalled()
    expect(AuditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'INVOICE_DUPLICATED' }))
  })

  it('POST /api/v1/invoices/:id/send marks invoice as sent', async () => {
    const draftInvoice = buildInvoiceRow({
      status: 'draft',
      items: [{ id: 'item-1' }],
    })
    const sentInvoice = buildInvoiceRow({
      status: 'sent',
      sent_at: '2026-04-10T12:00:00.000Z',
    })

    Invoice.findOne
      .mockResolvedValueOnce(draftInvoice)
      .mockResolvedValueOnce(sentInvoice)

    const token = buildAccessToken()
    const res = await request(app)
      .post('/api/v1/invoices/f4dc454d-5890-4a62-9859-4c7bea4b0111/send')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe('sent')
    expect(draftInvoice.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }))
  })

  it('POST /api/v1/invoices/:id/cancel blocks cancel when payments exist', async () => {
    Invoice.findOne.mockResolvedValue(buildInvoiceRow())
    Payment.count.mockResolvedValue(2)

    const token = buildAccessToken()
    const res = await request(app)
      .post('/api/v1/invoices/f4dc454d-5890-4a62-9859-4c7bea4b0111/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Customer requested cancellation' })

    expect(res.statusCode).toBe(409)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toContain('payments are already recorded')
  })
})
