import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { RefreshCw, AlertCircle } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { restaurantAPI } from "@food/api"
import {
  setAuthData as setRestaurantAuthData,
  setRestaurantPendingPhone,
} from "@food/utils/auth"
import { checkOnboardingStatus, isRestaurantOnboardingComplete } from "@food/utils/onboardingUtils"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { motion, AnimatePresence } from "framer-motion"
import logoImg from "@food/assets/eqosy-logo.png"

export default function RestaurantOTP() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("") 
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const inputRefs = useRef([])
  const hasSubmittedRef = useRef(false)
  const otpSectionRef = useRef(null)

  useEffect(() => {
    const stored = sessionStorage.getItem("restaurantAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)
      if (data.method === "email" && data.email) {
        setContactInfo(data.email)
      } else if (data.phone) {
        const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
        setContactInfo(phoneMatch ? `${phoneMatch[1]} ${phoneMatch[2].replace(/\D/g, "")}` : (data.phone || ""))
      }
    } else {
      navigate("/food/restaurant/login")
      return
    }

    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate])

  useEffect(() => {
    if (inputRefs.current[0]) inputRefs.current[0].focus()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const viewport = window.visualViewport
    if (!viewport) return
    const updateKeyboardState = () => {
      const keyboardHeight = Math.max(0, window.innerHeight - viewport.height)
      setKeyboardOffset(keyboardHeight > 120 ? keyboardHeight : 0)
    }
    updateKeyboardState()
    viewport.addEventListener("resize", updateKeyboardState)
    viewport.addEventListener("scroll", updateKeyboardState)
    return () => {
      viewport.removeEventListener("resize", updateKeyboardState)
      viewport.removeEventListener("scroll", updateKeyboardState)
    }
  }, [])

  const handleChange = (index, value) => {
    const digits = String(value || "").replace(/\D/g, "")
    const newOtp = [...otp]

    if (!digits) {
      newOtp[index] = ""
      setOtp(newOtp)
      setError("")
      if (index > 0) inputRefs.current[index - 1]?.focus()
      return
    }

    if (digits.length >= 4) {
      const pasted = digits.slice(0, 4).split("")
      const fullPastedOtp = ["", "", "", ""]
      pasted.forEach((char, i) => { fullPastedOtp[i] = char })
      setOtp(fullPastedOtp)
      setError("")
      inputRefs.current[3]?.focus()
      if (!hasSubmittedRef.current) {
        hasSubmittedRef.current = true
        handleVerify(fullPastedOtp.join(""))
      }
      return
    }

    const newDigit = digits.slice(-1)
    newOtp[index] = newDigit
    setOtp(newOtp)
    setError("")

    if (newDigit && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    if (newOtp.every((digit) => digit !== "") && newOtp.length === 4) {
      if (!hasSubmittedRef.current) {
        hasSubmittedRef.current = true
        handleVerify(newOtp.join(""))
      }
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (!otp[index] && index > 0) {
        e.preventDefault()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
        inputRefs.current[index - 1]?.focus()
      }
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 4).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => { if (i < 4) newOtp[i] = digit })
    setOtp(newOtp)
    if (digits.length === 4) handleVerify(newOtp.join(""))
    else inputRefs.current[digits.length]?.focus()
  }

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")
    if (hasSubmittedRef.current && !otpValue) return
    if (code.length !== 4) {
      setError("Please enter the complete 4-digit code")
      hasSubmittedRef.current = false
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) throw new Error("Session expired.")
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      const response = await restaurantAPI.verifyOTP(phone, code, purpose, null, email)
      const data = response?.data?.data || response?.data
      const needsRegistration = data?.needsRegistration === true
      const normalizedPhone = data?.phone || phone

      if (needsRegistration) {
        setRestaurantPendingPhone(normalizedPhone)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        navigate("/food/restaurant/onboarding", { replace: true })
        return
      }

      const accessToken = data?.accessToken
      const refreshToken = data?.refreshToken ?? null
      const restaurant = data?.user ?? data?.restaurant

      if (accessToken && restaurant) {
        setRestaurantAuthData("restaurant", accessToken, restaurant, refreshToken)
        window.dispatchEvent(new Event("restaurantAuthChanged"))
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")

        setTimeout(async () => {
          if (authData?.isSignUp) {
            navigate("/food/restaurant/onboarding", { replace: true })
          } else {
            try {
              if (!isRestaurantOnboardingComplete(restaurant)) {
                const incompleteStep = await checkOnboardingStatus()
                if (incompleteStep) {
                  navigate(`/food/restaurant/onboarding?step=${incompleteStep}`, { replace: true })
                  return
                }
              }
              navigate("/food/restaurant", { replace: true })
            } catch (err) { navigate("/food/restaurant", { replace: true }) }
          }
        }, 500)
      }
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Invalid OTP."
      if (/pending approval/i.test(message)) {
        const pendingPhone = authData?.phone || authData?.email || contactInfo
        if (pendingPhone) setRestaurantPendingPhone(pendingPhone)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        navigate("/food/restaurant/pending-verification", {
          replace: true, state: { phone: pendingPhone || "" },
        })
        return
      }
      setError(message)
      setOtp(["", "", "", ""])
      hasSubmittedRef.current = false
      inputRefs.current[0]?.focus()
    } finally { setIsLoading(false) }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return
    setIsLoading(true)
    setError("")
    try {
      if (!authData) throw new Error("Session expired.")
      const purpose = authData.isSignUp ? "register" : "login"
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      await restaurantAPI.sendOTP(phone, purpose, email)
      setResendTimer(60)
    } catch (err) { setError("Failed to resend OTP.") }
    setIsLoading(false)
    setOtp(["", "", "", ""])
    inputRefs.current[0]?.focus()
  }

  if (!authData) return null

  return (
    <div className="min-h-[100dvh] bg-white dark:bg-[#0A0A0B] flex flex-col font-sans overflow-hidden">
      {/* Top Branding Section - 35% height */}
      <div className="relative h-[35dvh] w-full bg-[#1A1A1A] overflow-hidden flex flex-col items-center justify-center">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#F38F24]/5 rounded-full blur-[80px] translate-x-1/3 -translate-y-1/3"></div>
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-white/5 rounded-full blur-[60px] -translate-x-1/3 translate-y-1/3"></div>
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex flex-col items-center gap-4 px-6 text-center"
        >
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center border border-white/25 shadow-lg mb-2 overflow-hidden">
            <img src={logoImg} alt={`${companyName} logo`} className="w-full h-full object-cover scale-110" />
          </div>
          <div className="space-y-1">
            <h1 className="text-white font-black text-3xl tracking-tight leading-none italic">
              SECURITY CHECK
            </h1>
            <p className="text-white/70 text-xs font-bold uppercase tracking-[0.2em]">
              Sent to {contactInfo}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Bottom Content Section - 65% height */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 bg-white dark:bg-[#0A0A0B] rounded-t-[2.5rem] -mt-10 relative z-20 shadow-[0_-20px_40px_rgba(0,0,0,0.05)] px-6 pt-12 pb-6 flex flex-col"
        style={{ marginBottom: keyboardOffset > 0 ? `${keyboardOffset}px` : 0 }}
      >
        <div className="max-w-md mx-auto w-full flex flex-col h-full">
          <div className="space-y-10">
            <div ref={otpSectionRef} className="flex justify-center gap-4">
              {otp.map((digit, index) => (
                <motion.div
                  key={index}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 * index }}
                  className="relative"
                >
                  <input
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={handlePaste}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex(null)}
                    disabled={isLoading}
                    className={`w-16 h-16 text-center text-3xl font-black bg-[#F8F9FA] dark:bg-zinc-900 border rounded-xl text-[#1A1A1A] dark:text-white transition-all outline-none shadow-sm ${
                      focusedIndex === index ? "border-[#F38F24] ring-1 ring-[#F38F24] shadow-[#F38F24]/10" : "border-gray-200"
                    }`}
                  />
                  {digit && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F38F24] rounded-full" />
                  )}
                </motion.div>
              ))}
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-2 text-xs font-bold text-red-500 bg-red-50 py-4 px-4 rounded-xl border border-red-100"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            <div className="space-y-6 pt-4">
              <Button
                onClick={() => handleVerify()}
                disabled={isLoading || otp.some(d => !d)}
                className="w-full h-14 bg-[#1A1A1A] hover:bg-black text-white font-bold text-base rounded-xl transition-all hover:shadow-lg disabled:opacity-50 disabled:bg-gray-200 disabled:text-gray-400"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Validating...</span>
                  </div>
                ) : (
                  "Unlock Portal"
                )}
              </Button>

              <div className="flex justify-center flex-col items-center gap-4">
                {resendTimer > 0 ? (
                  <p className="text-sm font-medium text-gray-400">
                    Request new code in <span className="text-[#F38F24] font-semibold">{resendTimer}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isLoading}
                    className="text-sm font-semibold text-[#F38F24] hover:text-[#d97716] transition-colors"
                  >
                    Resend OTP
                  </button>
                )}

                <Button
                  onClick={() => navigate("/food/restaurant/login")}
                  variant="ghost"
                  className="text-gray-400 font-medium text-xs hover:bg-transparent hover:text-[#1A1A1A]"
                >
                  Change Account
                </Button>
              </div>
            </div>
          </div>

          <footer className="mt-auto pt-10 text-center">
            <p className="text-xs text-gray-400 font-medium leading-relaxed">
              Partner Security Network &bull; <span className="text-[#1A1A1A] font-bold">{companyName.toUpperCase()}</span>
            </p>
          </footer>
        </div>
      </motion.div>
    </div>
  )
}
