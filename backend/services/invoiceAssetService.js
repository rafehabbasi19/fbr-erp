'use strict'

const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')
const QRCode = require('qrcode')

const STORAGE_ROOT = path.resolve(__dirname, '..', 'storage')

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value) {
  return Number(toNumber(value).toFixed(2))
}

function formatDate(value) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return String(value)
  }

  return parsed.toISOString().slice(0, 10)
}

function formatCurrency(value, currency = 'PKR') {
  return `${currency} ${roundCurrency(value).toFixed(2)}`
}

async function ensureDirectoryExists(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true })
}

function normalizePathSegments(...segments) {
  return segments
    .map(segment => String(segment || '').trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
}

function buildPublicStoragePath(...segments) {
  const normalizedSegments = normalizePathSegments(...segments)
  return `/${path.posix.join('storage', ...normalizedSegments)}`
}

function resolveStorageAbsolutePath(publicPath) {
  const normalized = String(publicPath || '').trim()
  if (!normalized) {
    return null
  }

  const storagePrefix = '/storage/'
  if (!normalized.startsWith(storagePrefix)) {
    return null
  }

  const relativePath = normalized.slice(storagePrefix.length)
  return path.join(STORAGE_ROOT, ...relativePath.split('/'))
}

async function fileExists(filePath) {
  if (!filePath) {
    return false
  }

  try {
    await fs.promises.access(filePath, fs.constants.F_OK)
    return true
  } catch (_err) {
    return false
  }
}

async function getFileModifiedAtMs(filePath) {
  if (!filePath) {
    return null
  }

  try {
    const stat = await fs.promises.stat(filePath)
    return Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : null
  } catch (_err) {
    return null
  }
}

async function touchFile(filePath) {
  if (!filePath) {
    return
  }

  const now = new Date()
  await fs.promises.utimes(filePath, now, now)
}

async function persistInvoiceQrPng({ companyId, invoiceId, qrCodeData }) {
  const safeCompanyId = String(companyId || '').trim()
  const safeInvoiceId = String(invoiceId || '').trim()

  if (!safeCompanyId || !safeInvoiceId) {
    throw new Error('Company id and invoice id are required to persist QR code')
  }

  if (!String(qrCodeData || '').trim()) {
    throw new Error('QR code data is required to persist QR code')
  }

  const qrFolder = path.join(STORAGE_ROOT, 'qrcodes', safeCompanyId)
  const fileName = `${safeInvoiceId}.png`
  const absolutePath = path.join(qrFolder, fileName)

  await ensureDirectoryExists(qrFolder)
  await QRCode.toFile(absolutePath, qrCodeData, {
    type: 'png',
    width: 360,
    margin: 1,
    errorCorrectionLevel: 'M',
  })

  return {
    absolutePath,
    publicPath: buildPublicStoragePath('qrcodes', safeCompanyId, fileName),
  }
}

async function persistInvoicePdf({
  invoice,
  company,
  client,
  items,
  payments,
  qrCodeAbsolutePath = null,
}) {
  const safeCompanyId = String(invoice?.company_id || '').trim()
  const safeInvoiceId = String(invoice?.id || '').trim()

  if (!safeCompanyId || !safeInvoiceId) {
    throw new Error('Invoice id and company id are required to generate invoice PDF')
  }

  const pdfFolder = path.join(STORAGE_ROOT, 'pdfs', safeCompanyId)
  const fileName = `${safeInvoiceId}.pdf`
  const absolutePath = path.join(pdfFolder, fileName)

  await ensureDirectoryExists(pdfFolder)

  const doc = new PDFDocument({ size: 'A4', margin: 48 })

  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(absolutePath)
    stream.on('finish', resolve)
    stream.on('error', reject)
    doc.on('error', reject)

    doc.pipe(stream)

    const invoiceCurrency = invoice?.currency || 'PKR'
    const normalizedItems = Array.isArray(items) ? items : []
    const normalizedPayments = Array.isArray(payments) ? payments : []

    doc.fontSize(20).text('TAX INVOICE', { align: 'right' })
    doc.moveDown(0.5)

    doc.fontSize(12).text(company?.name || 'Company', { continued: true }).fontSize(10).text('')
    if (company?.address) {
      doc.fontSize(10).text(company.address)
    }
    if (company?.email || company?.phone) {
      doc
        .fontSize(10)
        .text([company?.email, company?.phone].filter(Boolean).join(' | '))
    }
    if (company?.ntn || company?.strn) {
      doc
        .fontSize(10)
        .text([company?.ntn ? `NTN: ${company.ntn}` : null, company?.strn ? `STRN: ${company.strn}` : null].filter(Boolean).join(' | '))
    }

    doc.moveDown(0.8)

    doc
      .fontSize(11)
      .text(`Invoice #: ${invoice?.invoice_number || '-'}`)
      .text(`Issue Date: ${formatDate(invoice?.issue_date || invoice?.invoice_date)}`)
      .text(`Due Date: ${formatDate(invoice?.due_date)}`)
      .text(`Status: ${invoice?.status || '-'}`)

    doc.moveDown(0.8)
    doc.fontSize(12).text('Bill To')
    doc.fontSize(10).text(client?.name || '-')
    if (client?.address) {
      doc.text(client.address)
    }
    if (client?.email || client?.phone) {
      doc.text([client?.email, client?.phone].filter(Boolean).join(' | '))
    }
    if (client?.ntn || client?.cnic) {
      doc.text([client?.ntn ? `NTN: ${client.ntn}` : null, client?.cnic ? `CNIC: ${client.cnic}` : null].filter(Boolean).join(' | '))
    }

    doc.moveDown(0.9)

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const x = doc.page.margins.left
    const startY = doc.y
    const colDescription = x
    const colQty = x + pageWidth * 0.48
    const colUnitPrice = x + pageWidth * 0.62
    const colTax = x + pageWidth * 0.76
    const colTotal = x + pageWidth * 0.88

    doc.fontSize(10).text('Description', colDescription, startY)
    doc.text('Qty', colQty, startY, { width: 45, align: 'right' })
    doc.text('Unit Price', colUnitPrice, startY, { width: 70, align: 'right' })
    doc.text('Tax', colTax, startY, { width: 60, align: 'right' })
    doc.text('Line Total', colTotal, startY, { width: 70, align: 'right' })

    doc.moveTo(x, startY + 14).lineTo(x + pageWidth, startY + 14).strokeColor('#AAAAAA').stroke()

    let y = startY + 20
    normalizedItems.forEach((item, index) => {
      const description = item?.description || item?.product_name || `Item ${index + 1}`
      const quantity = toNumber(item?.quantity)
      const unitPrice = toNumber(item?.unit_price)
      const taxAmount = toNumber(item?.tax_amount)
      const lineTotal = toNumber(item?.line_total ?? item?.total_price)

      doc.fontSize(10).text(description, colDescription, y, { width: pageWidth * 0.46 })
      doc.text(quantity.toFixed(3), colQty, y, { width: 45, align: 'right' })
      doc.text(formatCurrency(unitPrice, invoiceCurrency), colUnitPrice, y, { width: 70, align: 'right' })
      doc.text(formatCurrency(taxAmount, invoiceCurrency), colTax, y, { width: 60, align: 'right' })
      doc.text(formatCurrency(lineTotal, invoiceCurrency), colTotal, y, { width: 70, align: 'right' })

      y += 18
    })

    doc.moveDown(1)
    const totalsX = x + pageWidth * 0.55

    doc
      .fontSize(10)
      .text(`Subtotal: ${formatCurrency(invoice?.subtotal, invoiceCurrency)}`, totalsX, y, {
        width: pageWidth * 0.45,
        align: 'right',
      })
    y += 16
    doc.text(
      `Discount: ${formatCurrency(invoice?.discount_amount ?? invoice?.discount, invoiceCurrency)}`,
      totalsX,
      y,
      {
        width: pageWidth * 0.45,
        align: 'right',
      }
    )
    y += 16
    doc.text(`Tax: ${formatCurrency(invoice?.tax_amount, invoiceCurrency)}`, totalsX, y, {
      width: pageWidth * 0.45,
      align: 'right',
    })
    y += 16
    doc.font('Helvetica-Bold').text(`Total: ${formatCurrency(invoice?.total ?? invoice?.total_amount, invoiceCurrency)}`, totalsX, y, {
      width: pageWidth * 0.45,
      align: 'right',
    })
    doc.font('Helvetica')
    y += 16
    doc.text(`Paid: ${formatCurrency(invoice?.amount_paid, invoiceCurrency)}`, totalsX, y, {
      width: pageWidth * 0.45,
      align: 'right',
    })
    y += 16
    doc.text(`Balance Due: ${formatCurrency(invoice?.balance_due, invoiceCurrency)}`, totalsX, y, {
      width: pageWidth * 0.45,
      align: 'right',
    })

    if (invoice?.notes) {
      y += 24
      doc.fontSize(10).text('Notes:', x, y)
      y += 14
      doc.text(invoice.notes, x, y, { width: pageWidth })
    }

    if (invoice?.terms) {
      y += 34
      doc.fontSize(10).text('Terms:', x, y)
      y += 14
      doc.text(invoice.terms, x, y, { width: pageWidth })
    }

    if (normalizedPayments.length > 0) {
      y += 30
      doc.fontSize(10).text('Payments', x, y)
      y += 14
      normalizedPayments.forEach(payment => {
        doc.text(
          `${formatDate(payment.payment_date)} - ${formatCurrency(payment.amount_paid, invoiceCurrency)} (${payment.payment_method || 'payment'})`,
          x,
          y,
          { width: pageWidth }
        )
        y += 14
      })
    }

    if (qrCodeAbsolutePath && fs.existsSync(qrCodeAbsolutePath)) {
      const qrY = Math.max(doc.page.height - 190, y + 20)
      doc.fontSize(9).text('Invoice QR', x, qrY)
      doc.image(qrCodeAbsolutePath, x, qrY + 12, { width: 110, height: 110 })
    }

    doc.end()
  })

  return {
    absolutePath,
    publicPath: buildPublicStoragePath('pdfs', safeCompanyId, fileName),
  }
}

module.exports = {
  persistInvoiceQrPng,
  persistInvoicePdf,
  resolveStorageAbsolutePath,
  fileExists,
  getFileModifiedAtMs,
  touchFile,
}
