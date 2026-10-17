import { useSyncExternalStore } from 'react'

// Minimal hash router: #/datapath, #/timeline, ... Works on any static host without rewrites.

export const ROUTES = [
  { id: 'home', label: 'Overview', short: 'Home' },
  { id: 'datapath', label: 'Datapath Explorer', short: 'Datapath' },
  { id: 'timeline', label: 'Cycle Timeline', short: 'Timeline' },
  { id: 'hazards', label: 'Hazard & Forwarding Analysis', short: 'Hazards' },
  { id: 'performance', label: 'Performance Lab', short: 'Performance' },
  { id: 'experiments', label: 'My Experiments', short: 'Experiments' },
  { id: 'architecture', label: 'Architecture & Assumptions', short: 'Architecture' },
] as const

export type RouteId = (typeof ROUTES)[number]['id']

function current(): RouteId {
  const id = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return (ROUTES.find((r) => r.id === id)?.id ?? 'home') as RouteId
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): RouteId {
  return useSyncExternalStore(subscribe, current, () => 'home' as RouteId)
}

export function navigate(id: RouteId) {
  window.location.hash = `/${id}`
  window.scrollTo({ top: 0 })
}
