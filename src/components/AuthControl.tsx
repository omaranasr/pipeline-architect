import { useAuth } from '../firebase/AuthContext.tsx'

export function AuthControl() {
  const auth = useAuth()
  if (auth.status === 'disabled') {
    return (
      <span className="hidden text-xs text-faint md:inline" title="Set the VITE_FIREBASE_* variables to enable Google Sign-In (see FIREBASE_SETUP.md)">
        Sign-in not configured
      </span>
    )
  }
  if (auth.status === 'loading') return <span className="text-xs text-faint">…</span>
  if (auth.status === 'signed-in' && auth.user) {
    return (
      <div className="flex items-center gap-2">
        {auth.user.photoURL ? (
          <img src={auth.user.photoURL} alt="" className="h-7 w-7 rounded-full border border-line" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/20 text-xs font-bold text-cyan-200">
            {auth.user.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="hidden max-w-[140px] truncate text-sm text-fg sm:inline" title={auth.user.email ?? undefined}>
          {auth.user.displayName}
        </span>
        <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => void auth.signOut()} disabled={auth.busy}>
          Sign out
        </button>
      </div>
    )
  }
  return (
    <div className="relative flex items-center gap-2">
      <button className="btn px-2.5 py-1 text-sm" onClick={() => void auth.signIn()} aria-busy={auth.busy}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.1 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
        </svg>
        {auth.busy ? 'Signing in…' : 'Sign in'}
      </button>
      {auth.error && (
        <div role="alert" className="absolute right-0 top-10 z-40 w-72 rounded-lg border border-rose-400/40 bg-ink-800 p-3 text-xs text-rose-200 shadow-xl">
          {auth.error}
          <button className="mt-2 block text-dim underline" onClick={auth.clearError}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
