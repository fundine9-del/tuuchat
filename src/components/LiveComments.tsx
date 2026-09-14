import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send, X } from 'lucide-react'
import { liveManager, type LiveSnapshot } from '../lib/live'
import type { LiveComment } from '../lib/types'

const FADE_MS = 8000
const MAX_BUBBLES = 12

export default function LiveComments() {
  const [snap, setSnap] = useState<LiveSnapshot>(liveManager.snapshot)
  useEffect(() => liveManager.subscribe(setSnap), [])

  const [chatOpen, setChatOpen] = useState(false)
  const [text, setText] = useState('')
  const [visible, setVisible] = useState<LiveComment[]>([])
  const visibleRef = useRef(visible)
  useEffect(() => { visibleRef.current = visible })
  const lastComments = useRef<LiveComment[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // Track newly arrived comments and float them over the video.
  useEffect(() => {
    const prev = lastComments.current
    lastComments.current = snap.comments
    const prevIds = new Set(prev.map((c) => c.id))
    const fresh = snap.comments.filter((c) => !prevIds.has(c.id))
    if (fresh.length === 0) return

    let next = [...visibleRef.current]
    for (const c of fresh) {
      if (next.some((x) => x.id === c.id)) continue
      next.push(c)
      const id = c.id
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id)
          setVisible((cur) => cur.filter((x) => x.id !== id))
        }, FADE_MS),
      )
    }
    if (next.length > MAX_BUBBLES) next = next.slice(-MAX_BUBBLES)
    setVisible(next)
  }, [snap.comments])

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t))
      timers.current.clear()
    },
    [],
  )

  const send = () => {
    const value = text.trim()
    if (!value) return
    void liveManager.sendComment(value)
    setText('')
  }

  return (
    <>
      {visible.length > 0 && (
        <div className="pointer-events-none absolute bottom-28 left-3 z-10 flex flex-col items-start gap-1.5 max-w-[260px]">
          {visible.map((c) => (
            <span
              key={c.id}
              className="live-comment-bubble max-w-full truncate rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/95 shadow-lg backdrop-blur-sm"
            >
              <span className="font-semibold text-pink-200">{c.displayName} </span>
              {c.content}
            </span>
          ))}
        </div>
      )}

      {/* chat toggle */}
      <button
        onClick={() => setChatOpen((o) => !o)}
        aria-label="Chat"
        className="absolute right-3 top-16 z-10 flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
      >
        <MessageSquare className="h-4 w-4" />
        {snap.comments.length > 0 && <span>{snap.comments.length}</span>}
      </button>

      {/* compact input bar */}
      {chatOpen && (
        <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
          <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-white/15 bg-black/45 p-2 shadow-xl backdrop-blur-xl">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send()
              }}
              maxLength={500}
              placeholder="Send a comment…"
              className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-white placeholder-white/50 outline-none"
            />
            <button
              onClick={send}
              disabled={!text.trim()}
              aria-label="Send comment"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-500 text-white shadow-lg transition hover:bg-pink-400 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
            <button
              onClick={() => setChatOpen(false)}
              aria-label="Close chat"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}