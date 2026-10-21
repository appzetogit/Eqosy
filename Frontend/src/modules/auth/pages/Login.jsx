import React, { useEffect, useState, useRef } from "react"
import { motion } from "framer-motion"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { ShieldCheck, Loader2, ArrowRight, ArrowLeft, X, UtensilsCrossed, Car, Package } from "lucide-react"
import { toast } from "sonner"
import apiClient, { authAPI } from "@food/api"
import { setUnifiedAuthData, isUnifiedAuthenticated } from "@food/utils/auth"
import { resolvePostLoginRoute } from "@/shared/utils/activeModule.js"

const getInitialOtpSession = () => {
  try {
    const savedSessionRaw = sessionStorage.getItem("eqosy_active_otp_session")
    if (savedSessionRaw) {
      const saved = JSON.parse(savedSessionRaw)
      const elapsedSeconds = Math.floor((Date.now() - (saved.timestamp || 0)) / 1000)
      if (elapsedSeconds < 600 && saved.phoneNumber) {
        const remainingTimer = Math.max(0, (saved.resendTimer || 60) - elapsedSeconds)
        return {
          phoneNumber: saved.phoneNumber,
          step: saved.step || 2,
          resendTimer: remainingTimer,
          pendingAuthData: saved.pendingAuthData || null,
        }
      } else {
        sessionStorage.removeItem("eqosy_active_otp_session")
      }
    }
  } catch (_) {}
  return null
}

