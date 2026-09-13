import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react'
import Avatar from './Avatar'
import { callManager, type CallSnapshot } from '../lib/call'

export default function CallUI() {
  const [snap, setSnap] = useState<CallSnapshot>(callManager.snapshot)

  useEffect(() => callManager.subscribe(setSnap), [])

  if (snap.stage === 'idle') {
    if (!snap.notice) return null
    return (
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center">
        <div className="pointer-events-auto rounded-full border border-pink-100 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-lg backdrop-blur-xl">
          {snap.notice}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-pink-400 via-rose-400 to-fuchsia-500">
      <div className="flex h-full flex-col items-center justify-center px-6 text-white">
        {snap.stage === 'incoming' && snap.peer && (
          <IncomingView snap={snap} />
        )}
        {snap.stage === 'outgoing' && snap.peer && <OutgoingView snap={snap} />}
        {snap.stage === 'active' && snap.peer && <ActiveView snap={snap} />}
      </div>
    </div>
  )
}

function IncomingView({ snap }: { snap: CallSnapshot }) {
  const peer = snap.peer!
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8">
      <div className="animate-pulse">
        <Avatar name={peer.display_name} src={peer.avatar_url} size={96} online />
      </div>
      <div className="text-center">
        <h2 className="text-3xl font-bold">{peer.display_name}</h2>
        <p className="mt-1 text-lg text-white/80">
          Incoming {snap.kind === 'video' ? 'video' : 'voice'} call…
        </p>
      </div>
      <div className="flex items-center gap-10">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => callManager.accept()}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl transition hover:scale-105 hover:bg-emerald-400"
            title="Accept call"
          >
            <Phone className="h-7 w-7" />
          </button>
          <span className="text-sm text-white/80">Accept</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => callManager.reject()}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-xl transition hover:scale-105 hover:bg-rose-400"
            title="Decline call"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
          <span className="text-sm text-white/80">Decline</span>
        </div>
      </div>
    </div>
  )
}

function OutgoingView({ snap }: { snap: CallSnapshot }) {
  const peer = snap.peer!
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8">
      <div className="relative">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        <Avatar name={peer.display_name} src={peer.avatar_url} size={96} online={false} />
      </div>
      <div className="text-center">
        <h2 className="text-3xl font-bold">{peer.display_name}</h2>
        <p className="mt-1 text-lg text-white/80">
          Calling {snap.kind === 'video' ? 'video' : 'voice'}…
        </p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => callManager.cancel()}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-xl transition hover:scale-105 hover:bg-rose-400"
          title="Cancel call"
        >
          <PhoneOff className="h-7 w-7" />
        </button>
        <span className="text-sm text-white/80">Cancel</span>
      </div>
    </div>
  )
}

function ActiveView({ snap }: { snap: CallSnapshot }) {
  const peer = snap.peer!
  const showVideo = snap.kind === 'video' && !!snap.remoteStream
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!snap.startedAt) return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - snap.startedAt!) / 1000)), 500)
    return () => clearInterval(t)
  }, [snap.startedAt])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="relative flex h-full w-full flex-col">
      {showVideo ? (
        <>
          <MediaVideo stream={snap.remoteStream} className="absolute inset-0 h-full w-full object-cover" />
          {snap.localStream && (
            <div className="absolute right-4 top-4 h-40 w-28 overflow-hidden rounded-2xl border-2 border-white/60 shadow-xl">
              <MediaVideo stream={snap.localStream} muted className="h-full w-full object-cover" />
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-6">
          <Avatar name={peer.display_name} src={peer.avatar_url} size={112} online />
          <p className="text-2xl font-semibold text-white">
            {peer.display_name}
            <span className="ml-3 align-middle text-lg text-white/70">
              {mm}:{ss}
            </span>
          </p>
        </div>
      )}

      {showVideo && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/30 px-4 py-1 text-sm font-medium text-white backdrop-blur-sm">
          {peer.display_name} · {mm}:{ss}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-8 flex items-center justify-center gap-8">
        <button
          onClick={() => callManager.toggleMute()}
          className={`flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition hover:scale-105 ${
            snap.muted ? 'bg-amber-400 text-white' : 'bg-white/25 text-white backdrop-blur-sm'
          }`}
          title={snap.muted ? 'Unmute' : 'Mute'}
        >
          {snap.muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>

        {snap.kind === 'video' && (
          <button
            onClick={() => callManager.toggleCamera()}
            className={`flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition hover:scale-105 ${
              snap.cameraOn ? 'bg-white/25 text-white backdrop-blur-sm' : 'bg-amber-400 text-white'
            }`}
            title={snap.cameraOn ? 'Turn camera off' : 'Turn camera on'}
          >
            {snap.cameraOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
          </button>
        )}

        <button
          onClick={() => callManager.end()}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-xl transition hover:scale-105 hover:bg-rose-400"
          title="End call"
        >
          <PhoneOff className="h-7 w-7" />
        </button>
      </div>
    </div>
  )
}

function MediaVideo({
  stream,
  className,
  muted = false,
}: {
  stream: MediaStream | null
  className?: string
  muted?: boolean
}) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    return () => {
      el.srcObject = null
    }
  }, [stream])

  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />
}