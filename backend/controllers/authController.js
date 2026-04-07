'use strict'

const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { validationResult } = require('express-validator')
const { Op } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

const { sendSuccess, sendError } = require('../utils/response')
const AuditLogger = require('../utils/auditLogger')
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/mailService')
const {
  sequelize,
  Company,
  User,
  Role,
  RoleUser,
  RefreshToken,
  PasswordResetToken,
  EmailVerificationToken,
  AccessTokenBlacklist,
} = require('../models')

const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000
const RESEND_LIMIT_PER_HOUR = 3
const BCRYPT_COST = 12
const MAX_FAILED_ATTEMPTS = 5
const ACCOUNT_LOCKOUT_WINDOW_MS = 15 * 60 * 1000

function parseDurationToSeconds(durationValue, fallbackSeconds) {
  const value = String(durationValue || '').trim()
  const match = value.match(/^(\d+)([smhd])$/i)

  if (!match) {
    return fallbackSeconds
  }

  const quantity = Number(match[1])
  const unit = match[2].toLowerCase()
  const unitSeconds = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  }

  return quantity * unitSeconds[unit]
}

const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h'
const ACCESS_TOKEN_EXPIRES_SECONDS = parseDurationToSeconds(ACCESS_TOKEN_EXPIRES_IN, 2 * 60 * 60)
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d'
const REFRESH_TOKEN_EXPIRES_SECONDS = parseDurationToSeconds(
  REFRESH_TOKEN_EXPIRES_IN,
  30 * 24 * 60 * 60
)

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function validationErrors(req) {
  const errors = validationResult(req)

  if (errors.isEmpty()) {
    return null
  }

  return errors.array().map(error => ({
    field: error.path,
    message: error.msg,
  }))
}

function sanitizeUser(user) {
  if (!user) {
    return null
  }

  const plain = typeof user.toJSON === 'function' ? user.toJSON() : user
  const safeUser = { ...plain }
  delete safeUser.password_hash
  return safeUser
}

function getJwtSecret() {
  const jwtSecret = process.env.JWT_SECRET

  if (!jwtSecret) {
    const error = new Error('JWT secret is not configured')
    error.statusCode = 500
    throw error
  }

  return jwtSecret
}

function buildAccessTokenPayload(user) {
  return {
    sub: user.id,
    company_id: user.company_id,
    role: user.role,
  }
}

function createAccessToken(user) {
  return jwt.sign(buildAccessTokenPayload(user), getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  })
}

async function createRefreshToken(user, transaction = null) {
  const rawToken = crypto.randomBytes(48).toString('hex')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_SECONDS * 1000)

  await RefreshToken.create(
    {
      user_id: user.id,
      token_hash: hashToken(rawToken),
      expires_at: expiresAt,
      revoked: false,
    },
    transaction ? { transaction } : undefined
  )

  return {
    rawToken,
    expiresAt,
  }
}

async function issueTokenPair(user, transaction = null) {
  const accessToken = createAccessToken(user)
  const { rawToken } = await createRefreshToken(user, transaction)

  return {
    accessToken,
    refreshToken: rawToken,
    expiresIn: ACCESS_TOKEN_EXPIRES_SECONDS,
  }
}

