'use strict'

const DASHBOARD_SUMMARY_TTL_MS = 5 * 60 * 1000
const summaryCacheStore = new Map()

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
    return `dashboard:summary:${user.company_id}:seller:${user.id}`
  }

  return `dashboard:summary:${user.company_id}:${role}`
}

function getDashboardSummaryCache(cacheKey) {
  if (!cacheKey) {
    return null
  }

  const cached = summaryCacheStore.get(cacheKey)
  if (!cached) {
    return null
  }

  if (cached.expiresAt <= Date.now()) {
    summaryCacheStore.delete(cacheKey)
    return null
  }

  return cached.value
}

function setDashboardSummaryCache(cacheKey, value, ttlMs = DASHBOARD_SUMMARY_TTL_MS) {
  if (!cacheKey) {
    return
  }

  summaryCacheStore.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}

function invalidateDashboardSummaryCacheForCompany(companyId) {
  if (!companyId) {
    return
  }

  const companyPrefix = `dashboard:summary:${companyId}:`

  for (const cacheKey of summaryCacheStore.keys()) {
    if (cacheKey.startsWith(companyPrefix)) {
      summaryCacheStore.delete(cacheKey)
    }
  }
}

function clearDashboardSummaryCache() {
  summaryCacheStore.clear()
}

module.exports = {
  DASHBOARD_SUMMARY_TTL_MS,
  buildDashboardSummaryCacheKey,
  getDashboardSummaryCache,
  setDashboardSummaryCache,
  invalidateDashboardSummaryCacheForCompany,
  clearDashboardSummaryCache,
}
