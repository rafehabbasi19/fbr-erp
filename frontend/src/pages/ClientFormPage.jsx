import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import ErrorAlert from '../components/ErrorAlert'
import { useAuth } from '../context/AuthContext'
import {
  clientDetailRequest,
  createClientRequest,
  updateClientRequest,
} from '../services/authApi'
import { getApiErrorMessage } from '../utils/errorMessage'
import { scrollToFirstFieldError, scrollToRef } from '../utils/scrollToError'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeOptional(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function buildValidationErrors(form) {
  const errors = {}

  if (!form.name.trim()) {
    errors.name = 'Name is required'
  } else if (form.name.trim().length > 200) {
    errors.name = 'Name must not exceed 200 characters'
  }

  if (!form.client_type) {
    errors.client_type = 'Client type is required'
  } else if (!['individual', 'business'].includes(form.client_type)) {
    errors.client_type = 'Client type must be either individual or business'
  }

  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = 'Email must be valid'
  }

  if (form.ntn.trim() && !/^\d{7}$/.test(form.ntn.trim())) {
    errors.ntn = 'NTN must contain exactly 7 digits'
  }

  if (form.cnic.trim() && !/^\d{13}$/.test(form.cnic.trim())) {
    errors.cnic = 'CNIC must contain exactly 13 digits without dashes'
  }

  if (!form.ntn.trim() && !form.cnic.trim()) {
    errors.ntn = 'At least one of NTN or CNIC must be provided'
  }

  if (form.client_type === 'individual' && !form.cnic.trim()) {
    errors.cnic = 'CNIC is required for individual clients'
  }

  if (form.payment_terms_days.trim()) {
    const parsedDays = Number.parseInt(form.payment_terms_days, 10)

    if (!Number.isInteger(parsedDays) || parsedDays < 0 || parsedDays > 3650) {
      errors.payment_terms_days = 'Payment terms days must be an integer between 0 and 3650'
    }
  }

  if (form.status && !['active', 'inactive'].includes(form.status)) {
    errors.status = 'Status must be either active or inactive'
  }

  return errors
}

function mapApiValidationErrors(apiErrors) {
  const fieldAliases = {
    ntn_num: 'ntn',
    ntn_number: 'ntn',
    client_ntn: 'ntn',
    client_cnic: 'cnic',
  }

  if (Array.isArray(apiErrors)) {
    return apiErrors.reduce((accumulator, item) => {
      const rawField = String(item?.field || '').trim()
      const field = fieldAliases[rawField] || rawField

      if (field) {
        accumulator[field] = item.message
      }

      return accumulator
    }, {})
  }

  if (apiErrors && typeof apiErrors === 'object') {
    return Object.entries(apiErrors).reduce((accumulator, [rawField, rawMessage]) => {
      const field = fieldAliases[rawField] || rawField
      const message = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage

      if (field && message) {
        accumulator[field] = String(message)
      }

      return accumulator
    }, {})
  }

  return {}
}

