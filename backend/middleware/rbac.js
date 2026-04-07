'use strict'

const { sendError } = require('../utils/response')
const { hasPermission, resolveRoleName } = require('../config/rbacMatrix')

function getUserRole(req) {
  const roleFromUser = req.user && req.user.role
  const roleFromToken = req.authPayload && req.authPayload.role
  return resolveRoleName(roleFromUser || roleFromToken)
}

function requireRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles)
    ? allowedRoles.map(role => resolveRoleName(role))
    : [resolveRoleName(allowedRoles)]

  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, {
        statusCode: 401,
        message: 'Authentication required',
      })
    }

    const roleName = getUserRole(req)

    if (!allowed.includes(roleName)) {
      return sendError(res, {
        statusCode: 403,
        message: 'Forbidden: insufficient role permissions',
      })
    }

    return next()
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, {
        statusCode: 401,
        message: 'Authentication required',
      })
    }

    const roleName = getUserRole(req)

    if (!hasPermission(roleName, permission)) {
      return sendError(res, {
        statusCode: 403,
        message: `Forbidden: missing required permission (${permission})`,
      })
    }

    return next()
  }
}

module.exports = {
  getUserRole,
  requireRole,
  requirePermission,
}
