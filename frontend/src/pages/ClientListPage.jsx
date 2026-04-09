import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import ErrorAlert from '../components/ErrorAlert'
import { useAuth } from '../context/AuthContext'
import {
  clientImportRequest,
  clientImportTemplateRequest,
  clientsListRequest,
  deleteClientRequest,
} from '../services/authApi'
import { getApiErrorMessage } from '../utils/errorMessage'

const STATUS_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]

const TYPE_FILTER_OPTIONS = [
  { label: 'All Types', value: 'all' },
  { label: 'Individual', value: 'individual' },
  { label: 'Business', value: 'business' },
]

const SORT_COLUMNS = {
  name: 'name',
  type: 'type',
  taxId: 'tax_id',
  email: 'email',
  invoices: 'total_invoices',
  outstanding: 'outstanding_balance',
  status: 'status',
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 2,
})

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US')

function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(Number(value || 0))
}

function formatNumber(value) {
  return NUMBER_FORMATTER.format(Number(value || 0))
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

function statusBadgeClass(status) {
  const normalizedStatus = String(status || '').toLowerCase()

  if (normalizedStatus === 'active') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  }

  if (normalizedStatus === 'inactive') {
    return 'border-zinc-600 bg-zinc-700/30 text-zinc-300'
  }

  return 'border-zinc-700 bg-zinc-800 text-zinc-300'
}

function renderTaxId(client) {
  if (client.ntn) {
    return `NTN ${client.ntn}`
  }

  if (client.cnic) {
    return `CNIC ${client.cnic}`
  }

  return '-'
}

function getSortableValue(client, sortKey) {
  if (sortKey === SORT_COLUMNS.name) {
    return String(client.name || '').toLowerCase()
  }

  if (sortKey === SORT_COLUMNS.type) {
    return String(client.client_type || '').toLowerCase()
  }

  if (sortKey === SORT_COLUMNS.taxId) {
    return String(client.ntn || client.cnic || '').toLowerCase()
  }

  if (sortKey === SORT_COLUMNS.email) {
    return String(client.email || '').toLowerCase()
  }

  if (sortKey === SORT_COLUMNS.invoices) {
    return Number(client.total_invoices || 0)
  }

  if (sortKey === SORT_COLUMNS.outstanding) {
    return Number(client.outstanding_balance || 0)
  }

  if (sortKey === SORT_COLUMNS.status) {
    return String(client.status || '').toLowerCase()
  }

  return ''
}

