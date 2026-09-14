import { useEffect, useState } from 'react'
import { Check, Copy, Search, Share2, X } from 'lucide-react'
import { conversationsApi, messagesApi } from '../lib/api'
import type { Conversation } from '../lib/types'
import Avatar from './Avatar'

function linkFor(liveId: string): string {
  return `${window.location.origin}/live/${liveId}`
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export default function ShareLiveModal({
  liveId,
  title,
  onClose,
}: {
  liveId: string
  title: string
  onClose: () => void
}) {
  const [link] = useState(() => linkFor(liveId))
  const [copied, setCopied] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filter, setFilter] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    void conversationsApi.list().then(({ conversations }) => setConversations(conversations))
  }, [])

  const doCopy = async () => {
    const ok = await copyText(link)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator

  const doNativeShare = async () => {
    const shareData = { title: title || 'Live', text: title ? `Live now: ${title}` : 'Live now', url: link }
    if (canNativeShare) {
      try {
        await navigator.share(shareData)
      } catch {
        /* user cancelled */
      }
    } else {
      void doCopy()
    }
  }

  const shareToConversation = async (conversation: Conversation) => {
    const content = (title ? `${title}\n` : '') + link
    setSendError(null)
    try {
      await messagesApi.send(conversation.id, { content })
      setSent(conversation.id)
      setTimeout(() => setSent(null), 2500)
    } catch {
      setSendError('Could not send. Try again.')
    }
  }

  const q = filter.trim().toLowerCase()
  const shown = q
    ? conversations.filter((c) => (c.name ?? '').toLowerCase().includes(q))
    : conversations

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[85%] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-pink-100 bg-white/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-base font-bold text-slate-800">Share this live</h2>
          <button onClick={onClose} aria-label="Close share" className="rounded-full p-1.5 text-slate-400 transition hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-3">
          {/* link + copy */}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              {link}
            </div>
            <button
              onClick={() => void doCopy()}
              aria-label="Copy link"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-500 text-white shadow-lg transition hover:bg-pink-400"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          {canNativeShare && (
            <button
              onClick={() => void doNativeShare()}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-4 py-2.5 text-sm font-semibold text-pink-600 transition hover:bg-pink-100"
            >
              <Share2 className="h-4 w-4" />
              More options
            </button>
          )}

          {/* share to tuuchat users */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Send to tuuchat users
            </p>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search conversations…"
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-pink-300"
              />
            </div>

            {sendError && <p className="mb-2 text-xs font-medium text-rose-500">{sendError}</p>}

            <div className="-mr-2 max-h-56 space-y-0.5 overflow-y-auto pr-2">
              {shown.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">
                  {q ? 'No conversations match' : 'No conversations yet'}
                </p>
              )}
              {shown.map((c) => (
                <button
                  key={c.id}
                  onClick={() => void shareToConversation(c)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-pink-50"
                >
                  <Avatar name={c.name ?? ''} src={c.avatar_url} size={36} showStatus={false} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
                    {c.name ?? 'Conversation'}
                  </span>
                  <span className="shrink-0 rounded-full bg-pink-500 px-3 py-1 text-xs font-bold text-white">
                    {sent === c.id ? 'Sent' : 'Send'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="py-3" />
      </div>
    </div>
  )
}