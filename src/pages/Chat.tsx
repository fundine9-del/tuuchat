import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Pencil, Phone, Send, Trash2, Video } from 'lucide-react'
import Avatar from '../components/Avatar'
import { callManager } from '../lib/call'
import { conversationsApi, messagesApi, usersApi, type MessagesPage } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { usePresence } from '../lib/presence'
import type { Conversation, Message } from '../lib/types'
import { emitTyping, subscribe } from '../lib/socket'
import { formatRelative, formatTime } from '../lib/utils'

const PAGE = 50
const TYPING_TTL = 4000

export default function ChatPage() {
  const { id = '' } = useParams()
  // remounts on every conversation change -> fresh state, no reset effects needed
  return <ChatInner key={id} conversationId={id} />
}

function ChatInner({ conversationId }: { conversationId: string }) {
  const id = conversationId
  const navigate = useNavigate()
  const { user } = useAuth()
  const meId = user?.id ?? ''

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map())
  const [peerLastSeen, setPeerLastSeen] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const idsRef = useRef<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const pendingRef = useRef<Map<string, Message>>(new Map())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const typingEmitRef = useRef<{ on: boolean; timer: ReturnType<typeof setTimeout> | null }>({
    on: false,
    timer: null,
  })

  /* ------------------------------ data load ------------------------------ */
  const resolvePending = useCallback((tempId: string, real: Message) => {
    pendingRef.current.delete(tempId)
    setPendingIds((prev) => {
      if (!prev.has(tempId)) return prev
      const next = new Set(prev)
      next.delete(tempId)
      return next
    })
    setMessages((prev) => prev.map((x) => (x.id === tempId ? real : x)))
  }, [])

  useEffect(() => {
    let cancelled = false
    const timers = typingTimers.current

    async function load() {
      try {
        const [convRes, msgRes] = await Promise.all([
          conversationsApi.get(id).catch(() => null),
          messagesApi.list(id, { limit: PAGE }),
        ])
        if (cancelled) return
        const conversation = convRes?.conversation ?? null
        setConversation(conversation)
        if (conversation) {
          const peer =
            conversation.type === 'direct' && user
              ? conversation.participants.find((p) => p.id !== user.id)
              : undefined
          if (peer) {
            usersApi
              .presence(peer.id)
              .then((p) => !cancelled && setPeerLastSeen(p.last_seen))
              .catch(() => undefined)
          }
        }
        setMessages(msgRes.messages)
        setHasMore(msgRes.has_more)
        msgRes.messages.forEach((m) => idsRef.current.add(m.id))
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }))
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [id, user])

  /* ------------------------------ realtime ------------------------------ */
  useEffect(() => {
    const offUpdated = subscribe('messageUpdated', (m) => {
      if (m.conversation_id !== id) return
      setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)))
    })
    const offDeleted = subscribe('messageDeleted', ({ messageId }) => {
      setMessages((prev) => prev.filter((x) => x.id !== messageId))
    })

    const offMessage = subscribe('message', (m) => {
      if (m.conversation_id !== id) return
      if (idsRef.current.has(m.id)) return

      // our own message echoed back: swap the optimistic temp bubble for the real one
      if (m.sender_id === meId) {
        for (const [tempId, temp] of pendingRef.current) {
          if (temp.conversation_id === m.conversation_id && temp.content === m.content) {
            idsRef.current.add(m.id)
            resolvePending(tempId, m)
            return
          }
        }
      }

      idsRef.current.add(m.id)
      setMessages((prev) => [...prev, m])
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
    })

    const offTyping = subscribe('typing', (t) => {
      if (t.conversationId !== id) return
      if (t.userId === meId) return

      const prevTimer = typingTimers.current.get(t.userId)
      if (prevTimer) clearTimeout(prevTimer)

      setTypingUsers((prev) => {
        const next = new Map(prev)
        if (!t.isTyping) {
          next.delete(t.userId)
          return next
        }
        next.set(t.userId, Date.now())
        return next
      })

      if (t.isTyping) {
        typingTimers.current.set(
          t.userId,
          setTimeout(() => {
            typingTimers.current.delete(t.userId)
            setTypingUsers((prev) => {
              const next = new Map(prev)
              next.delete(t.userId)
              return next
            })
          }, TYPING_TTL),
        )
      }
    })

    return () => {
      offMessage()
      offTyping()
      offUpdated()
      offDeleted()
    }
  }, [id, meId, resolvePending])

  /* ---------------------------- typing emit ---------------------------- */
  const signalTyping = useCallback(
    (isTyping: boolean) => {
      const st = typingEmitRef.current
      if (st.on === isTyping) return
      st.on = isTyping
      if (isTyping) {
        if (st.timer) clearTimeout(st.timer)
        st.timer = setTimeout(() => {
          st.on = false
          emitTyping(id, false)
        }, 2500)
      } else if (st.timer) {
        clearTimeout(st.timer)
        st.timer = null
      }
      emitTyping(id, isTyping)
    },
    [id],
  )

  useEffect(() => {
    const t = setTimeout(() => {
      if (draft && draft.trim()) signalTyping(true)
      else signalTyping(false)
    }, 300)
    return () => clearTimeout(t)
  }, [draft, signalTyping])

  /* -------------------------------- send -------------------------------- */
  async function send() {
    const content = draft.trim()
    if (!content || sending || !conversation) return
    signalTyping(false)
    setSending(true)

    // optimistic bubble shown immediately
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const temp: Message = {
      id: tempId,
      conversation_id: conversation.id,
      sender_id: meId,
      message_type: 'text',
      content,
      reply_to_id: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      sender_name: user?.display_name,
      sender_avatar: user?.avatar_url ?? null,
    }
    pendingRef.current.set(tempId, temp)
    setPendingIds((prev) => new Set(prev).add(tempId))
    setMessages((prev) => [...prev, temp])
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
    setDraft('')

    try {
      const { message } = await messagesApi.send(conversation.id, { content })
      idsRef.current.add(message.id)
      resolvePending(tempId, message)
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
    } catch (e) {
      // roll the optimistic bubble back and restore the draft so nothing is lost
      pendingRef.current.delete(tempId)
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(tempId)
        return next
      })
      setMessages((prev) => prev.filter((x) => x.id !== tempId))
      setDraft(content)
      alert(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  /* ---------------------------- pagination ---------------------------- */
  async function loadEarlier() {
    if (!hasMore || loadingMore || messages.length === 0) return
    setLoadingMore(true)
    try {
      const page: MessagesPage = await messagesApi.list(id, { limit: PAGE, before: messages[0].id })
      const known = new Set(messages.map((m) => m.id))
      const fresh = page.messages.filter((m) => !known.has(m.id))
      fresh.forEach((m) => idsRef.current.add(m.id))
      setMessages((prev) => [...fresh, ...prev])
      setHasMore(page.has_more)
    } finally {
      setLoadingMore(false)
    }
  }

  /* --------------------- edit / delete messages --------------------- */
  const meRole = conversation?.participants.find((p) => p.id === meId)?.role
  const isAdmin = meRole === 'admin'

  function startEdit(m: Message) {
    setEditingId(m.id)
    setEditDraft(m.content)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft('')
  }

  async function saveEdit() {
    const content = editDraft.trim()
    if (!content || !editingId || sending) return
    setSending(true)
    try {
      const { message } = await messagesApi.update(editingId, content)
      setMessages((prev) => prev.map((x) => (x.id === message.id ? message : x)))
      setEditingId(null)
      setEditDraft('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to edit')
    } finally {
      setSending(false)
    }
  }

  async function removeMessage(messageId: string) {
    const content = messages.find((m) => m.id === messageId)?.content
    const ok = window.confirm(content ? `Delete this message?\n\n“${content.slice(0, 120)}”` : 'Delete this message?')
    if (!ok) return
    try {
      await messagesApi.del(messageId, id)
      setMessages((prev) => prev.filter((x) => x.id !== messageId))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  /* ------------------------------ derived ------------------------------ */
  const peer = useMemo(() => {
    if (!conversation || conversation.type !== 'direct' || !user) return undefined
    return conversation.participants.find((p) => p.id !== user.id)
  }, [conversation, user])

  const livePeerStatus = usePresence(peer?.id ?? '')
  const peerOnline = peer ? (livePeerStatus ?? (peer.online ? 'online' : 'offline')) === 'online' : false

  const title = conversation?.name ?? (peer ? peer.display_name : 'Chat')
  const avatarSrc = conversation?.avatar_url ?? (conversation?.type === 'direct' ? peer?.avatar_url : null)

  const typingNames = useMemo(() => {
    if (!conversation) return []
    return Array.from(typingUsers.keys())
      .filter((uid) => uid !== meId)
      .map((uid) => conversation.participants.find((p) => p.id === uid)?.display_name ?? 'Someone')
  }, [typingUsers, conversation, meId])

  const peerStatusText = peerOnline
    ? 'Active now'
    : peerLastSeen
      ? `Last seen ${formatRelative(peerLastSeen)}`
      : peer
        ? 'Offline'
        : ''

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-pink-500" />
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-slate-500">
        <p>Conversation not available</p>
        <button onClick={() => navigate('/')} className="mt-3 text-pink-500 hover:underline">
          Back to chats
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-pink-100 bg-white/70 px-4 py-3 backdrop-blur-xl">
        <button onClick={() => navigate('/')} className="rounded-lg p-1.5 text-slate-500 hover:bg-pink-100 lg:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar
          name={title}
          src={avatarSrc}
          size={40}
          online={conversation.type === 'direct' ? peerOnline : false}
          showStatus={conversation.type === 'direct'}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-slate-800">{title}</h2>
          <p
            className={`truncate text-xs ${
              conversation.type === 'group'
                ? typingNames.length > 0
                  ? 'italic text-pink-500'
                  : 'text-slate-500'
                : typingUsers.size > 0
                  ? 'italic text-pink-500'
                  : 'text-slate-500'
            }`}
          >
            {conversation.type === 'group'
              ? typingNames.length > 0
                ? `${typingNames.slice(0, 3).join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…`
                : `${conversation.participant_count} members`
              : typingUsers.size > 0
                ? 'typing…'
                : peerStatusText}
          </p>
        </div>
        {conversation.type === 'direct' && peer && user && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() =>
                void callManager.startOutgoing(
                  { id: peer.id, display_name: peer.display_name, avatar_url: peer.avatar_url },
                  'audio',
                  id,
                  { id: user.id, display_name: user.display_name, avatar_url: user.avatar_url },
                )
              }
              className="rounded-xl p-2.5 text-pink-500 transition hover:bg-pink-100 hover:text-pink-600"
              title="Voice call"
            >
              <Phone className="h-5 w-5" />
            </button>
            <button
              onClick={() =>
                void callManager.startOutgoing(
                  { id: peer.id, display_name: peer.display_name, avatar_url: peer.avatar_url },
                  'video',
                  id,
                  { id: user.id, display_name: user.display_name, avatar_url: user.avatar_url },
                )
              }
              className="rounded-xl p-2.5 text-pink-500 transition hover:bg-pink-100 hover:text-pink-600"
              title="Video call"
            >
              <Video className="h-5 w-5" />
            </button>
          </div>
        )}
      </header>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {hasMore && (
          <div className="mb-4 text-center">
            <button
              onClick={() => void loadEarlier()}
              disabled={loadingMore}
              className="rounded-lg border border-pink-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No messages yet — say hi!
          </div>
        )}

        <div className="space-y-2">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              mine={m.sender_id === meId}
              showSender={conversation.type === 'group' && m.sender_id !== meId}
              isFirstOfGroup={shouldGroup(m, messages)}
              pending={pendingIds.has(m.id)}
              editing={editingId === m.id}
              editDraft={editingId === m.id ? editDraft : ''}
              canEdit={m.sender_id === meId}
              canDelete={m.sender_id === meId || (conversation.type === 'group' && isAdmin)}
              onEditDraft={(v) => setEditDraft(v)}
              onSaveEdit={() => void saveEdit()}
              onCancelEdit={cancelEdit}
              onEdit={() => startEdit(m)}
              onDelete={() => void removeMessage(m.id)}
            />
          ))}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <div className="border-t border-pink-100 bg-white/70 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-end gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder="Type a message…"
            className="flex-1 rounded-xl border border-pink-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-pink-500"
          />
          <button
            onClick={() => void send()}
            disabled={!draft.trim() || sending}
            className="rounded-xl bg-pink-500 p-2.5 text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function shouldGroup(m: Message, all: Message[]): boolean {
  const idx = all.findIndex((x) => x.id === m.id)
  const prev = all[idx - 1]
  if (!prev) return true
  const gap = new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()
  return prev.sender_id !== m.sender_id || gap > 5 * 60 * 1000
}

