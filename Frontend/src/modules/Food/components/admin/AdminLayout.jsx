import { useState, useEffect, Suspense } from "react"
import { Outlet } from "react-router-dom"
import { Loader2 } from "lucide-react"
import AdminSidebar from "./AdminSidebar"
import AdminNavbar from "./AdminNavbar"
import { API_BASE_URL } from "@food/api/config"

const debugError = (...args) => {}

const FoodAdminContentSkeleton = () => (
  <div className="w-full flex-1 min-h-[500px] p-6 space-y-6 animate-in fade-in duration-300">
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/60 relative">
      <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-orange-400 via-rose-500 to-amber-400 animate-pulse" />
    </div>
    <div className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <div className="h-6 w-48 rounded-lg bg-slate-200/80 animate-pulse" />
        <div className="h-4 w-72 rounded-lg bg-slate-100 animate-pulse" />
      </div>
      <div className="h-10 w-32 rounded-xl bg-slate-200/80 animate-pulse" />
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-3">
          <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
          <div className="h-8 w-16 rounded-lg bg-slate-200/80 animate-pulse" />
        </div>
      ))}
    </div>
    <div className="min-h-[320px] rounded-3xl border border-slate-100 bg-white p-8 shadow-sm flex flex-col items-center justify-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
        <Loader2 size={24} className="animate-spin text-orange-600" />
      </div>
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Food Section...</p>
    </div>
  </div>
);

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Get initial collapsed state from localStorage to set initial margin
  useEffect(() => {
    try {
      const saved = localStorage.getItem('admin_sidebar_state')
      if (saved !== null) {
        const state = JSON.parse(saved)
        if (state && typeof state.isCollapsed !== 'undefined') {
          setIsSidebarCollapsed(state.isCollapsed)
        }
      }
    } catch (e) {
      debugError('Error loading sidebar collapsed state:', e)
    }
  }, [])

  const handleCollapseChange = (collapsed) => {
    setIsSidebarCollapsed(collapsed)
  }

  return (
    <div className="h-screen bg-neutral-200 flex overflow-hidden">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCollapseChange={handleCollapseChange}
      />

      {/* Main Content Area */}
      <div className={`
        flex-1 flex min-h-0 flex-col transition-all duration-300 ease-in-out min-w-0
        ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-80'}
      `}>
        {/* Top Navbar */}
        <AdminNavbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        {/* Backend disconnected banner */}
        {!API_BASE_URL && (
          <div className="w-full bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-sm text-amber-900">
            Backend disconnected. Data is not live.
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 min-h-0 w-full max-w-full overflow-x-hidden overflow-y-auto bg-neutral-100">
          <Suspense fallback={<FoodAdminContentSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

