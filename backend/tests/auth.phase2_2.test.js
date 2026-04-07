'use strict'

jest.mock('../models', () => ({
  sequelize: {
    transaction: jest.fn(),
  },
  Company: {
    create: jest.fn(),
  },
  User: {
    findOne: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn(),
  },
  Role: {
    findOne: jest.fn(),
  },
  RoleUser: {
    create: jest.fn(),
  },
  EmailVerificationToken: {
    create: jest.fn(),
    destroy: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  },
}))

jest.mock('../services/mailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ skipped: true }),
}))

jest.mock('../utils/auditLogger', () => ({
  log: jest.fn().mockResolvedValue(),
}))

const request = require('supertest')
const app = require('../app')

const {
  sequelize,
  Company,
  User,
  Role,
  RoleUser,
  EmailVerificationToken,
} = require('../models')
const { sendVerificationEmail } = require('../services/mailService')
const AuditLogger = require('../utils/auditLogger')

function createUser(overrides = {}) {
  return {
    id: '92fe52f1-9ea1-4d81-9a8f-a8d0ed35f111',
    company_id: 'e9cb4eb3-4f89-48c2-bfd4-f6f4f01cb111',
    role_id: '21b4fa89-a8e0-44f9-aefa-e2e2e6f9b111',
    name: 'Ali Khan',
    email: 'ali@example.com',
    role: 'company_admin',
    email_verified_at: null,
    password_hash: 'hashed-password',
    save: jest.fn().mockResolvedValue(),
    toJSON() {
      return {
        id: this.id,
        company_id: this.company_id,
        role_id: this.role_id,
        name: this.name,
        email: this.email,
        role: this.role,
        email_verified_at: this.email_verified_at,
        password_hash: this.password_hash,
      }
    },
    ...overrides,
  }
}

describe('Auth Phase 2.2 API', () => {
  const transaction = {
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    LOCK: { UPDATE: 'UPDATE' },
  }

  beforeEach(() => {
    jest.clearAllMocks()

    sequelize.transaction.mockResolvedValue(transaction)

    Company.create.mockResolvedValue({
      id: 'e9cb4eb3-4f89-48c2-bfd4-f6f4f01cb111',
      name: 'Test Company',
    })

    Role.findOne.mockResolvedValue({
      id: '21b4fa89-a8e0-44f9-aefa-e2e2e6f9b111',
      name: 'company_admin',
    })

    User.findOne.mockResolvedValue(null)
    User.create.mockResolvedValue(createUser())
    User.findByPk.mockResolvedValue(createUser())

    RoleUser.create.mockResolvedValue({
      id: '93265dc5-2d77-4fd8-919f-8678d45bd111',
    })

    EmailVerificationToken.destroy.mockResolvedValue(1)
    EmailVerificationToken.create.mockResolvedValue({
      id: '9140f0e6-73e8-4794-a794-6cd22d97f111',
    })
    EmailVerificationToken.findOne.mockResolvedValue({
      id: '9140f0e6-73e8-4794-a794-6cd22d97f111',
      user_id: '92fe52f1-9ea1-4d81-9a8f-a8d0ed35f111',
    })
    EmailVerificationToken.count.mockResolvedValue(0)
  })

  it('POST /api/v1/auth/register creates company, user, and verification token', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Ali Khan',
      email: 'ali@example.com',
      password: 'StrongPass123',
      password_confirmation: 'StrongPass123',
      company_name: 'Test Company',
    })

    expect(res.statusCode).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.email).toBe('ali@example.com')
    expect(res.body.data.password_hash).toBeUndefined()

    expect(Company.create).toHaveBeenCalledTimes(1)
    expect(User.create).toHaveBeenCalledTimes(1)
    expect(RoleUser.create).toHaveBeenCalledTimes(1)
    expect(EmailVerificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: '92fe52f1-9ea1-4d81-9a8f-a8d0ed35f111',
        purpose: 'register',
      }),
      expect.any(Object)
    )

    expect(sendVerificationEmail).toHaveBeenCalledTimes(1)
    expect(AuditLogger.log).toHaveBeenCalledTimes(1)
  })

  it('POST /api/v1/auth/register validates required fields', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Ali Khan',
      email: 'ali@example.com',
      password: 'short',
      password_confirmation: 'different',
    })

    expect(res.statusCode).toBe(422)
    expect(res.body.success).toBe(false)
    expect(Array.isArray(res.body.errors)).toBe(true)
    expect(User.create).not.toHaveBeenCalled()
  })

  it('GET /api/v1/auth/verify-email/:token verifies email and invalidates token', async () => {
    const token = '46b6a6e7-571e-4f52-b6f3-4e2ac7f7a111'

    const user = createUser({ email_verified_at: null })
    User.findByPk.mockResolvedValue(user)

    const res = await request(app).get(`/api/v1/auth/verify-email/${token}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(user.save).toHaveBeenCalledTimes(1)
    expect(EmailVerificationToken.destroy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: user.id },
      })
    )
  })

  it('POST /api/v1/auth/resend-verification enforces per-email resend limit', async () => {
    User.findOne.mockResolvedValue(createUser({ email_verified_at: null }))
    EmailVerificationToken.count.mockResolvedValue(3)

    const res = await request(app).post('/api/v1/auth/resend-verification').send({
      email: 'ali@example.com',
    })

    expect(res.statusCode).toBe(429)
    expect(res.body.success).toBe(false)
    expect(EmailVerificationToken.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/auth/resend-verification regenerates token for unverified user', async () => {
    User.findOne.mockResolvedValue(createUser({ email_verified_at: null }))
    EmailVerificationToken.count.mockResolvedValue(1)

    const res = await request(app).post('/api/v1/auth/resend-verification').send({
      email: 'ali@example.com',
    })

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(EmailVerificationToken.destroy).toHaveBeenCalledTimes(1)
    expect(EmailVerificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'resend' }),
      expect.any(Object)
    )
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1)
  })
})
