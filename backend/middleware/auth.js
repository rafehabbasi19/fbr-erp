'use strict'

const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { Op } = require('sequelize')

const { sendError } = require('../utils/response')
const { User, AccessTokenBlacklist } = require('../models')

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''

  if (!authHeader.startsWith('Bearer ')) {
    return sendError(res, {
      statusCode: 401,
      message: 'Authorization token is required',
    })
  }

  const token = authHeader.slice(7).trim()

  if (!token) {
    return sendError(res, {
      statusCode: 401,
      message: 'Authorization token is required',
    })
  }

  try {
    const jwtSecret = process.env.JWT_SECRET

    if (!jwtSecret) {
      return sendError(res, {
        statusCode: 500,
        message: 'JWT secret is not configured',
      })
    }

    const payload = jwt.verify(token, jwtSecret)

    const blacklistedToken = await AccessTokenBlacklist.findOne({
      where: {
        token_hash: hashToken(token),
        expires_at: { [Op.gt]: new Date() },
      },
    })

    if (blacklistedToken) {
      return sendError(res, {
        statusCode: 401,
        message: 'Access token is revoked',
      })
    }

    const user = await User.findByPk(payload.sub)

    if (!user || !user.is_active) {
      return sendError(res, {
        statusCode: 401,
        message: 'Invalid authentication context',
      })
    }

    if (user.password_changed_at && payload.iat) {
      const tokenIssuedAtMs = payload.iat * 1000
      if (tokenIssuedAtMs < new Date(user.password_changed_at).getTime()) {
        return sendError(res, {
          statusCode: 401,
          message: 'Access token is no longer valid. Please log in again.',
        })
      }
    }

    req.user = user
    req.authPayload = payload
    req.accessToken = token

    return next()
  } catch (err) {
    return next(err)
  }
}

module.exports = {
  requireAuth,
}