function SortableHeader({
  column,
  currentSort,
  onSort,
  children,
  alignRight = false,
}) {
  const isActive = currentSort.key === column
  const indicator = !isActive ? '↕' : currentSort.direction === 'asc' ? '↑' : '↓'

  return (
    <th className={`px-3 py-2 ${alignRight ? 'text-right' : ''}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5 text-left text-xs uppercase tracking-[0.14em] text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
      >
        <span>{children}</span>
        <span aria-hidden="true">{indicator}</span>
      </button>
    </th>
  )
}

function ClientListPage() {
  const navigate = useNavigate()
  const { accessToken, logout } = useAuth()

  const fileInputRef = useRef(null)

  const [clients, setClients] = useState([])
  const [meta, setMeta] = useState({
    page: 1,
    per_page: 10,
    total: 0,
    total_pages: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [searchDraft, setSearchDraft] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)

  const [sortConfig, setSortConfig] = useState({ key: SORT_COLUMNS.name, direction: 'asc' })

  const [pendingDeleteClient, setPendingDeleteClient] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importFeedback, setImportFeedback] = useState('')
  const [importReport, setImportReport] = useState(null)

  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setSearchTerm(searchDraft.trim())
      setPage(1)
    }, 300)

    return () => {
      clearTimeout(debounceTimer)
    }
  }, [searchDraft])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, typeFilter])

  useEffect(() => {
    let isMounted = true

    async function loadClients() {
      setIsLoading(true)
      setLoadError('')

      try {
        const params = {
          page,
          per_page: 10,
        }

        if (searchTerm) {
          params.search = searchTerm
        }

        if (statusFilter !== 'all') {
          params.status = statusFilter
        }

        if (typeFilter !== 'all') {
          params.type = typeFilter
        }

        const response = await clientsListRequest(accessToken, params)

        if (!isMounted) {
          return
        }

        setClients(response.data?.data || [])
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

        setLoadError(
          getApiErrorMessage(error, 'Unable to load clients right now. Please refresh and try again.')
        )
        setClients([])
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadClients()

    return () => {
      isMounted = false
    }
  }, [accessToken, page, reloadTick, searchTerm, statusFilter, typeFilter])

  const sortedClients = useMemo(() => {
    const cloned = [...clients]

    cloned.sort((a, b) => {
      const left = getSortableValue(a, sortConfig.key)
      const right = getSortableValue(b, sortConfig.key)

      if (left < right) {
        return sortConfig.direction === 'asc' ? -1 : 1
      }

      if (left > right) {
        return sortConfig.direction === 'asc' ? 1 : -1
      }

      return 0
    })

    return cloned
  }, [clients, sortConfig])

  const totalPages = Number(meta.total_pages || 0)

  function handleSort(column) {
    setSortConfig(current => {
      if (current.key === column) {
        return {
          key: column,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        }
      }

      return {
        key: column,
        direction: 'asc',
      }
    })
  }

  function triggerReload() {
    setReloadTick(current => current + 1)
  }

  async function handleDeleteClient() {
    if (!pendingDeleteClient) {
      return
    }

    setIsDeleting(true)
    setDeleteError('')

    try {
      await deleteClientRequest(accessToken, pendingDeleteClient.id)
      setPendingDeleteClient(null)
      triggerReload()
    } catch (error) {
      setDeleteError(getApiErrorMessage(error, 'Unable to delete this client right now.'))
    } finally {
      setIsDeleting(false)
    }
  }

  function openImportDialog() {
    setImportError('')
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  async function handleDownloadTemplate() {
    setImportError('')

    try {
      const response = await clientImportTemplateRequest(accessToken)
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)

      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'clients-import-template.csv'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      setImportFeedback('Import template downloaded successfully.')
    } catch (error) {
      setImportError(
        getApiErrorMessage(error, 'Unable to download import template right now. Try again.')
      )
    }
  }

  async function handleImportFileSelection(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setIsImporting(true)
    setImportError('')
    setImportFeedback('')

    try {
      const response = await clientImportRequest(accessToken, file)
      const report = response.data?.data || null

      setImportReport(report)

      if (report) {
        setImportFeedback(
          `Import completed: ${formatNumber(report.imported)} imported, ${formatNumber(report.failed)} failed.`
        )
      }

      if (report?.imported > 0) {
        triggerReload()
      }
    } catch (error) {
      setImportError(getApiErrorMessage(error, 'Unable to import CSV right now.'))
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Smart Invoicing FBR</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">Clients</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Search, filter, import, and manage your customer records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500"
            >
              Download Template
            </button>
            <button
              type="button"
              onClick={openImportDialog}
              disabled={isImporting}
              className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-sm text-sky-200 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isImporting ? 'Importing...' : 'Import CSV'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/clients/new')}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400"
            >
              Add Client
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500"
            >
              Sign out
            </button>
          </div>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleImportFileSelection}
        />

        {importError ? <ErrorAlert title="Import Failed" message={importError} /> : null}

        {importFeedback ? (
          <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
            {importFeedback}
          </div>
        ) : null}

        {importReport ? (
          <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Latest Import Report</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Total Rows</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-100">{formatNumber(importReport.total_rows)}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-emerald-300">Imported</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-200">{formatNumber(importReport.imported)}</p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-300">Failed</p>
                <p className="mt-2 text-2xl font-semibold text-amber-200">{formatNumber(importReport.failed)}</p>
              </div>
            </div>

            {importReport.errors?.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Field</th>
                      <th className="px-3 py-2">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importReport.errors.slice(0, 100).map((error, index) => (
                      <tr key={`import-error-${index}`} className="bg-zinc-950">
                        <td className="rounded-l-lg px-3 py-2 text-zinc-200">{error.row}</td>
                        <td className="px-3 py-2 text-zinc-300">{error.field}</td>
                        <td className="rounded-r-lg px-3 py-2 text-zinc-300">{error.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importReport.errors.length > 100 ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Showing first 100 errors out of {formatNumber(importReport.errors.length)}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex-1 min-w-[260px]">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-zinc-500">
                Search
              </span>
              <input
                type="text"
                value={searchDraft}
                onChange={event => setSearchDraft(event.target.value)}
                placeholder="Search by name, email, NTN, or CNIC"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
              />
            </label>

            <label className="min-w-[200px]">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-zinc-500">
                Type Filter
              </span>
              <select
                value={typeFilter}
                onChange={event => setTypeFilter(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-zinc-400"
              >
                {TYPE_FILTER_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {STATUS_TABS.map(tab => {
              const isActive = statusFilter === tab.value

              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.14em] transition ${isActive ? 'border-zinc-200 bg-zinc-100 text-zinc-900' : 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500'}`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {loadError ? <p className="mt-4 text-sm text-zinc-300">{loadError}</p> : null}

          <div className="mt-4 overflow-x-auto">
            {isLoading ? (
              <div className="h-64 animate-pulse rounded-lg border border-zinc-800 bg-zinc-950" />
            ) : (
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                    <SortableHeader column={SORT_COLUMNS.name} currentSort={sortConfig} onSort={handleSort}>
                      Name
                    </SortableHeader>
                    <SortableHeader column={SORT_COLUMNS.type} currentSort={sortConfig} onSort={handleSort}>
                      Type
                    </SortableHeader>
                    <SortableHeader column={SORT_COLUMNS.taxId} currentSort={sortConfig} onSort={handleSort}>
                      NTN/CNIC
                    </SortableHeader>
                    <SortableHeader column={SORT_COLUMNS.email} currentSort={sortConfig} onSort={handleSort}>
                      Email
                    </SortableHeader>
                    <SortableHeader
                      column={SORT_COLUMNS.invoices}
                      currentSort={sortConfig}
                      onSort={handleSort}
                      alignRight
                    >
                      Invoices
                    </SortableHeader>
                    <SortableHeader
                      column={SORT_COLUMNS.outstanding}
                      currentSort={sortConfig}
                      onSort={handleSort}
                      alignRight
                    >
                      Outstanding
                    </SortableHeader>
                    <SortableHeader column={SORT_COLUMNS.status} currentSort={sortConfig} onSort={handleSort}>
                      Status
                    </SortableHeader>
                    <th className="px-3 py-2 text-xs uppercase tracking-[0.14em] text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedClients.map(client => (
                    <tr key={client.id} className="bg-zinc-950">
                      <td className="rounded-l-lg px-3 py-3 text-zinc-100">{client.name}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs uppercase ${typeBadgeClass(client.client_type)}`}
                        >
                          {client.client_type}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-zinc-300">{renderTaxId(client)}</td>
                      <td className="px-3 py-3 text-zinc-300">{client.email || '-'}</td>
                      <td className="px-3 py-3 text-right text-zinc-300">
                        {formatNumber(client.total_invoices)}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-300">
                        {formatCurrency(client.outstanding_balance)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs uppercase ${statusBadgeClass(client.status)}`}
                        >
                          {client.status}
                        </span>
                      </td>
                      <td className="rounded-r-lg px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to={`/clients/${client.id}`}
                            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:border-zinc-500"
                          >
                            View
                          </Link>
                          <button
                            type="button"
                            onClick={() => navigate(`/clients/${client.id}/edit`)}
                            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:border-zinc-500"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError('')
                              setPendingDeleteClient(client)
                            }}
                            className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300 transition hover:bg-rose-500/10"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!isLoading && sortedClients.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No clients found for the current filters.</p>
          ) : null}

          <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4 text-sm text-zinc-400">
            <p>
              Showing page {formatNumber(meta.page || page)} of {formatNumber(totalPages || 1)}
              {' '}| Total clients: {formatNumber(meta.total || 0)}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(current => Math.max(1, current - 1))}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={totalPages === 0 || page >= totalPages}
                onClick={() => setPage(current => current + 1)}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </footer>
        </section>
      </div>

      {pendingDeleteClient ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/85 px-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <h2 className="text-lg font-semibold text-zinc-100">Delete Client</h2>
            <p className="mt-2 text-sm text-zinc-400">
              This will soft-delete {pendingDeleteClient.name}. If the client has any non-cancelled invoices,
              deletion will be blocked.
            </p>

            {deleteError ? <p className="mt-3 text-sm text-rose-300">{deleteError}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingDeleteClient(null)
                  setDeleteError('')
                }}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteClient}
                disabled={isDeleting}
                className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDeleting ? 'Deleting...' : 'Delete Client'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ClientListPage
