import type { FormEvent } from 'react'
import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { statusesApi } from '../lib/api'
import type { Status } from '../lib/types'

const MAX = 280

interface Props {
  onClose: () => void
  onPosted: (s: Status) => void
}

export default function NewStatusModal({ onClose, onPosted }: Props) {
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!content.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const { status } = await statusesApi.create(content.trim())
      onPosted(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post status')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pink-900/20 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-pink-100 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">New status</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-pink-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={MAX}
          rows={4}
          placeholder="How are you doing? 🎉"
          className="w-full resize-none rounded-xl border border-pink-200 bg-pink-50/60 p-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-pink-400"
        />
        <div className="mb-3 mt-1 text-right text-xs text-slate-400">
          {content.length}/{MAX}
        </div>
        {error && <p className="mb-2 text-sm text-rose-500">{error}</p>}
        <button
          type="submit"
          disabled={!content.trim() || busy}
          className="w-full rounded-xl bg-pink-500 py-2 text-sm font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Post status'}
        </button>
      </form>
    </div>
  )
}