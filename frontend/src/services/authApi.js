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
