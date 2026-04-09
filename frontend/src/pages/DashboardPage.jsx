import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useAuth } from '../context/AuthContext'
import {
  dashboardFbrStatusRequest,
  dashboardRecentActivityRequest,
  dashboardRecentInvoicesRequest,
  dashboardRevenueChartRequest,
  dashboardSummaryRequest,
  dashboardTopClientsRequest,
} from '../services/authApi'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  company_admin: 'Company Admin',
  seller: 'Seller',
  accountant: 'Accountant',
}

const ROLE_CAPABILITIES = {
  super_admin: ['Manage companies', 'Manage users', 'View reports', 'View audit logs'],
  admin: ['Manage companies', 'Manage users', 'View reports', 'View audit logs'],
  company_admin: ['Manage users', 'Manage invoices', 'View reports', 'System settings'],
  seller: ['Create invoices', 'Submit to FBR', 'View own reports'],
  accountant: ['View reports'],
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

function formatDate(value) {
  if (!value) {
    return '-'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return '-'
  }

  return parsedDate.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return '-'
  }

  return parsedDate.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toInputDate(date) {
  return date.toISOString().slice(0, 10)
}

function buildChartParams(range, customRange) {
  const currentYear = new Date().getFullYear()

  if (range === 'last_6_months') {
    return {
      period: 'monthly',
      preset: 'last_6_months',
    }
  }

  if (range === 'custom') {
    return {
      period: 'monthly',
      date_from: customRange.from,
      date_to: customRange.to,
    }
  }

  return {
    period: 'monthly',
    year: currentYear,
  }
}

function calculateTrend(currentValue, previousValue) {
  if (!previousValue && previousValue !== 0) {
    return null
  }

  if (previousValue === 0) {
    if (currentValue === 0) {
      return {
        direction: 'flat',
        text: '0% vs previous',
      }
    }

    return {
      direction: 'up',
      text: '100% vs previous',
    }
  }

  const delta = ((currentValue - previousValue) / previousValue) * 100

  if (delta > 0) {
    return {
      direction: 'up',
      text: `+${Math.abs(delta).toFixed(1)}% vs previous`,
    }
  }

  if (delta < 0) {
    return {
      direction: 'down',
      text: `-${Math.abs(delta).toFixed(1)}% vs previous`,
    }
  }

  return {
    direction: 'flat',
    text: '0% vs previous',
  }
}

function statusBadgeClass(status) {
  const normalizedStatus = String(status || '').toLowerCase()

  if (normalizedStatus === 'paid' || normalizedStatus === 'submitted' || normalizedStatus === 'verified') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  }

  if (normalizedStatus === 'overdue' || normalizedStatus === 'rejected' || normalizedStatus === 'failed') {
    return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  }

  if (normalizedStatus === 'partial' || normalizedStatus === 'pending') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  }

  return 'border-zinc-700 bg-zinc-800/70 text-zinc-300'
}

function MetricCard({ icon, label, value, trend, loading }) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
        <span className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300">
          {icon}
        </span>
      </div>

      {loading ? (
        <div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-zinc-800" />
      ) : (
        <p className="mt-4 text-3xl font-semibold text-zinc-50">{value}</p>
      )}

      {trend ? (
        <p
          className={`mt-3 text-xs ${trend.direction === 'up' ? 'text-emerald-300' : ''} ${trend.direction === 'down' ? 'text-rose-300' : ''} ${trend.direction === 'flat' ? 'text-zinc-400' : ''}`}
        >
          {trend.text}
        </p>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">Trend pending more historical data</p>
      )}
    </article>
  )
}

