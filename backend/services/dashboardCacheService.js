'use strict'

const { createClient } = require('redis')

const DASHBOARD_SUMMARY_TTL_MS = 5 * 60 * 1000
const DASHBOARD_CACHE_PREFIX = 'dashboard:summary:'
const summaryCacheStore = new Map()

let redisClient = null
let redisClientReadyPromise = null

function isRedisEnabled() {
  if (process.env.APP_ENV === 'test' || process.env.NODE_ENV === 'test') {
    return false
  }

  return String(process.env.REDIS_ENABLED || 'true').trim().toLowerCase() !== 'false'
}

function buildRedisUrl() {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL
  }

  const host = process.env.REDIS_HOST || '127.0.0.1'
  const port = process.env.REDIS_PORT || '6379'
  const db = process.env.REDIS_DB || '0'
  const password = process.env.REDIS_PASSWORD

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}/${db}`
  }

  return `redis://${host}:${port}/${db}`
}

function isRedisConnected() {
  return Boolean(redisClient && redisClient.isOpen)
}

function pruneLocalCache() {
  const now = Date.now()

  for (const [cacheKey, cached] of summaryCacheStore.entries()) {
    if (cached.expiresAt <= now) {
      summaryCacheStore.delete(cacheKey)
    }
  }
}

function getFromLocalCache(cacheKey) {
  if (!cacheKey) {
    return null
  }

  pruneLocalCache()

  const cached = summaryCacheStore.get(cacheKey)
  return cached ? cached.value : null
}

function setInLocalCache(cacheKey, value, ttlMs = DASHBOARD_SUMMARY_TTL_MS) {
  if (!cacheKey) {
    return
  }

  summaryCacheStore.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}

function invalidateLocalCacheByCompany(companyId) {
  if (!companyId) {
    return
  }

  const companyPrefix = `${DASHBOARD_CACHE_PREFIX}${companyId}:`

  for (const cacheKey of summaryCacheStore.keys()) {
    if (cacheKey.startsWith(companyPrefix)) {
      summaryCacheStore.delete(cacheKey)
    }
  }
}

async function getRedisClient() {
  if (!isRedisEnabled()) {
    return null
  }

  if (isRedisConnected()) {
    return redisClient
  }

  if (redisClientReadyPromise) {
    return redisClientReadyPromise
  }

  redisClient = createClient({ url: buildRedisUrl() })

  redisClient.on('error', err => {
    if (process.env.APP_ENV !== 'test') {
      // Local cache fallback remains active when Redis is unreachable.
      console.warn('[dashboard-cache] Redis error:', err.message)
    }
  })

  redisClientReadyPromise = redisClient
    .connect()
    .then(() => redisClient)
    .catch(() => {
      redisClient = null
      return null
    })
    .finally(() => {
      redisClientReadyPromise = null
    })

  return redisClientReadyPromise
}

async function deleteRedisKeysByPattern(client, pattern) {
  if (!client || !client.isOpen) {
    return
  }

  let cursor = '0'

  do {
    const result = await client.scan(cursor, {
      MATCH: pattern,
      COUNT: 100,
    })

    cursor = String(result.cursor)
    const keys = Array.isArray(result.keys) ? result.keys : []

    if (keys.length) {
      await client.del(keys)
    }
  } while (cursor !== '0')
}

function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase()
  return normalized || 'user'
}

function buildDashboardSummaryCacheKey(user) {
  if (!user || !user.company_id) {
    return null
  }

  const role = normalizeRole(user.role)

  if (role === 'seller') {
    return `${DASHBOARD_CACHE_PREFIX}${user.company_id}:seller:${user.id}`
  }

  return `${DASHBOARD_CACHE_PREFIX}${user.company_id}:${role}`
}

async function getDashboardSummaryCache(cacheKey) {
  if (!cacheKey) {
    return null
  }

  const client = await getRedisClient()

  if (client && client.isOpen) {
    try {
      const redisValue = await client.get(cacheKey)
      if (!redisValue) {
        return null
      }

      return JSON.parse(redisValue)
    } catch (_error) {
      return getFromLocalCache(cacheKey)
    }
  }

  return getFromLocalCache(cacheKey)
}

async function setDashboardSummaryCache(cacheKey, value, ttlMs = DASHBOARD_SUMMARY_TTL_MS) {
  if (!cacheKey) {
    return
  }

  setInLocalCache(cacheKey, value, ttlMs)

  const client = await getRedisClient()

  if (client && client.isOpen) {
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000))

    try {
      await client.set(cacheKey, JSON.stringify(value), {
        EX: ttlSeconds,
      })
    } catch (_error) {
      // Keep local cache available if Redis write fails.
    }
  }
}

async function invalidateDashboardSummaryCacheForCompany(companyId) {
  if (!companyId) {
    return
  }

  invalidateLocalCacheByCompany(companyId)

  const client = await getRedisClient()

  if (client && client.isOpen) {
    try {
      await deleteRedisKeysByPattern(client, `${DASHBOARD_CACHE_PREFIX}${companyId}:*`)
    } catch (_error) {
      // Local invalidation already completed.
    }
  }
}

async function clearDashboardSummaryCache() {
  summaryCacheStore.clear()

  const client = await getRedisClient()

  if (client && client.isOpen) {
    try {
      await deleteRedisKeysByPattern(client, `${DASHBOARD_CACHE_PREFIX}*`)
    } catch (_error) {
      // No-op.
    }
  }
}

module.exports = {
  DASHBOARD_SUMMARY_TTL_MS,
  buildDashboardSummaryCacheKey,
  getDashboardSummaryCache,
  setDashboardSummaryCache,
  invalidateDashboardSummaryCacheForCompany,
  clearDashboardSummaryCache,
}
