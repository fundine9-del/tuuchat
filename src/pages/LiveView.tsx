import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Heart, Loader2, PhoneOff, Radio, Share2, Users } from 'lucide-react'
import Avatar from '../components/Avatar'
import LiveComments from '../components/LiveComments'
import ShareLiveModal from '../components/ShareLiveModal'
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
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([])
  const [shareOpen, setShareOpen] = useState(false)
  const heartId = useRef(0)

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
      // Join-by-link: resolve the live directly first, fall back to the directory.
      void livesApi
        .get(liveId)
        .then(({ live }) => void liveManager.join(live))
        .catch(() => {
          void livesApi.list().then(({ lives }) => {
            const found = lives.find((l) => l.id === liveId)
            if (found) void liveManager.join(found)
          })
        })
      return
    }
    void liveManager.join(live)
  }, [liveId, passedLive, amHost, isViewing, snap.stage])

  const ended = snap.stage === 'ended' || (snap.live?.id === liveId && snap.stage === 'idle' && !amHost)

  const like = (e?: { clientX?: number }) => {
    liveManager.sendLike()
    const x = (e?.clientX ?? window.innerWidth / 2) + (Math.random() * 40 - 20)
    const n = ++heartId.current
    setHearts((cur) => [...cur, { id: n, x }])
    setTimeout(() => setHearts((cur) => cur.filter((h) => h.id !== n)), 1500)
  }

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

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => like()}
            aria-label="Like this live"
            className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
          >
            <Heart className="h-3.5 w-3.5 text-pink-200" />
            {snap.likes}
          </button>
          <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            <Radio className="h-3 w-3 animate-pulse" />
            <Users className="h-3 w-3" />
            {snap.viewers}
          </div>
          <button
            onClick={() => setShareOpen(true)}
            aria-label="Share live"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* main content — double-tap anywhere to like */}
      <div
        onDoubleClick={like}
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center"
      >
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

        {/* heart burst on like */}
        {hearts.map((h) => (
          <span
            key={h.id}
            className="live-heart pointer-events-none absolute z-20"
            style={{ left: h.x, bottom: '42%' }}
          >
            <Heart className="h-16 w-16 fill-rose-400 text-rose-400 drop-shadow-lg" />
          </span>
        ))}
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

      {/* share modal */}
      {shareOpen && snap.live && (
        <ShareLiveModal liveId={liveId} title={snap.live.title} onClose={() => setShareOpen(false)} />
      )}

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