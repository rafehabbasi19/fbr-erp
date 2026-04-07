'use strict'

const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { validationResult } = require('express-validator')
const { Op } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

const { sendSuccess, sendError } = require('../utils/response')
const AuditLogger = require('../utils/auditLogger')
const { sendVerificationEmail } = require('../services/mailService')
const {
  sequelize,
  Company,
  User,
  Role,
  RoleUser,
  EmailVerificationToken,
} = require('../models')

const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000
const RESEND_LIMIT_PER_HOUR = 3
const BCRYPT_COST = 12

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

module.exports = {
  register,
  verifyEmail,
  resendVerification,
}
