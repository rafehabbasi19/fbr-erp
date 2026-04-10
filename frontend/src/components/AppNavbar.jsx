import { Link, useLocation } from 'react-router-dom'

function getLinkClasses(isActive) {
  return `rounded-md border px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
      : 'border-transparent text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100'
  }`
}

function AppNavbar() {
  const location = useLocation()
  const pathname = String(location.pathname || '')

  const isHomeActive = pathname === '/dashboard'
  const isClientSectionActive = pathname.startsWith('/clients')
  const isInvoiceSectionActive = pathname.startsWith('/invoices')

  return (
    <nav className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
        <Link to="/dashboard" className={getLinkClasses(isHomeActive)}>
          Home
        </Link>
        <Link to="/clients/new" className={getLinkClasses(isClientSectionActive)}>
          Add Client
        </Link>
        <Link to="/clients" className={getLinkClasses(isClientSectionActive)}>
          All Clients
        </Link>
        <Link to="/invoices/new" className={getLinkClasses(isInvoiceSectionActive)}>
          Add Invoice
        </Link>
        <Link to="/invoices" className={getLinkClasses(isInvoiceSectionActive)}>
          All Invoices
        </Link>
      </div>
    </nav>
  )
}

export default AppNavbar
