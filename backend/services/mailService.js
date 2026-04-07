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

module.exports = {
  sendVerificationEmail,
}
