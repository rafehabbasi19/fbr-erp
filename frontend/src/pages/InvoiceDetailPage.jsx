import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import ErrorAlert from '../components/ErrorAlert'
import { useAuth } from '../context/AuthContext'
import {
  cancelInvoiceRequest,
  deleteInvoiceRequest,
  duplicateInvoiceRequest,
  invoiceDetailRequest,
  invoicePdfRequest,
  sendInvoiceRequest,
} from '../services/authApi'
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

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return parsed.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusBadgeClass(status) {
  const normalized = String(status || '').toLowerCase()

  if (normalized === 'paid') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  }

  if (normalized === 'sent' || normalized === 'partially_paid') {
    return 'border-sky-500/40 bg-sky-500/10 text-sky-300'
  }

  if (normalized === 'overdue') {
    return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  }

  if (normalized === 'cancelled') {
    return 'border-zinc-600 bg-zinc-700/40 text-zinc-300'
  }

  return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
}

function fbrStatusBadgeClass(status) {
  const normalized = String(status || '').toLowerCase()

  if (normalized === 'accepted' || normalized === 'submitted') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  }

  if (normalized === 'pending') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  }

  if (normalized === 'rejected') {
    return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  }

  return 'border-zinc-700 bg-zinc-800 text-zinc-300'
}

