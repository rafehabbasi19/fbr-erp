import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import ErrorAlert from '../components/ErrorAlert'
import { getApiErrorMessage } from '../utils/errorMessage'
import { scrollToFirstFieldError, scrollToRef } from '../utils/scrollToError'

function validateLogin(values) {
  const errors = {}
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!values.email) {
    errors.email = 'Email is required'
  } else if (!emailPattern.test(values.email)) {
    errors.email = 'Enter a valid email address'
  }

  if (!values.password) {
    errors.password = 'Password is required'
  }

  return errors
}

function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const lockoutRef = useRef(null)
  const serverErrorRef = useRef(null)

  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverMessage, setServerMessage] = useState('')
  const [lockoutMessage, setLockoutMessage] = useState('')

  const noticeMessage = useMemo(
    () => location.state?.resetMessage || location.state?.registerMessage || '',
    [location.state]
  )

  const registerVerificationUrl = useMemo(
    () => location.state?.registerVerificationUrl || '',
    [location.state]
  )

  const fieldRefs = useMemo(
    () => ({
      email: emailRef,
      password: passwordRef,
    }),
    []
  )

  useEffect(() => {
    if (lockoutMessage) {
      scrollToRef(lockoutRef)
      return
    }

    if (serverMessage) {
      scrollToRef(serverErrorRef)
    }
  }, [lockoutMessage, serverMessage])

  function handleChange(event) {
    const { name, value } = event.target

    setForm(current => ({
      ...current,
      [name]: value,
    }))

    setErrors(current => ({
      ...current,
      [name]: '',
    }))
    setServerMessage('')
    setLockoutMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const nextErrors = validateLogin(form)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      scrollToFirstFieldError(nextErrors, fieldRefs)
      return
    }

    setIsSubmitting(true)
    setServerMessage('')
    setLockoutMessage('')

    try {
      await login({
        email: form.email.trim(),
        password: form.password,
      })

      navigate('/dashboard', { replace: true })
    } catch (error) {
      const statusCode = error?.response?.status
      const apiMessage = getApiErrorMessage(
        error,
        'Unable to sign in right now. Please try again.'
      )

      if (statusCode === 423) {
        setLockoutMessage(apiMessage)
      } else {
        setServerMessage(apiMessage)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto flex min-h-[85vh] w-full max-w-5xl items-center justify-center">
        <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <header className="mb-7">
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Smart Invoicing FBR</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">Sign in</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Access your company workspace using your verified account.
            </p>
          </header>

          {noticeMessage ? (
            <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
              <p>{noticeMessage}</p>
              {registerVerificationUrl ? (
                <p className="mt-2 text-xs text-zinc-300">
                  Verification link:{' '}
                  <a
                    href={registerVerificationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4 break-all"
                  >
                    Open verification link
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}

          {lockoutMessage ? (
            <ErrorAlert ref={lockoutRef} title="Account Locked" message={lockoutMessage} />
          ) : null}

          {serverMessage ? (
            <ErrorAlert ref={serverErrorRef} title="Sign-In Failed" message={serverMessage} />
          ) : null}

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <label className="block">
              <span className="mb-2 block text-sm text-zinc-300">Email</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                type="email"
                name="email"
                ref={emailRef}
                aria-invalid={Boolean(errors.email)}
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                placeholder="name@company.com"
              />
              {errors.email ? <span className="mt-2 block text-xs text-zinc-400">{errors.email}</span> : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-zinc-300">Password</span>
              <div className="relative">
                <input
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 pr-20 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  ref={passwordRef}
                  aria-invalid={Boolean(errors.password)}
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:border-zinc-500"
                  onClick={() => setShowPassword(current => !current)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password ? (
                <span className="mt-2 block text-xs text-zinc-400">{errors.password}</span>
              ) : null}
            </label>

            <div className="flex items-center justify-between">
              <Link to="/forgot-password" className="text-sm text-zinc-300 underline underline-offset-4">
                Forgot password?
              </Link>
              <Link to="/register" className="text-sm text-zinc-300 underline underline-offset-4">
                Create account
              </Link>
            </div>

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
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}

export default LoginPage
