import Dexie, { type EntityTable } from 'dexie'
import type { Conversation, Message, Status } from './types'

/*
 * Client-side API cache backed by IndexedDB (Dexie).
 *
 * Reads use a TTL: fresh entries return instantly with NO network call, stale
 * entries are refreshed in the background but fall back to the cached value if
 * the refresh fails (offline / server hiccup). Socket events + mutations keep
 * the cache coherent so snapshots stay fresh between refreshes.
 */

interface CacheEntry {
  key: string
  value: unknown
  at: number
}

type Db = Dexie & { kv: EntityTable<CacheEntry, 'key'> }

const db = new Dexie('tuuchat-cache') as Db
db.version(1).stores({ kv: 'key' })

/* --------------------------- generic helpers --------------------------- */

async function cacheGet<T>(key: string): Promise<{ value: T; at: number } | undefined> {
  try {
    const e = await db.kv.get(key)
    return e ? { value: e.value as T, at: e.at } : undefined
  } catch {
    return undefined
  }
}

async function cacheSet(key: string, value: unknown) {
  try {
    await db.kv.put({ key, value, at: Date.now() })
  } catch {
    /* indexDB unavailable / quota -> cache is best-effort */
  }
}

async function cacheDelete(key: string) {
  try {
    await db.kv.delete(key)
  } catch {
    /* ignore */
  }
}

async function cacheDeletePrefix(prefix: string) {
  try {
    await db.kv.where('key').startsWith(prefix).delete()
  } catch {
    /* ignore */
  }
}

export async function cacheClear() {
  try {
    await db.kv.clear()
  } catch {
    /* ignore */
  }
}

/**
 * Cache-first load with TTL freshness + stale fallback.
 * Returns straight from cache when fresh, otherwise refreshes and re-caches.
 */
export async function swr<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const entry = await cacheGet<T>(key)
  if (entry) {
    if (Date.now() - entry.at <= ttl) return entry.value
    try {
      const fresh = await fetcher()
      await cacheSet(key, fresh)
      return fresh
    } catch {
      return entry.value
    }
  }
  const fresh = await fetcher()
  await cacheSet(key, fresh)
  return fresh
}

/* ---------------------------- cache keys ---------------------------- */

const convListKey = 'conv:list'
const convDetailKey = (id: string) => `conv:${id}`
const msgsKey = (id: string) => `msgs:${id}`
const statusesKey = 'statuses'

export const chatCache = {
  invalidateConversationList: () => cacheDelete(convListKey),
  invalidateConversation: (id: string) => cacheDelete(convDetailKey(id)),
  invalidateMessages: (id: string) => cacheDelete(msgsKey(id)),
  invalidateMessagesAll: () => cacheDeletePrefix('msgs:'),
  invalidateStatuses: () => cacheDelete(statusesKey),
  clear: cacheClear,
}

/* ------------------------- cache coherence ------------------------- */

function lastMessageJson(m: Message) {
  return {
    id: m.id,
    sender_id: m.sender_id,
    message_type: m.message_type,
    content: m.content,
    created_at: m.created_at,
    sender_name: m.sender_name ?? null,
  }
}

/** Append a new message to the cached page + bump the conversation preview. */
export async function noteMessageCache(m: Message) {
  const page = await cacheGet<{ messages: Message[]; has_more: boolean }>(msgsKey(m.conversation_id))
  if (page) {
    const messages = page.value.messages.some((x) => x.id === m.id)
      ? page.value.messages
      : [...page.value.messages, m]
    await cacheSet(msgsKey(m.conversation_id), { ...page.value, messages })
  }
  const list = await cacheGet<{ conversations: Conversation[] }>(convListKey)
  if (list) {
    const next = [...list.value.conversations]
    const idx = next.findIndex((c) => c.id === m.conversation_id)
    if (idx >= 0) {
      next[idx] = { ...next[idx], last_message: lastMessageJson(m) }
      next.unshift(next.splice(idx, 1)[0])
      await cacheSet(convListKey, { conversations: next })
    }
  }
}

/** Replace a message in the cached page + preview (edits). */
export async function updateMessageCache(m: Message) {
  const page = await cacheGet<{ messages: Message[]; has_more: boolean }>(msgsKey(m.conversation_id))
  if (page) {
    await cacheSet(msgsKey(m.conversation_id), {
      ...page.value,
      messages: page.value.messages.map((x) => (x.id === m.id ? m : x)),
    })
  }
  const list = await cacheGet<{ conversations: Conversation[] }>(convListKey)
  if (list) {
    await cacheSet(convListKey, {
      conversations: list.value.conversations.map((c) =>
        c.id === m.conversation_id && c.last_message?.id === m.id ? { ...c, last_message: lastMessageJson(m) } : c,
      ),
    })
  }
}

/** Drop a deleted message from the cached page. */
export async function removeMessageCache(conversationId: string, messageId: string) {
  const page = await cacheGet<{ messages: Message[]; has_more: boolean }>(msgsKey(conversationId))
  if (page) {
    await cacheSet(msgsKey(conversationId), {
      ...page.value,
      messages: page.value.messages.filter((x) => x.id !== messageId),
    })
  }
}

/** Prepend a new status to the cached status list. */
export async function noteStatusCache(s: Status) {
  const entry = await cacheGet<{ statuses: Status[] }>(statusesKey)
  if (entry) {
    const statuses = entry.value.statuses.some((x) => x.id === s.id) ? entry.value.statuses : [s, ...entry.value.statuses]
    await cacheSet(statusesKey, { statuses })
  }
}

/** Drop a removed status from the cache. */
export async function removeStatusCache(statusId: string) {
  const entry = await cacheGet<{ statuses: Status[] }>(statusesKey)
  if (entry) {
    await cacheSet(statusesKey, { statuses: entry.value.statuses.filter((x) => x.id !== statusId) })
  }
}