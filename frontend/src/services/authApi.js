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
