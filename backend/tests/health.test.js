'use strict'

const request = require('supertest')
const app = require('../app')

describe('API Health Check', () => {
  it('GET /api → 200 with success envelope', async () => {
    const res = await request(app).get('/api')
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeTruthy()
    expect(res.body.message).toMatch(/running/i)
    expect(res.body.errors).toBeNull()
    expect(res.body.meta).toBeNull()
  })

  it('GET /api/v1 → 200 with success envelope', async () => {
    const res = await request(app).get('/api/v1')
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.version).toBe('v1')
  })

  it('GET /api/nonexistent → 404', async () => {
    const res = await request(app).get('/api/nonexistent-route')
    expect(res.statusCode).toBe(404)
    expect(res.body.success).toBe(false)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })
})
