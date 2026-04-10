import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import ErrorAlert from '../components/ErrorAlert'
import { useAuth } from '../context/AuthContext'
import {
  invoicePdfRequest,
  invoicesListRequest,
  sendInvoiceRequest,
} from '../services/authApi'
import { getApiErrorMessage } from '../utils/errorMessage'

const STATUS_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Paid', value: 'paid' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'FBR Submitted', value: 'fbr_submitted' },
  { label: 'Cancelled', value: 'cancelled' },
]

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

  if (normalizedStatus === 'paid') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  }

  if (normalizedStatus === 'sent' || normalizedStatus === 'partially_paid') {
    return 'border-sky-500/40 bg-sky-500/10 text-sky-300'
  }

  if (normalizedStatus === 'overdue') {
    return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  }

  if (normalizedStatus === 'cancelled') {
    return 'border-zinc-600 bg-zinc-700/40 text-zinc-300'
  }

  return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
}

function fbrStatusBadgeClass(status) {
  const normalizedStatus = String(status || '').toLowerCase()

  if (normalizedStatus === 'accepted' || normalizedStatus === 'submitted') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  }

  if (normalizedStatus === 'pending') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  }

  if (normalizedStatus === 'rejected') {
    return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  }

  return 'border-zinc-700 bg-zinc-800 text-zinc-300'
}

