function decodeBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '==='.slice((normalized.length + 3) % 4)

  try {
    return atob(padded)
  } catch (_error) {
    return null
  }
}

export function parseJwtPayload(token) {
  if (!token || typeof token !== 'string') {
    return null
  }

  const segments = token.split('.')
  if (segments.length !== 3) {
    return null
  }

  const decoded = decodeBase64Url(segments[1])
  if (!decoded) {
    return null
  }

  try {
    return JSON.parse(decoded)
  } catch (_error) {
    return null
  }
}

export function isTokenValid(token) {
  const payload = parseJwtPayload(token)

  if (!payload || !payload.exp) {
    return false
  }

  return payload.exp * 1000 > Date.now()
}
