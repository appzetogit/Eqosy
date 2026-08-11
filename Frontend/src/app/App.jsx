import AppRoutes from './routes'
import ThemeSync from './ThemeSync'
import AppOpeningAnimation from '../shared/components/AppOpeningAnimation'

function App() {
  return (
    <>
      <AppOpeningAnimation />
      <ThemeSync />
      <AppRoutes />
    </>
  )
}

export default App