export default function UnifiedOTPFastLogin() {
  const RESEND_COOLDOWN_SECONDS = 60
  const VERIFY_REQUEST_TIMEOUT_MS = 20000
  const FCM_FETCH_TIMEOUT_MS = 12000

  const initialSessionRef = useRef(null)
  if (initialSessionRef.current === null) {
    initialSessionRef.current = getInitialOtpSession()
  }
  const initialSession = initialSessionRef.current

  const [phoneNumber, setPhoneNumber] = useState(() => initialSession?.phoneNumber || "")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState(() => initialSession?.step || 1) // 1: Phone, 2: OTP, 3: Name
  const [loading, setLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(() => Boolean(initialSession?.step && initialSession.step > 1))
  const [resendTimer, setResendTimer] = useState(() => initialSession?.resendTimer || 0)
  const [name, setName] = useState("")
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [pendingAuthData, setPendingAuthData] = useState(() => initialSession?.pendingAuthData || null)
  const [policyModal, setPolicyModal] = useState({ open: false, title: "", content: "", loading: false })
  const navigate = useNavigate()
  const location = useLocation()
  const submitting = useRef(false)

  const openPolicyModal = async (type) => {
    const title = type === "terms" ? "Terms of Service" : "Privacy Policy"
    setPolicyModal({ open: true, title, content: "", loading: true })
    try {
      const endpoint = type === "terms" ? "/food/pages/terms" : "/food/pages/privacy"
      const res = await apiClient.get(endpoint)
      const payload = res?.data?.data || res?.data || {}
      const pageTitle = payload.title || title
      const pageContent = payload.content || ""

      if (pageContent) {
        setPolicyModal({
          open: true,
          title: pageTitle,
          content: pageContent,
          loading: false,
        })
      } else {
        setPolicyModal({
          open: true,
          title: pageTitle,
          content: `<div class="py-4 text-slate-700 font-medium leading-relaxed">Welcome to Eqosy. Please read and agree to our ${pageTitle} before using our services. Full detailed terms are available in the system settings.</div>`,
          loading: false,
        })
      }
    } catch (_) {
      setPolicyModal({
        open: true,
        title,
        content: `<div class="py-4 text-slate-700 font-medium leading-relaxed">Welcome to Eqosy. Please read and agree to our ${title} before using our services. Full detailed terms are available in the system settings.</div>`,
        loading: false,
      })
    }
  }

  // Persist session whenever state changes
  useEffect(() => {
    if (step > 1 && phoneNumber) {
      try {
        sessionStorage.setItem("eqosy_active_otp_session", JSON.stringify({
          phoneNumber,
          step,
          resendTimer,
          pendingAuthData,
          timestamp: Date.now(),
        }))
      } catch (_) {}
    } else if (step === 1) {
      try {
        sessionStorage.removeItem("eqosy_active_otp_session")
      } catch (_) {}
    }
  }, [step, phoneNumber, pendingAuthData, resendTimer])

  // Dismiss soft keyboard on unmount & auto-redirect if already logged in
  useEffect(() => {
    if (isUnifiedAuthenticated()) {
      const fromPath = location.state?.from || resolvePostLoginRoute()
      navigate(fromPath, { replace: true })
    }
    return () => {
      if (typeof document !== 'undefined') {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur()
        }
        document.querySelectorAll('input, textarea').forEach((el) => {
          if (el && typeof el.blur === 'function') el.blur()
        })
      }
    }
  }, [location.state?.from, navigate])

  const handleBack = (e) => {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault()
      if (typeof e.stopPropagation === 'function') e.stopPropagation()
    }

    // Instantly dismiss soft keyboard across all browsers & native WebView
    if (typeof document !== 'undefined') {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur()
      }
      document.querySelectorAll('input, textarea').forEach((el) => {
        if (el && typeof el.blur === 'function') el.blur()
      })
    }
    if (typeof window !== 'undefined' && window.flutter_inappwebview) {
      try {
        window.flutter_inappwebview.callHandler('hideKeyboard')
      } catch (_) {}
    }

    if (step > 1) {
      setStep(1)
      return
    }

    const fromPath = location.state?.from
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
    const fallbackPath = (currentPath.includes('taxi') || localStorage.getItem('eqosy_active_module') === 'taxi') 
      ? '/taxi/user' 
      : '/food/user'

    // If fromPath points back to a login page itself or is missing, use module home
    const isLoginPath = (p) => !p || p === '/login' || p.includes('/auth/login')
    const targetPath = !isLoginPath(fromPath) ? fromPath : fallbackPath

    if (typeof window !== 'undefined' && window.history.length > 1 && !isLoginPath(fromPath)) {
      navigate(-1)
    } else {
      navigate(targetPath, { replace: true })
    }
  }

  const getWebFcmTokenForLogin = async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      throw new Error("Browser environment not available for FCM token generation")
    }
    if (!("serviceWorker" in navigator) || typeof Notification === "undefined") {
      throw new Error("This browser does not support push notifications")
    }

    const firebaseConfig = {
      apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || "").trim(),
      authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
      projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
      storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(),
      messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
      appId: String(import.meta.env.VITE_FIREBASE_APP_ID || "").trim(),
    }
    const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || "").trim()

    if (!Object.values(firebaseConfig).every(Boolean) || !vapidKey) {
      throw new Error("Firebase web push config missing in Frontend/.env")
    }

    if (Notification.permission === "denied") {
      throw new Error("Notification permission is blocked. Enable notifications and try again.")
    }
    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        throw new Error("Notification permission is required for login")
      }
    }

    const [{ getApps, initializeApp }, { getMessaging, getToken, isSupported }] = await Promise.all([
      import("firebase/app"),
      import("firebase/messaging"),
    ])

    const supported = await isSupported().catch(() => false)
    if (!supported) {
      throw new Error("Firebase messaging is not supported in this browser")
    }

    const app = getApps()[0] || initializeApp(firebaseConfig)
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js")
    const messaging = getMessaging(app)
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })

    const normalizedToken = String(token || "").trim()
    if (!normalizedToken || normalizedToken.length < 20) {
      throw new Error("Failed to generate FCM token")
    }

    localStorage.setItem("fcm_web_registered_token_user", normalizedToken)
    return normalizedToken
  }

  // Check if already logged in on mount
  useEffect(() => {
    if (isUnifiedAuthenticated()) {
      navigate(resolvePostLoginRoute(), { replace: true })
    }
  }, [navigate])

  const normalizedPhone = () => {
    const digits = String(phoneNumber).replace(/\D/g, "").slice(-15)
    return digits.length >= 8 ? digits : ""
  }

  const withTimeout = async (promise, timeoutMs, label) => {
    let timeoutId
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out. Please try again.`))
      }, timeoutMs)
    })
    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const waitForFlutterBridge = async (timeoutMs = 6000) => {
    if (typeof window === "undefined") return false
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      return true
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 120))
      if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
        return true
      }
    }
    return false
  }

  const normalizeBridgeToken = (value) => {
    if (typeof value === "string") return value.trim()
    if (value && typeof value === "object") {
      const candidates = [value.token, value.fcmToken, value.data?.token, value.data?.fcmToken]
      for (const candidate of candidates) {
        const normalized = String(candidate || "").trim()
        if (normalized.length > 20) return normalized
      }
    }
    return String(value || "").trim()
  }

  const handleSendOTP = async (e) => {
    e.preventDefault()
    const phone = normalizedPhone()
    if (phone.length < 8) {
      toast.error("Please enter a valid phone number (at least 8 digits)")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      const otpSendResponse = await authAPI.sendUnifiedOTP(phoneNumber)
      console.log("[Auth] OTP send response:", otpSendResponse?.data || otpSendResponse)
      setOtpSent(true)
      setOtp("")
      setStep(2)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success("OTP sent! Check your phone.")
    } catch (err) {
      console.log("[Auth] OTP send error:", err?.response?.data || err)
      const msg = err?.response?.data?.message || err?.message || "Failed to send OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleResendOTP = async () => {
    const phone = normalizedPhone()
    if (phone.length < 8) {
      toast.error("Please enter a valid phone number (at least 8 digits)")
      return
    }
    if (resendTimer > 0 || submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      const otpResendResponse = await authAPI.sendUnifiedOTP(phoneNumber)
      console.log("[Auth] OTP resend response:", otpResendResponse?.data || otpResendResponse)
      setOtp("")
      setOtpSent(true)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success("OTP resent successfully.")
    } catch (err) {
      console.log("[Auth] OTP resend error:", err?.response?.data || err)
      const msg = err?.response?.data?.message || err?.message || "Failed to resend OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleEditNumber = () => {
    setStep(1)
    setOtp("")
    setName("")
    setPendingAuthData(null)
    setResendTimer(0)
  }

  const handleVerifyOTP = async (e) => {
    e.preventDefault()
    const phone = normalizedPhone()
    const otpDigits = String(otp).replace(/\D/g, "").slice(0, 4)
    if (otpDigits.length !== 4) {
      toast.error("Please enter the 4-digit OTP")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      let fcmToken = ""
      let platform = "web"
      if (typeof window !== "undefined" && window.flutter_inappwebview) {
        platform = "mobile"
        await waitForFlutterBridge()
        const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"]
        for (const handlerName of handlerNames) {
          try {
            const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "user" })
            const normalized = normalizeBridgeToken(t)
            if (normalized.length > 20) {
              fcmToken = normalized
              break
            }
          } catch (_) { }
        }
        if (!fcmToken) {
          console.warn("[Auth] Mobile FCM token not retrieved from Flutter app bridge during login.")
        }
      } else {
        try {
          fcmToken = await withTimeout(
            getWebFcmTokenForLogin(),
            FCM_FETCH_TIMEOUT_MS,
            "FCM token fetch",
          )
        } catch (webFcmErr) {
          console.warn("[Auth] Web FCM token fetch failed during login:", webFcmErr?.message || webFcmErr)
        }
      }

      console.log("[Auth] FCM token for login:", {
        platform,
        length: fcmToken.length,
        preview: `${fcmToken.slice(0, 12)}...`,
      })

      const response = await withTimeout(
        authAPI.verifyUnifiedOTP(phoneNumber, otpDigits, null, null, fcmToken, platform),
        VERIFY_REQUEST_TIMEOUT_MS,
        "OTP verification request",
      )
      console.log("[Auth] OTP verify response:", response?.data || response)
      const data = response?.data?.data || response?.data || {}

      if (!data.accessToken || !data.user) {
        throw new Error("Invalid response from server")
      }

      const hasName =
        data.user?.name &&
        String(data.user.name).trim().length > 0 &&
        String(data.user.name).toLowerCase() !== "null"
      const needsName = data.isNewUser === true || data.needsNamePrompt === true || !hasName

      if (needsName) {
        setPendingAuthData({ ...data, fcmToken, platform })
        setName("")
        setStep(3)
        toast.success("OTP verified. Complete your profile to continue.")
        return
      }

      setUnifiedAuthData(data)
      try {
        sessionStorage.removeItem("eqosy_active_otp_session")
      } catch (_) {}
      try {
        await authAPI.saveLoginFcmToken(fcmToken, platform)
      } catch (fcmSaveError) {
        console.warn("[Auth] FCM save route failed after login:", fcmSaveError?.message || fcmSaveError)
      }
      toast.success("Authentication successful!")
      const targetRoute = location.state?.from || resolvePostLoginRoute()
      navigate(targetRoute, { replace: true })
    } catch (err) {
      const status = err?.response?.status
      let msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Invalid OTP. Please try again."
      if (status === 401) {
        if (/deactivat(ed|e)/i.test(String(msg))) {
          msg = "Your account is deactivated. Please contact support."
        } else {
          msg = "Invalid or expired code, or account not active."
        }
      }
      console.log("[Auth] OTP verify error:", err?.response?.data || err)
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleCompleteProfile = async (e) => {
    e.preventDefault()
    const trimmedName = String(name || "").trim()
    if (trimmedName.length < 2) {
      toast.error("Please enter your full name")
      return
    }
    if (!pendingAuthData?.accessToken || !pendingAuthData?.user) {
      toast.error("Session expired. Please verify OTP again.")
      setStep(1)
      setOtp("")
      setPendingAuthData(null)
      return
    }

    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      await apiClient.patch(
        "/food/user/profile",
        { name: trimmedName },
        {
          headers: {
            Authorization: `Bearer ${pendingAuthData.accessToken}`,
          },
        },
      )

      const nextData = {
        ...pendingAuthData,
        user: {
          ...pendingAuthData.user,
          name: trimmedName,
        },
      }

      setUnifiedAuthData(nextData)
      try {
        sessionStorage.removeItem("eqosy_active_otp_session")
      } catch (_) {}
      toast.success("Profile completed successfully!")
      const targetRoute = location.state?.from || resolvePostLoginRoute()
      navigate(targetRoute, { replace: true })
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save your name."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  useEffect(() => {
    if (step !== 2 || resendTimer <= 0) return
    const intervalId = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(intervalId)
  }, [step, resendTimer])

  const formatResendTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  const buttonDisabled =
    loading ||
    (step === 1 && String(phoneNumber).length < 10) ||
    (step === 2 && (!agreeTerms || otp.length !== 4)) ||
    (step === 3 && (!agreeTerms || String(name).trim().length < 2))

  const heading =
    step === 1
      ? { title: "Welcome to Eqosy", subtitle: "Enter your mobile number to continue" }
      : step === 2
        ? { title: "Verify your number", subtitle: "Enter the 4-digit code we sent you" }
        : { title: "One last step", subtitle: "Tell us your name to finish up" }

  const fieldClass =
    "border-[1.5px] border-[#E4E8F4] bg-white transition-all focus-within:border-[#F7931E] focus-within:shadow-[0_0_0_4px_rgba(247,147,30,0.2)]"

  const numberChip = (label) => (
    <div className="flex items-center justify-between rounded-2xl bg-[#FFF0CF] px-4 py-2.5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A6A3A]">{label}</p>
        <p className="text-[15px] font-extrabold text-[#0C1336]">+91 {phoneNumber}</p>
      </div>
      <button
        type="button"
        onClick={handleEditNumber}
        className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-extrabold text-[#B84A06] shadow-sm active:scale-95"
      >
        Edit
      </button>
    </div>
  )

  const policyLinks = (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); openPolicyModal("terms") }}
        className="font-extrabold text-[#B84A06] underline decoration-[#F7931E]/50 underline-offset-2"
      >
        Terms of Service
      </button>
      {" "}and{" "}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); openPolicyModal("privacy") }}
        className="font-extrabold text-[#B84A06] underline decoration-[#F7931E]/50 underline-offset-2"
      >
        Privacy Policy
      </button>
    </>
  )

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-[#060A22] via-[#0C1336] to-[#16204F] font-sans">
      {/* warm glow + soft rings */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-24 left-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-[#F7931E]/35 blur-[90px]" />
        <div className="absolute top-10 right-0 h-60 w-60 rounded-full bg-[#7ED321]/25 blur-[90px]" />
        <div className="absolute left-1/2 top-16 h-64 w-64 -translate-x-1/2 rounded-full border border-white/10" />
        <div className="absolute left-1/2 top-4 h-96 w-96 -translate-x-1/2 rounded-full border border-white/5" />
      </div>

      <button
        type="button"
        onClick={handleBack}
        aria-label="Back"
        className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md transition-transform active:scale-95"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      {/* Hero */}
      <div className="relative z-10 flex flex-col items-center px-6 pb-12 pt-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-[25px] bg-gradient-to-br from-[#7ED321] via-[#FFC400] to-[#F7931E] p-[3px] shadow-[0_18px_40px_-12px_rgba(247,147,30,0.7)]"
        >
          <div className="h-[68px] w-[68px] overflow-hidden rounded-[22px] bg-white">
            <img src="/eqosy-logo.png" alt="Eqosy" className="h-full w-full scale-110 object-cover" />
          </div>
        </motion.div>

        <p className="mt-3 text-[20px] font-black leading-none tracking-tight">
          <span className="text-[#8BE02A]">E</span>
          <span className="text-[#F7931E]">q</span>
          <span className="text-white">osy</span>
        </p>
        <h1 className="mt-2 text-[25px] font-black leading-[1.15] tracking-tight text-white">
          Everything you need,
          <br />
          <span className="bg-gradient-to-r from-[#8BE02A] via-[#FFC400] to-[#F7931E] bg-clip-text text-transparent">delivered.</span>
        </h1>

        <div className="pointer-events-none mt-3 flex select-none items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur">
            <UtensilsCrossed className="h-3.5 w-3.5 text-[#F7931E]" /> Food
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur">
            <Car className="h-3.5 w-3.5 text-[#8BE02A]" /> Rides
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur">
            <Package className="h-3.5 w-3.5 text-[#FFC400]" /> Parcel
          </span>
        </div>
      </div>

      {/* Bottom sheet */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto flex w-full max-w-[460px] flex-1 flex-col rounded-t-[32px] bg-[#FFFDF6] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_50px_-20px_rgba(0,0,0,0.6)]"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[#D9DEEE]" />

        <div className="mb-4">
          <h2 className="text-[22px] font-black leading-tight text-[#0C1336]">{heading.title}</h2>
          <p className="mt-0.5 text-[14px] font-medium text-[#5E678A]">{heading.subtitle}</p>
        </div>

        <form
          onSubmit={step === 1 ? handleSendOTP : step === 2 ? handleVerifyOTP : handleCompleteProfile}
          className="mb-6 space-y-4"
        >
          {step === 1 ? (
            <div className={`flex h-16 items-center overflow-hidden rounded-2xl ${fieldClass}`}>
              <span className="flex h-full items-center bg-[#FFF0CF] px-5 text-[18px] font-black text-[#B84A06]">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                required
                autoFocus
                maxLength={10}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Mobile number"
                className="h-full min-w-0 flex-1 bg-transparent px-4 text-[22px] font-extrabold tracking-[0.14em] text-[#0C1336] outline-none placeholder:text-[17px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-[#AEB5CE]"
              />
            </div>
          ) : step === 2 ? (
            <>
              {numberChip("Code sent to")}

              <div className="flex justify-between gap-3">
                {[0, 1, 2, 3].map((index) => (
                  <input
                    key={index}
                    id={`otp-${index}`}
                    type="tel"
                    inputMode="numeric"
                    required
                    autoFocus={index === 0}
                    value={otp[index] || ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "")
                      const current = (otp || "").split("")
                      while (current.length < 4) current.push("")

                      if (!digits) {
                        current[index] = ""
                        setOtp(current.join(""))
                        if (index > 0) document.getElementById(`otp-${index - 1}`)?.focus()
                        return
                      }

                      if (digits.length >= 4) {
                        setOtp(digits.slice(0, 4))
                        document.getElementById(`otp-3`)?.focus()
                        return
                      }

                      const newDigit = digits.slice(-1)
                      current[index] = newDigit
                      setOtp(current.join(""))
                      if (index < 3 && newDigit) {
                        document.getElementById(`otp-${index + 1}`)?.focus()
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace") {
                        if (!otp[index] && index > 0) {
                          e.preventDefault()
                          const current = (otp || "").split("")
                          while (current.length < 4) current.push("")
                          current[index - 1] = ""
                          setOtp(current.join(""))
                          document.getElementById(`otp-${index - 1}`)?.focus()
                        }
                      }
                    }}
                    className="h-16 w-full rounded-2xl border-[1.5px] border-[#E4E8F4] bg-white text-center text-[28px] font-black text-[#0C1336] outline-none transition-all placeholder:text-[#C4CAE0] focus:border-[#F7931E] focus:shadow-[0_0_0_4px_rgba(247,147,30,0.2)]"
                    placeholder="-"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between px-1">
                <span className="text-[12px] font-medium text-[#5E678A]">Didn't receive it?</span>
                {resendTimer > 0 ? (
                  <span className="text-[12px] font-bold text-[#9AA2C0]">Resend in {formatResendTimer(resendTimer)}</span>
                ) : (
                  <button type="button" onClick={handleResendOTP} className="text-[12px] font-extrabold text-[#F7931E]">
                    Resend Code
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {numberChip("New account")}
              <div className={`flex h-16 items-center rounded-2xl ${fieldClass}`}>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="h-full min-w-0 flex-1 bg-transparent px-4 text-[18px] font-bold text-[#0C1336] outline-none placeholder:font-semibold placeholder:text-[#AEB5CE]"
                />
              </div>
            </>
          )}

          {step > 1 && (
            <label htmlFor="agreeTermsCheck" className="flex cursor-pointer select-none items-start gap-2.5 px-1 text-[11.5px] font-medium leading-snug text-[#4A5378]">
              <input
                type="checkbox"
                id="agreeTermsCheck"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[#C4CAE0] accent-[#E85D04]"
              />
              <span>I agree to the {policyLinks}.</span>
            </label>
          )}

          <button
            type="submit"
            disabled={buttonDisabled}
            className={`flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-black tracking-wide transition-all ${
              buttonDisabled
                ? "cursor-not-allowed bg-[#E9ECF6] text-[#A3AAC6]"
                : "bg-gradient-to-r from-[#F7931E] to-[#E85D04] text-white shadow-[0_14px_26px_-10px_rgba(232,93,4,0.7)] active:scale-[0.98]"
            }`}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                {step === 1 ? "Get OTP" : step === 2 ? "Verify & Login" : "Complete Profile"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Legal footer */}
        <div className="mt-auto border-t border-[#E4E8F4] pt-3 text-center">
          {step === 1 && (
            <p className="text-[11px] font-medium leading-relaxed text-[#5E678A]">
              By continuing, you agree to our {policyLinks}.
            </p>
          )}
          <div className="mt-1.5 flex items-center justify-center gap-3 text-[11px] font-bold text-[#5E678A]">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-[#5FB410]" /> Secure login
            </span>
            <span className="h-3 w-px bg-[#D9DEEE]" />
            <Link to="/support" className="hover:underline">Help & Support</Link>
          </div>
        </div>
      </motion.div>

      {/* Legal Policy In-Page Modal */}
      {policyModal.open && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
          >
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="text-lg font-black text-slate-900">{policyModal.title}</h3>
              <button
                type="button"
                onClick={() => setPolicyModal({ ...policyModal, open: false })}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 text-slate-700 text-sm leading-relaxed">
              {policyModal.loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#F7931E]" />
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Loading policy...</p>
                </div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: policyModal.content }} />
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50">
              <button
                type="button"
                onClick={() => setPolicyModal({ ...policyModal, open: false })}
                className="px-6 py-2 bg-[#1A1A1A] text-white rounded-full font-bold text-sm hover:bg-black transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
