import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { firebaseConfigured, useEmulators } from './config.ts'

export interface AppUser {
  uid: string
  displayName: string
  email: string | null
  photoURL: string | null
}

type Status = 'disabled' | 'loading' | 'signed-out' | 'signed-in'

interface AuthValue {
  status: Status
  user: AppUser | null
  error: string | null
  busy: boolean
  emulator: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

type Client = typeof import('./client.ts')
let clientPromise: Promise<Client> | null = null
// eslint-disable-next-line react-refresh/only-export-components
export function loadFirebase(): Promise<Client> {
  clientPromise ??= import('./client.ts')
  return clientPromise
}

function describeAuthError(e: unknown): string | null {
  const code = (e as { code?: string }).code ?? ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null // the user changed their mind: not an error
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked by the browser. Allow popups for this site and try again.'
    case 'auth/unauthorized-domain':
      return `This domain (${window.location.hostname}) is not in the Firebase project's Authorized Domains. See FIREBASE_SETUP.md.`
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled in the Firebase console (Authentication → Sign-in method).'
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase. Check your connection and try again.'
    default:
      return `Sign-in failed${code ? ` (${code})` : ''}. Please try again.`
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(firebaseConfigured ? 'loading' : 'disabled')
  const [user, setUser] = useState<AppUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!firebaseConfigured) return
    let unsub: (() => void) | undefined
    let cancelled = false
    loadFirebase()
      .then((fb) => {
        if (cancelled) return
        unsub = fb.watchAuth((u) => {
          if (u) {
            setUser({ uid: u.uid, displayName: u.displayName || u.email || 'Signed-in user', email: u.email, photoURL: u.photoURL })
            setStatus('signed-in')
          } else {
            setUser(null)
            setStatus('signed-out')
          }
        })
      })
      .catch(() => {
        setStatus('signed-out')
        setError('Could not load Firebase. Check the network and the VITE_FIREBASE_* settings.')
      })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  // Firebase may need several seconds to notice a popup the user closed, so the button stays
  // clickable: a new attempt cancels the old popup, and only the latest attempt drives `busy`.
  const attempt = useRef(0)
  const signIn = useCallback(async () => {
    const id = ++attempt.current
    setError(null)
    setBusy(true)
    try {
      const fb = await loadFirebase()
      await fb.signInWithGoogle()
    } catch (e) {
      if (id === attempt.current) setError(describeAuthError(e))
    } finally {
      if (id === attempt.current) setBusy(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    setBusy(true)
    try {
      const fb = await loadFirebase()
      await fb.signOutUser()
    } catch {
      setError('Sign-out failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ status, user, error, busy, emulator: useEmulators, signIn, signOut, clearError: () => setError(null) }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
