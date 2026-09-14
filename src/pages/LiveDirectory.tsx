import { Radio } from 'lucide-react'
import LivePanel from '../components/LivePanel'

export default function LiveDirectory() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 pb-28 pt-6">
        <div className="mb-4">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
            </span>
            Live now
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Tune into a live stream or broadcast your own.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-pink-100 bg-white/70 shadow-sm backdrop-blur-xl">
          <LivePanel />
        </div>
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <Radio className="h-3.5 w-3.5" /> Streams are public to your conversations
        </div>
      </div>
    </div>
  )
}