import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/state/auth'
import Access from '@/routes/Access'
import CaseView from '@/routes/CaseView'
import { LoadingScreen } from '@/components/Loading'

function Gate() {
  const { user, status } = useAuth()

  if (status === 'checking') {
    return <LoadingScreen variant="checking" />
  }

  return (
    <Routes>
      <Route path="/access" element={user ? <Navigate to="/" replace /> : <Access />} />
      <Route path="/" element={user ? <CaseView /> : <Navigate to="/access" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
