import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { label: 'Home', to: '/dashboard' },
  { label: 'Add Client', to: '/clients/new' },
  { label: 'All Clients', to: '/clients' },
  { label: 'Add Invoice', to: '/invoices/new' },
  { label: 'All Invoices', to: '/invoices' },
]

function linkClasses(isActive) {
  return `rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-zinc-100 text-zinc-900'
      : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
  }`
}

function AppNavbar() {
  return (
    <nav className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => linkClasses(isActive)}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default AppNavbar
