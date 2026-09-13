import { MessageCircle, Users } from 'lucide-react'

export default function Home() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-6 flex -space-x-2">
        <div className="rounded-2xl bg-pink-100 p-4 shadow-lg">
          <MessageCircle className="h-8 w-8 text-pink-500" />
        </div>
        <div className="rounded-2xl bg-rose-100 p-4 shadow-lg">
          <Users className="h-8 w-8 text-rose-500" />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-slate-800">Your messages live here</h2>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        Pick a conversation from the sidebar or start a new chat with friends and teammates.
      </p>
    </div>
  )
}