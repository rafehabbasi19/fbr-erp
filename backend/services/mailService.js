'use strict'

const nodemailer = require('nodemailer')

let transporter = null

function buildTransporter() {
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const user = process.env.SMTP_USER || process.env.MAIL_USER
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS

  if (!host || !user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  })
}

function getTransporter() {
  if (transporter === null) {
    transporter = buildTransporter()
  }

  return transporter
}

function buildVerificationLink(token) {
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '')
  const verifyPath = process.env.EMAIL_VERIFICATION_PATH || '/verify-email'
  return `${clientUrl}${verifyPath}?token=${encodeURIComponent(token)}`
}

function buildPasswordResetLink(token, email) {
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '')
  const resetPath = process.env.PASSWORD_RESET_PATH || '/reset-password'
  return `${clientUrl}${resetPath}?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
}

async function sendVerificationEmail({ to, name, token }) {
  const verificationLink = buildVerificationLink(token)
  const activeTransporter = getTransporter()

  if (!activeTransporter) {
    console.info(
      `[MailService] SMTP not configured. Verification link for ${to}: ${verificationLink}`
    )

    return {
      skipped: true,
      previewUrl: verificationLink,
    }
  }

  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    process.env.MAIL_USER ||
    'no-reply@fbr.local'

  const info = await activeTransporter.sendMail({
    from,
    to,
    subject: 'Verify your email address',
    text: [
      `Hi ${name},`,
      '',
      'Please verify your email by opening the link below:',
      verificationLink,
      '',
      'This link expires in 24 hours.',
    ].join('\n'),
    html: `
      <p>Hi ${name},</p>
      <p>Please verify your email by clicking the link below:</p>
      <p><a href="${verificationLink}">${verificationLink}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  })

  return {
    skipped: false,
    messageId: info.messageId,
    previewUrl: verificationLink,
  }
}

async function sendPasswordResetEmail({ to, name, token }) {
  const resetLink = buildPasswordResetLink(token, to)
  const activeTransporter = getTransporter()

  if (!activeTransporter) {
    console.info(`[MailService] SMTP not configured. Password reset link for ${to}: ${resetLink}`)

    return {
      skipped: true,
      previewUrl: resetLink,
    }
  }

  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    process.env.MAIL_USER ||
    'no-reply@fbr.local'

  const info = await activeTransporter.sendMail({
    from,
    to,
    subject: 'Reset your password',
    text: [
      `Hi ${name},`,
      '',
      'You requested a password reset. Open this link to continue:',
      resetLink,
      '',
      'This link expires in 1 hour.',
    ].join('\n'),
    html: `
      <p>Hi ${name},</p>
      <p>You requested a password reset. Click the link below to continue:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>This link expires in 1 hour.</p>
    `,
  })

  return {
    skipped: false,
    messageId: info.messageId,
    previewUrl: resetLink,
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
}
