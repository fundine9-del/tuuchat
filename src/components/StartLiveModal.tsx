import { useState } from 'react'
import { Loader2, Radio } from 'lucide-react'

interface Props {
  onClose: () => void
  onStarted: (liveId: string) => void
  liveManager: {
    start: (title: string) => Promise<import('../lib/types').LiveSession | null>
  }
}

export default function StartLiveModal({ onClose, onStarted, liveManager }: Props) {
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (loading) return
    setLoading(true)
    const live = await liveManager.start(title.trim())
    setLoading(false)
    if (live) onStarted(live.id)
    else onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-pink-100 bg-white/90 p-6 shadow-xl backdrop-blur-xl">
        <div className="mb-5 flex items-center gap-2">
          <Radio className="h-5 w-5 text-rose-500" />
          <h3 className="text-lg font-bold text-slate-800">Go Live</h3>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-600">Title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's happening?"
          maxLength={60}
          className="mb-6 w-full rounded-xl border border-pink-100 bg-white/80 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-pink-400"
        />

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-rose-400 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
            Start
          </button>
        </div>
      </div>
    </div>
  )
}