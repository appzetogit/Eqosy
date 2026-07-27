import { useEffect, useRef, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import {
  User,
  ArrowRight,
  Bike,
  Ticket,
  ChevronRight,
  Share2,
  LogOut,
  X,
  Loader2,
  Briefcase,
  Star,
  MessageSquare
} from "lucide-react"
import { deliveryAPI } from "@food/api"
import DeleteAccountModal from "@food/components/DeleteAccountModal";
import { Trash2 } from "lucide-react";
import { toast } from "sonner"
import { clearModuleAuth } from "@food/utils/auth"

/**
 * ProfileV2 - 1:1 EXACT Restoration of the Legacy Profile Hub.
 * Matches ProfilePage.jsx exactly.
 */
export const ProfileV2 = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [referralReward, setReferralReward] = useState(0)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [logoutSubmitting, setLogoutSubmitting] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [reviewsData, setReviewsData] = useState({ rating: 0, totalRatings: 0, reviews: [] });
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          setProfile(response.data.data.profile)
        }
      } catch (error) {
        toast.error("Failed to load profile data")
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
    deliveryAPI.getWallet().then(res => {
      const bal = res?.data?.data?.wallet?.pocketBalance || res?.data?.data?.wallet?.totalBalance || 0;
      setWalletBalance(Number(bal));
    }).catch(() => {});

    deliveryAPI.getReviews().then(res => {
      if (res?.data?.success && res?.data?.data) {
        setReviewsData(res.data.data);
      }
    }).catch(() => {});
  }, [])

  useEffect(() => {
    deliveryAPI.getReferralStats().then((res) => {
      const reward = res?.data?.data?.stats?.rewardAmount
      setReferralReward(Number(reward) || 0)
    }).catch(() => {})
  }, [])

  const refId = profile?._id || profile?.id || profile?.referralCode || ""
  const referralLink = refId ? `${window.location.origin}/food/delivery/signup?ref=${encodeURIComponent(String(refId))}` : ""

  const handleShareReferral = async () => {
    if (!referralLink) return
    const rewardText = referralReward > 0 ? `₹${referralReward}` : "rewards"
    const shareText = `Join as a delivery partner and earn ${rewardText}.`
    try {
      if (navigator.share) {
        await navigator.share({ title: "Delivery referral", text: shareText, url: referralLink })
      } else {
        const fallbackUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`
        window.open(fallbackUrl, "_blank", "noopener,noreferrer")
      }
    } catch (e) {}
  }

  const handleConfirmDelete = async () => {
    try {
      await deliveryAPI.deleteAccount();
      toast.success("Account deleted successfully");
      clearModuleAuth("delivery");
      localStorage.removeItem("app:isOnline");
      navigate("/food/delivery/login", { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete account");
    }
  };

  const handleLogout = async () => {
    if (logoutSubmitting) return
    setShowLogoutConfirm(false)
    try {
      setLogoutSubmitting(true)
      await deliveryAPI.logout()
    } catch (error) {}
    clearModuleAuth("delivery")
    localStorage.removeItem("app:isOnline")
    toast.success("Logged out successfully")
    navigate("/food/delivery/login", { replace: true })
    setLogoutSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center font-poppins">
        <div className="flex items-center gap-2 text-gray-700">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading profile...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 font-poppins pb-24">
      {/* Profile Header Block */}
      <div className="bg-white p-4 w-full shadow-sm">
        <div 
          onClick={() => navigate("/food/delivery/profile/details")}
          className="flex items-start justify-between cursor-pointer"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl md:text-3xl font-bold">{profile?.name || ""}</h2>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-gray-600 text-sm md:text-base mb-3 font-medium">{profile?.deliveryId || ""}</p>
          </div>
          <div className="relative shrink-0 ml-4">
            {profile?.profileImage?.url ? (
              <img src={profile.profileImage.url} alt="Profile" className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2 border-gray-200" />
            ) : (
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-200">
                <User className="w-10 h-10 md:w-12 md:h-12 text-gray-400" />
              </div>
            )}
            <div className="absolute bottom-0 right-0 bg-white rounded-full p-2 shadow-md border-2 border-white">
              <Briefcase className="w-4 h-4 text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6">
        {/* Navigation Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => navigate("/food/delivery/history")}
            className="bg-white rounded-xl p-4 flex flex-col items-center gap-2 border border-transparent active:bg-gray-50 transition-colors shadow-sm"
          >
            <div className="rounded-full bg-gray-50 p-3">
              <Bike className="w-6 h-6 text-gray-700" />
            </div>
            <span className="text-sm font-bold text-gray-900">Trips history</span>
          </button>
          <button
            onClick={() => {
              setShowReviewsModal(true);
              setLoadingReviews(true);
              deliveryAPI.getReviews().then(res => {
                if (res?.data?.success && res?.data?.data) {
                  setReviewsData(res.data.data);
                }
              }).finally(() => setLoadingReviews(false));
            }}
            className="bg-white rounded-xl p-4 flex flex-col items-center gap-2 border border-transparent active:bg-gray-50 transition-colors shadow-sm"
          >
            <div className="rounded-full bg-amber-50 p-3">
              <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
            </div>
            <span className="text-sm font-bold text-gray-900">
              Ratings & Reviews ({reviewsData.totalRatings || profile?.totalRatings || 0})
            </span>
          </button>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {/* Share & Earn */}
          <div className="bg-white rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 mb-1">
                Share & Earn{referralReward > 0 ? ` ₹${referralReward}` : ""}
              </h3>
              <p className="text-gray-500 text-xs font-medium">Invite friends to join the delivery partner fleet.</p>
            </div>
            <button
              onClick={handleShareReferral}
              className="shrink-0 bg-black text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest shadow-md"
            >
              Share
            </button>
          </div>

          {/* Support Section */}
          <div>
            <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-3 px-1">Support</h3>
            <div 
              onClick={() => navigate("/food/delivery/help/tickets")}
              className="bg-white rounded-xl p-4 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Ticket className="w-5 h-5 text-gray-700" />
                <span className="text-sm font-bold text-gray-900">Support tickets</span>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300" />
            </div>
          </div>

          {/* Partner options Section */}
          {/* Logout & Account Section */}
          <div className="space-y-3">
            {/* Delete Account */}
            <div 
              onClick={() => setDeleteModalOpen(true)}
              className="bg-white rounded-xl p-4 flex items-center justify-between cursor-pointer border border-red-50 hover:bg-red-50/30 active:bg-red-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-red-600" />
                <span className="text-sm font-bold text-red-600">Delete Account</span>
              </div>
              <ArrowRight className="w-5 h-5 text-red-100" />
            </div>

            {/* Logout */}
            <div 
              onClick={() => setShowLogoutConfirm(true)}
              className="bg-white rounded-xl p-4 flex items-center justify-between cursor-pointer border border-red-50 hover:bg-red-50/30 active:bg-red-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5 text-red-600" />
                <span className="text-sm font-bold text-red-600">Log out</span>
              </div>
              <ArrowRight className="w-5 h-5 text-red-100" />
            </div>
          </div>
        </div>
      </div>

      {/* Logout Confirm Popup */}
      {showLogoutConfirm && (
        <div 
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center px-4"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div 
            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-gray-900 mb-2">Do you want to log out?</h3>
            <p className="text-sm text-gray-500 mb-5">You will be signed out from your delivery account.</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-gray-200 text-gray-700 font-bold"
              >
                No
              </button>
              <button
                onClick={handleLogout}
                disabled={logoutSubmitting}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white font-bold disabled:opacity-60"
              >
                {logoutSubmitting ? "Logging out..." : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}
      <DeleteAccountModal 
        isOpen={deleteModalOpen} 
        onClose={() => setDeleteModalOpen(false)} 
        onConfirm={handleConfirmDelete} 
        walletAmount={walletBalance} 
        moduleName="delivery" 
      />

      {/* Ratings & Reviews Modal */}
      {showReviewsModal && (
        <div className="fixed inset-0 bg-black/60 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                  <Star className="w-5 h-5 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">Customer Ratings & Reviews</h3>
                  <p className="text-xs text-gray-500 font-medium">Feedback from customers delivered to</p>
                </div>
              </div>
              <button
                onClick={() => setShowReviewsModal(false)}
                className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm border border-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Summary Banner */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-100 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block mb-1">Average Score</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-gray-900">
                      {reviewsData.rating ? Number(reviewsData.rating).toFixed(1) : (profile?.rating ? Number(profile.rating).toFixed(1) : "0.0")}
                    </span>
                    <span className="text-xs text-gray-500 font-medium">out of 5.0</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= Math.round(reviewsData.rating || profile?.rating || 0)
                            ? "text-amber-400 fill-amber-400"
                            : "text-gray-200 fill-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-gray-600">
                    {reviewsData.totalRatings || profile?.totalRatings || reviewsData.reviews.length} Total Ratings
                  </span>
                </div>
              </div>

              {/* Reviews List */}
              {loadingReviews ? (
                <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading reviews...</span>
                </div>
              ) : reviewsData.reviews.length === 0 ? (
                <div className="py-12 text-center text-gray-400 font-medium">
                  <MessageSquare className="w-12 h-12 mx-auto text-gray-200 mb-2" />
                  <p>No customer reviews yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reviewsData.reviews.map((item) => (
                    <div key={item._id} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-700 text-xs">
                            {item.customerName ? item.customerName.charAt(0).toUpperCase() : "C"}
                          </div>
                          <div>
                            <span className="text-sm font-bold text-gray-900 block leading-tight">{item.customerName}</span>
                            <span className="text-[10px] text-gray-400">Order #{item.orderId}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span className="text-xs font-bold text-amber-700">{item.rating}</span>
                        </div>
                      </div>
                      {item.comment ? (
                        <p className="text-xs text-gray-600 mt-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100 italic">
                          "{item.comment}"
                        </p>
                      ) : null}
                      <p className="text-[10px] text-gray-400 mt-2 text-right">
                        {new Date(item.createdAt).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                          year: "numeric"
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileV2;
