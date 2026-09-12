import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import AppOpeningAnimation from '../shared/components/AppOpeningAnimation'
import ErrorBoundary from '../shared/components/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <AppOpeningAnimation />
      <ThemeSync />
      <AppRoutes />
    </ErrorBoundary>
  )
}

export default App

