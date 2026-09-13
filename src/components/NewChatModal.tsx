import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Loader2, Search, Users, UserPlus, X } from 'lucide-react'
import Avatar from './Avatar'
import { conversationsApi, usersApi } from '../lib/api'
import type { Conversation, User } from '../lib/types'

interface Props {
  onClose: () => void
  onCreated: (conv: Conversation) => void
}

export default function NewChatModal({ onClose, onCreated }: Props) {
  const [tab, setTab] = useState<'direct' | 'group'>('direct')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)

  const [groupName, setGroupName] = useState('')
  const [groupQ, setGroupQ] = useState('')
  const [groupResults, setGroupResults] = useState<User[]>([])
  const [selected, setSelected] = useState<User[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      const query = (tab === 'direct' ? q : groupQ).trim()
      if (!query) {
        setResults([])
        setGroupResults([])
        setSearching(false)
        return
      }
      setSearching(true)
      try {
        const { users } = await usersApi.search(query)
        if (tab === 'direct') setResults(users)
        else setGroupResults(users.filter((u) => !selected.some((s) => s.id === u.id)))
      } catch {
        /* ignore */
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [tab, q, groupQ, selected])

  async function startDirect(user: User) {
    if (busy) return
    setBusy(true)
    try {
      const { conversation } = await conversationsApi.create({ type: 'direct', user_ids: [user.id] })
      onCreated(conversation)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start chat')
    } finally {
      setBusy(false)
    }
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault()
    if (!groupName.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const { conversation } = await conversationsApi.create({
        type: 'group',
        name: groupName.trim(),
        user_ids: selected.map((s) => s.id),
      })
      onCreated(conversation)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pink-900/20 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-pink-100 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">New chat</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-pink-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* tabs */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-pink-100/70 p-1">
          <button
            onClick={() => setTab('direct')}
            className={`flex items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-medium transition ${
              tab === 'direct' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserPlus className="h-4 w-4" /> Direct
          </button>
          <button
            onClick={() => setTab('group')}
            className={`flex items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-medium transition ${
              tab === 'group' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users className="h-4 w-4" /> Group
          </button>
        </div>

        {tab === 'direct' ? (
          <div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-300" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by username or name"
                className="w-full rounded-xl border border-pink-200 bg-pink-50/60 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-pink-400"
              />
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {searching ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-pink-400" /></div>
              ) : q && results.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No users found</p>
              ) : (
                results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => void startDirect(u)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-pink-50"
                  >
                    <Avatar name={u.display_name} src={u.avatar_url} size={40} online={u.online} showStatus />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{u.display_name}</p>
                      <p className="truncate text-xs text-slate-500">@{u.username}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={createGroup}>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="mb-3 w-full rounded-xl border border-pink-200 bg-pink-50/60 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-pink-400"
            />
            {/* selected chips */}
            {selected.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {selected.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2.5 py-1 text-xs text-pink-700"
                  >
                    {u.display_name}
                    <button type="button" onClick={() => setSelected(selected.filter((s) => s.id !== u.id))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-300" />
              <input
                value={groupQ}
                onChange={(e) => setGroupQ(e.target.value)}
                placeholder="Search members to add"
                className="w-full rounded-xl border border-pink-200 bg-pink-50/60 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-pink-400"
              />
            </div>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {searching && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-pink-400" /></div>}
              {groupResults.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setSelected((s) => [...s, u])
                    setGroupQ('')
                    setGroupResults([])
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-pink-50"
                >
                  <Avatar name={u.display_name} src={u.avatar_url} size={28} />
                  <span className="truncate text-sm text-slate-700">{u.display_name}</span>
                </button>
              ))}
            </div>
            {error && <p className="mb-2 text-sm text-rose-500">{error}</p>}
            <button
              type="submit"
              disabled={!groupName.trim() || busy}
              className="mt-2 w-full rounded-xl bg-pink-500 py-2 text-sm font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Create group'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}