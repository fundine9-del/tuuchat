import { useCallback, useEffect, useState } from 'react'
import { Radio } from 'lucide-react'
import Avatar from './Avatar'
import StartLiveModal from './StartLiveModal'
import { livesApi } from '../lib/api'
import { liveManager } from '../lib/live'
import { useAuth } from '../lib/auth-context'
import { subscribe } from '../lib/socket'
import type { LiveSession } from '../lib/types'
import { useNavigate } from 'react-router-dom'

export default function LivePanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [lives, setLives] = useState<LiveSession[]>([])
  const [modalOpen, setModalOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const { lives } = await livesApi.list()
      setLives(lives)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      void refresh()
    }, 0)
    const offStart = subscribe('liveStarted', (l) =>
      setLives((prev) => (prev.some((x) => x.id === l.id) ? prev : [l, ...prev])),
    )
    const offEnd = subscribe('liveEnded', (d) =>
      setLives((prev) => prev.filter((x) => x.id !== d.liveId)),
    )
    return () => {
      clearTimeout(t)
      offStart()
      offEnd()
    }
  }, [refresh])

  if (!user) return null
  const myLive = lives.find((l) => l.host_id === user.id)
  const others = lives.filter((l) => l.host_id !== user.id)

  return (
    <div className="border-b border-pink-100 px-2 pb-2">
      {/* my live */}
      <button
        onClick={() =>
          myLive
            ? navigate(`/live/${myLive.id}`, { state: { live: myLive } })
            : setModalOpen(true)
        }
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-pink-50"
      >
        <div className="relative">
          <div
            className={`rounded-full p-[2.5px] ${myLive ? 'bg-gradient-to-tr from-rose-400 to-pink-500 animate-pulse' : 'bg-transparent'}`}
          >
            <Avatar name={user.display_name} src={user.avatar_url} size={44} showStatus={false} />
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">
            {myLive ? 'You are LIVE' : 'Go Live'}
          </p>
          <p className="truncate text-xs text-slate-500">
            {myLive ? `${myLive.viewer_count} watching · ${myLive.title || 'No title'}` : 'Tap to start a broadcast'}
          </p>
        </div>
        {!myLive && <Radio className="ml-auto h-4 w-4 shrink-0 text-rose-400" />}
      </button>

      {/* other lives */}
      {others.length > 0 && (
        <>
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Live now
          </p>
          <ul className="space-y-1">
            {others.map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => navigate(`/live/${l.id}`, { state: { live: l } })}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-pink-50"
                >
                  <div className="rounded-full bg-gradient-to-tr from-rose-400 to-pink-500 p-[2.5px]">
                    <Avatar name={l.host.display_name} src={l.host.avatar_url} size={44} showStatus={false} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{l.host.display_name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {l.title || 'Live'} · {l.viewer_count} watching
                    </p>
                  </div>
                  <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Live
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {modalOpen && (
        <StartLiveModal
          liveManager={liveManager}
          onClose={() => setModalOpen(false)}
          onStarted={(liveId) => {
            setModalOpen(false)
            navigate(`/live/${liveId}`, {
              state: { live: liveManager.snapshot.live ?? { id: liveId, host_id: user.id, title: '', started_at: new Date().toISOString(), host: { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url }, viewer_count: 0 } },
            })
          }}
        />
      )}
    </div>
  )
}