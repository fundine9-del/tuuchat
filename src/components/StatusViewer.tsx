import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import Avatar from './Avatar'
import { statusesApi } from '../lib/api'
import type { Status } from '../lib/types'
import { formatRelative } from '../lib/utils'

const GRADIENTS = [
  'from-pink-400 via-rose-400 to-fuchsia-500',
  'from-blue-500 via-indigo-500 to-violet-500',
  'from-violet-400 via-purple-400 to-fuchsia-500',
  'from-amber-300 via-orange-400 to-rose-400',
  'from-emerald-400 via-teal-400 to-cyan-500',
]

const DURATION_MS = 5000

interface Props {
  statuses: Status[]
  initialIndex: number
  meId: string
  onClose: () => void
  onDeleted: (statusId: string) => void
}

export default function StatusViewer({ statuses, initialIndex, meId, onClose, onDeleted }: Props) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, statuses.length - 1)))
  const [progress, setProgress] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const current = statuses[index]

  const goNext = useCallback(() => {
    if (index + 1 >= statuses.length) onClose()
    else setIndex(index + 1)
  }, [index, statuses.length, onClose])

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  // auto-advance
  useEffect(() => {
    const t = setTimeout(goNext, DURATION_MS)
    return () => clearTimeout(t)
  }, [index, goNext])

  // progress bar fill for the current status
  const startRef = useRef(0)
  useEffect(() => {
    startRef.current = Date.now()
    const id = setInterval(() => setProgress((Date.now() - startRef.current) / DURATION_MS), 100)
    return () => clearInterval(id)
  }, [index])

  // keyboard support
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, onClose])

  // when everything is gone, close
  useEffect(() => {
    if (statuses.length === 0) onClose()
  }, [statuses.length, onClose])

  if (!current) return null

  const isMine = current.user_id === meId
  const gradient = GRADIENTS[index % GRADIENTS.length]

  async function del() {
    if (deleting) return
    setDeleting(true)
    try {
      await statusesApi.del(current.id)
      onDeleted(current.id)
      goNext()
    } catch {
      /* keep viewer open on failure */
    } finally {
      setDeleting(false)
    }
  }

  // only my own statuses and contact statuses shown -> index is relative to flat list
  const segments = statuses.length

  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-br ${gradient}`}>
      {/* progress bar */}
      <div className="flex gap-1 p-3">
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
                i < index ? 'w-full bg-white/90' : i === index ? 'bg-white/90' : 'w-0'
              }`}
              style={i === index ? { width: `${Math.min(progress, 1) * 100}%` } : undefined}
            />
          </div>
        ))}
      </div>

      {/* top bar */}
      <div className="flex items-center gap-3 px-4">
        <Avatar name={current.user.display_name} src={current.user.avatar_url} size={40} showStatus />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{current.user.display_name}</p>
          <p className="text-xs text-white/80">Today · {formatRelative(current.created_at)}</p>
        </div>
        {isMine && (
          <button
            onClick={() => void del()}
            disabled={deleting}
            className="rounded-full p-2 text-white/80 transition hover:bg-white/20 hover:text-white"
            title="Delete status"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
        <button onClick={onClose} className="rounded-full p-2 text-white/80 transition hover:bg-white/20 hover:text-white" title="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* content */}
      <div className="relative flex flex-1 items-center justify-center px-8">
        <p className="max-w-md text-center text-2xl font-medium leading-relaxed text-white drop-shadow-md">
          {current.content}
        </p>
      </div>

      {/* tap zones */}
      <button
        aria-label="Previous status"
        onClick={goPrev}
        className="absolute left-0 top-16 h-[70%] w-1/2 cursor-w-resize"
      />
      <button
        aria-label="Next status"
        onClick={goNext}
        className="absolute right-0 top-16 h-[70%] w-1/2 cursor-e-resize"
      />
    </div>
  )
}