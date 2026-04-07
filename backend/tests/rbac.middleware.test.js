'use strict'

const { requireRole, requirePermission, getUserRole } = require('../middleware/rbac')
const { PERMISSIONS } = require('../config/rbacMatrix')

function createMockRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

describe('RBAC middleware', () => {
  it('getUserRole resolves role from req.user', () => {
    const role = getUserRole({
      user: { role: 'Company_Admin' },
      authPayload: { role: 'seller' },
    })

    expect(role).toBe('company_admin')
  })

  it('requireRole allows matching role', () => {
    const req = {
      user: { role: 'seller' },
      authPayload: { role: 'seller' },
    }
    const res = createMockRes()
    const next = jest.fn()

    requireRole(['seller', 'company_admin'])(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('requireRole blocks non-matching role', () => {
    const req = {
      user: { role: 'seller' },
      authPayload: { role: 'seller' },
    }
    const res = createMockRes()
    const next = jest.fn()

    requireRole(['company_admin'])(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('requirePermission allows seller invoice creation permission', () => {
    const req = {
      user: { role: 'seller' },
      authPayload: { role: 'seller' },
    }
    const res = createMockRes()
    const next = jest.fn()

    requirePermission(PERMISSIONS.CREATE_EDIT_INVOICES)(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('requirePermission blocks seller from manage users permission', () => {
    const req = {
      user: { role: 'seller' },
      authPayload: { role: 'seller' },
    }
    const res = createMockRes()
    const next = jest.fn()

    requirePermission(PERMISSIONS.MANAGE_USERS)(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('requirePermission allows super_admin for all permissions', () => {
    const req = {
      user: { role: 'super_admin' },
      authPayload: { role: 'super_admin' },
    }
    const res = createMockRes()
    const next = jest.fn()

    requirePermission(PERMISSIONS.MANAGE_BACKUPS)(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })
})
