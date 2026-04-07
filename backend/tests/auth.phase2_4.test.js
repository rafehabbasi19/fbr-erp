'use strict'

const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const request = require('supertest')

jest.mock('../models', () => ({
  sequelize: {
    transaction: jest.fn(),
  },
  User: {
    scope: jest.fn(),
    findOne: jest.fn(),
  },
  PasswordResetToken: {
    create: jest.fn(),
    destroy: jest.fn(),
    findOne: jest.fn(),
  },
  RefreshToken: {
    update: jest.fn(),
  },
}))

jest.mock('../services/mailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ skipped: true }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ skipped: true }),
}))

jest.mock('../utils/auditLogger', () => ({
  log: jest.fn().mockResolvedValue(),
}))

const app = require('../app')
const {
  sequelize,
  User,
  PasswordResetToken,
  RefreshToken,
} = require('../models')
const { sendPasswordResetEmail } = require('../services/mailService')
const AuditLogger = require('../utils/auditLogger')

function createUser(overrides = {}) {
  return {
    id: 'aa86d205-f2cd-4796-970e-5834942f3111',
    company_id: '896cf113-8df7-4fee-a8f8-9e5986181111',
    name: 'Ali Khan',
    email: 'ali@example.com',
    role: 'company_admin',
    password_hash: bcrypt.hashSync('StrongPass123', 12),
    failed_attempts: 2,
    locked_until: new Date(Date.now() + 10000),
    password_changed_at: null,
    save: jest.fn().mockResolvedValue(),
    ...overrides,
  }
}

describe('Auth Phase 2.4 API', () => {
  const transaction = {
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    LOCK: { UPDATE: 'UPDATE' },
  }

  beforeEach(() => {
    jest.clearAllMocks()

    sequelize.transaction.mockResolvedValue(transaction)
    User.scope.mockReturnValue(User)
    PasswordResetToken.destroy.mockResolvedValue(1)
    PasswordResetToken.create.mockResolvedValue({ token_hash: 'hash' })
    RefreshToken.update.mockResolvedValue([1])
  })

  it('POST /api/v1/auth/forgot-password always returns generic success for unknown email', async () => {
    User.findOne.mockResolvedValue(null)

    const res = await request(app).post('/api/v1/auth/forgot-password').send({
      email: 'unknown@example.com',
    })

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toMatch(/if an account with that email exists/i)
    expect(PasswordResetToken.create).not.toHaveBeenCalled()
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('POST /api/v1/auth/forgot-password creates reset token and sends email for known user', async () => {
    const user = createUser()
    User.findOne.mockResolvedValue(user)

    const res = await request(app).post('/api/v1/auth/forgot-password').send({
      email: 'ali@example.com',
    })

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(PasswordResetToken.destroy).toHaveBeenCalledTimes(1)
    expect(PasswordResetToken.create).toHaveBeenCalledTimes(1)
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1)
    expect(AuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_PASSWORD_RESET_REQUESTED' })
    )
  })

  it('POST /api/v1/auth/reset-password rejects invalid or expired token', async () => {
    PasswordResetToken.findOne.mockResolvedValue(null)

    const res = await request(app).post('/api/v1/auth/reset-password').send({
      token: 'a4f73f41-7e18-4f8c-a5bb-f4f7367fb111',
      email: 'ali@example.com',
      password: 'NewStrongPass123',
      password_confirmation: 'NewStrongPass123',
    })

    expect(res.statusCode).toBe(400)
    expect(res.body.success).toBe(false)
    expect(User.findOne).not.toHaveBeenCalled()
  })

  it('POST /api/v1/auth/reset-password updates password and revokes all refresh tokens', async () => {
    const user = createUser()

    const tokenValue = 'a4f73f41-7e18-4f8c-a5bb-f4f7367fb111'
    const tokenHash = crypto.createHash('sha256').update(tokenValue).digest('hex')

    PasswordResetToken.findOne.mockResolvedValue({
      email: 'ali@example.com',
      token_hash: tokenHash,
    })

    User.findOne.mockResolvedValue(user)

    const res = await request(app).post('/api/v1/auth/reset-password').send({
      token: tokenValue,
      email: 'ali@example.com',
      password: 'NewStrongPass123',
      password_confirmation: 'NewStrongPass123',
    })

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(user.password_hash).not.toBe('NewStrongPass123')
    expect(user.failed_attempts).toBe(0)
    expect(user.locked_until).toBeNull()
    expect(user.password_changed_at).toBeTruthy()
    expect(user.save).toHaveBeenCalledTimes(1)
    expect(PasswordResetToken.destroy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ali@example.com' } })
    )
    expect(RefreshToken.update).toHaveBeenCalledWith(
      { revoked: true },
      expect.objectContaining({
        where: expect.objectContaining({ user_id: user.id, revoked: false }),
      })
    )
    expect(AuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_PASSWORD_RESET_COMPLETED' })
    )
  })
})
