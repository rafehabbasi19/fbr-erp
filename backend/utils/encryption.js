'use strict'

const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/**
 * Returns a 32-byte Buffer key from ENCRYPTION_KEY env var.
 * ENCRYPTION_KEY must be a 64-character hex string.
 */
function getKey() {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(key, 'hex')
}

/**
 * Encrypts a plaintext string.
 * @param {string} plaintext
 * @returns {string} format: "<iv_base64>:<authTag_base64>:<ciphertext_base64>"
 */
function encrypt(plaintext) {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':')
}

/**
 * Decrypts a string produced by encrypt().
 * @param {string} encryptedString format: "<iv_base64>:<authTag_base64>:<ciphertext_base64>"
 * @returns {string} plaintext
 */
function decrypt(encryptedString) {
  const key = getKey()
  const [ivB64, authTagB64, ciphertextB64] = encryptedString.split(':')

  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Invalid encrypted string format')
  }

  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/**
 * SHA-256 hash of a string (for token storage).
 * @param {string} value
 * @returns {string} hex string
 */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

module.exports = { encrypt, decrypt, sha256 }
