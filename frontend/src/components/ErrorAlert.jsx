import { forwardRef } from 'react'

const ErrorAlert = forwardRef(function ErrorAlert({ title = 'Error', message }, ref) {
  if (!message) {
    return null
  }

  return (
    <div
      ref={ref}
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      className="mb-4 rounded-lg border-2 border-zinc-500 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-400 text-xs font-semibold"
        >
          !
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-300">{title}</p>
          <p className="mt-1 text-sm text-zinc-100">{message}</p>
        </div>
      </div>
    </div>
  )
})

export default ErrorAlert
