import { io, Socket } from 'socket.io-client'
import { API_BASE } from './api'
import { setPresence } from './presence'
import type {
  CallIce,
  CallInitiate,
  CallSdp,
  CallUpdate,
  Message,
  PresenceUpdate,
  Status,
  StatusDeleted,
  TypingUpdate,
} from './types'

type EventMap = {
  message: (m: Message) => void
  messageUpdated: (m: Message) => void
  messageDeleted: (d: { messageId: string; conversationId: string }) => void
  presence: (p: PresenceUpdate) => void
  typing: (t: TypingUpdate) => void
  conversations: (u: { conversationId: string }) => void
  status: (s: Status) => void
  statusDeleted: (d: StatusDeleted) => void
  callInitiated: (c: CallInitiate) => void
  callAccepted: (c: CallSdp) => void
  callRejected: (c: CallUpdate) => void
  callCanceled: (c: CallUpdate) => void
  callEnded: (c: CallUpdate) => void
  callUnavailable: (c: CallUpdate) => void
  callOffer: (c: CallSdp) => void
  callAnswer: (c: CallSdp) => void
  callIce: (c: CallIce) => void
}

const listeners: { [K in keyof EventMap]: Set<EventMap[K]> } = {
  message: new Set(),
  messageUpdated: new Set(),
  messageDeleted: new Set(),
  presence: new Set(),
  typing: new Set(),
  conversations: new Set(),
  status: new Set(),
  statusDeleted: new Set(),
  callInitiated: new Set(),
  callAccepted: new Set(),
  callRejected: new Set(),
  callCanceled: new Set(),
  callEnded: new Set(),
  callUnavailable: new Set(),
  callOffer: new Set(),
  callAnswer: new Set(),
  callIce: new Set(),
}

let socket: Socket | null = null

function dispatch<K extends keyof EventMap>(event: K, payload: Parameters<EventMap[K]>[0]) {
  listeners[event].forEach((l) => (l as (p: unknown) => void)(payload))
}

export function connectSocket(token: string) {
  if (socket?.connected) return socket
  if (socket) {
    socket.disconnect()
  }
  socket = io(API_BASE, { auth: { token } })

  socket.on('presence:update', (d: PresenceUpdate) => {
    setPresence(d.userId, d.status)
    dispatch('presence', d)
  })
  socket.on('message:new', (m: Message) => dispatch('message', m))
  socket.on('message:update', (m: Message) => dispatch('messageUpdated', m))
  socket.on('message:delete', (d: { messageId: string; conversationId: string }) => dispatch('messageDeleted', d))
  socket.on('typing:update', (t: TypingUpdate) => dispatch('typing', t))
  socket.on('conversations:update', (u: { conversationId: string }) => dispatch('conversations', u))
  socket.on('status:new', (s: Status) => dispatch('status', s))
  socket.on('status:delete', (d: StatusDeleted) => dispatch('statusDeleted', d))
  socket.on('call:initiate', (c: CallInitiate) => dispatch('callInitiated', c))
  socket.on('call:accept', (c: CallSdp) => dispatch('callAccepted', c))
  socket.on('call:reject', (c: CallUpdate) => dispatch('callRejected', c))
  socket.on('call:cancel', (c: CallUpdate) => dispatch('callCanceled', c))
  socket.on('call:end', (c: CallUpdate) => dispatch('callEnded', c))
  socket.on('call:unavailable', (c: CallUpdate) => dispatch('callUnavailable', c))
  socket.on('call:offer', (c: CallSdp) => dispatch('callOffer', c))
  socket.on('call:answer', (c: CallSdp) => dispatch('callAnswer', c))
  socket.on('call:ice', (c: CallIce) => dispatch('callIce', c))
  socket.on('connect_error', (e) => console.warn('[socket]', e.message))

  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

export function emitTyping(conversationId: string, isTyping: boolean) {
  socket?.emit('typing', { conversationId, isTyping })
}

export function emitCall(event: string, payload: Record<string, unknown>) {
  socket?.emit(event, payload)
}

export function subscribe<K extends keyof EventMap>(event: K, cb: EventMap[K]): () => void {
  listeners[event].add(cb)
  return () => {
    listeners[event].delete(cb)
  }
}