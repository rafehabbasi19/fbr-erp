'use strict'

const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const request = require('supertest')

jest.mock('../models', () => ({
  sequelize: {
    transaction: jest.fn(),
  },
  User: {
    scope: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
  },
  RefreshToken: {
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  },
  AccessTokenBlacklist: {
    findOne: jest.fn(),
    findOrCreate: jest.fn(),
  },
}))

jest.mock('../utils/auditLogger', () => ({
  log: jest.fn().mockResolvedValue(),
}))

const app = require('../app')

const {
  sequelize,
  User,
  RefreshToken,
  AccessTokenBlacklist,
} = require('../models')
const AuditLogger = require('../utils/auditLogger')

function createUser(overrides = {}) {
  return {
    id: 'd8a6e4ea-57fb-4f7d-8ea8-f53cd446d111',
    company_id: '2ea3514f-fc8f-4d2b-bd00-3adcc0ab8111',
    role: 'company_admin',
    name: 'Ali Khan',
    email: 'ali@example.com',
    password_hash: bcrypt.hashSync('StrongPass123', 12),
    is_active: true,
    email_verified_at: new Date('2026-04-07T10:00:00.000Z'),
    failed_attempts: 0,
    locked_until: null,
    last_login_at: null,
    save: jest.fn().mockResolvedValue(),
    toJSON() {
      return {
        id: this.id,
        company_id: this.company_id,
        role: this.role,
        name: this.name,
        email: this.email,
        is_active: this.is_active,
        email_verified_at: this.email_verified_at,
        last_login_at: this.last_login_at,
        failed_attempts: this.failed_attempts,
        locked_until: this.locked_until,
        password_hash: this.password_hash,
      }
    },
    ...overrides,
  }
}

describe('Auth Phase 2.3 API', () => {
  const transaction = {
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.JWT_SECRET = 'phase2_3_test_secret'

    sequelize.transaction.mockResolvedValue(transaction)
    User.scope.mockReturnValue(User)
    AccessTokenBlacklist.findOne.mockResolvedValue(null)
    AccessTokenBlacklist.findOrCreate.mockResolvedValue([{ id: '1' }, true])
    RefreshToken.create.mockResolvedValue({ id: 'token-row' })
    RefreshToken.update.mockResolvedValue([1])
  })

  it('POST /api/v1/auth/login returns access and refresh tokens', async () => {
    const user = createUser()
    User.findOne.mockResolvedValue(user)

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'ali@example.com',
      password: 'StrongPass123',
    })

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.access_token).toBeTruthy()
    expect(res.body.data.refresh_token).toBeTruthy()
    expect(res.body.data.expires_in).toBeGreaterThan(0)
    expect(RefreshToken.create).toHaveBeenCalledTimes(1)
    expect(user.save).toHaveBeenCalledTimes(1)
    expect(AuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_LOGIN_SUCCESS' })
    )
  })

  it('POST /api/v1/auth/login locks user after 5 failed attempts', async () => {
    const user = createUser({
      failed_attempts: 4,
      password_hash: bcrypt.hashSync('CorrectPassword123', 12),
    })

    User.findOne.mockResolvedValue(user)

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'ali@example.com',
      password: 'WrongPassword123',
    })

    expect(res.statusCode).toBe(423)
    expect(res.body.success).toBe(false)
    expect(user.failed_attempts).toBe(5)
    expect(user.locked_until).toBeTruthy()
    expect(user.save).toHaveBeenCalledTimes(1)
    expect(AuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_LOGIN_FAILED' })
    )
  })

  it('POST /api/v1/auth/refresh rotates refresh token and returns new token pair', async () => {
    const user = createUser()
    const refreshToken = 'refresh-token-value-123'
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')

    const refreshRow = {
      user_id: user.id,
      update: jest.fn().mockResolvedValue(),
    }

    RefreshToken.findOne.mockResolvedValue(refreshRow)
    User.findByPk.mockResolvedValue(user)

    const res = await request(app).post('/api/v1/auth/refresh').send({
      refresh_token: refreshToken,
    })

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.access_token).toBeTruthy()
    expect(res.body.data.refresh_token).toBeTruthy()
    expect(RefreshToken.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ token_hash: refreshTokenHash }),
      })
    )
    expect(refreshRow.update).toHaveBeenCalledWith(
      { revoked: true },
      expect.objectContaining({ transaction })
    )
    expect(RefreshToken.create).toHaveBeenCalledTimes(1)
    expect(AuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_TOKEN_REFRESHED' })
    )
  })

  it('POST /api/v1/auth/logout revokes access and refresh tokens', async () => {
    const user = createUser()
    const accessToken = jwt.sign(
      {
        sub: user.id,
        company_id: user.company_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    )

    User.findByPk.mockResolvedValue(user)

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refresh_token: 'refresh-token-value-123' })

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(AccessTokenBlacklist.findOrCreate).toHaveBeenCalledTimes(1)
    expect(RefreshToken.update).toHaveBeenCalledTimes(1)
    expect(AuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_LOGOUT' })
    )
  })
})
