import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  timeout: 15000,
})

function authHeader(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
}

export async function loginRequest(payload) {
  return api.post('/auth/login', payload)
}

export async function registerRequest(payload) {
  return api.post('/auth/register', payload)
}

export async function refreshRequest(payload) {
  return api.post('/auth/refresh', payload)
}

export async function logoutRequest(payload, token) {
  return api.post('/auth/logout', payload, authHeader(token))
}

export async function forgotPasswordRequest(payload) {
  return api.post('/auth/forgot-password', payload)
}

export async function resetPasswordRequest(payload) {
  return api.post('/auth/reset-password', payload)
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
