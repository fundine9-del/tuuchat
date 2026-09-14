import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import Avatar from './Avatar'
import { liveManager, type LiveSnapshot } from '../lib/live'

export default function LiveComments() {
  const [snap, setSnap] = useState<LiveSnapshot>(liveManager.snapshot)
  useEffect(() => liveManager.subscribe(setSnap), [])
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [snap.comments.length])

  const send = () => {
    const value = text.trim()
    if (!value) return
    void liveManager.sendComment(value)
    setText('')
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-4">
      <div className="pointer-events-auto flex h-[35vh] max-h-72 w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/35 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
          <p className="text-xs font-bold uppercase tracking-wide text-white/80">Live chat</p>
          <span className="ml-auto text-[11px] text-white/50">{snap.comments.length}</span>
        </div>

        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
          className="flex-1 space-y-2.5 overflow-y-auto px-4 pb-2.5"
        >
          {snap.comments.length === 0 && (
            <p className="pt-3 text-center text-xs text-white/40">No comments yet — say hi!</p>
          )}
          {snap.comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                <Avatar name={c.displayName} src={c.avatarUrl} size={20} showStatus={false} />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-pink-200">{c.displayName}</span>{' '}
                <span className="break-words text-[13px] leading-snug text-white/95">{c.content}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 p-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
            maxLength={500}
            placeholder="Say something…"
            className="flex-1 rounded-full bg-white/15 px-3.5 py-2 text-sm text-white placeholder-white/40 outline-none focus:bg-white/20"
          />
          <button
            onClick={send}
            disabled={!text.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-500 text-white shadow-lg transition hover:bg-pink-400 disabled:opacity-40"
            aria-label="Send comment"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}