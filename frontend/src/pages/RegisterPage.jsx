import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import ErrorAlert from '../components/ErrorAlert'
import { registerRequest } from '../services/authApi'
import { getApiErrorMessage } from '../utils/errorMessage'
import { scrollToFirstFieldError, scrollToRef } from '../utils/scrollToError'

function validate(values) {
  const errors = {}
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!values.name.trim()) {
    errors.name = 'Name is required'
  } else if (values.name.trim().length > 100) {
    errors.name = 'Name must not exceed 100 characters'
  }

  if (!values.companyName.trim()) {
    errors.companyName = 'Company name is required'
  }

  if (!values.email.trim()) {
    errors.email = 'Email is required'
  } else if (!emailPattern.test(values.email.trim())) {
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

function mapApiValidationErrors(apiErrors) {
  const fieldMap = {
    company_name: 'companyName',
    password_confirmation: 'passwordConfirmation',
  }

  return (apiErrors || []).reduce((accumulator, item) => {
    const rawField = item?.field
    const targetField = fieldMap[rawField] || rawField

    if (targetField) {
      accumulator[targetField] = item.message
    }

    return accumulator
  }, {})
}

function RegisterPage() {
  const navigate = useNavigate()

  const nameRef = useRef(null)
  const companyNameRef = useRef(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const passwordConfirmationRef = useRef(null)
  const serverErrorRef = useRef(null)

  const [form, setForm] = useState({
    name: '',
    email: '',
    companyName: '',
    password: '',
    passwordConfirmation: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverMessage, setServerMessage] = useState('')

  const fieldRefs = useMemo(
    () => ({
      name: nameRef,
      companyName: companyNameRef,
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
    setServerMessage('')

    try {
      const response = await registerRequest({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        password_confirmation: form.passwordConfirmation,
        company_name: form.companyName.trim(),
      })

      const registerMessage =
        response?.data?.message ||
        'Registration completed. Please verify your email before signing in.'
      const registerVerificationUrl =
        response?.data?.meta?.verification_api_url || response?.data?.meta?.verification_url || ''

      navigate('/login', {
        replace: true,
        state: {
          registerMessage,
          registerVerificationUrl,
        },
      })
    } catch (error) {
      const apiMessage = getApiErrorMessage(
        error,
        'Unable to create account right now. Please try again.'
      )
      const apiErrors = error?.response?.data?.errors
      let mergedErrors = {}

      if (Array.isArray(apiErrors) && apiErrors.length > 0) {
        mergedErrors = mapApiValidationErrors(apiErrors)
        setErrors(current => ({ ...current, ...mergedErrors }))
      }

      if (Object.keys(mergedErrors).length > 0) {
        scrollToFirstFieldError(mergedErrors, fieldRefs)
      }

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
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Smart Invoicing FBR</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">Create account</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Register your company account to start invoicing.
            </p>
          </header>

          {serverMessage ? (
            <ErrorAlert ref={serverErrorRef} title="Registration Failed" message={serverMessage} />
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <label className="block">
              <span className="mb-2 block text-sm text-zinc-300">Full name</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                type="text"
                name="name"
                ref={nameRef}
                aria-invalid={Boolean(errors.name)}
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
                placeholder="Muhammad Ali"
              />
              {errors.name ? <span className="mt-2 block text-xs text-zinc-400">{errors.name}</span> : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-zinc-300">Company name</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                type="text"
                name="companyName"
                ref={companyNameRef}
                aria-invalid={Boolean(errors.companyName)}
                value={form.companyName}
                onChange={handleChange}
                autoComplete="organization"
                placeholder="Your company"
              />
              {errors.companyName ? (
                <span className="mt-2 block text-xs text-zinc-400">{errors.companyName}</span>
              ) : null}
            </label>

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
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
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

            <label className="block">
              <span className="mb-2 block text-sm text-zinc-300">Confirm password</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                type={showPassword ? 'text' : 'password'}
                name="passwordConfirmation"
                ref={passwordConfirmationRef}
                aria-invalid={Boolean(errors.passwordConfirmation)}
                value={form.passwordConfirmation}
                onChange={handleChange}
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
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-zinc-400">
            Already have an account?{' '}
            <Link to="/login" className="underline underline-offset-4 text-zinc-300">
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </div>
  )
}

export default RegisterPage
