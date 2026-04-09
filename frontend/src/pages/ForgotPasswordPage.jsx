import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import ErrorAlert from '../components/ErrorAlert'
import { forgotPasswordRequest } from '../services/authApi'
import { getApiErrorMessage } from '../utils/errorMessage'
import { scrollToRef } from '../utils/scrollToError'

function ForgotPasswordPage() {
  const emailRef = useRef(null)
  const serverErrorRef = useRef(null)

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [serverMessage, setServerMessage] = useState('')

  useEffect(() => {
    if (serverMessage) {
      scrollToRef(serverErrorRef)
    }
  }, [serverMessage])

  function validate() {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!email.trim()) {
      return 'Email is required'
    }

    if (!emailPattern.test(email.trim())) {
      return 'Enter a valid email address'
    }

    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const validationError = validate()
    setError(validationError)

    if (validationError) {
      scrollToRef(emailRef)
      return
    }

    setIsSubmitting(true)
    setSuccessMessage('')
    setServerMessage('')

    try {
      const response = await forgotPasswordRequest({ email: email.trim() })
      setSuccessMessage(
        response.data?.message ||
          'If an account with that email exists, a password reset link has been sent.'
      )
    } catch (_error) {
      setServerMessage(
        getApiErrorMessage(
          _error,
          'Unable to process your request right now. Please try again in a moment.'
        )
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto flex min-h-[85vh] w-full max-w-5xl items-center justify-center">
        <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <header className="mb-7">
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Account Recovery</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">Forgot password</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Enter your email and we will send password reset instructions.
            </p>
          </header>

          {successMessage ? (
            <p className="mb-4 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
              {successMessage}
            </p>
          ) : null}

          {serverMessage ? (
            <ErrorAlert ref={serverErrorRef} title="Request Failed" message={serverMessage} />
          ) : null}

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <label className="block">
              <span className="mb-2 block text-sm text-zinc-300">Email</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                type="email"
                ref={emailRef}
                aria-invalid={Boolean(error)}
                value={email}
                onChange={event => {
                  setEmail(event.target.value)
                  setError('')
                  setServerMessage('')
                }}
                autoComplete="email"
                placeholder="name@company.com"
              />
              {error ? <span className="mt-2 block text-xs text-zinc-400">{error}</span> : null}
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-600 bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-900"
                    aria-hidden="true"
                  />
                  Sending...
                </>
              ) : (
                'Send reset link'
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-zinc-400">
            <Link to="/login" className="underline underline-offset-4 text-zinc-300">
              Back to login
            </Link>
          </p>
        </section>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