async function register(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const { name, email, password, company_name: companyName } = req.body
  const normalizedEmail = normalizeEmail(email)

  try {
    const existingUser = await User.findOne({ where: { email: normalizedEmail } })

    if (existingUser) {
      return sendError(res, {
        statusCode: 422,
        message: 'Validation failed',
        errors: [{ field: 'email', message: 'Email is already in use' }],
      })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
    const rawToken = uuidv4()
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS)

    const transaction = await sequelize.transaction()

    let company
    let user

    try {
      company = await Company.create(
        {
          name: companyName.trim(),
          email: normalizedEmail,
        },
        { transaction }
      )

      let companyAdminRole = await Role.findOne({
        where: { name: 'company_admin' },
        transaction,
      })

      if (!companyAdminRole) {
        companyAdminRole = await Role.create(
          {
            name: 'company_admin',
            description: 'Company-level administrator',
          },
          { transaction }
        )
      }

      user = await User.create(
        {
          company_id: company.id,
          role_id: companyAdminRole ? companyAdminRole.id : null,
          name: name.trim(),
          email: normalizedEmail,
          password_hash: passwordHash,
          role: 'company_admin',
          is_active: true,
          email_verified_at: null,
        },
        { transaction }
      )

      if (companyAdminRole) {
        await RoleUser.create(
          {
            role_id: companyAdminRole.id,
            user_id: user.id,
          },
          { transaction }
        )
      }

      await EmailVerificationToken.destroy({
        where: {
          user_id: user.id,
          used_at: null,
        },
        transaction,
      })

      await EmailVerificationToken.create(
        {
          user_id: user.id,
          token_hash: tokenHash,
          purpose: 'register',
          expires_at: expiresAt,
        },
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }

    let message = 'Registration successful. Please verify your email before login.'

    try {
      await sendVerificationEmail({
        to: normalizedEmail,
        name: user.name,
        token: rawToken,
      })
    } catch (mailError) {
      console.warn('[Auth] Verification email failed during registration:', mailError.message)
      message =
        'Registration successful, but verification email could not be sent. Please request resend.'
    }

    await AuditLogger.log({
      company_id: company.id,
      user_id: user.id,
      action: 'AUTH_REGISTERED',
      entity_type: 'User',
      entity_id: user.id,
      new_values: {
        email: user.email,
        role: user.role,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      statusCode: 201,
      data: sanitizeUser(user),
      message,
    })
  } catch (err) {
    return next(err)
  }
}

async function verifyEmail(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const { token } = req.params
  const tokenHash = hashToken(token)

  try {
    const tokenRow = await EmailVerificationToken.findOne({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
    })

    if (!tokenRow) {
      return sendError(res, {
        statusCode: 400,
        message: 'Invalid or expired verification token',
        errors: [{ code: 'INVALID_TOKEN', message: 'Token is invalid, used, or expired' }],
      })
    }

    const transaction = await sequelize.transaction()

    let user

    try {
      user = await User.findByPk(tokenRow.user_id, { transaction, lock: transaction.LOCK.UPDATE })

      if (!user) {
        await transaction.rollback()
        return sendError(res, {
          statusCode: 404,
          message: 'User for this verification token does not exist',
        })
      }

      if (!user.email_verified_at) {
        user.email_verified_at = new Date()
        await user.save({ transaction })
      }

      await EmailVerificationToken.destroy({
        where: { user_id: user.id },
        transaction,
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'AUTH_EMAIL_VERIFIED',
      entity_type: 'User',
      entity_id: user.id,
      new_values: { email_verified_at: user.email_verified_at },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      message: 'Email verified successfully',
      data: null,
    })
  } catch (err) {
    return next(err)
  }
}

async function resendVerification(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const normalizedEmail = normalizeEmail(req.body.email)

  try {
    const user = await User.findOne({ where: { email: normalizedEmail } })

    if (!user) {
      return sendError(res, {
        statusCode: 404,
        message: 'User not found for the provided email',
      })
    }

    if (user.email_verified_at) {
      return sendError(res, {
        statusCode: 400,
        message: 'Email is already verified',
      })
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const resendCount = await EmailVerificationToken.count({
      where: {
        user_id: user.id,
        purpose: 'resend',
        created_at: { [Op.gte]: oneHourAgo },
      },
    })

    if (resendCount >= RESEND_LIMIT_PER_HOUR) {
      return sendError(res, {
        statusCode: 429,
        message: 'Resend limit exceeded. Maximum 3 verification emails per hour.',
        errors: [
          {
            code: 'RESEND_LIMIT_EXCEEDED',
            message: 'Try again after one hour.',
          },
        ],
      })
    }

    const rawToken = uuidv4()
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS)

    const transaction = await sequelize.transaction()

    try {
      await EmailVerificationToken.destroy({
        where: {
          user_id: user.id,
          used_at: null,
        },
        transaction,
      })

      await EmailVerificationToken.create(
        {
          user_id: user.id,
          token_hash: tokenHash,
          purpose: 'resend',
          expires_at: expiresAt,
        },
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }

    let message = 'Verification email sent successfully'

    try {
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        token: rawToken,
      })
    } catch (mailError) {
      console.warn('[Auth] Verification email resend failed:', mailError.message)
      message =
        'Verification token refreshed, but email could not be sent. Please retry in a moment.'
    }

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'AUTH_VERIFICATION_RESENT',
      entity_type: 'User',
      entity_id: user.id,
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      message,
      data: null,
    })
  } catch (err) {
    return next(err)
  }
}

