'use strict'

const { CompanySetting, InvoiceNumberSequence } = require('../models')

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed
  }

  return fallback
}

function normalizePrefix(prefix) {
  const value = String(prefix || '').trim()
  if (!value) {
    return 'INV'
  }

  return value.slice(0, 20)
}

function buildInvoiceNumber({ prefix, year, currentNumber, padding, format }) {
  const safePrefix = normalizePrefix(prefix)
  const safePadding = parsePositiveInteger(padding, 4)
  const numericPart = String(currentNumber).padStart(safePadding, '0')
  const baseFormat = String(format || '{prefix}-{year}-{number}').trim() || '{prefix}-{year}-{number}'

  const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const replacementMap = {
    '{prefix}': safePrefix,
    '{year}': String(year),
    '{number}': numericPart,
  }

  let formatted = baseFormat
  Object.entries(replacementMap).forEach(([token, value]) => {
    const pattern = new RegExp(escapeRegExp(token), 'gi')
    formatted = formatted.replace(pattern, value)
  })

  formatted = formatted.replace(/\{N{2,}\}/g, token => {
    const nCount = token.length - 2
    return String(currentNumber).padStart(nCount, '0')
  })

  if (!formatted.includes(safePrefix) && !formatted.includes(String(year))) {
    return `${safePrefix}-${year}-${numericPart}`
  }

  return formatted
}

function isUniqueConstraintError(error) {
  return error?.name === 'SequelizeUniqueConstraintError' || error?.parent?.code === '23505'
}

async function getOrCreateSequence(companyId, transaction) {
  let sequence = await InvoiceNumberSequence.findOne({
    where: { company_id: companyId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  })

  if (sequence) {
    return sequence
  }

  const companySetting = await CompanySetting.findOne({
    where: { company_id: companyId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  })

  const initialPrefix = normalizePrefix(companySetting?.invoice_prefix)
  const initialNextNumber = parsePositiveInteger(companySetting?.invoice_counter, 1)

  try {
    await InvoiceNumberSequence.create(
      {
        company_id: companyId,
        prefix: initialPrefix,
        next_number: initialNextNumber,
        padding: 4,
        format: '{prefix}-{year}-{number}',
      },
      { transaction }
    )
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error
    }
  }

  sequence = await InvoiceNumberSequence.findOne({
    where: { company_id: companyId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  })

  if (!sequence) {
    const err = new Error('Unable to initialize invoice number sequence')
    err.statusCode = 500
    throw err
  }

  return sequence
}

async function assignNextInvoiceNumber({ companyId, issueDate, transaction }) {
  const sequence = await getOrCreateSequence(companyId, transaction)
  const currentNumber = parsePositiveInteger(sequence.next_number, 1)
  const parsedIssueDate = new Date(issueDate)
  const issueYear = Number.isNaN(parsedIssueDate.getTime())
    ? new Date().getFullYear()
    : parsedIssueDate.getFullYear()

  const invoiceNumber = buildInvoiceNumber({
    prefix: sequence.prefix,
    year: issueYear,
    currentNumber,
    padding: sequence.padding,
    format: sequence.format,
  })

  await sequence.update(
    {
      next_number: currentNumber + 1,
    },
    { transaction }
  )

  await CompanySetting.update(
    {
      invoice_prefix: sequence.prefix,
      invoice_counter: currentNumber + 1,
    },
    {
      where: { company_id: companyId },
      transaction,
    }
  )

  return invoiceNumber
}

module.exports = {
  assignNextInvoiceNumber,
  buildInvoiceNumber,
}
