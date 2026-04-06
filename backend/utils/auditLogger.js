'use strict'

const { AuditLog } = require('../models')

/**
 * Logs an auditable action to the audit_logs table.
 *
 * Automatically masks sensitive fields (password_hash, token_encrypted)
 * from old_values and new_values before storing.
 *
 * @param {object} params
 * @param {string} params.company_id
 * @param {string|null} params.user_id
 * @param {string} params.action         e.g. 'INVOICE_CREATED'
 * @param {string|null} params.entity_type  e.g. 'Invoice'
 * @param {string|null} params.entity_id
 * @param {object|null} params.old_values
 * @param {object|null} params.new_values
 * @param {string|null} params.ip_address
 */
async function log({
  company_id,
  user_id = null,
  action,
  entity_type = null,
  entity_id = null,
  old_values = null,
  new_values = null,
  ip_address = null,
}) {
  const SENSITIVE_FIELDS = ['password_hash', 'password', 'token_encrypted', 'token_hash']

  const mask = obj => {
    if (!obj || typeof obj !== 'object') { return obj }
    const masked = { ...obj }
    SENSITIVE_FIELDS.forEach(field => {
      if (masked[field] !== undefined) {
        masked[field] = '[REDACTED]'
      }
    })
    return masked
  }

  try {
    await AuditLog.create({
      company_id,
      user_id,
      action,
      entity_type,
      entity_id,
      old_values: mask(old_values),
      new_values: mask(new_values),
      ip_address,
    })
  } catch (err) {
    // Audit log failures must never break the main request
    console.error('[AuditLogger] Failed to write audit log:', err.message)
  }
}

module.exports = { log }
