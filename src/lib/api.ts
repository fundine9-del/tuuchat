import type { Conversation, LastMessage, Message, Participant, Status, User, UserStatus } from './types'

export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://tuuchat-server-production.up.railway.app'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let token: string | null = null

export function setToken(t: string | null) {
  token = t
}

export function getToken() {
  return token
}

export function absoluteUrl(p: string | null | undefined): string | null {
  if (!p) return null
  return p.startsWith('http') ? p : `${API_BASE}${p}`
}

interface RequestOpts {
  method?: string
  body?: unknown
  rawBody?: FormData
  auth?: boolean
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined && opts.rawBody === undefined) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.rawBody !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  })

  if (!res.ok) {
    let msg = res.statusText
    try {
      const j: { error?: string } = await res.json()
      if (j?.error) msg = j.error
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/* ------------------------------- auth ------------------------------- */

export const authApi = {
  register: (email: string, username: string, password: string, display_name?: string) =>
    request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: { email, username, password, display_name },
    }),
  login: (identifier: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email: identifier, username: identifier, password },
    }),
  me: () => request<{ user: User }>('/api/auth/me'),
}

/* ------------------------------- users ------------------------------- */

export const usersApi = {
  me: () => request<{ user: User }>('/api/users/me'),
  search: (q: string) =>
    request<{ users: User[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  presence: (userId: string) => request<{ online: boolean; status: UserStatus; last_seen: string }>(`/api/users/${userId}/presence`),
  setStatus: (status: UserStatus) =>
    request<{ status: UserStatus }>('/api/users/me/status', { method: 'PUT', body: { status } }),
  updateProfile: (data: { display_name?: string; bio?: string }) =>
    request<{ user: User }>('/api/users/me', { method: 'PATCH', body: data }),
  uploadAvatar: async (file: File, conversationId?: string) => {
    const fd = new FormData()
    fd.append('avatar', file)
    const path = conversationId ? `/api/conversations/${conversationId}/avatar` : '/api/users/me/avatar'
    return request<{ avatar_url: string }>(path, { method: 'POST', rawBody: fd })
  },
}

/* ---------------------------- conversations --------------------------- */

export const conversationsApi = {
  list: () => request<{ conversations: Conversation[] }>('/api/conversations'),
  get: async (id: string) => {
    const res = await request<{ conversation: Conversation; participants: (Participant & { user_id: string })[] }>(`/api/conversations/${id}`)
    return { ...res, conversation: { ...res.conversation, participants: res.participants } }
  },
  create: (data: { type: 'direct' | 'group'; user_ids: string[]; name?: string }) =>
    request<{ conversation: Conversation; duplicate?: boolean }>('/api/conversations', {
      method: 'POST',
      body: data,
    }),
  addParticipants: (id: string, user_ids: string[]) =>
    request<{ added: string[] }>(`/api/conversations/${id}/participants`, {
      method: 'POST',
      body: { user_ids },
    }),
  typing: (id: string, isTyping: boolean) =>
    request<{ ok: boolean }>(`/api/conversations/${id}/typing`, { method: 'POST', body: { is_typing: isTyping } }),
}

/* ------------------------------ messages ------------------------------ */

export interface MessagesPage {
  messages: (Message & { sender_name: string; sender_avatar: string | null })[]
  has_more: boolean
}

export const messagesApi = {
  list: (conversationId: string, opts: { limit?: number; before?: string } = {}) => {
    const q = new URLSearchParams()
    if (opts.limit) q.set('limit', String(opts.limit))
    if (opts.before) q.set('before', opts.before)
    return request<MessagesPage>(`/api/conversations/${conversationId}/messages?${q}`)
  },
  send: (
    conversationId: string,
    data: { content: string; message_type?: 'text' | 'image' | 'file'; reply_to_id?: string },
  ) =>
    request<{ message: Message & { sender_name: string; sender_avatar: string | null } }>(
      `/api/conversations/${conversationId}/messages`,
      { method: 'POST', body: data },
    ),
  update: (messageId: string, content: string) =>
    request<{ message: Message & { sender_name: string; sender_avatar: string | null } }>(
      `/api/messages/${messageId}`,
      { method: 'PATCH', body: { content } },
    ),
  del: (messageId: string) => request<{ deleted: string }>(`/api/messages/${messageId}`, { method: 'DELETE' }),
}

export type { LastMessage }

/* ------------------------------ statuses ------------------------------ */

export const statusesApi = {
  list: () => request<{ statuses: Status[] }>('/api/statuses'),
  create: (content: string) =>
    request<{ status: Status }>('/api/statuses', { method: 'POST', body: { content } }),
  del: (id: string) => request<{ deleted: string }>(`/api/statuses/${id}`, { method: 'DELETE' }),
}