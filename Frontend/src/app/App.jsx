import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import ErrorBoundary from '../shared/components/ErrorBoundary'
import OfflineBanner from '../shared/components/OfflineBanner'

function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <ThemeSync />
      <AppRoutes />
    </ErrorBoundary>
  )
}

export default App

