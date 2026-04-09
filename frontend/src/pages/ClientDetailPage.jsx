import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import ErrorAlert from '../components/ErrorAlert'
import { useAuth } from '../context/AuthContext'
import { clientDetailRequest } from '../services/authApi'
import { getApiErrorMessage } from '../utils/errorMessage'

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 2,
})

function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(Number(value || 0))
}

function formatDate(value) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return parsed.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function statusBadgeClass(status) {
  const normalizedStatus = String(status || '').toLowerCase()

  if (normalizedStatus === 'active') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  }

  if (normalizedStatus === 'inactive') {
    return 'border-zinc-600 bg-zinc-700/30 text-zinc-300'
  }

  if (normalizedStatus === 'paid' || normalizedStatus === 'verified' || normalizedStatus === 'submitted') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  }

  if (normalizedStatus === 'overdue' || normalizedStatus === 'failed' || normalizedStatus === 'rejected') {
    return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  }

  return 'border-zinc-700 bg-zinc-800 text-zinc-300'
}

function typeBadgeClass(clientType) {
  const normalizedType = String(clientType || '').toLowerCase()

  if (normalizedType === 'business') {
    return 'border-sky-500/40 bg-sky-500/10 text-sky-300'
  }

  if (normalizedType === 'individual') {
    return 'border-violet-500/40 bg-violet-500/10 text-violet-300'
  }

  return 'border-zinc-700 bg-zinc-800 text-zinc-300'
}

function DetailField({ label, value }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-200">{value || '-'}</p>
    </div>
  )
}

function ClientDetailPage() {
  const { id: clientId } = useParams()
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [quickActionMessage, setQuickActionMessage] = useState('')
  const [payload, setPayload] = useState({
    client: null,
    invoice_summary: null,
    recent_invoices: [],
  })

  useEffect(() => {
    let isMounted = true

    async function loadClientDetails() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const response = await clientDetailRequest(accessToken, clientId)

        if (!isMounted) {
          return
        }

        setPayload({
          client: response.data?.data?.client || null,
          invoice_summary: response.data?.data?.invoice_summary || null,
          recent_invoices: response.data?.data?.recent_invoices || [],
        })
      } catch (error) {
        if (!isMounted) {
          return
        }

        setErrorMessage(
          getApiErrorMessage(error, 'Unable to load this client right now. Please try again.')
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadClientDetails()

    return () => {
      isMounted = false
    }
  }, [accessToken, clientId])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
        <div className="mx-auto max-w-6xl">
          <div className="h-24 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
          <div className="mt-4 h-96 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
        <div className="mx-auto max-w-4xl">
          <ErrorAlert title="Client Detail Unavailable" message={errorMessage} />
          <div className="mt-4 flex gap-2">
            <Link
              to="/clients"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
            >
              Back to Clients
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const client = payload.client
  const summary = payload.invoice_summary || {
    total_invoiced: 0,
    total_paid: 0,
    outstanding: 0,
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
        <div className="mx-auto max-w-4xl rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-sm text-zinc-300">Client not found.</p>
          <Link
            to="/clients"
            className="mt-3 inline-flex rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
          >
            Back to Clients
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Client Profile</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">{client.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-xs uppercase ${typeBadgeClass(client.client_type)}`}
              >
                {client.client_type}
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs uppercase ${statusBadgeClass(client.status)}`}
              >
                {client.status}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/clients/${clientId}/edit`)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setQuickActionMessage('Invoice creation is planned in Phase 5 and will be linked here.')}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400"
            >
              Create Invoice for this Client
            </button>
            <Link
              to="/clients"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
            >
              Back
            </Link>
          </div>
        </header>

        {quickActionMessage ? (
          <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
            {quickActionMessage}
          </div>
        ) : null}

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Total Invoiced</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-100">{formatCurrency(summary.total_invoiced)}</p>
          </article>
          <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Total Paid</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-300">{formatCurrency(summary.total_paid)}</p>
          </article>
          <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Outstanding</p>
            <p className="mt-2 text-2xl font-semibold text-amber-300">{formatCurrency(summary.outstanding)}</p>
          </article>
        </section>

        <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Client Information</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField label="Email" value={client.email} />
            <DetailField label="Phone" value={client.phone} />
            <DetailField label="NTN" value={client.ntn} />
            <DetailField label="CNIC" value={client.cnic} />
            <DetailField label="STRN" value={client.strn} />
            <DetailField label="City" value={client.city} />
            <DetailField label="Province" value={client.province} />
            <DetailField label="Country" value={client.country} />
            <DetailField
              label="Payment Terms"
              value={
                client.payment_terms_days !== null && client.payment_terms_days !== undefined
                  ? `${client.payment_terms_days} days`
                  : null
              }
            />
            <DetailField label="Address" value={client.address} />
            <DetailField label="Notes" value={client.notes} />
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Invoice History</h2>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-3 py-2">Invoice #</th>
                  <th className="px-3 py-2">Issue Date</th>
                  <th className="px-3 py-2">Due Date</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {payload.recent_invoices.map(invoice => (
                  <tr key={invoice.id} className="bg-zinc-950">
                    <td className="rounded-l-lg px-3 py-3 text-zinc-100">{invoice.invoice_number}</td>
                    <td className="px-3 py-3 text-zinc-300">{formatDate(invoice.invoice_date)}</td>
                    <td className="px-3 py-3 text-zinc-300">{formatDate(invoice.due_date)}</td>
                    <td className="px-3 py-3 text-right text-zinc-300">{formatCurrency(invoice.total_amount)}</td>
                    <td className="rounded-r-lg px-3 py-3">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs uppercase ${statusBadgeClass(
                          invoice.payment_status || invoice.status
                        )}`}
                      >
                        {invoice.payment_status || invoice.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {payload.recent_invoices.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No invoice history found for this client yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

export default ClientDetailPage
