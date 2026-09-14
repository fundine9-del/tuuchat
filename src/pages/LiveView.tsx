import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, PhoneOff, Radio, Users } from 'lucide-react'
import Avatar from '../components/Avatar'
import LiveComments from '../components/LiveComments'
import { liveManager, type LiveSnapshot } from '../lib/live'
import type { LiveSession } from '../lib/types'
import { useAuth } from '../lib/auth-context'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { livesApi } from '../lib/api'

export default function LiveView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const [snap, setSnap] = useState<LiveSnapshot>(liveManager.snapshot)

  useEffect(() => liveManager.subscribe(setSnap), [])

  const passedLive = (location.state as { live?: LiveSession } | null)?.live ?? null
  const liveId = id ?? ''

  // Already hosting this live?
  const amHost = snap.stage === 'live' && snap.live?.id === liveId && user?.id === snap.live.host_id

  // Joining or watching
  const isViewing =
    (snap.stage === 'watching' || snap.stage === 'joining') && snap.live?.id === liveId

  const joinedRef = useRef<string | null>(null)

  // If mounted fresh (not already in live), join or fetch
  useEffect(() => {
    if (joinedRef.current === liveId) return
    if (amHost || isViewing) {
      joinedRef.current = liveId
      return
    }
    if (snap.stage !== 'idle' && snap.stage !== 'ended') return
    joinedRef.current = liveId
    const live = passedLive
    if (!live) {
      // Try fetching from the list
      void livesApi.list().then(({ lives }) => {
        const found = lives.find((l) => l.id === liveId)
        if (found) void liveManager.join(found)
      })
      return
    }
    void liveManager.join(live)
  }, [liveId, passedLive, amHost, isViewing, snap.stage])

  const ended = snap.stage === 'ended' || (snap.live?.id === liveId && snap.stage === 'idle' && !amHost)

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-500">
      {/* top bar */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-3">
        <button onClick={() => { liveManager.leave(); navigate(-1) }} className="text-white/80 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>

        {snap.live && (
          <div className="flex items-center gap-2 text-white">
            <Avatar
              name={snap.live.host.display_name}
              src={snap.live.host.avatar_url}
              size={32}
              showStatus={false}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{snap.live.host.display_name}</p>
              <p className="truncate text-xs text-white/70">{snap.live.title || 'Live'}</p>
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          <Radio className="h-3 w-3 animate-pulse" />
          <Users className="h-3 w-3" />
          {snap.viewers}
        </div>
      </div>

      {/* main content */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
        {(amHost || isViewing) && snap.remoteStream && (
          <MediaVideo stream={snap.remoteStream} className="absolute inset-0 h-full w-full object-cover" muted />
        )}
        {amHost && snap.localStream && (
          <MediaVideo stream={snap.localStream} className="absolute inset-0 h-full w-full object-cover" muted />
        )}

        {amHost && !snap.localStream && (
          <div className="flex flex-col items-center gap-4 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Starting your camera…</p>
          </div>
        )}

        {(snap.stage === 'joining' || (isViewing && !snap.remoteStream)) && !amHost && (
          <div className="flex flex-col items-center gap-4 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Connecting…</p>
          </div>
        )}

        {ended && (
          <div className="flex flex-col items-center gap-4 text-white">
            <Radio className="h-10 w-10 text-white/60" />
            <p className="text-xl font-bold">Live has ended</p>
            <button
              onClick={() => { liveManager.leave(); navigate(-1) }}
              className="mt-2 rounded-full bg-white/20 px-6 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              Back
            </button>
          </div>
        )}
      </div>

      {/* notice toast */}
      {snap.notice && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center">
          <div className="pointer-events-auto rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-xl">
            {snap.notice}
          </div>
        </div>
      )}

      {/* live comments */}
      {!ended && (amHost || isViewing) && <LiveComments />}

      {/* bottom controls */}
      {!ended && (amHost || isViewing) && (
        <div className="relative z-10 flex items-center justify-center gap-8 pb-8 pt-4">
          <button
            onClick={() => {
              if (amHost) liveManager.end()
              else liveManager.leave()
              navigate(-1)
            }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-xl transition hover:scale-105 hover:bg-rose-400"
            title={amHost ? 'End live' : 'Leave live'}
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        </div>
      )}
    </div>
  )
}

function MediaVideo({ stream, className, muted = false }: { stream: MediaStream | null; className?: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    return () => { el.srcObject = null }
  }, [stream])
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />
}