export function getApiErrorMessage(error, fallbackMessage) {
  const serverMessage = error?.response?.data?.message

  if (serverMessage) {
    return serverMessage
  }

  if (error?.request) {
    const attemptedBaseUrl = error?.config?.baseURL || import.meta.env.VITE_API_URL

    if (attemptedBaseUrl) {
      return `Cannot reach the API server at ${attemptedBaseUrl}. Make sure backend is running and CORS allows your frontend origin.`
    }

    return 'Cannot reach the API server. Make sure backend is running and CORS allows your frontend origin.'
  }

  return fallbackMessage
}