function ClientFormPage() {
  const { id: clientId } = useParams()
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const isEdit = Boolean(clientId)

  const nameRef = useRef(null)
  const typeRef = useRef(null)
  const ntnRef = useRef(null)
  const cnicRef = useRef(null)
  const strnRef = useRef(null)
  const emailRef = useRef(null)
  const phoneRef = useRef(null)
  const addressRef = useRef(null)
  const cityRef = useRef(null)
  const provinceRef = useRef(null)
  const paymentTermsRef = useRef(null)
  const notesRef = useRef(null)
  const statusRef = useRef(null)
  const serverErrorRef = useRef(null)

  const [form, setForm] = useState({
    name: '',
    client_type: 'business',
    ntn: '',
    cnic: '',
    strn: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    province: '',
    payment_terms_days: '30',
    notes: '',
    status: 'active',
  })
  const [errors, setErrors] = useState({})
  const [serverMessage, setServerMessage] = useState('')
  const [isLoadingClient, setIsLoadingClient] = useState(isEdit)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fieldRefs = useMemo(
    () => ({
      name: nameRef,
      client_type: typeRef,
      ntn: ntnRef,
      cnic: cnicRef,
      strn: strnRef,
      email: emailRef,
      phone: phoneRef,
      address: addressRef,
      city: cityRef,
      province: provinceRef,
      payment_terms_days: paymentTermsRef,
      notes: notesRef,
      status: statusRef,
    }),
    []
  )

  useEffect(() => {
    if (!serverMessage) {
      return
    }

    scrollToRef(serverErrorRef)
  }, [serverMessage])

  useEffect(() => {
    let isMounted = true

    async function loadClientForEdit() {
      if (!isEdit) {
        setIsLoadingClient(false)
        return
      }

      setIsLoadingClient(true)

      try {
        const response = await clientDetailRequest(accessToken, clientId)
        const client = response.data?.data?.client

        if (!isMounted || !client) {
          return
        }

        setForm({
          name: client.name || '',
          client_type: client.client_type || 'business',
          ntn: client.ntn || '',
          cnic: client.cnic || '',
          strn: client.strn || '',
          email: client.email || '',
          phone: client.phone || '',
          address: client.address || '',
          city: client.city || '',
          province: client.province || '',
          payment_terms_days:
            client.payment_terms_days !== null && client.payment_terms_days !== undefined
              ? String(client.payment_terms_days)
              : '30',
          notes: client.notes || '',
          status: client.status || 'active',
        })
      } catch (error) {
        if (!isMounted) {
          return
        }

        setServerMessage(
          getApiErrorMessage(error, 'Unable to load client details for editing. Please go back and try again.')
        )
      } finally {
        if (isMounted) {
          setIsLoadingClient(false)
        }
      }
    }

    loadClientForEdit()

    return () => {
      isMounted = false
    }
  }, [accessToken, clientId, isEdit])

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

    const nextErrors = buildValidationErrors(form)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      scrollToFirstFieldError(nextErrors, fieldRefs)
      return
    }

    const payload = {
      name: form.name.trim(),
      client_type: form.client_type,
      ntn: normalizeOptional(form.ntn),
      cnic: normalizeOptional(form.cnic),
      strn: normalizeOptional(form.strn),
      email: normalizeOptional(form.email),
      phone: normalizeOptional(form.phone),
      address: normalizeOptional(form.address),
      city: normalizeOptional(form.city),
      province: normalizeOptional(form.province),
      payment_terms_days: form.payment_terms_days.trim()
        ? Number.parseInt(form.payment_terms_days, 10)
        : 30,
      notes: normalizeOptional(form.notes),
      status: form.status || 'active',
    }

    setIsSubmitting(true)
    setServerMessage('')

    try {
      if (isEdit) {
        await updateClientRequest(accessToken, clientId, payload)
        navigate(`/clients/${clientId}`)
      } else {
        const response = await createClientRequest(accessToken, payload)
        const newClientId = response.data?.data?.id

        if (newClientId) {
          navigate(`/clients/${newClientId}`)
        } else {
          navigate('/clients')
        }
      }
    } catch (error) {
      const apiMessage = getApiErrorMessage(error, 'Unable to save client right now. Please try again.')
      const apiErrors = error?.response?.data?.errors
      const responseMessage = String(error?.response?.data?.message || '')
      const mappedErrors = mapApiValidationErrors(apiErrors)

      if (!mappedErrors.ntn && /\bntn\b/i.test(responseMessage) && /exist|duplicate|already/i.test(responseMessage)) {
        mappedErrors.ntn = responseMessage
      }

      if (!mappedErrors.cnic && /\bcnic\b/i.test(responseMessage) && /exist|duplicate|already/i.test(responseMessage)) {
        mappedErrors.cnic = responseMessage
      }

      if (Object.keys(mappedErrors).length > 0) {
        setErrors(current => ({
          ...current,
          ...mappedErrors,
        }))

        scrollToFirstFieldError(mappedErrors, fieldRefs)
      }

      setServerMessage(apiMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoadingClient) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
        <div className="mx-auto max-w-4xl">
          <div className="h-20 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
          <div className="mt-4 h-96 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Client Management</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
              {isEdit ? 'Edit Client' : 'Add Client'}
            </h1>
          </div>

          <Link
            to={isEdit ? `/clients/${clientId}` : '/clients'}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
          >
            Back
          </Link>
        </header>

        {serverMessage ? (
          <ErrorAlert
            ref={serverErrorRef}
            title={isEdit ? 'Update Failed' : 'Creation Failed'}
            message={serverMessage}
          />
        ) : null}

        <form
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)]"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-2 block text-sm text-zinc-300">Name *</span>
              <input
                ref={nameRef}
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                placeholder="Client legal name"
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? <span className="mt-1 block text-xs text-zinc-400">{errors.name}</span> : null}
            </label>

            <fieldset ref={typeRef} className="md:col-span-2">
              <legend className="mb-2 text-sm text-zinc-300">Type *</legend>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200">
                  <input
                    type="radio"
                    name="client_type"
                    value="business"
                    checked={form.client_type === 'business'}
                    onChange={handleChange}
                  />
                  Business
                </label>
                <label className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200">
                  <input
                    type="radio"
                    name="client_type"
                    value="individual"
                    checked={form.client_type === 'individual'}
                    onChange={handleChange}
                  />
                  Individual
                </label>
              </div>
              {errors.client_type ? (
                <span className="mt-1 block text-xs text-zinc-400">{errors.client_type}</span>
              ) : null}
              <p className="mt-2 text-xs text-zinc-500">
                NTN required for business clients submitting invoices to FBR.
              </p>
            </fieldset>

            <label>
              <span className="mb-2 block text-sm text-zinc-300">NTN</span>
              <input
                ref={ntnRef}
                name="ntn"
                value={form.ntn}
                onChange={handleChange}
                placeholder="7 digits"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                aria-invalid={Boolean(errors.ntn)}
              />
              {errors.ntn ? <span className="mt-1 block text-xs text-zinc-400">{errors.ntn}</span> : null}
            </label>

            <label>
              <span className="mb-2 block text-sm text-zinc-300">CNIC</span>
              <input
                ref={cnicRef}
                name="cnic"
                value={form.cnic}
                onChange={handleChange}
                placeholder="13 digits without dashes"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                aria-invalid={Boolean(errors.cnic)}
              />
              {errors.cnic ? <span className="mt-1 block text-xs text-zinc-400">{errors.cnic}</span> : null}
            </label>

            <label>
              <span className="mb-2 block text-sm text-zinc-300">STRN</span>
              <input
                ref={strnRef}
                name="strn"
                value={form.strn}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm text-zinc-300">Email</span>
              <input
                ref={emailRef}
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email ? <span className="mt-1 block text-xs text-zinc-400">{errors.email}</span> : null}
            </label>

            <label>
              <span className="mb-2 block text-sm text-zinc-300">Phone</span>
              <input
                ref={phoneRef}
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm text-zinc-300">City</span>
              <input
                ref={cityRef}
                name="city"
                value={form.city}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm text-zinc-300">Province</span>
              <input
                ref={provinceRef}
                name="province"
                value={form.province}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm text-zinc-300">Payment Terms (Days)</span>
              <input
                ref={paymentTermsRef}
                name="payment_terms_days"
                value={form.payment_terms_days}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
                aria-invalid={Boolean(errors.payment_terms_days)}
              />
              {errors.payment_terms_days ? (
                <span className="mt-1 block text-xs text-zinc-400">{errors.payment_terms_days}</span>
              ) : null}
            </label>

            <label>
              <span className="mb-2 block text-sm text-zinc-300">Status</span>
              <select
                ref={statusRef}
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {errors.status ? <span className="mt-1 block text-xs text-zinc-400">{errors.status}</span> : null}
            </label>

            <label className="md:col-span-2">
              <span className="mb-2 block text-sm text-zinc-300">Address</span>
              <textarea
                ref={addressRef}
                name="address"
                value={form.address}
                onChange={handleChange}
                rows={3}
                className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
              />
            </label>

            <label className="md:col-span-2">
              <span className="mb-2 block text-sm text-zinc-300">Notes</span>
              <textarea
                ref={notesRef}
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={4}
                className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Link
              to={isEdit ? `/clients/${clientId}` : '/clients'}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ClientFormPage
