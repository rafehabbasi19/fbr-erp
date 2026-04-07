'use strict'

const PERMISSIONS = Object.freeze({
  MANAGE_COMPANIES: 'manage_companies',
  MANAGE_USERS: 'manage_users',
  CREATE_EDIT_INVOICES: 'create_edit_invoices',
  DELETE_INVOICES: 'delete_invoices',
  SUBMIT_TO_FBR: 'submit_to_fbr',
  MANAGE_TAX_RATES: 'manage_tax_rates',
  VIEW_REPORTS: 'view_reports',
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  SYSTEM_SETTINGS: 'system_settings',
  MANAGE_BACKUPS: 'manage_backups',
})

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS))

const ROLE_PERMISSION_MATRIX = Object.freeze({
  super_admin: ['*'],
  // Keep legacy admin role backward-compatible with full system access.
  admin: ['*'],
  company_admin: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.CREATE_EDIT_INVOICES,
    PERMISSIONS.DELETE_INVOICES,
    PERMISSIONS.SUBMIT_TO_FBR,
    PERMISSIONS.MANAGE_TAX_RATES,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.SYSTEM_SETTINGS,
    PERMISSIONS.MANAGE_BACKUPS,
  ],
  seller: [
    PERMISSIONS.CREATE_EDIT_INVOICES,
    PERMISSIONS.SUBMIT_TO_FBR,
    PERMISSIONS.VIEW_REPORTS,
  ],
  accountant: [PERMISSIONS.VIEW_REPORTS],
})

function resolveRoleName(roleName) {
  return String(roleName || '').trim().toLowerCase()
}

function getRolePermissions(roleName) {
  const resolvedRole = resolveRoleName(roleName)
  return ROLE_PERMISSION_MATRIX[resolvedRole] || []
}

function hasPermission(roleName, permission) {
  const resolvedPermission = String(permission || '').trim()
  if (!resolvedPermission) {
    return false
  }

  const rolePermissions = getRolePermissions(roleName)
  if (rolePermissions.includes('*')) {
    return true
  }

  return rolePermissions.includes(resolvedPermission)
}

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  resolveRoleName,
  getRolePermissions,
  hasPermission,
}