function MessageBubble({
  message: m,
  mine,
  showSender,
  isFirstOfGroup,
  pending,
  editing,
  editDraft,
  canEdit,
  canDelete,
  onEditDraft,
  onSaveEdit,
  onCancelEdit,
  onEdit,
  onDelete,
}: {
  message: Message
  mine: boolean
  showSender: boolean
  isFirstOfGroup: boolean
  pending: boolean
  editing: boolean
  editDraft: string
  canEdit: boolean
  canDelete: boolean
  onEditDraft: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const hasActions = (canEdit || canDelete) && !pending

  return (
    <div className={`group flex items-start gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
      {hasActions && !mine && <Actions canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} />}

      {editing ? (
        <div className="max-w-[78%] rounded-2xl border border-blue-300 bg-white p-2 shadow-sm">
          <textarea
            value={editDraft}
            autoFocus
            rows={2}
            placeholder="Edit message"
            onChange={(e) => onEditDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSaveEdit()
              }
              if (e.key === 'Escape') onCancelEdit()
            }}
            className="w-full resize-none bg-transparent text-sm text-slate-800 outline-none"
          />
          <div className="mt-1 flex justify-end gap-3 text-xs">
            <button onClick={onCancelEdit} className="text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            <button onClick={onSaveEdit} disabled={!editDraft.trim()} className="font-medium text-blue-600 hover:text-blue-500 disabled:opacity-40">
              Save
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
            mine
              ? 'rounded-br-md bg-gradient-to-br from-blue-500 to-blue-600 text-white'
              : 'rounded-bl-md border border-blue-100 bg-white text-slate-700'
          } ${pending ? 'opacity-70' : ''}`}
        >
          {showSender && isFirstOfGroup && (
            <p className="mb-0.5 text-xs font-semibold text-blue-500">{m.sender_name}</p>
          )}
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
          <p className={`mt-0.5 flex items-center justify-end gap-1 text-right text-[10px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            {formatTime(m.created_at)}
            {m.edited_at && !pending && <span className="opacity-80">(edited)</span>}
            {pending && <span className="italic opacity-80">Sending…</span>}
          </p>
        </div>
      )}

      {hasActions && mine && <Actions canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} />}
    </div>
  )
}

function Actions({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5 pt-1 opacity-0 transition group-hover:opacity-100">
      {canEdit && (
        <button
          onClick={onEdit}
          title="Edit"
          className="rounded-lg p-1 text-slate-500 hover:bg-blue-100 hover:text-blue-600"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {canDelete && (
        <button
          onClick={onDelete}
          title="Delete"
          className="rounded-lg p-1 text-slate-500 hover:bg-blue-100 hover:text-rose-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}