import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import AppColorSync from './AppColorSync'
import LanguageSwitcher from '../shared/language/LanguageSwitcher'
import ErrorBoundary from '../shared/components/ErrorBoundary'
import OfflineBanner from '../shared/components/OfflineBanner'

function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <ThemeSync />
      <AppColorSync />
      <LanguageSwitcher />
      <AppRoutes />
    </ErrorBoundary>
  )
}

export default App