function InvoiceDetailPage() {
  const { id: invoiceId } = useParams()
  const navigate = useNavigate()
  const { accessToken, role } = useAuth()

  const [invoice, setInvoice] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('payments')

  useEffect(() => {
    let isMounted = true

    async function loadInvoice() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const response = await invoiceDetailRequest(accessToken, invoiceId)

        if (!isMounted) {
          return
        }

        setInvoice(response.data?.data || null)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setErrorMessage(getApiErrorMessage(error, 'Unable to load invoice details right now.'))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadInvoice()

    return () => {
      isMounted = false
    }
  }, [accessToken, invoiceId])

  const canMutate = ['super_admin', 'admin', 'company_admin', 'seller'].includes(String(role || '').toLowerCase())

  const activityItems = useMemo(() => {
    if (!invoice) {
      return []
    }

    const items = [
      {
        id: 'created',
        label: 'Invoice created',
        timestamp: invoice.created_at,
      },
    ]

    if (invoice.sent_at) {
      items.push({
        id: 'sent',
        label: 'Invoice sent to client',
        timestamp: invoice.sent_at,
      })
    }

    if (Number(invoice.amount_paid || 0) > 0) {
      items.push({
        id: 'payment',
        label: `Payments recorded: ${formatCurrency(invoice.amount_paid)}`,
        timestamp: invoice.updated_at,
      })
    }

    if (invoice.fbr_submission?.submitted_at) {
      items.push({
        id: 'fbr',
        label: `FBR submission: ${invoice.fbr_submission.status}`,
        timestamp: invoice.fbr_submission.submitted_at,
      })
    }

    if (invoice.status === 'cancelled') {
      items.push({
        id: 'cancelled',
        label: 'Invoice cancelled',
        timestamp: invoice.updated_at,
      })
    }

    return items
  }, [invoice])

  const timeline = useMemo(() => {
    if (!invoice) {
      return []
    }

    const status = String(invoice.status || '').toLowerCase()

    return [
      {
        label: 'Created',
        done: true,
        at: invoice.created_at,
      },
      {
        label: 'Sent',
        done: Boolean(invoice.sent_at || ['sent', 'partially_paid', 'paid', 'overdue'].includes(status)),
        at: invoice.sent_at,
      },
      {
        label: 'Payment Received',
        done: Number(invoice.amount_paid || 0) > 0,
        at: Number(invoice.amount_paid || 0) > 0 ? invoice.updated_at : null,
      },
      {
        label: status === 'cancelled' ? 'Cancelled' : 'Paid / Overdue',
        done: ['paid', 'overdue', 'cancelled'].includes(status),
        at: ['paid', 'overdue', 'cancelled'].includes(status) ? invoice.updated_at : null,
      },
    ]
  }, [invoice])

  async function downloadPdf() {
    if (!invoice) {
      return
    }

    const response = await invoicePdfRequest(accessToken, invoice.id, { download: 1 })
    const blob = new Blob([response.data], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${invoice.invoice_number || 'invoice'}.pdf`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)

    URL.revokeObjectURL(url)
  }

  async function runAction(action, fallbackMessage) {
    setActionError('')
    setActionMessage('')
    setIsActionLoading(true)

    try {
      await action()
    } catch (error) {
      setActionError(getApiErrorMessage(error, fallbackMessage))
    } finally {
      setIsActionLoading(false)
    }
  }

  function refreshInvoiceData() {
    return invoiceDetailRequest(accessToken, invoiceId).then(response => {
      setInvoice(response.data?.data || null)
    })
  }

  function handleSend() {
    if (!invoice) {
      return
    }

    runAction(
      async () => {
        const response = await sendInvoiceRequest(accessToken, invoice.id)
        setInvoice(response.data?.data || null)
        setActionMessage('Invoice marked as sent successfully.')
      },
      'Unable to send invoice right now.'
    )
  }

  function handleCancel() {
    if (!invoice) {
      return
    }

    const cancelReason = window.prompt('Reason for cancellation (optional):', '')

    runAction(
      async () => {
        const response = await cancelInvoiceRequest(accessToken, invoice.id, {
          reason: cancelReason || undefined,
        })
        setInvoice(response.data?.data || null)
        setActionMessage('Invoice cancelled successfully.')
      },
      'Unable to cancel invoice right now.'
    )
  }

  function handleDuplicate() {
    if (!invoice) {
      return
    }

    runAction(
      async () => {
        const response = await duplicateInvoiceRequest(accessToken, invoice.id)
        const duplicatedInvoiceId = response.data?.data?.id

        if (duplicatedInvoiceId) {
          navigate(`/invoices/${duplicatedInvoiceId}`)
          return
        }

        setActionMessage('Invoice duplicated successfully.')
        await refreshInvoiceData()
      },
      'Unable to duplicate invoice right now.'
    )
  }

  function handleDelete() {
    if (!invoice) {
      return
    }

    const confirmed = window.confirm(
      'Delete this draft invoice? This is a soft delete and can impact active workflows.'
    )

    if (!confirmed) {
      return
    }

    runAction(
      async () => {
        await deleteInvoiceRequest(accessToken, invoice.id)
        navigate('/invoices')
      },
      'Unable to delete invoice right now.'
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
        <div className="mx-auto max-w-7xl">
          <div className="h-20 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
          <div className="mt-4 h-[36rem] animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
        <div className="mx-auto max-w-4xl">
          <ErrorAlert title="Invoice Detail Unavailable" message={errorMessage} />
          <Link
            to="/invoices"
            className="mt-2 inline-flex rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
          >
            Back to Invoices
          </Link>
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
        <div className="mx-auto max-w-4xl rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-sm text-zinc-300">Invoice not found.</p>
          <Link
            to="/invoices"
            className="mt-3 inline-flex rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
          >
            Back to Invoices
          </Link>
        </div>
      </div>
    )
  }

  const canEdit = invoice.status === 'draft' && invoice.fbr_status === 'not_submitted'
  const canSend = canMutate && invoice.status === 'draft'
  const canCancel = canMutate && invoice.status !== 'cancelled' && Number(invoice.amount_paid || 0) <= 0
  const canDelete = canMutate && invoice.status === 'draft' && Number(invoice.amount_paid || 0) <= 0

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Invoice Detail</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">{invoice.invoice_number}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {invoice.client?.name || 'Unknown client'} | Issued {formatDate(invoice.issue_date)} | Due {formatDate(invoice.due_date)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs uppercase ${statusBadgeClass(invoice.status)}`}>
                {invoice.status}
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs uppercase ${fbrStatusBadgeClass(invoice.fbr_status)}`}
              >
                FBR: {invoice.fbr_status}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/invoices"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
            >
              Back
            </Link>
            {canEdit ? (
              <Link
                to={`/invoices/${invoice.id}/edit`}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
              >
                Edit
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => runAction(downloadPdf, 'Unable to download invoice PDF right now.')}
              disabled={isActionLoading}
              className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-sm text-sky-200 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Download PDF
            </button>
            {canMutate ? (
              <button
                type="button"
                onClick={handleDuplicate}
                disabled={isActionLoading}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Duplicate
              </button>
            ) : null}
          </div>
        </header>

        {actionError ? <ErrorAlert title="Invoice Action Failed" message={actionError} /> : null}
        {actionMessage ? (
          <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {actionMessage}
          </div>
        ) : null}

        <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Status Timeline</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {timeline.map(step => (
              <div
                key={step.label}
                className={`rounded-lg border p-3 ${
                  step.done
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                }`}
              >
                <p className="text-xs uppercase tracking-[0.14em]">{step.label}</p>
                <p className="mt-2 text-sm">{step.done ? formatDateTime(step.at) : 'Pending'}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Invoice Preview</h2>

            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Bill To</p>
                  <p className="mt-2 text-sm text-zinc-100">{invoice.client?.name || '-'}</p>
                  <p className="mt-1 text-xs text-zinc-400">{invoice.client?.email || '-'}</p>
                  <p className="mt-1 text-xs text-zinc-400">{invoice.client?.phone || '-'}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {invoice.client?.ntn ? `NTN ${invoice.client.ntn}` : invoice.client?.cnic ? `CNIC ${invoice.client.cnic}` : 'No Tax ID'}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Tax Invoice</p>
                  <p className="mt-2 text-sm text-zinc-100">Issue: {formatDate(invoice.issue_date)}</p>
                  <p className="mt-1 text-sm text-zinc-100">Due: {formatDate(invoice.due_date)}</p>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Tax %</th>
                      <th className="px-3 py-2 text-right">Tax Amount</th>
                      <th className="px-3 py-2 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoice.items || []).map(item => (
                      <tr key={item.id} className="bg-zinc-900">
                        <td className="rounded-l-lg px-3 py-3 text-zinc-100">{item.description}</td>
                        <td className="px-3 py-3 text-right text-zinc-300">{Number(item.quantity || 0).toFixed(3)}</td>
                        <td className="px-3 py-3 text-zinc-300">{item.unit || '-'}</td>
                        <td className="px-3 py-3 text-right text-zinc-300">{formatCurrency(item.unit_price)}</td>
                        <td className="px-3 py-3 text-right text-zinc-300">{Number(item.tax_rate_percentage || 0).toFixed(2)}%</td>
                        <td className="px-3 py-3 text-right text-zinc-300">{formatCurrency(item.tax_amount)}</td>
                        <td className="rounded-r-lg px-3 py-3 text-right text-zinc-100">{formatCurrency(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-zinc-300">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(invoice.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Discount</span>
                  <span>- {formatCurrency(invoice.discount_amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tax</span>
                  <span>{formatCurrency(invoice.tax_amount)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-700 pt-3 text-lg font-semibold text-zinc-100">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.total)}</span>
                </div>
              </div>

              {invoice.notes ? (
                <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Notes</p>
                  <p className="mt-2">{invoice.notes}</p>
                </div>
              ) : null}

              {invoice.terms ? (
                <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Terms</p>
                  <p className="mt-2">{invoice.terms}</p>
                </div>
              ) : null}
            </div>
          </article>

          <aside className="space-y-4">
            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-sm uppercase tracking-[0.16em] text-zinc-500">Actions</h2>
              <div className="mt-4 grid gap-2">
                {canSend ? (
                  <div>
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={isActionLoading}
                      title="Send marks this draft as officially issued to the client."
                      className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Send to Client
                    </button>
                    <p className="mt-1 text-xs text-zinc-400">
                      This does not email automatically. It marks the draft as issued and updates invoice status.
                    </p>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => setActionMessage('Submit to FBR endpoint will be enabled in Phase 7.')}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-sm text-amber-200 hover:bg-amber-500/25"
                >
                  Submit to FBR
                </button>

                <button
                  type="button"
                  onClick={() => setActionMessage('Payment recording will be enabled in Phase 8.')}
                  className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm text-sky-200 hover:bg-sky-500/25"
                >
                  Record Payment
                </button>

                {canCancel ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isActionLoading}
                    className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-4 py-2.5 text-sm text-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Cancel Invoice
                  </button>
                ) : null}

                {canDelete ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isActionLoading}
                    className="rounded-lg border border-rose-500/40 bg-transparent px-4 py-2.5 text-sm text-rose-200 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Delete Draft
                  </button>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-sm uppercase tracking-[0.16em] text-zinc-500">Amounts</h2>
              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                <div className="flex items-center justify-between">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.total)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Paid</span>
                  <span>{formatCurrency(invoice.amount_paid)}</span>
                </div>
                <div className="flex items-center justify-between font-medium text-zinc-100">
                  <span>Balance Due</span>
                  <span>{formatCurrency(invoice.balance_due)}</span>
                </div>
              </div>
            </section>
          </aside>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-[0.14em] ${
                activeTab === 'payments'
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'border border-zinc-700 bg-zinc-950 text-zinc-300'
              }`}
            >
              Payments
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-[0.14em] ${
                activeTab === 'activity'
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'border border-zinc-700 bg-zinc-950 text-zinc-300'
              }`}
            >
              Activity
            </button>
          </div>

          {activeTab === 'payments' ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.payments || []).map(payment => (
                    <tr key={payment.id} className="bg-zinc-950">
                      <td className="rounded-l-lg px-3 py-3 text-zinc-300">{formatDate(payment.payment_date)}</td>
                      <td className="px-3 py-3 text-zinc-300">{payment.payment_method || '-'}</td>
                      <td className="px-3 py-3 text-zinc-300">{payment.reference_number || '-'}</td>
                      <td className="rounded-r-lg px-3 py-3 text-right text-zinc-100">
                        {formatCurrency(payment.amount_paid)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(invoice.payments || []).length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No payments recorded yet.</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {activityItems.map(item => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <p className="text-sm text-zinc-100">{item.label}</p>
                  <p className="mt-1 text-xs text-zinc-400">{formatDateTime(item.timestamp)}</p>
                </div>
              ))}

              {activityItems.length === 0 ? (
                <p className="text-sm text-zinc-500">No activity entries available.</p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default InvoiceDetailPage
