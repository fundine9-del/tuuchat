import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import CallUI from './components/CallUI'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import ChatPage from './pages/Chat'
import LiveView from './pages/LiveView'
import LiveDirectory from './pages/LiveDirectory'
import Profile from './pages/Profile'

function HomeLayout() {
  const location = useLocation()
  const inPanel =
    location.pathname === '/profile' ||
    location.pathname.startsWith('/chat/') ||
    location.pathname.startsWith('/live/')

  // the bottom nav lives on the three top-level tabs (chat + live watch are
  // full-screen experiences with their own back handling)
  const inNav =
    location.pathname === '/' ||
    location.pathname === '/live' ||
    location.pathname === '/profile'

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-white via-pink-50 to-pink-100">
      <div className={`${inPanel ? 'hidden' : 'flex'} h-full w-full sm:flex sm:w-80 sm:shrink-0`}>
        <Sidebar />
      </div>
      <main className={`${inPanel ? 'block' : 'hidden'} h-full min-w-0 flex-1 sm:block`}>
        <Outlet />
      </main>
      {inNav && <BottomNav />}
      <CallUI />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          element={
            <ProtectedRoute>
              <HomeLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Home />} />
          <Route path="live" element={<LiveDirectory />} />
          <Route path="live/:id" element={<LiveView />} />
          <Route path="chat/:id" element={<ChatPage />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}