async function login(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const normalizedEmail = normalizeEmail(req.body.email)
  const userAgent = req.get('user-agent') || null

  try {
    const user = await User.scope('withPassword').findOne({
      where: { email: normalizedEmail },
    })

    if (!user) {
      return sendError(res, {
        statusCode: 401,
        message: 'Invalid email or password',
      })
    }

    if (!user.is_active) {
      return sendError(res, {
        statusCode: 403,
        message: 'Account is inactive',
      })
    }

    if (!user.email_verified_at) {
      return sendError(res, {
        statusCode: 403,
        message: 'Email must be verified before login',
      })
    }

    if (user.locked_until && user.locked_until > new Date()) {
      return sendError(res, {
        statusCode: 423,
        message: 'Account is temporarily locked. Please try again later.',
        errors: [
          {
            code: 'ACCOUNT_LOCKED',
            message: 'Too many failed login attempts',
          },
        ],
      })
    }

    const passwordMatches = await bcrypt.compare(req.body.password, user.password_hash)

    if (!passwordMatches) {
      const nextFailedAttempts = (user.failed_attempts || 0) + 1
      const shouldLockAccount = nextFailedAttempts >= MAX_FAILED_ATTEMPTS

      user.failed_attempts = nextFailedAttempts
      user.locked_until = shouldLockAccount
        ? new Date(Date.now() + ACCOUNT_LOCKOUT_WINDOW_MS)
        : null
      await user.save()

      await AuditLogger.log({
        company_id: user.company_id,
        user_id: user.id,
        action: 'AUTH_LOGIN_FAILED',
        entity_type: 'User',
        entity_id: user.id,
        new_values: {
          failed_attempts: user.failed_attempts,
          user_agent: userAgent,
        },
        ip_address: req.ip || null,
      })

      if (shouldLockAccount) {
        return sendError(res, {
          statusCode: 423,
          message: 'Account locked for 15 minutes after repeated failed attempts',
        })
      }

      return sendError(res, {
        statusCode: 401,
        message: 'Invalid email or password',
      })
    }

    user.failed_attempts = 0
    user.locked_until = null
    user.last_login_at = new Date()
    await user.save()

    const { accessToken, refreshToken, expiresIn } = await issueTokenPair(user)

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      entity_type: 'User',
      entity_id: user.id,
      new_values: {
        last_login_at: user.last_login_at,
        user_agent: userAgent,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: {
        user: sanitizeUser(user),
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
      },
      message: 'Login successful',
    })
  } catch (err) {
    return next(err)
  }
}

