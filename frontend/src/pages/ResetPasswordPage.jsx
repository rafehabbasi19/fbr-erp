import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import ErrorAlert from '../components/ErrorAlert'
import { resetPasswordRequest } from '../services/authApi'
import { getApiErrorMessage } from '../utils/errorMessage'
import { scrollToFirstFieldError, scrollToRef } from '../utils/scrollToError'

function validate(values) {
  const errors = {}
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  if (!values.token) {
    errors.token = 'Reset token is required'
  } else if (!uuidPattern.test(values.token)) {
    errors.token = 'Reset token must be a valid UUID'
  }

  if (!values.email) {
    errors.email = 'Email is required'
  } else if (!emailPattern.test(values.email)) {
    errors.email = 'Enter a valid email address'
  }

  if (!values.password) {
    errors.password = 'Password is required'
  } else if (values.password.length < 8) {
    errors.password = 'Password must be at least 8 characters'
  }

  if (!values.passwordConfirmation) {
    errors.passwordConfirmation = 'Password confirmation is required'
  } else if (values.passwordConfirmation !== values.password) {
    errors.passwordConfirmation = 'Password confirmation does not match'
  }

  return errors
}

function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const tokenRef = useRef(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const passwordConfirmationRef = useRef(null)
  const serverErrorRef = useRef(null)

  const [form, setForm] = useState({
    token: params.get('token') || '',
    email: params.get('email') || '',
    password: '',
    passwordConfirmation: '',
  })
  const [errors, setErrors] = useState({})
  const [serverMessage, setServerMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fieldRefs = useMemo(
    () => ({
      token: tokenRef,
      email: emailRef,
      password: passwordRef,
      passwordConfirmation: passwordConfirmationRef,
    }),
    []
  )

  useEffect(() => {
    if (serverMessage) {
      scrollToRef(serverErrorRef)
    }
  }, [serverMessage])

  function updateForm(name, value) {
    setForm(current => ({
      ...current,
      [name]: value,
    }))

    setErrors(current => ({
      ...current,
      [name]: '',
    }))

    setServerMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const nextErrors = validate(form)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      scrollToFirstFieldError(nextErrors, fieldRefs)
      return
    }

    setIsSubmitting(true)

    try {
      await resetPasswordRequest({
        token: form.token.trim(),
        email: form.email.trim(),
        password: form.password,
        password_confirmation: form.passwordConfirmation,
      })

      navigate('/login', {
        replace: true,
        state: {
          resetMessage: 'Password reset successfully. You can now sign in with your new password.',
        },
      })
    } catch (error) {
      const apiMessage = getApiErrorMessage(
        error,
        'Unable to reset password right now. Please request a new reset link.'
      )
      setServerMessage(apiMessage)
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
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">Reset password</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Set your new password and continue to sign in.
            </p>
          </header>

          {serverMessage ? (
            <ErrorAlert ref={serverErrorRef} title="Password Reset Failed" message={serverMessage} />
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <label className="block">
              <span className="mb-2 block text-sm text-zinc-300">Reset token</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                type="text"
                ref={tokenRef}
                aria-invalid={Boolean(errors.token)}
                value={form.token}
                onChange={event => updateForm('token', event.target.value)}
                placeholder="Paste your reset token"
              />
              {errors.token ? <span className="mt-2 block text-xs text-zinc-400">{errors.token}</span> : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-zinc-300">Email</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                type="email"
                ref={emailRef}
                aria-invalid={Boolean(errors.email)}
                value={form.email}
                onChange={event => updateForm('email', event.target.value)}
                autoComplete="email"
                placeholder="name@company.com"
              />
              {errors.email ? <span className="mt-2 block text-xs text-zinc-400">{errors.email}</span> : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-zinc-300">New password</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                type="password"
                ref={passwordRef}
                aria-invalid={Boolean(errors.password)}
                value={form.password}
                onChange={event => updateForm('password', event.target.value)}
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
              />
              {errors.password ? (
                <span className="mt-2 block text-xs text-zinc-400">{errors.password}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-zinc-300">Confirm password</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                type="password"
                ref={passwordConfirmationRef}
                aria-invalid={Boolean(errors.passwordConfirmation)}
                value={form.passwordConfirmation}
                onChange={event => updateForm('passwordConfirmation', event.target.value)}
                autoComplete="new-password"
                placeholder="Repeat your password"
              />
              {errors.passwordConfirmation ? (
                <span className="mt-2 block text-xs text-zinc-400">{errors.passwordConfirmation}</span>
              ) : null}
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
                  Resetting...
                </>
              ) : (
                'Reset password'
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

export default ResetPasswordPage
