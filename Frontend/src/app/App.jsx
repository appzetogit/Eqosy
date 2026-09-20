import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import AppOpeningAnimation from '../shared/components/AppOpeningAnimation'
import ErrorBoundary from '../shared/components/ErrorBoundary'
import OfflineBanner from '../shared/components/OfflineBanner'

function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <AppOpeningAnimation />
      <ThemeSync />
      <AppRoutes />
    </ErrorBoundary>
  )
}

export default App

