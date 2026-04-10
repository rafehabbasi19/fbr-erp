import axios from 'axios'

const STORAGE_KEY = 'fbr_auth_session'

const baseApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  timeout: 15000,
})

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  timeout: 15000,
})

let refreshInFlight = null

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.accessToken || !parsed.refreshToken) {
      return null
    }

    return parsed
  } catch (_error) {
    return null
  }
}

function dispatchSessionChange(session) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent('fbr-auth-session-changed', { detail: session }))
}

function writeStoredSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  dispatchSessionChange(session)
}

function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEY)
  dispatchSessionChange(null)
}

async function refreshAccessToken() {
  if (!refreshInFlight) {
    const stored = readStoredSession()

    if (!stored?.refreshToken) {
      throw new Error('No refresh token available')
    }

    refreshInFlight = baseApi
      .post('/auth/refresh', { refresh_token: stored.refreshToken })
      .then(response => {
        const data = response.data?.data

        if (!data?.access_token || !data?.refresh_token) {
          throw new Error('Invalid refresh response')
        }

        const nextSession = {
          user: stored.user,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in,
        }

        writeStoredSession(nextSession)
        return nextSession
      })
      .catch(error => {
        const statusCode = error?.response?.status

        if (statusCode === 401 || statusCode === 403) {
          clearStoredSession()
        }

        throw error
      })
      .finally(() => {
        refreshInFlight = null
      })
  }

  return refreshInFlight
}

function shouldAttemptTokenRefresh(error) {
  const statusCode = error?.response?.status
  if (statusCode !== 401) {
    return false
  }

  const message = String(error?.response?.data?.message || '').toLowerCase()
  const errorCodes = Array.isArray(error?.response?.data?.errors)
    ? error.response.data.errors.map(item => String(item?.code || '').toUpperCase())
    : []

  return (
    message.includes('token expired') ||
    message.includes('jwt has expired') ||
    errorCodes.includes('TOKEN_EXPIRED')
  )
}

api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config

    if (!originalRequest || originalRequest._retry || !shouldAttemptTokenRefresh(error)) {
      return Promise.reject(error)
    }

    const requestUrl = String(originalRequest.url || '')
    if (requestUrl.includes('/auth/refresh') || requestUrl.includes('/auth/login')) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      const nextSession = await refreshAccessToken()
      originalRequest.headers = {
        ...(originalRequest.headers || {}),
        Authorization: `Bearer ${nextSession.accessToken}`,
      }

      return api.request(originalRequest)
    } catch (refreshError) {
      return Promise.reject(refreshError)
    }
  }
)

function authHeader(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
}

export async function loginRequest(payload) {
  return baseApi.post('/auth/login', payload)
}

export async function registerRequest(payload) {
  return baseApi.post('/auth/register', payload)
}

export async function refreshRequest(payload) {
  return baseApi.post('/auth/refresh', payload)
}

export async function logoutRequest(payload, token) {
  return baseApi.post('/auth/logout', payload, authHeader(token))
}

export async function forgotPasswordRequest(payload) {
  return baseApi.post('/auth/forgot-password', payload)
}

export async function resetPasswordRequest(payload) {
  return baseApi.post('/auth/reset-password', payload)
}

export async function dashboardSummaryRequest(token) {
  return api.get('/dashboard/summary', authHeader(token))
}

export async function dashboardRevenueChartRequest(token, params = {}) {
  return api.get('/dashboard/revenue-chart', {
    ...authHeader(token),
    params,
  })
}

export async function dashboardTopClientsRequest(token) {
  return api.get('/dashboard/top-clients', authHeader(token))
}

export async function dashboardRecentActivityRequest(token) {
  return api.get('/dashboard/recent-activity', authHeader(token))
}

export async function dashboardRecentInvoicesRequest(token) {
  return api.get('/dashboard/recent-invoices', authHeader(token))
}

export async function dashboardFbrStatusRequest(token) {
  return api.get('/dashboard/fbr-status', authHeader(token))
}

export async function clientsListRequest(token, params = {}) {
  return api.get('/clients', {
    ...authHeader(token),
    params,
  })
}

export async function clientDetailRequest(token, clientId) {
  return api.get(`/clients/${clientId}`, authHeader(token))
}

export async function createClientRequest(token, payload) {
  return api.post('/clients', payload, authHeader(token))
}

export async function updateClientRequest(token, clientId, payload) {
  return api.put(`/clients/${clientId}`, payload, authHeader(token))
}

export async function deleteClientRequest(token, clientId) {
  return api.delete(`/clients/${clientId}`, authHeader(token))
}

export async function clientImportTemplateRequest(token) {
  return api.get('/clients/import-template', {
    ...authHeader(token),
    responseType: 'blob',
  })
}

export async function clientImportRequest(token, file) {
  const formData = new FormData()
  formData.append('file', file)

  return api.post('/clients/import', formData, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function invoicesListRequest(token, params = {}) {
  return api.get('/invoices', {
    ...authHeader(token),
    params,
  })
}

export async function invoiceDetailRequest(token, invoiceId) {
  return api.get(`/invoices/${invoiceId}`, authHeader(token))
}

export async function createInvoiceRequest(token, payload) {
  return api.post('/invoices', payload, authHeader(token))
}

export async function updateInvoiceRequest(token, invoiceId, payload) {
  return api.put(`/invoices/${invoiceId}`, payload, authHeader(token))
}

export async function deleteInvoiceRequest(token, invoiceId) {
  return api.delete(`/invoices/${invoiceId}`, authHeader(token))
}

export async function duplicateInvoiceRequest(token, invoiceId) {
  return api.post(`/invoices/${invoiceId}/duplicate`, {}, authHeader(token))
}

export async function sendInvoiceRequest(token, invoiceId) {
  return api.post(`/invoices/${invoiceId}/send`, {}, authHeader(token))
}

export async function cancelInvoiceRequest(token, invoiceId, payload = {}) {
  return api.post(`/invoices/${invoiceId}/cancel`, payload, authHeader(token))
}

export async function invoicePdfRequest(token, invoiceId, params = {}) {
  return api.get(`/invoices/${invoiceId}/pdf`, {
    ...authHeader(token),
    params,
    responseType: 'blob',
  })
}

export async function taxRatesListRequest(token, params = {}) {
  return api.get('/tax-rates', {
    ...authHeader(token),
    params,
  })
}

export async function taxRatesPreviewRequest(token, payload) {
  return api.post('/tax-rates/preview', payload, authHeader(token))
}

export {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
}