function InvoiceListPage() {
  const navigate = useNavigate()
  const { accessToken } = useAuth()

  const [invoices, setInvoices] = useState([])
  const [meta, setMeta] = useState({
    page: 1,
    per_page: 10,
    total: 0,
    total_pages: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  const [statusTab, setStatusTab] = useState('all')
  const [searchDraft, setSearchDraft] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)

  const [selectedIds, setSelectedIds] = useState([])
  const [isSendingInvoiceId, setIsSendingInvoiceId] = useState('')
  const [isBulkDownloading, setIsBulkDownloading] = useState(false)

  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchDraft.trim())
      setPage(1)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchDraft])

  useEffect(() => {
    setPage(1)
  }, [statusTab])

  useEffect(() => {
    let isMounted = true

    async function loadInvoices() {
      setIsLoading(true)
      setLoadError('')

      try {
        const params = {
          page,
          per_page: 10,
          sort_by: 'created_at',
          sort_dir: 'desc',
        }

        if (searchTerm) {
          params.search = searchTerm
        }

        if (statusTab === 'fbr_submitted') {
          params.fbr_submitted = 1
        } else if (statusTab !== 'all') {
          params.status = statusTab
        }

        const response = await invoicesListRequest(accessToken, params)

        if (!isMounted) {
          return
        }

        setInvoices(response.data?.data || [])
        setMeta(
          response.data?.meta || {
            page,
            per_page: 10,
            total: 0,
            total_pages: 0,
          }
        )
      } catch (error) {
        if (!isMounted) {
          return
        }

        setInvoices([])
        setLoadError(getApiErrorMessage(error, 'Unable to load invoices right now. Please try again.'))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadInvoices()

    return () => {
      isMounted = false
    }
  }, [accessToken, page, reloadTick, searchTerm, statusTab])

  useEffect(() => {
    setSelectedIds([])
  }, [invoices])

  const selectedInvoices = useMemo(
    () => invoices.filter(invoice => selectedIds.includes(invoice.id)),
    [invoices, selectedIds]
  )

  function triggerReload() {
    setReloadTick(current => current + 1)
  }

  function toggleSelectOne(invoiceId) {
    setSelectedIds(current => {
      if (current.includes(invoiceId)) {
        return current.filter(id => id !== invoiceId)
      }

      return [...current, invoiceId]
    })
  }

  function toggleSelectAll() {
    setSelectedIds(current => {
      if (current.length === invoices.length) {
        return []
      }

      return invoices.map(invoice => invoice.id)
    })
  }

  async function downloadPdf(invoiceId, invoiceNumber) {
    const response = await invoicePdfRequest(accessToken, invoiceId, { download: 1 })
    const blob = new Blob([response.data], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${invoiceNumber || 'invoice'}.pdf`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)

    URL.revokeObjectURL(url)
  }

  async function handleBulkDownload() {
    if (selectedInvoices.length === 0) {
      setActionMessage('Select at least one invoice to bulk download PDFs.')
      return
    }

    setIsBulkDownloading(true)
    setActionError('')
    setActionMessage('')

    try {
      await Promise.all(
        selectedInvoices.map(invoice => downloadPdf(invoice.id, invoice.invoice_number))
      )
      setActionMessage(`Downloaded ${selectedInvoices.length} invoice PDF(s).`)
    } catch (error) {
      setActionError(getApiErrorMessage(error, 'Unable to bulk download invoice PDFs right now.'))
    } finally {
      setIsBulkDownloading(false)
    }
  }

  async function handleSendInvoice(invoice) {
    setActionError('')
    setActionMessage('')
    setIsSendingInvoiceId(invoice.id)

    try {
      await sendInvoiceRequest(accessToken, invoice.id)
      setActionMessage(`Invoice ${invoice.invoice_number} marked as sent.`)
      triggerReload()
    } catch (error) {
      setActionError(getApiErrorMessage(error, 'Unable to send invoice right now.'))
    } finally {
      setIsSendingInvoiceId('')
    }
  }

  const totalPages = Number(meta.total_pages || 0)
  const allChecked = invoices.length > 0 && selectedIds.length === invoices.length

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Invoice Management</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Invoices</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Track status, search invoices, and export tax invoice PDFs.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/invoices/new')}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400"
          >
            New Invoice
          </button>
        </header>

        {loadError ? <ErrorAlert title="Invoice List Unavailable" message={loadError} /> : null}
        {actionError ? <ErrorAlert title="Invoice Action Failed" message={actionError} /> : null}

        {actionMessage ? (
          <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {actionMessage}
          </div>
        ) : null}

        <section className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusTab(tab.value)}
                className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.14em] transition ${
                  statusTab === tab.value
                    ? 'border-zinc-200 bg-zinc-100 text-zinc-900'
                    : 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="w-full max-w-lg">
              <span className="sr-only">Search invoices</span>
              <input
                value={searchDraft}
                onChange={event => setSearchDraft(event.target.value)}
                placeholder="Search by invoice number or client name"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleBulkDownload}
                disabled={isBulkDownloading}
                className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-sm text-sky-200 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isBulkDownloading ? 'Downloading...' : 'Bulk Download PDF'}
              </button>
              <button
                type="button"
                onClick={() => setActionMessage('Bulk FBR submission will be enabled in Phase 7 integration.')}
                className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200 transition hover:bg-amber-500/25"
              >
                Bulk Submit to FBR
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleSelectAll}
                      aria-label="Select all invoices"
                    />
                  </th>
                  <th className="px-3 py-2">Invoice #</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Issue Date</th>
                  <th className="px-3 py-2">Due Date</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">FBR Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="rounded-lg px-3 py-6">
                      <div className="h-24 animate-pulse rounded-lg border border-zinc-800 bg-zinc-950" />
                    </td>
                  </tr>
                ) : (
                  invoices.map(invoice => (
                    <tr key={invoice.id} className="bg-zinc-950">
                      <td className="rounded-l-lg px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(invoice.id)}
                          onChange={() => toggleSelectOne(invoice.id)}
                          aria-label={`Select ${invoice.invoice_number}`}
                        />
                      </td>
                      <td className="px-3 py-3 text-zinc-100">{invoice.invoice_number}</td>
                      <td className="px-3 py-3 text-zinc-300">{invoice.client?.name || '-'}</td>
                      <td className="px-3 py-3 text-zinc-300">{formatDate(invoice.issue_date)}</td>
                      <td className="px-3 py-3 text-zinc-300">{formatDate(invoice.due_date)}</td>
                      <td className="px-3 py-3 text-right text-zinc-300">{formatCurrency(invoice.total)}</td>
                      <td className="px-3 py-3 text-right text-zinc-300">{formatCurrency(invoice.amount_paid)}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full border px-2.5 py-1 text-xs uppercase ${statusBadgeClass(invoice.status)}`}>
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs uppercase ${fbrStatusBadgeClass(invoice.fbr_status)}`}
                        >
                          {invoice.fbr_status}
                        </span>
                      </td>
                      <td className="rounded-r-lg px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Link
                            to={`/invoices/${invoice.id}`}
                            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500"
                          >
                            View
                          </Link>
                          {invoice.status === 'draft' ? (
                            <Link
                              to={`/invoices/${invoice.id}/edit`}
                              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500"
                            >
                              Edit
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => downloadPdf(invoice.id, invoice.invoice_number)}
                            className="rounded-md border border-sky-500/40 px-2 py-1 text-xs text-sky-200 hover:bg-sky-500/15"
                          >
                            PDF
                          </button>
                          {invoice.status === 'draft' ? (
                            <button
                              type="button"
                              onClick={() => handleSendInvoice(invoice)}
                              disabled={isSendingInvoiceId === invoice.id}
                              className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isSendingInvoiceId === invoice.id ? 'Sending...' : 'Send'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && invoices.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No invoices found for the current filters.</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
            <p>
              Showing page {meta.page || 1} of {Math.max(totalPages, 1)} ({meta.total || 0} records)
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(current => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage(current => current + 1)}
                disabled={totalPages > 0 && page >= totalPages}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default InvoiceListPage
