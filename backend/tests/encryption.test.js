'use strict'

const { encrypt, decrypt, sha256 } = require('../utils/encryption')

// Use a valid test key (64 hex chars)
process.env.ENCRYPTION_KEY = '0'.repeat(64)

describe('encryption util', () => {
  it('encrypts and decrypts a string correctly', () => {
    const original = 'my-secret-fbr-token'
    const encrypted = encrypt(original)
    expect(encrypted).not.toBe(original)
    expect(encrypted.split(':').length).toBe(3)
    expect(decrypt(encrypted)).toBe(original)
  })

  it('produces different ciphertext each call (random IV)', () => {
    const text = 'same-value'
    expect(encrypt(text)).not.toBe(encrypt(text))
  })

  it('sha256 returns a 64-char hex string', () => {
    const hash = sha256('token-value')
    expect(hash).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true)
  })
})
