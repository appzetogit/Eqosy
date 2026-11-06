import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { restaurantPerformanceAPI } from "@food/api/performanceAPI"
import PartyPerformanceScreen from "@food/components/performance/PartyPerformanceScreen"

const pct = (v) => `${Number(v ?? 0)}%`

export default function PerformancePage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gray-50">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 p-4 pb-0 text-sm text-gray-600">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <PartyPerformanceScreen
        api={restaurantPerformanceAPI}
        role="restaurant"
        party="restaurant"
        title="Performance & Penalties"
        stats={[
          { key: "totalOrders", label: "Total orders" },
          { key: "acceptedOrders", label: "Accepted" },
          { key: "rejectedOrders", label: "Rejected" },
          { key: "prepDelayCount", label: "Prep delays", tone: (v) => (v > 0 ? "bad" : "default") },
          { key: "onTimePrepPercent", label: "On-time prep", format: pct, tone: (v) => (v >= 90 ? "good" : "default") },
          { key: "avgPrepMinutes", label: "Avg prep (min)" },
          { key: "bulkOrders", label: "Bulk orders" },
        ]}
      />
    </div>
  )
}
