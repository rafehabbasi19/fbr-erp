'use strict'

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const jwt = require('jsonwebtoken')
const request = require('supertest')

const app = require('../app')
const { sequelize, User } = require('../models')

function resolveStorageAbsolutePath(publicPath) {
  if (!publicPath || typeof publicPath !== 'string') {
    return null
  }

  if (!publicPath.startsWith('/storage/')) {
    return null
  }

  const relative = publicPath.replace('/storage/', '')
  return path.join(__dirname, '..', 'storage', ...relative.split('/'))
}

async function run() {
  const user = await User.findOne({
    where: { is_active: true, role: 'company_admin' },
    order: [['created_at', 'DESC']],
  })

  if (!user) {
    throw new Error('No active company_admin user found for smoke tests')
  }

  const token = jwt.sign(
    {
      sub: user.id,
      company_id: user.company_id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  )

  const now = Date.now()
  const ntn = String((now % 9000000) + 1000000)

  const responses = {}

  responses.createClient = await request(app)
    .post('/api/v1/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Smoke Client ${now}`,
      client_type: 'business',
      ntn,
      email: `client.${now}@example.com`,
      phone: '03001234567',
      city: 'Islamabad',
      status: 'active',
    })

  const clientId = responses.createClient.body?.data?.id
  if (!clientId) {
    return {
      authUser: {
        id: user.id,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
      },
      createClient: {
        status: responses.createClient.statusCode,
        message: responses.createClient.body?.message,
        errors: responses.createClient.body?.errors || null,
      },
    }
  }

  const invoicePayload = {
    client_id: clientId,
    issue_date: '2026-04-10',
    due_date: '2026-04-25',
    currency: 'PKR',
    discount_type: 'fixed',
    discount_value: 50,
    notes: 'Smoke invoice test',
    terms: 'Standard terms',
    items: [
      {
        description: 'Consulting',
        quantity: 2,
        unit: 'hour',
        unit_price: 1000,
        tax_rate_percentage: 17,
        sort_order: 0,
      },
    ],
  }

  responses.createInvoice = await request(app)
    .post('/api/v1/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send(invoicePayload)

  const invoiceId = responses.createInvoice.body?.data?.id

  responses.listInvoices = await request(app)
    .get('/api/v1/invoices?page=1&per_page=10')
    .set('Authorization', `Bearer ${token}`)

  if (!invoiceId) {
    return {
      authUser: {
        id: user.id,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
      },
      createClient: {
        status: responses.createClient.statusCode,
        message: responses.createClient.body?.message,
        id: clientId,
      },
      createInvoice: {
        status: responses.createInvoice.statusCode,
        message: responses.createInvoice.body?.message,
        errors: responses.createInvoice.body?.errors || null,
      },
    }
  }

  responses.getInvoice = await request(app)
    .get(`/api/v1/invoices/${invoiceId}`)
    .set('Authorization', `Bearer ${token}`)

  responses.updateInvoice = await request(app)
    .put(`/api/v1/invoices/${invoiceId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      ...invoicePayload,
      notes: 'Updated via smoke test',
      items: [
        {
          description: 'Consulting Updated',
          quantity: 1,
          unit: 'hour',
          unit_price: 1500,
          tax_rate_percentage: 17,
          sort_order: 0,
        },
      ],
    })

  responses.pdf = await request(app)
    .get(`/api/v1/invoices/${invoiceId}/pdf`)
    .set('Authorization', `Bearer ${token}`)

  responses.sendInvoice = await request(app)
    .post(`/api/v1/invoices/${invoiceId}/send`)
    .set('Authorization', `Bearer ${token}`)

  responses.cancelAfterSend = await request(app)
    .post(`/api/v1/invoices/${invoiceId}/cancel`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: 'Smoke cancel attempt after send' })

  responses.duplicateInvoice = await request(app)
    .post(`/api/v1/invoices/${invoiceId}/duplicate`)
    .set('Authorization', `Bearer ${token}`)

  const duplicateId = responses.duplicateInvoice.body?.data?.id
  if (duplicateId) {
    responses.deleteDuplicate = await request(app)
      .delete(`/api/v1/invoices/${duplicateId}`)
      .set('Authorization', `Bearer ${token}`)
  }

  responses.getInvoiceAfterPdf = await request(app)
    .get(`/api/v1/invoices/${invoiceId}`)
    .set('Authorization', `Bearer ${token}`)

  const qrPath = responses.getInvoiceAfterPdf.body?.data?.qr_code_path
  const pdfPath = responses.getInvoiceAfterPdf.body?.data?.pdf_path
  const qrAbsolute = resolveStorageAbsolutePath(qrPath)
  const pdfAbsolute = resolveStorageAbsolutePath(pdfPath)

  return {
    authUser: {
      id: user.id,
      email: user.email,
      role: user.role,
      company_id: user.company_id,
    },
    createClient: {
      status: responses.createClient.statusCode,
      message: responses.createClient.body?.message,
      id: clientId,
    },
    createInvoice: {
      status: responses.createInvoice.statusCode,
      message: responses.createInvoice.body?.message,
      id: invoiceId,
      invoice_number: responses.createInvoice.body?.data?.invoice_number,
      qr_code_path: responses.createInvoice.body?.data?.qr_code_path || null,
    },
    listInvoices: {
      status: responses.listInvoices.statusCode,
      total: responses.listInvoices.body?.meta?.total,
    },
    getInvoice: {
      status: responses.getInvoice.statusCode,
      message: responses.getInvoice.body?.message,
    },
    updateInvoice: {
      status: responses.updateInvoice.statusCode,
      message: responses.updateInvoice.body?.message,
    },
    pdf: {
      status: responses.pdf.statusCode,
      content_type: responses.pdf.headers['content-type'] || null,
      content_disposition: responses.pdf.headers['content-disposition'] || null,
    },
    sendInvoice: {
      status: responses.sendInvoice.statusCode,
      message: responses.sendInvoice.body?.message,
    },
    cancelAfterSend: {
      status: responses.cancelAfterSend.statusCode,
      message: responses.cancelAfterSend.body?.message,
    },
    duplicateInvoice: {
      status: responses.duplicateInvoice.statusCode,
      message: responses.duplicateInvoice.body?.message,
      id: duplicateId || null,
    },
    deleteDuplicate: responses.deleteDuplicate
      ? {
          status: responses.deleteDuplicate.statusCode,
          message: responses.deleteDuplicate.body?.message,
        }
      : null,
    storedAssets: {
      qr_code_path: qrPath || null,
      pdf_path: pdfPath || null,
      qr_absolute_path: qrAbsolute,
      pdf_absolute_path: pdfAbsolute,
      qr_file_exists: qrAbsolute ? fs.existsSync(qrAbsolute) : false,
      pdf_file_exists: pdfAbsolute ? fs.existsSync(pdfAbsolute) : false,
    },
  }
}

run()
  .then(async summary => {
    console.log(JSON.stringify(summary, null, 2))
    await sequelize.close()
  })
  .catch(async error => {
    console.error(error)
    await sequelize.close()
    process.exit(1)
  })
