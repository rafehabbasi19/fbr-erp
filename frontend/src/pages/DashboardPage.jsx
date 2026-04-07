import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../context/AuthContext'
import { dashboardSummaryRequest } from '../services/authApi'

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

function statCards(summary) {
  return [
    { label: 'Total invoices', value: summary?.total_invoices || 0 },
    { label: 'Draft invoices', value: summary?.draft_invoices || 0 },
    { label: 'Pending invoices', value: summary?.pending_invoices || 0 },
    { label: 'Paid invoices', value: summary?.paid_invoices || 0 },
    { label: 'Overdue invoices', value: summary?.overdue_invoices || 0 },
    { label: 'FBR pending submissions', value: summary?.fbr_pending_submissions || 0 },
  ]
}

function DashboardPage() {
  const { user, role, accessToken, logout } = useAuth()

  const [summary, setSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadSummary() {
      try {
        const response = await dashboardSummaryRequest(accessToken)
        if (isMounted) {
          setSummary(response.data?.data || null)
        }
      } catch (_error) {
        if (isMounted) {
          setErrorMessage('Unable to load dashboard summary right now.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadSummary()

    return () => {
      isMounted = false
    }
  }, [accessToken])

  const roleLabel = ROLE_LABELS[role] || 'User'
  const capabilities = ROLE_CAPABILITIES[role] || []
  const cards = useMemo(() => statCards(summary), [summary])

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
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

        <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? new Array(6).fill(null).map((_, index) => (
                <div
                  key={`placeholder-${index}`}
                  className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900"
                />
              ))
            : cards.map(card => (
                <article
                  key={card.label}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
                >
                  <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">{card.label}</p>
                  <p className="mt-3 text-3xl font-semibold text-zinc-50">{card.value}</p>
                </article>
              ))}
        </section>

        {errorMessage ? (
          <p className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default DashboardPage
