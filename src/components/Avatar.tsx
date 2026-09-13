import { absoluteUrl } from '../lib/api'
import { initials, initialsColor } from '../lib/utils'

interface Props {
  name: string
  src?: string | null
  size?: number
  online?: boolean
  showStatus?: boolean
}

export default function Avatar({ name, src, size = 44, online, showStatus = false }: Props) {
  const url = absoluteUrl(src)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img
          src={url}
          alt={name}
          className="h-full w-full rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center rounded-full text-sm font-semibold text-white ${initialsColor(name)}`}
          style={{ width: size, height: size }}
        >
          {initials(name) || '?'}
        </div>
      )}
      {showStatus && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full ring-2 ring-white ${
            online ? 'bg-emerald-400' : 'bg-slate-300'
          }`}
          style={{ width: Math.max(10, size * 0.25), height: Math.max(10, size * 0.25) }}
        />
      )}
    </div>
  )
}