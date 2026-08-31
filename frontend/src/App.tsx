import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/state/auth'
import Access from '@/routes/Access'
import CaseView from '@/routes/CaseView'
import { LoadingScreen, expectsReconciliation } from '@/components/Loading'

function Gate() {
  const { user, status } = useAuth()

  if (status === 'checking') {
    // On the sign-in route nothing is known yet, so the loader claims nothing.
    // Heading for a dashboard that has reconciled before, it starts the steps
    // here and the dashboard continues them.
    const headingToDashboard = window.location.pathname !== '/access'
    return (
      <LoadingScreen
        variant={headingToDashboard && expectsReconciliation() ? 'reconciling' : 'checking'}
      />
    )
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
