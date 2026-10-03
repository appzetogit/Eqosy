import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import {
  BadgeCheck,
  Building2,
  Compass,
  Download,
  Filter,
  Globe,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Store,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { adminAPI, uploadAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import { toast } from "sonner"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { getCurrentUser } from "@food/utils/auth"
import { canWriteFood } from "@food/constants/foodAdminAccess"

const defaultFormData = {
  name: "",
  image: "",
  status: true,
  type: "",
  zoneId: "global",
  foodTypeScope: "Both",
}

const approvalBadgeClass = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

const scopeBadgeClass = (scope) => {
  if (scope === "Veg") return "bg-green-50 text-green-700 border-green-200"
  if (scope === "Non-Veg") return "bg-red-50 text-red-700 border-red-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

const zoneLabel = (zone) => {
  if (!zone) return "Global"
  if (typeof zone === "string") {
    const value = zone.trim()
    if (/^[a-f0-9]{24}$/i.test(value)) return `Zone ID ${value.slice(-6)}`
    return value
  }
  return zone?.name || zone?.zoneName || zone?.serviceLocation || "Zone"
}

export default function Category() {
  const adminProfile = useMemo(() => getCurrentUser("admin") || {}, [])
  const canWrite = useMemo(() => canWriteFood(adminProfile, "categories"), [adminProfile])

  const [searchQuery, setSearchQuery] = useState("")
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPendingOnly, setShowPendingOnly] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [restaurants, setRestaurants] = useState([])
  const [restaurantsLoading, setRestaurantsLoading] = useState(false)
  const [formData, setFormData] = useState(defaultFormData)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef(null)

  // Granular Filters
  const [scopeFilter, setScopeFilter] = useState("all") // "all" | "global" | "restaurant"
  const [approvalFilter, setApprovalFilter] = useState("all") // "all" | "pending" | "approved" | "rejected"
  const [selectedZoneId, setSelectedZoneId] = useState("all")
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("all")
  const [selectedArea, setSelectedArea] = useState("all")

  useEffect(() => {
    const adminToken = localStorage.getItem("admin_accessToken")
    if (!adminToken) {
      toast.error("Please login to access categories")
      setLoading(false)
      return
    }
    fetchCategories()
  }, [])

  // Load Zones
  useEffect(() => {
    let cancelled = false
    setZonesLoading(true)
    adminAPI
      .getZones({ limit: 1000 })
      .then((res) => {
        const list =
          res?.data?.data?.zones ||
          res?.data?.data?.data?.zones ||
          res?.data?.data ||
          []
        if (!cancelled) setZones(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setZones([])
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Load Restaurants
  useEffect(() => {
    let cancelled = false
    setRestaurantsLoading(true)
    adminAPI
      .getRestaurants({ limit: 1000 })
      .then((res) => {
        const list =
          res?.data?.data?.restaurants ||
          res?.data?.restaurants ||
          res?.data?.data ||
          []
        if (!cancelled) setRestaurants(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setRestaurants([])
      })
      .finally(() => {
        if (!cancelled) setRestaurantsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchCategories()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery, showPendingOnly])

  // Cascading Restaurants filtered by selected Zone
  const availableRestaurants = useMemo(() => {
    if (!selectedZoneId || selectedZoneId === "all" || selectedZoneId === "global_zone") {
      return restaurants
    }
    const targetZoneObj = zones.find((z) => String(z._id || z.id) === String(selectedZoneId))
    const targetZoneName = String(targetZoneObj?.name || targetZoneObj?.zoneName || targetZoneObj?.serviceLocation || "").toLowerCase().trim()

    return restaurants.filter((r) => {
      const rZoneObj = r.zoneId || r.zone
      const rZoneIdStr = String(
        typeof rZoneObj === "object"
          ? (rZoneObj?._id || rZoneObj?.id || "")
          : (rZoneObj || r.location?.zoneId || r.address?.zoneId || "")
      ).trim()

      const rZoneName = String(
        (typeof rZoneObj === "object" ? (rZoneObj?.name || rZoneObj?.zoneName) : "") ||
        r.zoneName ||
        r.area ||
        r.serviceLocation ||
        r.city ||
        ""
      ).toLowerCase().trim()

      const matchesId = rZoneIdStr && rZoneIdStr === String(selectedZoneId)
      const matchesName = Boolean(targetZoneName && rZoneName && (rZoneName.includes(targetZoneName) || targetZoneName.includes(rZoneName)))

      return matchesId || matchesName
    })
  }, [restaurants, selectedZoneId, zones])

  // Advanced Filtering
  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      // 1. Search Query Filter
      const query = String(searchQuery || "").trim().toLowerCase()
      if (query) {
        const creator = category?.createdByRestaurant?.name || category?.restaurant?.name || ""
        const zoneTextStr = zoneLabel(category?.zoneId)
        const matchesSearch =
          String(category?.name || "").toLowerCase().includes(query) ||
          String(category?.foodTypeScope || "").toLowerCase().includes(query) ||
          String(creator || "").toLowerCase().includes(query) ||
          String(zoneTextStr || "").toLowerCase().includes(query) ||
          String(category?.id || "").toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      // 2. Global vs Restaurant Scope Filter
      const isGlobalCategory = Boolean(category?.isGlobal) || (!category?.createdByRestaurantId && !category?.restaurantId && !category?.createdByRestaurant && !category?.restaurant)
      const isRestaurantCategory = Boolean(category?.createdByRestaurantId || category?.restaurantId || category?.createdByRestaurant || category?.restaurant) && !category?.isGlobal

      if (scopeFilter === "global" && !isGlobalCategory) return false
      if (scopeFilter === "restaurant" && !isRestaurantCategory) return false

      // 3. Approval Status Filter
      if (approvalFilter !== "all") {
        const status = String(category?.approvalStatus || "pending").toLowerCase()
        if (status !== approvalFilter) return false
      }

      // 4. Zone Filter
      if (selectedZoneId !== "all") {
        const catZone = category?.zoneId
        const catZoneIdStr = typeof catZone === "string" ? catZone : catZone?._id || catZone?.id || ""
        const catZoneName = zoneLabel(catZone).toLowerCase()

        if (selectedZoneId === "global_zone") {
          if (catZoneIdStr && catZoneIdStr !== "global" && catZoneName !== "global") return false
        } else {
          const targetZoneObj = zones.find((z) => String(z._id || z.id) === selectedZoneId)
          const targetZoneName = (targetZoneObj?.name || targetZoneObj?.zoneName || targetZoneObj?.serviceLocation || "").toLowerCase()

          const matchesId = catZoneIdStr === selectedZoneId
          const matchesName = targetZoneName && catZoneName.includes(targetZoneName)

          if (!matchesId && !matchesName) return false
        }
      }

      // 5. Restaurant Filter
      if (selectedRestaurantId !== "all") {
        const restObj = category?.createdByRestaurant || category?.restaurant
        const catRestId = String(category?.createdByRestaurantId || category?.restaurantId || restObj?._id || restObj?.id || "")
        const creatorName = String(restObj?.name || category?.restaurantName || "").toLowerCase()

        const targetRest = restaurants.find((r) => String(r._id || r.id) === selectedRestaurantId)
        const targetRestName = String(targetRest?.name || targetRest?.restaurantName || "").toLowerCase()

        const matchesRestId = catRestId === selectedRestaurantId
        const matchesRestName = targetRestName && creatorName.includes(targetRestName)

        if (!matchesRestId && !matchesRestName) return false
      }

      return true
    })
  }, [categories, searchQuery, scopeFilter, approvalFilter, selectedZoneId, selectedRestaurantId, zones, restaurants])

  const hasActiveFilters =
    searchQuery !== "" ||
    scopeFilter !== "all" ||
    approvalFilter !== "all" ||
    selectedZoneId !== "all" ||
    selectedRestaurantId !== "all"

  const resetAllFilters = () => {
    setSearchQuery("")
    setScopeFilter("all")
    setApprovalFilter("all")
    setSelectedZoneId("all")
    setSelectedRestaurantId("all")
    setShowPendingOnly(false)
  }

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const params = {}
      if (searchQuery) params.search = searchQuery
      if (showPendingOnly) params.approvalStatus = "pending"

      const response = await adminAPI.getCategories(params)
      const list = response?.data?.data?.categories || response?.data?.categories || []
      setCategories(Array.isArray(list) ? list : [])
    } catch (error) {
      if (error?.response?.status === 401) {
        toast.error("Authentication required. Please login again.")
      } else if (error?.response?.status === 403) {
        toast.error("Access denied. You do not have permission.")
      } else if (error?.response?.status === 404) {
        toast.error("Categories endpoint not found. Please check backend server.")
      } else if (error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
        toast.error("Cannot connect to server. Please check if backend is running on " + API_BASE_URL.replace("/api", ""))
      } else {
        toast.error(error?.response?.data?.message || "Failed to load categories")
      }
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  const resetModal = () => {
    setIsModalOpen(false)
    setEditingCategory(null)
    setFormData(defaultFormData)
    setSelectedImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleAddNew = () => {
    setEditingCategory(null)
    setFormData(defaultFormData)
    setSelectedImageFile(null)
    setImagePreview(null)
    setIsModalOpen(true)
  }

  const handleEdit = (category) => {
    setEditingCategory(category)
    const zoneIdValue =
      typeof category?.zoneId === "string"
        ? category.zoneId
        : category?.zoneId?._id || category?.zoneId?.id || "global"

    setFormData({
      name: category?.name || "",
      image: category?.image || "",
      status: category?.status !== false,
      type: category?.type || "",
      zoneId: zoneIdValue || "global",
      foodTypeScope: category?.foodTypeScope || "Both",
    })
    setSelectedImageFile(null)
    setImagePreview(category?.image || null)
    setIsModalOpen(true)
  }

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5MB limit.")
      return
    }

    setSelectedImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleToggleStatus = async (id) => {
    try {
      const response = await adminAPI.toggleCategoryStatus(String(id))
      if (response?.data?.success) {
        toast.success("Category status updated successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update category status")
    }
  }

  const handleApprove = async (id) => {
    try {
      const response = await adminAPI.approveCategory(String(id))
      if (response?.data?.success) {
        toast.success("Category approved successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to approve category")
    }
  }

  const handleReject = async (category) => {
    const reason = window.prompt(`Reject "${category?.name}" with a reason:`)
    if (reason == null) return
    if (!String(reason).trim()) {
      toast.error("Rejection reason is required")
      return
    }

    try {
      const response = await adminAPI.rejectCategory(String(category?.id || category?._id), reason)
      if (response?.data?.success) {
        toast.success("Category rejected successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reject category")
    }
  }

  const handleMakeGlobal = async (category) => {
    if (!window.confirm(`Make "${category?.name}" global for every restaurant?`)) return

    try {
      const response = await adminAPI.makeCategoryGlobal(String(category?.id || category?._id))
      if (response?.data?.success) {
        toast.success("Category is now global")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to make category global")
    }
  }

  const handleDelete = async (id) => {
    const categoryName = categories.find((category) => String(category?.id) === String(id))?.name || "this category"
    if (!window.confirm(`Delete "${categoryName}"? This action cannot be undone.`)) return

    try {
      const response = await adminAPI.deleteCategory(String(id))
      if (response?.data?.success) {
        toast.success("Category deleted successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete category")
    }
  }

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF()
      doc.setFontSize(18)
      doc.setTextColor(30, 30, 30)
      doc.text("Category List", 14, 20)
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Generated on: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 14, 28)

      const tableData = filteredCategories.map((category, index) => [
        index + 1,
        category?.name || "N/A",
        category?.foodTypeScope || "Both",
        category?.isGlobal ? "Global" : "Private",
        zoneLabel(category?.zoneId),
        category?.approvalStatus || "pending",
      ])

      autoTable(doc, {
        startY: 35,
        head: [["SL", "Category", "Diet Scope", "Visibility", "Zone", "Approval"]],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 10,
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [30, 30, 30],
        },
      })

      doc.save(`Categories_${new Date().toISOString().split("T")[0]}.pdf`)
      toast.success("PDF exported successfully!")
    } catch {
      toast.error("Failed to export PDF")
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    try {
      setUploadingImage(true)
      let imageUrl = String(formData.image || "").trim()

      if (selectedImageFile) {
        const uploadRes = await uploadAPI.uploadMedia(selectedImageFile, { folder: "eqosy/categories" })
        const payload = uploadRes?.data?.data || uploadRes?.data
        imageUrl = payload?.url || imageUrl
      }

      const payload = {
        name: String(formData.name || "").trim(),
        type: String(formData.type || "").trim(),
        status: Boolean(formData.status),
        image: imageUrl || undefined,
        zoneId: formData.zoneId || "global",
        foodTypeScope: formData.foodTypeScope,
      }

      if (editingCategory) {
        const response = await adminAPI.updateCategory(editingCategory.id, payload)
        if (response?.data?.success) toast.success("Category updated successfully")
      } else {
        const response = await adminAPI.createCategory(payload)
        if (response?.data?.success) toast.success("Category created successfully")
      }

      resetModal()
      fetchCategories()
    } catch (error) {
      if (error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
        toast.error("Cannot connect to server. Please check if backend is running on " + API_BASE_URL.replace("/api", ""))
      } else {
        toast.error(error?.response?.data?.message || "Failed to save category")
      }
    } finally {
      setUploadingImage(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        {/* Top Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
              <span className="rounded-full bg-blue-50 border border-blue-200 px-3 py-0.5 text-xs font-bold text-blue-700">
                {filteredCategories.length} {filteredCategories.length === 1 ? "category" : "categories"}
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-500 font-medium">
              Restaurant-created categories now move through approval, rejection, and optional globalization before every
              restaurant can use them.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportPDF}
              disabled={filteredCategories.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              <Download className="h-4 w-4" />
              Export
            </button>

            {canWrite && (
              <button
                onClick={handleAddNew}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-all"
              >
                <Plus className="h-4 w-4" />
                Add Category
              </button>
            )}
          </div>
        </div>

        {/* Filter Row 1: Scope & Approval Tab Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {/* Global vs Restaurant Scope Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> Type:
            </span>
            {[
              { id: "all", label: "All Categories" },
              { id: "global", label: "🌐 Global Categories" },
              { id: "restaurant", label: "🏪 Restaurant Categories" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScopeFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${scopeFilter === tab.id
                    ? tab.id === "global"
                      ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                      : tab.id === "restaurant"
                        ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                        : "bg-slate-900 text-white border-slate-900 shadow-sm"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Approval Status Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Approval:
            </span>
            {[
              { id: "all", label: "All Status" },
              { id: "pending", label: "Pending" },
              { id: "approved", label: "Approved" },
              { id: "rejected", label: "Rejected" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setApprovalFilter(tab.id)
                  setShowPendingOnly(tab.id === "pending")
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${approvalFilter === tab.id
                    ? tab.id === "pending"
                      ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                      : tab.id === "approved"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : tab.id === "rejected"
                          ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                          : "bg-slate-800 text-white border-slate-800 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Row 2: Cascading Zone & Restaurant Filters + Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Zone Dropdown Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-blue-600" /> Zone Filter
            </label>
            <select
              value={selectedZoneId}
              onChange={(e) => {
                setSelectedZoneId(e.target.value)
                setSelectedRestaurantId("all")
              }}
              className={`w-full rounded-xl border px-3 py-2.5 text-xs font-semibold outline-none transition-all ${selectedZoneId !== "all" ? "border-blue-500 bg-blue-50/50 text-blue-900 font-bold" : "border-slate-300 bg-white text-slate-700"
                }`}
            >
              <option value="all">📍 All Zones</option>
              <option value="global_zone">🌐 Global (All Zones)</option>
              {zonesLoading && <option disabled>Loading zones...</option>}
              {zones.map((zone) => {
                const zId = String(zone._id || zone.id || "")
                const zName = zone.name || zone.zoneName || zone.serviceLocation || zId
                return (
                  <option key={zId} value={zId}>
                    📍 {zName}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Restaurant Dropdown Filter (Cascaded by Zone) */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-amber-600" /> Restaurant Filter
            </label>
            <select
              value={selectedRestaurantId}
              onChange={(e) => setSelectedRestaurantId(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-xs font-semibold outline-none transition-all ${selectedRestaurantId !== "all" ? "border-amber-500 bg-amber-50/50 text-amber-900 font-bold" : "border-slate-300 bg-white text-slate-700"
                }`}
            >
              <option value="all">
                {selectedZoneId !== "all"
                  ? `🏪 All Restaurants in Zone (${availableRestaurants.length})`
                  : "🏪 All Restaurants"}
              </option>
              {restaurantsLoading && <option disabled>Loading restaurants...</option>}
              {availableRestaurants.map((rest) => {
                const rId = String(rest._id || rest.id || "")
                const rName = rest.name || rest.restaurantName || rId
                return (
                  <option key={rId} value={rId}>
                    🏪 {rName}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Search Input & Reset Button */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-slate-600" /> Search Category
            </label>
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name, owner..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-slate-900"
                />
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="shrink-0 px-3 py-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 text-xs font-bold transition-all flex items-center gap-1"
                  title="Clear all filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active Filters Badges Indicator */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="font-bold text-slate-500">Active Filters:</span>
            {scopeFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-300 text-slate-800 font-semibold">
                Type: {scopeFilter === "global" ? "🌐 Global Only" : "🏪 Restaurant Only"}
                <X className="w-3 h-3 cursor-pointer text-slate-500 hover:text-slate-900" onClick={() => setScopeFilter("all")} />
              </span>
            )}
            {selectedZoneId !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 font-semibold">
                Zone: {selectedZoneId === "global_zone" ? "Global" : zones.find((z) => String(z._id || z.id) === selectedZoneId)?.name || selectedZoneId}
                <X className="w-3 h-3 cursor-pointer text-blue-500 hover:text-blue-900" onClick={() => setSelectedZoneId("all")} />
              </span>
            )}
            {selectedRestaurantId !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                Restaurant: {restaurants.find((r) => String(r._id || r.id) === selectedRestaurantId)?.name || selectedRestaurantId}
                <X className="w-3 h-3 cursor-pointer text-amber-500 hover:text-amber-900" onClick={() => setSelectedRestaurantId("all")} />
              </span>
            )}
            {approvalFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-800 font-semibold">
                Approval: {approvalFilter}
                <X className="w-3 h-3 cursor-pointer text-purple-500 hover:text-purple-900" onClick={() => { setApprovalFilter("all"); setShowPendingOnly(false); }} />
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-300 text-slate-800 font-semibold">
                Search: "{searchQuery}"
                <X className="w-3 h-3 cursor-pointer text-slate-500 hover:text-slate-900" onClick={() => setSearchQuery("")} />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="w-[25%] px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">Category</th>
                <th className="w-[17%] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">Owner</th>
                <th className="w-[15%] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">Zone</th>
                <th className="w-[10%] px-4 py-4 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">Diet</th>
                <th className="w-[10%] px-4 py-4 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">Status</th>
                <th className="w-[13%] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">Approval</th>
                <th className="w-[20%] px-5 py-4 text-right text-[11px] font-bold uppercase tracking-wider text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
                    <p className="mt-2 text-sm text-slate-500">Loading categories...</p>
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <p className="text-lg font-semibold text-slate-700">No categories found</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {hasActiveFilters ? "Try clearing active filters." : "Try a different search or create a new category."}
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={resetAllFilters}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset All Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredCategories.map((category) => {
                  const creatorName = category?.createdByRestaurant?.name || category?.restaurant?.name || "Admin"
                  const approvalStatus = category?.approvalStatus || "pending"
                  const isRestaurantCategory = Boolean(category?.createdByRestaurantId || category?.restaurantId)
                  const zoneText = zoneLabel(category?.zoneId)

                  return (
                    <tr key={category.id} className="align-top hover:bg-slate-50/80">
                      <td className="px-5 py-5">
                        <div className="flex items-start gap-3">
                          <div className="h-11 w-11 overflow-hidden rounded-2xl bg-slate-100 shrink-0">
                            {category?.image ? (
                              <img src={category.image} alt={category.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">
                                {String(category?.name || "C").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold leading-6 text-slate-900">{category?.name || "-"}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span>{category?.type || "No type"}</span>
                              <span className="text-slate-300">•</span>
                              <span>Items linked: {category?.itemCount || 0}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-5 text-sm text-slate-600">
                        <div className="space-y-1">
                          <p className="font-medium leading-6 text-slate-800">{creatorName}</p>
                          <p className="text-xs text-slate-400">
                            {category?.isGlobal ? "Global category" : "Private to creator"}
                          </p>
                          {category?.isGlobal && isRestaurantCategory && (
                            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700">
                              <Globe className="mr-1 h-3.5 w-3.5" />
                              Shared
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-5">
                        <div className="max-w-[180px]">
                          <p className="truncate text-sm font-medium text-slate-700" title={zoneText}>
                            {zoneText}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-5 text-center">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${scopeBadgeClass(category?.foodTypeScope)}`}>
                          {category?.foodTypeScope || "Both"}
                        </span>
                      </td>
                      <td className="px-4 py-5 text-center">
                        {canWrite ? (
                          <button
                            onClick={() => handleToggleStatus(category.id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full ${category?.status ? "bg-blue-600" : "bg-slate-300"}`}
                            title={category?.status ? "Deactivate" : "Activate"}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${category?.status ? "translate-x-6" : "translate-x-1"}`} />
                          </button>
                        ) : (
                          <span
                            className={`relative inline-flex h-6 w-11 items-center rounded-full opacity-60 cursor-not-allowed ${category?.status ? "bg-blue-600" : "bg-slate-300"}`}
                            title="Read-only mode (No write permission)"
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${category?.status ? "translate-x-6" : "translate-x-1"}`} />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-5">
                        <div className="space-y-2">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${approvalBadgeClass(approvalStatus)}`}>
                            {approvalStatus === "approved" && <BadgeCheck className="mr-1 h-3.5 w-3.5" />}
                            {approvalStatus.charAt(0).toUpperCase() + approvalStatus.slice(1)}
                          </span>
                          {category?.rejectionReason && (
                            <p className="max-w-[180px] text-xs leading-5 text-rose-600">{category.rejectionReason}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-5">
                        {canWrite ? (
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex flex-wrap justify-end gap-2">
                              {approvalStatus !== "approved" && (
                                <button
                                  onClick={() => handleApprove(category.id)}
                                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                                >
                                  Approve
                                </button>
                              )}
                              {isRestaurantCategory && approvalStatus !== "rejected" && (
                                <button
                                  onClick={() => handleReject(category)}
                                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                                >
                                  Reject
                                </button>
                              )}
                              {isRestaurantCategory && !category?.isGlobal && approvalStatus === "approved" && (
                                <button
                                  onClick={() => handleMakeGlobal(category)}
                                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                                >
                                  Make Global
                                </button>
                              )}
                            </div>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleEdit(category)}
                                className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(category.id)}
                                className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-right">
                            <span className="inline-flex items-center rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500">
                              Read Only
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isModalOpen && (
              <div className="fixed inset-0 z-[200]">
                <div className="absolute inset-0 bg-black/50" onClick={resetModal} />
                <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl max-h-[min(720px,calc(100vh-32px))]"
                  >
                    <div className="flex items-center justify-between border-b px-6 py-4">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">{editingCategory ? "Edit Category" : "Add Category"}</h2>
                        <p className="text-xs text-slate-500">
                          Admin categories are approved immediately. Restaurant-created categories can also be updated here.
                        </p>
                      </div>
                      <button onClick={resetModal} className="rounded-lg p-1 hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-500" />
                      </button>
                    </div>

                    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Zone</label>
                          <select
                            value={formData.zoneId}
                            onChange={(event) => setFormData((prev) => ({ ...prev, zoneId: event.target.value }))}
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-900"
                          >
                            <option value="global">Global (all zones)</option>
                            {zonesLoading && <option value="" disabled>Loading zones...</option>}
                            {zones.map((zone) => {
                              const id = String(zone?._id || zone?.id || "")
                              const label = zone?.name || zone?.zoneName || zone?.serviceLocation || id
                              return (
                                <option key={id} value={id}>
                                  {label}
                                </option>
                              )
                            })}
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Diet Scope</label>
                          <select
                            value={formData.foodTypeScope}
                            onChange={(event) => setFormData((prev) => ({ ...prev, foodTypeScope: event.target.value }))}
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-900"
                          >
                            <option value="Veg">Veg</option>
                            <option value="Non-Veg">Non-Veg</option>
                            <option value="Both">Both</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Category Type</label>
                          <input
                            type="text"
                            value={formData.type}
                            onChange={(event) => setFormData((prev) => ({ ...prev, type: event.target.value }))}
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                            placeholder="Examples: Starters, Desserts, Drinks"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Category Name</label>
                          <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                            placeholder="Enter category name"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Category Image</label>
                          <div className="space-y-3">
                            {(imagePreview || formData.image) && (
                              <div className="relative h-32 w-32 overflow-hidden rounded-2xl border border-slate-300">
                                <img
                                  src={imagePreview || formData.image}
                                  alt="Category preview"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-3">
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                onChange={handleImageSelect}
                                className="hidden"
                                id="category-image-upload"
                              />
                              <label
                                htmlFor="category-image-upload"
                                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
                              >
                                <Upload className="h-4 w-4" />
                                {imagePreview ? "Change Image" : "Upload Image"}
                              </label>
                              {uploadingImage && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
                            </div>
                          </div>
                        </div>

                        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={formData.status}
                            onChange={(event) => setFormData((prev) => ({ ...prev, status: event.target.checked }))}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Active Status
                        </label>
                      </div>

                      <div className="flex items-center gap-3 border-t bg-white px-6 py-4">
                        <button
                          type="button"
                          onClick={resetModal}
                          className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-white"
                        >
                          {editingCategory ? "Update" : "Create"}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
