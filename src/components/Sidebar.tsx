import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LogOut, MessageSquarePlus, PenLine, Search } from 'lucide-react'
import Avatar from './Avatar'
import NewChatModal from './NewChatModal'
import StatusPanel from './StatusPanel'
import { conversationsApi } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { subscribe } from '../lib/socket'
import { usePresence } from '../lib/presence'
import type { Conversation, LastMessage, Message } from '../lib/types'
import { formatTime } from '../lib/utils'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { id: activeId } = useParams()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [query, setQuery] = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const listRef = useRef<Conversation[]>([])

  useEffect(() => {
    listRef.current = conversations
  }, [conversations])

  const refresh = useCallback(async () => {
    try {
      const { conversations } = await conversationsApi.list()
      setConversations(conversations)
    } catch {
      /* ignore */
    }
  }, [])

  // live-update the matching list item in place (preview + reorder to top)
  const applyMessage = useCallback(
    (m: Message) => {
      const known = listRef.current.some((c) => c.id === m.conversation_id)
      if (!known) {
        void refresh()
        return
      }
      const patch: LastMessage = {
        id: m.id,
        sender_id: m.sender_id,
        message_type: m.message_type,
        content: m.content,
        created_at: m.created_at,
        sender_name: m.sender_name ?? null,
      }
      setConversations((prev) => {
        const item = prev.find((c) => c.id === m.conversation_id)
        if (!item) return prev
        return [{ ...item, last_message: patch }, ...prev.filter((c) => c.id !== m.conversation_id)]
      })
    },
    [refresh],
  )

  useEffect(() => {
    const t = setTimeout(() => {
      void refresh()
    }, 0)
    const offMessage = subscribe('message', applyMessage)
    const offConversations = subscribe('conversations', () => void refresh())
    return () => {
      clearTimeout(t)
      offMessage()
      offConversations()
    }
  }, [refresh, applyMessage])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => (c.name ?? '').toLowerCase().includes(q))
  }, [conversations, query])

  if (!user) return null

  return (
    <aside className="flex h-full w-full flex-col border-r border-pink-100 bg-white/70 backdrop-blur-xl sm:w-80">
      {/* header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-800">
          Tuuchat
          <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-pink-400" />
        </h1>
        <button
          onClick={() => setNewChatOpen(true)}
          className="rounded-full bg-pink-500 p-2 text-white transition hover:bg-pink-400"
          title="New chat"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </button>
      </div>

      {/* search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full rounded-xl border border-pink-100 bg-white/80 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-pink-400"
          />
        </div>
      </div>

      {/* statuses */}
      <StatusPanel />

      {/* conversation list */}
      <div className="flex-1 overflow-y-auto px-2">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            {query ? 'No matching chats' : 'No conversations yet'}
            {!query && (
              <button
                onClick={() => setNewChatOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-pink-500 hover:text-pink-600"
              >
                <PenLine className="h-4 w-4" /> Start your first chat
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                meId={user.id}
                active={c.id === activeId}
                onClick={() => navigate(`/chat/${c.id}`)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* me */}
      <div className="flex items-center gap-3 border-t border-pink-100 p-3">
        <button onClick={() => navigate('/profile')} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={user.display_name} src={user.avatar_url} size={40} online={user.status === 'online'} showStatus />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{user.display_name}</p>
            <p className="truncate text-xs capitalize text-slate-500">@{user.username}</p>
          </div>
        </button>
        <button
          onClick={logout}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-pink-100 hover:text-rose-500"
          title="Log out"
        >
          <LogOut className="h-5 w-5" />
        </button>
        {newChatOpen && (
          <NewChatModal
            onClose={() => setNewChatOpen(false)}
            onCreated={(conv) => {
              setNewChatOpen(false)
              navigate(`/chat/${conv.id}`)
            }}
          />
        )}
      </div>
    </aside>
  )
}

function ConversationItem({
  conversation: c,
  meId,
  active,
  onClick,
}: {
  conversation: Conversation
  meId: string
  active: boolean
  onClick: () => void
}) {
  const peer = c.type === 'direct' ? c.participants.find((p) => p.id !== meId) : undefined
  const liveStatus = usePresence(peer?.id ?? '')
  const online = peer ? (liveStatus ?? (peer.online ? 'online' : 'offline')) === 'online' : false
  const avatarSrc =
    c.avatar_url ?? (c.type === 'direct' ? peer?.avatar_url : undefined)
  const title = c.name ?? 'Direct chat'

  return (
    <li>
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition ${
          active ? 'bg-pink-100/90' : 'hover:bg-pink-50'
        }`}
      >
        <Avatar
          name={title}
          src={avatarSrc}
          size={46}
          online={c.type === 'direct' ? online : false}
          showStatus={c.type === 'direct'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">{title}</p>
            {c.last_message && (
              <span className="shrink-0 text-[11px] text-slate-400">
                {formatTime(c.last_message.created_at)}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-slate-500">
            {c.last_message
              ? `${c.last_message.sender_id === meId ? 'You: ' : c.type === 'group' ? `${c.last_message.sender_name ?? ''}: ` : ''}${c.last_message.content}`
              : `${c.type === 'group' ? `${c.participant_count} members` : 'Say hi 👋'}`}
          </p>
        </div>
      </button>
    </li>
  )
}