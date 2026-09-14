import type { ChangeEvent, FormEvent } from 'react'
import { useRef, useState } from 'react'
import { Camera, Check, Loader2, LogOut, Save } from 'lucide-react'
import Avatar from '../components/Avatar'
import { usersApi } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import type { UserStatus } from '../lib/types'
import { formatRelative } from '../lib/utils'

const STATUS_OPTIONS: UserStatus[] = ['online', 'away', 'busy', 'offline']

export default function Profile() {
  const { user, updateUser, logout } = useAuth()
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'offline')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  if (!user) return null
  const me = user

  async function onAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    setMessage(null)
    try {
      const { avatar_url } = await usersApi.uploadAvatar(file)
      updateUser({ ...me, avatar_url })
      setMessage('Profile picture updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const { user: updated } = await usersApi.updateProfile({
        display_name: displayName.trim() || me.display_name,
        bio: bio.trim(),
      })
      updateUser(updated)
      setStatus(updated.status)
      setMessage('Profile saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function setUserStatus(s: UserStatus) {
    setStatus(s)
    try {
      await usersApi.setStatus(s)
      updateUser({ ...me, status: s })
    } catch {
      // revert handled silently
    }
  }

  const statusDots: Record<UserStatus, string> = {
    online: 'bg-emerald-400',
    away: 'bg-amber-400',
    busy: 'bg-rose-400',
    offline: 'bg-slate-300',
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-6 pb-28 pt-8">
        <h1 className="mb-8 text-2xl font-bold text-slate-800">Profile</h1>

        {/* avatar */}
        <div className="mb-8 flex flex-col items-center">
          <div className="relative">
            <Avatar name={user.display_name} src={user.avatar_url} size={112} online={status === 'online'} showStatus />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 rounded-full bg-pink-500 p-2 text-white shadow-lg transition hover:bg-pink-400 disabled:opacity-60"
              title="Change photo"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarChange} />
          </div>
          <p className="mt-3 text-sm text-slate-500">@{user.username}</p>
          <p className="text-xs text-slate-400">
            Member since {formatRelative(user.created_at)}
          </p>
        </div>

        {/* status */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-slate-600">Status</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void setUserStatus(s)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm capitalize transition ${
                  status === s
                    ? 'border-pink-500 bg-pink-100 text-pink-600'
                    : 'border-pink-200 text-slate-500 hover:border-pink-400'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${statusDots[s]}`} />
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* edit form */}
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-pink-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-pink-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Tell people about yourself…"
              className="w-full resize-none rounded-xl border border-pink-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-pink-500"
            />
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}
          {message && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-500">
              <Check className="h-4 w-4" /> {message}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-500 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-400 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </form>

        <button
          onClick={logout}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-pink-200 py-2.5 text-sm font-medium text-slate-500 transition hover:border-rose-400 hover:text-rose-500"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </div>
  )
}