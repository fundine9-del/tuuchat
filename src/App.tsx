import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import CallUI from './components/CallUI'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import ChatPage from './pages/Chat'
import Profile from './pages/Profile'

function HomeLayout() {
  const location = useLocation()
  // on small screens show either the conversation list or the active view
  const inPanel = location.pathname === '/profile' || location.pathname.startsWith('/chat/')

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-white via-pink-50 to-pink-100">
      <div className={`${inPanel ? 'hidden' : 'flex'} h-full w-full sm:flex sm:w-80 sm:shrink-0`}>
        <Sidebar />
      </div>
      <main className={`${inPanel ? 'block' : 'hidden'} h-full min-w-0 flex-1 sm:block`}>
        <Outlet />
      </main>
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
          <Route path="chat/:id" element={<ChatPage />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}