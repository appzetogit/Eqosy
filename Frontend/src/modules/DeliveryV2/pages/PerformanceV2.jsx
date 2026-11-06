import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { deliveryPerformanceAPI } from "@food/api/performanceAPI"
import PartyPerformanceScreen from "@food/components/performance/PartyPerformanceScreen"

const pct = (v) => `${Number(v ?? 0)}%`

export default function PerformanceV2() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gray-50">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 p-4 pb-0 text-sm text-gray-600">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <PartyPerformanceScreen
        api={deliveryPerformanceAPI}
        role="delivery"
        party="delivery"
        title="Performance & Penalties"
        stats={[
          { key: "totalAssigned", label: "Assigned" },
          { key: "acceptedAssignments", label: "Accepted" },
          { key: "rejectedAssignments", label: "Rejected" },
          { key: "completedDeliveries", label: "Completed" },
          { key: "deliveryDelayCount", label: "Delivery delays", tone: (v) => (v > 0 ? "bad" : "default") },
          { key: "onTimeDeliveryPercent", label: "On-time delivery", format: pct, tone: (v) => (v >= 90 ? "good" : "default") },
          { key: "avgDeliveryMinutes", label: "Avg delivery (min)" },
        ]}
      />
    </div>
  )
}
