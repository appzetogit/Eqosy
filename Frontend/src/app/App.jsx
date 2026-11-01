import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import AppColorSync from './AppColorSync'
import LanguageSwitcher from '../shared/language/LanguageSwitcher'
import ErrorBoundary from '../shared/components/ErrorBoundary'
import OfflineBanner from '../shared/components/OfflineBanner'
import UserLocationGate from '../shared/components/UserLocationGate'

function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <ThemeSync />
      <AppColorSync />
      <LanguageSwitcher />
      <AppRoutes />
      <UserLocationGate />
    </ErrorBoundary>
  )
}

export default App

