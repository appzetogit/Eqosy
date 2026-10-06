import { useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, Calendar, Users, MapPin, Ticket, ChevronRight, Edit2, ShieldCheck, Info } from "lucide-react"
import { Button } from "@food/components/ui/button"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { diningAPI, authAPI } from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { useEffect } from "react"
import { toast } from "sonner"
import Loader from "@food/components/Loader"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const BOOKING_DRAFT_KEY = "food_dining_booking_draft_v1"

export default function TableBookingConfirmation() {
  const location = useLocation()
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
    const fallbackDraft = useMemo(() => {
        try {
            const raw = sessionStorage.getItem(BOOKING_DRAFT_KEY)
            return raw ? JSON.parse(raw) : null
        } catch {
            return null
        }
    }, [])
    const resolvedState = location.state || fallbackDraft || {}
    const { restaurant, guests, date, timeSlot, discount } = resolvedState

    const [specialRequest, setSpecialRequest] = useState("")
    const [showSpecialRequestBox, setShowSpecialRequestBox] = useState(false)
    const [tempRequestText, setTempRequestText] = useState("")
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [bookingInProgress, setBookingInProgress] = useState(false)
    const [isEditingUser, setIsEditingUser] = useState(false)
    const [editName, setEditName] = useState("")
    const [editPhone, setEditPhone] = useState("")

    const handleSaveUserDetails = () => {
        if (!editName.trim()) {
            toast.error("Please enter a valid guest name")
            return
        }
        setUser((prev) => ({
            ...prev,
            name: editName.trim(),
            phone: editPhone.trim(),
        }))
        setIsEditingUser(false)
        toast.success("Guest details updated!")
    }

    const activeOfferText =
        restaurant?.offer ||
        restaurant?.diningSettings?.offer ||
        (restaurant?.diningSettings?.discountPercentage
            ? `${restaurant.diningSettings.discountPercentage}% OFF`
            : typeof discount === "string" && discount.includes("%")
            ? discount
            : "10% cashback")

    const quickPills = [
        "🎂 Birthday decoration",
        "💍 Anniversary setup",
        "👶 High chair needed",
        "🪟 Window table preference",
        "🤫 Quiet / Private table",
        "🕯️ Candlelight setup",
    ]

    const handleTogglePill = (pillText) => {
        if (tempRequestText.includes(pillText)) {
            setTempRequestText((prev) =>
                prev
                    .split(", ")
                    .filter((item) => item !== pillText)
                    .join(", ")
            )
        } else {
            setTempRequestText((prev) => (prev ? `${prev}, ${pillText}` : pillText))
        }
    }

    const handleSaveSpecialRequest = () => {
        setSpecialRequest(tempRequestText.trim())
        setShowSpecialRequestBox(false)
        if (tempRequestText.trim()) {
            toast.success("Special request added!")
        }
    }

    useEffect(() => {
        if (!restaurant) {
            navigate("/food/user/dining")
            return
        }

        const fetchUser = async () => {
            try {
                const response = await authAPI.getCurrentUser()
                if (response.data.success) {
                    const userData =
                        response?.data?.data?.user ||
                        response?.data?.data ||
                        response?.data?.user ||
                        null
                    setUser(userData)
                }
            } catch (error) {
                debugError("Error fetching user:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchUser()
    }, [restaurant, navigate])

    const parseTimeToMinutes = (value) => {
        if (!value) return null
        const raw = String(value).trim()
        const hhmmMatch = raw.match(/^(\d{1,2}):(\d{2})$/)
        if (hhmmMatch) return Number(hhmmMatch[1]) * 60 + Number(hhmmMatch[2])
        const meridiemMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
        if (!meridiemMatch) return null
        let hour = Number(meridiemMatch[1])
        const minute = Number(meridiemMatch[2] || 0)
        const meridiem = meridiemMatch[3].toUpperCase()
        if (meridiem === "PM" && hour !== 12) hour += 12
        if (meridiem === "AM" && hour === 12) hour = 0
        return hour * 60 + minute
    }

    const handleBooking = async () => {
        try {
            setBookingInProgress(true)
            const restaurantId =
                restaurant?._id ||
                restaurant?.id ||
                restaurant?.restaurant?._id ||
                restaurant?.restaurant?.id ||
                restaurant?.restaurantId ||
                null

            if (!restaurantId) {
                toast.error("Unable to proceed. Restaurant ID is missing.")
                return
            }

            if (date && timeSlot) {
                const bookingDate = new Date(date)
                if (!Number.isNaN(bookingDate.getTime())) {
                    const isToday = bookingDate.toDateString() === new Date().toDateString()
                    if (isToday) {
                        const slotMins = parseTimeToMinutes(timeSlot)
                        const now = new Date()
                        const currentMins = now.getHours() * 60 + now.getMinutes()
                        if (slotMins !== null && slotMins <= currentMins) {
                            toast.error("Selected time slot has already passed. Please go back and select a future time slot.")
                            return
                        }
                    }
                }
            }

            const response = await diningAPI.createBooking({
                restaurant: restaurantId,
                restaurantRef: restaurant,
                userRef: user,
                guests,
                date,
                timeSlot,
                specialRequest
            })

            if (response.data.success) {
                toast.success("Table booked successfully!")
                try {
                    sessionStorage.removeItem(BOOKING_DRAFT_KEY)
                } catch {}
                // Navigate to success page with booking details
                navigate("/food/user/dining/book-success", { state: { booking: response.data.data } })
            } else {
                toast.error(response.data.message || "Failed to confirm booking")
            }
        } catch (error) {
            debugError("Booking error:", error)
            toast.error(error.response?.data?.message || "Failed to confirm booking")
        } finally {
            setBookingInProgress(false)
        }
    }

    if (loading) return <Loader />

    const bookingDate = new Date(date)
    const formattedDate = Number.isNaN(bookingDate.getTime())
        ? "Today"
        : bookingDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

    return (
        <AnimatedPage className="bg-slate-50 min-h-screen pb-24">
            {/* Header */}
            <div className="bg-[#EB590E] text-white px-4 py-4 sticky top-0 z-50 shadow-md">
                <div className="flex items-center gap-3">
                    <button onClick={goBack} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <p className="font-semibold text-sm">Reach the restaurant 15 minutes before your booking time for a hassle-free experience</p>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Booking Summary Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-4 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="bg-[#FFF2EB] p-2 rounded-xl">
                                <Calendar className="w-5 h-5 text-[#EB590E]" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900">{formattedDate} at {timeSlot}</p>
                                <div className="flex items-center gap-2 text-gray-500 text-sm mt-0.5">
                                    <Users className="w-4 h-4" />
                                    <span>{guests} guests</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 pt-4 border-t border-dashed border-slate-100">
                            <div className="bg-red-50 p-2 rounded-xl">
                                <MapPin className="w-5 h-5 text-red-500" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900">{restaurant.name}</p>
                                <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">
                                    {typeof restaurant.location === 'string'
                                        ? restaurant.location
                                        : (restaurant.location?.formattedAddress || restaurant.location?.address || `${restaurant.location?.city || ''}${restaurant.location?.area ? ', ' + restaurant.location.area : ''}`)}
                                </p>
                            </div>
                        </div>

                        <div
                            onClick={() => {
                                toast.success(`🎉 ${activeOfferText} Applied!`, {
                                    description: `Valid for ${restaurant?.name}. Show your booking ticket at the restaurant to redeem.`,
                                    duration: 4000
                                })
                            }}
                            className="flex items-center justify-between pt-4 border-t border-dashed border-slate-100 text-purple-600 cursor-pointer hover:opacity-80 transition-all active:scale-[0.99] group"
                        >
                            <div className="flex items-center gap-2">
                                <Ticket className="w-5 h-5 text-purple-600 group-hover:rotate-12 transition-transform" />
                                <span className="font-bold text-sm">{activeOfferText}</span>
                            </div>
                            <span className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-bold border border-purple-200/60">
                                Applied ✓
                            </span>
                        </div>
                    </div>
                </div>

                {/* Special Request Section */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
                    <div
                        onClick={() => {
                            setTempRequestText(specialRequest)
                            setShowSpecialRequestBox(!showSpecialRequestBox)
                        }}
                        className="flex items-center justify-between cursor-pointer group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-100 p-2 rounded-xl group-hover:bg-slate-200 transition-colors">
                                <Info className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                                <span className="font-bold text-gray-700 block">Add special request</span>
                                {specialRequest && !showSpecialRequestBox && (
                                    <p className="text-xs text-[#EB590E] font-medium mt-0.5 line-clamp-1">
                                        "{specialRequest}"
                                    </p>
                                )}
                            </div>
                        </div>
                        <ChevronRight
                            className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                                showSpecialRequestBox ? "rotate-90" : ""
                            }`}
                        />
                    </div>

                    {showSpecialRequestBox && (
                        <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                            <p className="text-xs font-semibold text-slate-500">Quick Requests:</p>
                            <div className="flex flex-wrap gap-2">
                                {quickPills.map((pill) => {
                                    const isSelected = tempRequestText.includes(pill)
                                    return (
                                        <button
                                            key={pill}
                                            type="button"
                                            onClick={() => handleTogglePill(pill)}
                                            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                                                isSelected
                                                    ? "bg-[#EB590E] text-white shadow-sm"
                                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                            }`}
                                        >
                                            {pill}
                                        </button>
                                    )
                                })}
                            </div>

                            <textarea
                                value={tempRequestText}
                                onChange={(e) => setTempRequestText(e.target.value)}
                                placeholder="Type any specific note for the restaurant (e.g., quiet table, high chair, allergy note)..."
                                className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#EB590E]"
                            />

                            <div className="flex items-center justify-end gap-2 pt-1">
                                {specialRequest && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSpecialRequest("")
                                            setTempRequestText("")
                                            setShowSpecialRequestBox(false)
                                            toast.info("Special request cleared")
                                        }}
                                        className="px-3 py-1.5 text-xs text-red-500 font-bold hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        Remove
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setShowSpecialRequestBox(false)}
                                    className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveSpecialRequest}
                                    className="px-4 py-1.5 text-xs bg-[#EB590E] text-white font-bold rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
                                >
                                    Save Request
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Preferences Section */}
                <div className="pt-4">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Guest Preferences</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <div className="space-y-2">
                        <div
                            onClick={() => {
                                toast.info("Modifying booking details...", {
                                    description: "Going back to select a different date, time, or guest count.",
                                })
                                goBack()
                            }}
                            className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 active:scale-[0.99] transition-all group"
                        >
                            <div className="flex items-start gap-3">
                                <div className="text-[#EB590E] mt-1 group-hover:scale-110 transition-transform">
                                    <Edit2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">Modification available</p>
                                    <p className="text-xs text-slate-400">Valid till {timeSlot}, {formattedDate}</p>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                        </div>

                        <div
                            onClick={() => {
                                toast.info("Free Cancellation Policy", {
                                    description: `You can cancel your table reservation for ${restaurant?.name || 'this restaurant'} anytime before ${timeSlot} on ${formattedDate} with 0 cancellation fee.`,
                                    duration: 5000,
                                })
                            }}
                            className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 active:scale-[0.99] transition-all group"
                        >
                            <div className="flex items-start gap-3">
                                <div className="text-red-400 mt-1 group-hover:scale-110 transition-transform">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">Cancellation available</p>
                                    <p className="text-xs text-slate-400">Valid till {timeSlot}, {formattedDate}</p>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                        </div>
                    </div>
                </div>

                {/* Your Details */}
                <div className="pt-4">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Details</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        {isEditingUser ? (
                            <div className="space-y-3 animate-in fade-in duration-200">
                                <p className="text-xs font-bold text-slate-600">Update Guest Details</p>
                                <div>
                                    <label className="text-[11px] font-semibold text-slate-500">Full Name</label>
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        placeholder="Enter guest name"
                                        className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#EB590E]"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-semibold text-slate-500">Phone Number</label>
                                    <input
                                        type="tel"
                                        value={editPhone}
                                        onChange={(e) => setEditPhone(e.target.value)}
                                        placeholder="Enter phone number"
                                        className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#EB590E]"
                                    />
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingUser(false)}
                                        className="px-3 py-1.5 text-xs text-slate-500 font-bold hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveUserDetails}
                                        className="px-4 py-1.5 text-xs bg-[#EB590E] text-white font-bold rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
                                    >
                                        Save Details
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-gray-900">{user?.name || "Guest User"}</p>
                                    <p className="text-sm text-slate-400 mt-1">{user?.phone || user?.email || "No contact info"}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditName(user?.name || "")
                                        setEditPhone(user?.phone || "")
                                        setIsEditingUser(true)
                                    }}
                                    className="text-red-500 text-sm font-bold hover:underline cursor-pointer"
                                >
                                    Edit
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Terms and Conditions */}
                <div className="pt-4">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Terms and Conditions</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <ul className="space-y-4">
                            {[
                                "Please arrive 15 minutes prior to your reservation time.",
                                "Booking valid for the specified number of guests entered during reservation",
                                "Cover charges upon entry are subject to the discretion of the restaurant",
                                "House rules are to be observed at all times",
                                "Special requests will be accommodated at the restaurant's discretion",
                                "Offers can be availed only by paying via Eqosy Pay",
                                "Cover charges cannot be refunded if slot is cancelled within 30 minutes of slot start time",
                                "Additional service charges on the bill are at the restaurant's discretion"
                            ].map((term, i) => (
                                <li key={i} className="flex gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 flex-shrink-0"></div>
                                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{term}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Sticky Action Button */}
            <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-50">
                <Button
                    onClick={handleBooking}
                    disabled={bookingInProgress}
                    className="w-full h-14 bg-[#ef4444] hover:bg-red-600 text-white font-bold text-lg rounded-2xl shadow-xl shadow-red-200 transition-all active:scale-[0.98]"
                >
                    {bookingInProgress ? "Confirming..." : "Confirm your seat"}
                </Button>
            </div>
        </AnimatedPage>
    )
}

