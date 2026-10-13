import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowLeft, SearchX } from 'lucide-react'
import { AppShell } from './components/layout/AppShell'
import { DemoAuthGuard } from './components/auth/DemoAuthGuard'
import { ToastProvider } from './state/ToastProvider'
import { ThemeProvider } from './state/ThemeProvider'
import { DemoAuthProvider } from './state/DemoAuthProvider'
import { SupabaseAuthProvider } from './state/SupabaseAuthProvider'
import { useDemoAuth } from './state/useDemoAuth'
import { LoadingState } from './components/ui/LoadingState'
import { PublicEntryPage } from './pages/PublicEntryPage'
import { DemoLoginPage } from './pages/DemoLoginPage'
import { PublicInfoPage } from './pages/PublicInfoPage'
import { settingsService } from './services/settingsService'
import './App.css'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const NewScanPage = lazy(() => import('./pages/NewScanPage').then((module) => ({ default: module.NewScanPage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage })))
const ScanDetailsPage = lazy(() => import('./pages/ScanDetailsPage').then((module) => ({ default: module.ScanDetailsPage })))
const FindingDetailsPage = lazy(() => import('./pages/FindingDetailsPage').then((module) => ({ default: module.FindingDetailsPage })))
const ReportPage = lazy(() => import('./pages/ReportPage').then((module) => ({ default: module.ReportPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))

function AppNotFound() {
  const { isAuthenticated } = useDemoAuth()
  const { pathname } = useLocation()
  const homePath = isAuthenticated ? '/app/dashboard' : '/'
  const homeLabel = isAuthenticated ? 'Return to Security Overview' : 'Return to ContractIQ'
  return <main className="public-entry public-entry--not-found"><section className="public-info"><p className="eyebrow">404 · DEMO WORKSPACE</p><SearchX size={24} aria-hidden="true" /><h1>Page not found</h1><p>No page is registered at <code>{pathname}</code>.</p><Link className="button button--primary" to={homePath}><ArrowLeft size={14} />{homeLabel}</Link></section></main>
}

function AppHomeRedirect() {
  const destination = settingsService.get().defaultView === 'history' ? '/app/scans' : '/app/dashboard'
  return <Navigate to={destination} replace />
}

function App() {
  return (
    <SupabaseAuthProvider>
      <DemoAuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
            <Route path="/" element={<PublicEntryPage />} />
            <Route path="/login" element={<DemoLoginPage />} />
            <Route path="/privacy" element={<PublicInfoPage />} />
            <Route path="/terms" element={<PublicInfoPage />} />

            <Route element={<DemoAuthGuard />}>
              <Route path="/app" element={<AppShell />}>
                <Route index element={<AppHomeRedirect />} />
                <Route path="dashboard" element={<Suspense fallback={<LoadingState label="Loading dashboard" />}><DashboardPage /></Suspense>} />
                <Route path="new-scan" element={<Suspense fallback={<LoadingState label="Loading page" />}><NewScanPage /></Suspense>} />
                <Route path="scans" element={<Suspense fallback={<LoadingState label="Loading page" />}><HistoryPage /></Suspense>} />
                <Route path="scans/:scanId" element={<Suspense fallback={<LoadingState label="Loading page" />}><ScanDetailsPage /></Suspense>} />
                <Route path="scans/:scanId/findings/:findingId" element={<Suspense fallback={<LoadingState label="Loading page" />}><FindingDetailsPage /></Suspense>} />
                <Route path="reports/:scanId" element={<Suspense fallback={<LoadingState label="Loading page" />}><ReportPage /></Suspense>} />
                <Route path="settings" element={<Suspense fallback={<LoadingState label="Loading page" />}><SettingsPage /></Suspense>} />
                <Route path="*" element={<Suspense fallback={<LoadingState label="Loading page" />}><NotFoundPage homePath="/app/dashboard" homeLabel="Return to Security Overview" /></Suspense>} />
              </Route>
            </Route>

            {/* Preserve existing bookmarks and links while keeping /app/* canonical. */}
            <Route path="/new-scan" element={<Navigate to="/app/new-scan" replace />} />
            <Route path="/scans" element={<Navigate to="/app/scans" replace />} />
            <Route path="/scans/:scanId/findings/:findingId" element={<LegacyFindingRedirect />} />
            <Route path="/scans/:scanId" element={<LegacyScanRedirect />} />
            <Route path="/reports/:scanId" element={<LegacyReportRedirect />} />
            <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
            <Route path="*" element={<AppNotFound />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </DemoAuthProvider>
    </SupabaseAuthProvider>
  )
}

function LegacyFindingRedirect() {
  const { pathname } = useLocation()
  return <Navigate to={`/app${pathname}`} replace />
}

function LegacyScanRedirect() {
  const { pathname } = useLocation()
  return <Navigate to={`/app${pathname}`} replace />
}

function LegacyReportRedirect() {
  const { pathname } = useLocation()
  return <Navigate to={`/app${pathname}`} replace />
}

export default App