function DashboardPage() {
  const { user, role, accessToken, logout } = useAuth()

  const [summaryState, setSummaryState] = useState({ isLoading: true, error: '', data: null })
  const [chartState, setChartState] = useState({ isLoading: true, error: '', data: [] })
  const [topClientsState, setTopClientsState] = useState({ isLoading: true, error: '', data: [] })
  const [recentActivityState, setRecentActivityState] = useState({ isLoading: true, error: '', data: [] })
  const [recentInvoicesState, setRecentInvoicesState] = useState({ isLoading: true, error: '', data: [] })
  const [fbrStatusState, setFbrStatusState] = useState({ isLoading: true, error: '', data: null })

  const [chartRange, setChartRange] = useState('this_year')
  const [customRange, setCustomRange] = useState(() => {
    const now = new Date()
    const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    return {
      from: toInputDate(defaultFrom),
      to: toInputDate(now),
    }
  })

  const [actionFeedback, setActionFeedback] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadSummary() {
      setSummaryState({ isLoading: true, error: '', data: null })

      try {
        const response = await dashboardSummaryRequest(accessToken)
        if (isMounted) {
          setSummaryState({
            isLoading: false,
            error: '',
            data: response.data?.data || null,
          })
        }
      } catch (_error) {
        if (isMounted) {
          setSummaryState({
            isLoading: false,
            error: 'Unable to load summary metrics right now.',
            data: null,
          })
        }
      }
    }

    loadSummary()

    return () => {
      isMounted = false
    }
  }, [accessToken])

  useEffect(() => {
    let isMounted = true

    async function loadChart() {
      if (chartRange === 'custom' && (!customRange.from || !customRange.to)) {
        setChartState({
          isLoading: false,
          error: 'Choose both start and end dates for custom range.',
          data: [],
        })
        return
      }

      setChartState({ isLoading: true, error: '', data: [] })

      try {
        const response = await dashboardRevenueChartRequest(accessToken, buildChartParams(chartRange, customRange))
        if (isMounted) {
          setChartState({
            isLoading: false,
            error: '',
            data: response.data?.data || [],
          })
        }
      } catch (_error) {
        if (isMounted) {
          setChartState({
            isLoading: false,
            error: 'Unable to load revenue chart right now.',
            data: [],
          })
        }
      }
    }

    loadChart()

    return () => {
      isMounted = false
    }
  }, [accessToken, chartRange, customRange.from, customRange.to])

  useEffect(() => {
    let isMounted = true

    async function loadTopClients() {
      setTopClientsState({ isLoading: true, error: '', data: [] })

      try {
        const response = await dashboardTopClientsRequest(accessToken)
        if (isMounted) {
          setTopClientsState({
            isLoading: false,
            error: '',
            data: response.data?.data || [],
          })
        }
      } catch (_error) {
        if (isMounted) {
          setTopClientsState({
            isLoading: false,
            error: 'Unable to load top clients right now.',
            data: [],
          })
        }
      }
    }

    loadTopClients()

    return () => {
      isMounted = false
    }
  }, [accessToken])

  useEffect(() => {
    let isMounted = true

    async function loadRecentActivity() {
      setRecentActivityState({ isLoading: true, error: '', data: [] })

      try {
        const response = await dashboardRecentActivityRequest(accessToken)
        if (isMounted) {
          setRecentActivityState({
            isLoading: false,
            error: '',
            data: response.data?.data || [],
          })
        }
      } catch (_error) {
        if (isMounted) {
          setRecentActivityState({
            isLoading: false,
            error: 'Unable to load recent activity right now.',
            data: [],
          })
        }
      }
    }

    loadRecentActivity()

    return () => {
      isMounted = false
    }
  }, [accessToken])

  useEffect(() => {
    let isMounted = true

    async function loadRecentInvoices() {
      setRecentInvoicesState({ isLoading: true, error: '', data: [] })

      try {
        const response = await dashboardRecentInvoicesRequest(accessToken)
        if (isMounted) {
          setRecentInvoicesState({
            isLoading: false,
            error: '',
            data: response.data?.data || [],
          })
        }
      } catch (_error) {
        if (isMounted) {
          setRecentInvoicesState({
            isLoading: false,
            error: 'Unable to load recent invoices right now.',
            data: [],
          })
        }
      }
    }

    loadRecentInvoices()

    return () => {
      isMounted = false
    }
  }, [accessToken])

  useEffect(() => {
    let isMounted = true

    async function loadFbrStatus() {
      setFbrStatusState({ isLoading: true, error: '', data: null })

      try {
        const response = await dashboardFbrStatusRequest(accessToken)
        if (isMounted) {
          setFbrStatusState({
            isLoading: false,
            error: '',
            data: response.data?.data || null,
          })
        }
      } catch (_error) {
        if (isMounted) {
          setFbrStatusState({
            isLoading: false,
            error: 'Unable to load FBR status right now.',
            data: null,
          })
        }
      }
    }

    loadFbrStatus()

    return () => {
      isMounted = false
    }
  }, [accessToken])

  const roleLabel = ROLE_LABELS[role] || 'User'
  const capabilities = ROLE_CAPABILITIES[role] || []

  const chartTrend = useMemo(() => {
    if (!chartState.data || chartState.data.length < 2) {
      return {
        revenue: null,
        invoices: null,
        currentInvoiceCount: 0,
      }
    }

    const current = chartState.data[chartState.data.length - 1]
    const previous = chartState.data[chartState.data.length - 2]

    return {
      revenue: calculateTrend(Number(current.revenue || 0), Number(previous.revenue || 0)),
      invoices: calculateTrend(
        Number(current.invoice_count || 0),
        Number(previous.invoice_count || 0)
      ),
      currentInvoiceCount: Number(current.invoice_count || 0),
    }
  }, [chartState.data])

  const cards = useMemo(
    () => [
      {
        label: 'Total Revenue',
        icon: 'REV',
        value: formatCurrency(summaryState.data?.revenue_this_year || 0),
        trend: chartTrend.revenue,
      },
      {
        label: 'Invoices This Month',
        icon: 'INV',
        value: formatNumber(chartTrend.currentInvoiceCount || 0),
        trend: chartTrend.invoices,
      },
      {
        label: 'Outstanding',
        icon: 'BAL',
        value: formatCurrency(summaryState.data?.outstanding_amount || 0),
        trend: null,
      },
      {
        label: 'Overdue',
        icon: 'OD',
        value: formatNumber(summaryState.data?.overdue_invoices || 0),
        trend: null,
      },
      {
        label: 'FBR Pending',
        icon: 'FBR',
        value: formatNumber(
          fbrStatusState.data?.pending_submissions ||
            summaryState.data?.fbr_pending_submissions ||
            0
        ),
        trend: null,
      },
    ],
    [summaryState.data, fbrStatusState.data, chartTrend]
  )

  function handleQuickAction(actionKey) {
    if (actionKey === 'create-invoice') {
      setActionFeedback('Invoice module is planned in Phase 5. Quick action is staged.')
      return
    }

    if (actionKey === 'add-client') {
      setActionFeedback('Client module is planned in Phase 4. Quick action is staged.')
      return
    }

    setActionFeedback('FBR submission flow is planned in Phase 7. Quick action is staged.')
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Smart Invoicing FBR</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">Dashboard</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Welcome back, {user?.name || 'User'}. Your active role is {roleLabel}.
            </p>
          </div>

          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500"
          >
            Sign out
          </button>
        </header>

        <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Quick actions</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleQuickAction('create-invoice')}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400"
            >
              Create Invoice
            </button>
            <button
              type="button"
              onClick={() => handleQuickAction('add-client')}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-sky-950 transition hover:bg-sky-400"
            >
              Add Client
            </button>
            <button
              type="button"
              onClick={() => handleQuickAction('submit-fbr')}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-300"
            >
              Submit to FBR
            </button>
          </div>
          {actionFeedback ? <p className="mt-3 text-sm text-zinc-400">{actionFeedback}</p> : null}
        </section>

        <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Role capabilities</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {capabilities.map(capability => (
              <span
                key={capability}
                className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-300"
              >
                {capability}
              </span>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cards.map(card => (
            <MetricCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              trend={card.trend}
              loading={summaryState.isLoading}
            />
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Revenue Chart</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setChartRange('this_year')}
                  className={`rounded-md px-3 py-1 text-xs ${chartRange === 'this_year' ? 'bg-zinc-100 text-zinc-900' : 'border border-zinc-700 bg-zinc-950 text-zinc-300'}`}
                >
                  This Year
                </button>
                <button
                  type="button"
                  onClick={() => setChartRange('last_6_months')}
                  className={`rounded-md px-3 py-1 text-xs ${chartRange === 'last_6_months' ? 'bg-zinc-100 text-zinc-900' : 'border border-zinc-700 bg-zinc-950 text-zinc-300'}`}
                >
                  Last 6 Months
                </button>
                <button
                  type="button"
                  onClick={() => setChartRange('custom')}
                  className={`rounded-md px-3 py-1 text-xs ${chartRange === 'custom' ? 'bg-zinc-100 text-zinc-900' : 'border border-zinc-700 bg-zinc-950 text-zinc-300'}`}
                >
                  Custom
                </button>
              </div>
            </div>

            {chartRange === 'custom' ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  From
                  <input
                    type="date"
                    value={customRange.from}
                    onChange={event =>
                      setCustomRange(current => ({
                        ...current,
                        from: event.target.value,
                      }))
                    }
                    className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  To
                  <input
                    type="date"
                    value={customRange.to}
                    onChange={event =>
                      setCustomRange(current => ({
                        ...current,
                        to: event.target.value,
                      }))
                    }
                    className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                  />
                </label>
              </div>
            ) : null}

            {chartState.error ? (
              <p className="mt-4 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
                {chartState.error}
              </p>
            ) : null}

            <div className="mt-4 h-80">
              {chartState.isLoading ? (
                <div className="h-full animate-pulse rounded-lg border border-zinc-800 bg-zinc-950" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartState.data} margin={{ top: 10, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      dataKey="label"
                      stroke="#a1a1aa"
                      tickLine={false}
                      axisLine={{ stroke: '#3f3f46' }}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#a1a1aa"
                      tickLine={false}
                      axisLine={{ stroke: '#3f3f46' }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#a1a1aa"
                      tickLine={false}
                      axisLine={{ stroke: '#3f3f46' }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #3f3f46',
                        backgroundColor: '#09090b',
                        color: '#f4f4f5',
                      }}
                      formatter={(value, name) => {
                        if (name === 'Revenue') {
                          return [formatCurrency(value), name]
                        }

                        return [formatNumber(value), name]
                      }}
                    />
                    <Legend />
                    <Bar
                      yAxisId="left"
                      dataKey="revenue"
                      fill="#14b8a6"
                      radius={[6, 6, 0, 0]}
                      name="Revenue"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="invoice_count"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Invoice Count"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Top Clients</h2>
            {topClientsState.error ? (
              <p className="mt-3 text-sm text-zinc-400">{topClientsState.error}</p>
            ) : null}

            <div className="mt-4 space-y-3">
              {topClientsState.isLoading
                ? new Array(5)
                    .fill(null)
                    .map((_, index) => (
                      <div
                        key={`top-client-placeholder-${index}`}
                        className="h-14 animate-pulse rounded-lg border border-zinc-800 bg-zinc-950"
                      />
                    ))
                : topClientsState.data.map((client, index) => (
                    <div key={client.client_id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-sm font-medium text-zinc-100">
                        {index + 1}. {client.client_name}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        Billed: {formatCurrency(client.total_billed)} | Paid: {formatCurrency(client.total_paid)}
                      </p>
                    </div>
                  ))}

              {!topClientsState.isLoading && topClientsState.data.length === 0 ? (
                <p className="text-sm text-zinc-500">No client data available yet.</p>
              ) : null}
            </div>
          </article>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Recent Invoices</h2>
              <a
                href="/invoices"
                className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
              >
                View all
              </a>
            </div>

            {recentInvoicesState.error ? (
              <p className="mt-3 text-sm text-zinc-400">{recentInvoicesState.error}</p>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              {recentInvoicesState.isLoading ? (
                <div className="h-56 animate-pulse rounded-lg border border-zinc-800 bg-zinc-950" />
              ) : (
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                      <th className="px-3 py-2">Invoice #</th>
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoicesState.data.map(invoice => {
                      const status = invoice.payment_status || invoice.status

                      return (
                        <tr key={invoice.id} className="rounded-lg bg-zinc-950">
                          <td className="rounded-l-lg px-3 py-3 text-zinc-100">{invoice.invoice_number}</td>
                          <td className="px-3 py-3 text-zinc-300">{invoice.client_name}</td>
                          <td className="px-3 py-3 text-zinc-300">{formatDate(invoice.invoice_date)}</td>
                          <td className="px-3 py-3 text-zinc-300">{formatCurrency(invoice.amount)}</td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs uppercase ${statusBadgeClass(status)}`}
                            >
                              {status || 'unknown'}
                            </span>
                          </td>
                          <td className="rounded-r-lg px-3 py-3">
                            <button
                              type="button"
                              onClick={() => setActionFeedback('Invoice detail page is planned in Phase 5.')}
                              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {!recentInvoicesState.isLoading && recentInvoicesState.data.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No invoices yet for this scope.</p>
            ) : null}
          </article>

          <div className="space-y-6">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">FBR Status</h2>
                <a
                  href="/fbr/submissions"
                  className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                >
                  Open log
                </a>
              </div>

              {fbrStatusState.error ? (
                <p className="mt-3 text-sm text-zinc-400">{fbrStatusState.error}</p>
              ) : null}

              <div className="mt-4 grid gap-3">
                {fbrStatusState.isLoading ? (
                  <div className="h-32 animate-pulse rounded-lg border border-zinc-800 bg-zinc-950" />
                ) : (
                  <>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Submitted Today</p>
                      <p className="mt-2 text-2xl font-semibold text-emerald-300">
                        {formatNumber(fbrStatusState.data?.submitted_today || 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Pending Submission</p>
                      <p className="mt-2 text-2xl font-semibold text-amber-300">
                        {formatNumber(fbrStatusState.data?.pending_submissions || 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Rejected</p>
                      <p className="mt-2 text-2xl font-semibold text-rose-300">
                        {formatNumber(fbrStatusState.data?.rejected_submissions || 0)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-500">Recent Activity</h2>

              {recentActivityState.error ? (
                <p className="mt-3 text-sm text-zinc-400">{recentActivityState.error}</p>
              ) : null}

              <div className="mt-4 space-y-3">
                {recentActivityState.isLoading
                  ? new Array(5)
                      .fill(null)
                      .map((_, index) => (
                        <div
                          key={`activity-placeholder-${index}`}
                          className="h-14 animate-pulse rounded-lg border border-zinc-800 bg-zinc-950"
                        />
                      ))
                  : recentActivityState.data.slice(0, 6).map(activity => (
                      <div key={activity.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <p className="text-sm text-zinc-100">{activity.label}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          {activity.actor_name} | {formatDateTime(activity.occurred_at)}
                        </p>
                      </div>
                    ))}

                {!recentActivityState.isLoading && recentActivityState.data.length === 0 ? (
                  <p className="text-sm text-zinc-500">No activity yet for this scope.</p>
                ) : null}
              </div>
            </article>
          </div>
        </section>

        {summaryState.error ? (
          <p className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
            {summaryState.error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default DashboardPage
