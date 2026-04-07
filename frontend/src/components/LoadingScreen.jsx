function LoadingScreen({ message = 'Checking session...' }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
        <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-100"
            aria-hidden="true"
          />
          <p className="text-sm text-zinc-300">{message}</p>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen
