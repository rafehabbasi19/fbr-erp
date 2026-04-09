'use strict'

require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

const routes = require('./routes')
const notFound = require('./middleware/notFound')
const errorHandler = require('./middleware/errorHandler')
const { buildEnvelope, sendSuccess } = require('./utils/response')

const app = express()
const APP_ENV = process.env.APP_ENV || process.env.NODE_ENV || 'development'
const isProduction = APP_ENV === 'production'

const configuredCorsOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.CLIENT_URLS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean),
].filter(Boolean)

// ─── Security Headers ──────────────────────────────────────────────────────
app.use(helmet())

// ─── CORS ─────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, Postman, server-to-server).
      if (!origin) {
        return callback(null, true)
      }

      // In development, allow all origins so Vite port changes do not break auth calls.
      if (!isProduction) {
        return callback(null, true)
      }

      if (configuredCorsOrigins.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// ─── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ─── Global Rate Limiter ──────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: buildEnvelope({
    success: false,
    data: null,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
    errors: [{ code: 'RATE_LIMITED', message: 'Request limit exceeded' }],
    meta: null,
  }),
})
app.use(globalLimiter)

// ─── Health Check (unversioned, always available) ─────────────────────────
app.get('/api', (req, res) => {
  return sendSuccess(res, {
    data: {
      service: 'FBR Invoicing API',
      version: 'v1',
      timestamp: new Date().toISOString(),
    },
    message: 'API is running',
  })
})

// ─── Versioned Routes ─────────────────────────────────────────────────────
app.use('/api/v1', routes)

// ─── 404 Handler ──────────────────────────────────────────────────────────
app.use(notFound)

// ─── Global Error Handler ─────────────────────────────────────────────────
app.use(errorHandler)

module.exports = app