async function refresh(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const userAgent = req.get('user-agent') || null
  const refreshTokenHash = hashToken(req.body.refresh_token)

  try {
    const refreshTokenRow = await RefreshToken.findOne({
      where: {
        token_hash: refreshTokenHash,
        revoked: false,
        expires_at: { [Op.gt]: new Date() },
      },
    })

    if (!refreshTokenRow) {
      return sendError(res, {
        statusCode: 401,
        message: 'Invalid or expired refresh token',
      })
    }

    const user = await User.scope('withPassword').findByPk(refreshTokenRow.user_id)

    if (!user || !user.is_active) {
      return sendError(res, {
        statusCode: 401,
        message: 'Invalid authentication context',
      })
    }

    if (!user.email_verified_at) {
      return sendError(res, {
        statusCode: 403,
        message: 'Email must be verified before requesting new tokens',
      })
    }

    const transaction = await sequelize.transaction()

    let tokenPair

    try {
      await refreshTokenRow.update(
        {
          revoked: true,
        },
        { transaction }
      )

      tokenPair = await issueTokenPair(user, transaction)
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'AUTH_TOKEN_REFRESHED',
      entity_type: 'User',
      entity_id: user.id,
      new_values: {
        user_agent: userAgent,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: {
        access_token: tokenPair.accessToken,
        refresh_token: tokenPair.refreshToken,
        expires_in: tokenPair.expiresIn,
      },
      message: 'Access token refreshed successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function logout(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const user = req.user
  const userAgent = req.get('user-agent') || null

  try {
    const transaction = await sequelize.transaction()

    try {
      if (req.accessToken && req.authPayload && req.authPayload.exp) {
        const currentTokenHash = hashToken(req.accessToken)
        const expiresAt = new Date(req.authPayload.exp * 1000)

        await AccessTokenBlacklist.findOrCreate({
          where: {
            token_hash: currentTokenHash,
          },
          defaults: {
            user_id: user.id,
            token_hash: currentTokenHash,
            expires_at: expiresAt,
          },
          transaction,
        })
      }

      await RefreshToken.update(
        { revoked: true },
        {
          where: {
            user_id: user.id,
            token_hash: hashToken(req.body.refresh_token),
            revoked: false,
          },
          transaction,
        }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'AUTH_LOGOUT',
      entity_type: 'User',
      entity_id: user.id,
      new_values: {
        user_agent: userAgent,
      },
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: null,
      message: 'Logged out successfully',
    })
  } catch (err) {
    return next(err)
  }
}

async function forgotPassword(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const normalizedEmail = normalizeEmail(req.body.email)
  const genericMessage = 'If an account with that email exists, a password reset link has been sent.'

  try {
    const user = await User.findOne({ where: { email: normalizedEmail } })

    if (user) {
      const rawToken = uuidv4()
      const tokenHash = hashToken(rawToken)
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS)

      const transaction = await sequelize.transaction()

      try {
        await PasswordResetToken.destroy({
          where: { email: normalizedEmail },
          transaction,
        })

        await PasswordResetToken.create(
          {
            email: normalizedEmail,
            token_hash: tokenHash,
            expires_at: expiresAt,
          },
          { transaction }
        )

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }

      try {
        await sendPasswordResetEmail({
          to: normalizedEmail,
          name: user.name,
          token: rawToken,
        })
      } catch (mailError) {
        console.warn('[Auth] Password reset email failed:', mailError.message)
      }

      await AuditLogger.log({
        company_id: user.company_id,
        user_id: user.id,
        action: 'AUTH_PASSWORD_RESET_REQUESTED',
        entity_type: 'User',
        entity_id: user.id,
        ip_address: req.ip || null,
      })
    }

    return sendSuccess(res, {
      data: null,
      message: genericMessage,
    })
  } catch (err) {
    return next(err)
  }
}

async function resetPassword(req, res, next) {
  const errors = validationErrors(req)

  if (errors) {
    return sendError(res, {
      statusCode: 422,
      message: 'Validation failed',
      errors,
    })
  }

  const normalizedEmail = normalizeEmail(req.body.email)
  const tokenHash = hashToken(req.body.token)

  try {
    const tokenRow = await PasswordResetToken.findOne({
      where: {
        email: normalizedEmail,
        token_hash: tokenHash,
        expires_at: { [Op.gt]: new Date() },
      },
    })

    if (!tokenRow) {
      return sendError(res, {
        statusCode: 400,
        message: 'Invalid or expired password reset token',
      })
    }

    const transaction = await sequelize.transaction()

    let user

    try {
      user = await User.scope('withPassword').findOne({
        where: { email: normalizedEmail },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!user) {
        await transaction.rollback()
        return sendError(res, {
          statusCode: 404,
          message: 'User not found for this password reset request',
        })
      }

      user.password_hash = await bcrypt.hash(req.body.password, BCRYPT_COST)
      user.failed_attempts = 0
      user.locked_until = null
      user.password_changed_at = new Date()
      await user.save({ transaction })

      await PasswordResetToken.destroy({
        where: { email: normalizedEmail },
        transaction,
      })

      await RefreshToken.update(
        { revoked: true },
        {
          where: {
            user_id: user.id,
            revoked: false,
          },
          transaction,
        }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }

    await AuditLogger.log({
      company_id: user.company_id,
      user_id: user.id,
      action: 'AUTH_PASSWORD_RESET_COMPLETED',
      entity_type: 'User',
      entity_id: user.id,
      ip_address: req.ip || null,
    })

    return sendSuccess(res, {
      data: null,
      message: 'Password has been reset successfully. Please log in again.',
    })
  } catch (err) {
    return next(err)
  }
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
}
