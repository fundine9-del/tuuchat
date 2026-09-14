import { Home, Radio, User } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'

const TABS = [
  { key: 'home', path: '/', label: 'Home', icon: Home },
  { key: 'live', path: '/live', label: 'Live', icon: Radio },
  { key: 'profile', path: '/profile', label: 'Profile', icon: User },
] as const

export default function BottomNav() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  if (!user) return null

  const active =
    location.pathname === '/'
      ? 'home'
      : location.pathname.startsWith('/live')
        ? 'live'
        : location.pathname === '/profile'
          ? 'profile'
          : null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-pink-100 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      data-testid="bottom-nav"
    >
      <div className="mx-auto grid w-full max-w-md grid-cols-3">
        {TABS.map((t) => {
          const Icon = t.icon
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => navigate(t.path)}
              title={t.label}
              className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition"
              style={{ color: isActive ? '#db2777' : '#94a3b8' }}
            >
              <Icon
                className={`h-[22px] w-[22px] ${isActive ? 'text-pink-500' : ''}`}
                strokeWidth={isActive ? 2.4 : 2}
              />
              {t.label}
              <span className={`h-1 w-1 rounded-full ${isActive ? 'bg-pink-500' : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>
    </nav>
  )
}