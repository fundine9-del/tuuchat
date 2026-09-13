import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import Avatar from './Avatar'
import NewStatusModal from './NewStatusModal'
import StatusViewer from './StatusViewer'
import { statusesApi } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { subscribe } from '../lib/socket'
import type { Status } from '../lib/types'
import { formatRelative } from '../lib/utils'

export default function StatusPanel() {
  const { user } = useAuth()
  const [statuses, setStatuses] = useState<Status[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const { statuses } = await statusesApi.list()
      setStatuses(statuses)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      void refresh()
    }, 0)
    const offNew = subscribe('status', (s) => {
      setStatuses((prev) => [s, ...prev.filter((x) => x.id !== s.id)])
    })
    const offDeleted = subscribe('statusDeleted', (d) => {
      setStatuses((prev) => prev.filter((x) => x.id !== d.statusId))
    })
    return () => {
      clearTimeout(t)
      offNew()
      offDeleted()
    }
  }, [refresh])

  const meId = user?.id ?? ''
  const mine = useMemo(() => statuses.filter((s) => s.user_id === meId), [statuses, meId])
  const others = useMemo(() => statuses.filter((s) => s.user_id !== meId), [statuses, meId])

  if (!user) return null
  const myActive = mine[0]

  return (
    <div className="border-b border-pink-100 px-2 pb-2">
      {/* my status */}
      <button
        onClick={() =>
          myActive
            ? setViewerIndex(statuses.findIndex((x) => x.id === myActive.id))
            : setModalOpen(true)
        }
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-pink-50"
      >
        <div className="relative">
          <div
            className={`rounded-full p-[2.5px] ${myActive ? 'bg-gradient-to-tr from-pink-400 to-violet-400' : 'bg-transparent'}`}
          >
            <Avatar name={user.display_name} src={user.avatar_url} size={44} showStatus={false} />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-pink-500 text-white">
            <Plus className="h-3 w-3" />
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">My status</p>
          <p className="truncate text-xs text-slate-500">
            {myActive ? `Today · ${formatRelative(myActive.created_at)}` : 'Tap to add a status update'}
          </p>
        </div>
      </button>

      {/* recent updates */}
      {others.length > 0 && (
        <>
          <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Recent updates
          </p>
          <ul className="space-y-1">
            {others.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    const i = statuses.findIndex((x) => x.id === s.id)
                    setViewerIndex(i)
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-pink-50"
                >
                  <div className="rounded-full bg-gradient-to-tr from-pink-400 to-violet-400 p-[2.5px]">
                    <Avatar name={s.user.display_name} src={s.user.avatar_url} size={44} showStatus={false} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{s.user.display_name}</p>
                    <p className="truncate text-xs text-slate-500">{formatRelative(s.created_at)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {modalOpen && (
        <NewStatusModal
          onClose={() => setModalOpen(false)}
          onPosted={(s) => {
            setModalOpen(false)
            setStatuses((prev) => [s, ...prev.filter((x) => x.id !== s.id)])
          }}
        />
      )}
      {viewerIndex !== null && (
        <StatusViewer
          statuses={statuses}
          initialIndex={viewerIndex}
          meId={meId}
          onClose={() => setViewerIndex(null)}
          onDeleted={(id) => setStatuses((prev) => prev.filter((x) => x.id !== id))}
        />
      )}
    </div>
  )
}