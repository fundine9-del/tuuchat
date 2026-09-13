import { useSyncExternalStore } from 'react'
import type { UserStatus } from './types'

const presence = new Map<string, UserStatus>()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function setPresence(userId: string, status: UserStatus) {
  if (presence.get(userId) === status) return
  presence.set(userId, status)
  emit()
}

export function getPresence(userId: string): UserStatus | undefined {
  return presence.get(userId)
}

export function seedPresence(pairs: { id: string; status: UserStatus }[]) {
  let changed = false
  for (const p of pairs) {
    if (presence.get(p.id) !== p.status) {
      presence.set(p.id, p.status)
      changed = true
    }
  }
  if (changed) emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function usePresence(userId: string): UserStatus | undefined {
  return useSyncExternalStore(subscribe, () => presence.get(userId))
}