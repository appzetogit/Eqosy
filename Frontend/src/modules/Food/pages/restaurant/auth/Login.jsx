import { useEffect, useRef, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Store } from "lucide-react"
import { restaurantAPI } from "@food/api"
import { useCompanyName } from "@food/hooks/useCompanyName"
import logoImg from "@food/assets/eqosy-logo.png"
import FloatingAuthLayout, { AUTH_THEMES, AuthButton, AuthError, AuthPhoneField } from "@/shared/components/auth/FloatingAuthLayout"

const DEFAULT_COUNTRY_CODE = "+91"

export default function RestaurantLogin() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const phoneInputRef = useRef(null)
  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem("restaurantLoginPhone")
    return {
      phone: saved || "",
      countryCode: DEFAULT_COUNTRY_CODE,
    }
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined

    const updateKeyboardInset = () => {
      const viewport = window.visualViewport
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }

    updateKeyboardInset()
    window.visualViewport.addEventListener("resize", updateKeyboardInset)
    window.visualViewport.addEventListener("scroll", updateKeyboardInset)

    return () => {
      window.visualViewport.removeEventListener("resize", updateKeyboardInset)
      window.visualViewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [])

  const validatePhone = (phone) => {
    if (!phone || phone.trim() === "") return "Please enter your 10-digit mobile number"
    const digitsOnly = phone.replace(/\D/g, "")
    if (digitsOnly.length < 10) return "Mobile number must be exactly 10 digits"
    if (digitsOnly.length > 10) return "Mobile number cannot exceed 10 digits"
    if (!["6", "7", "8", "9"].includes(digitsOnly[0])) return "Please enter a valid mobile number starting with 6, 7, 8, or 9"
    return ""
  }

  const handlePhoneChange = (e) => {
    const rawInput = e.target.value
    const digitsOnly = rawInput.replace(/\D/g, "")
    
    let validationErr = ""
    if (rawInput.length > 10 || digitsOnly.length > 10) {
      validationErr = "Mobile number cannot exceed 10 digits"
    } else if (digitsOnly.length > 0 && !["6", "7", "8", "9"].includes(digitsOnly[0])) {
      validationErr = "Mobile number must start with 6, 7, 8, or 9"
    }

    const value = digitsOnly.slice(0, 10)
    setFormData((prev) => ({ ...prev, phone: value }))
    sessionStorage.setItem("restaurantLoginPhone", value)
    setError(validationErr)
  }

  const handleSendOTP = async () => {
    const phoneError = validatePhone(formData.phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      setError("")
      await restaurantAPI.sendOTP(fullPhone, "login")
      sessionStorage.setItem("restaurantAuthData", JSON.stringify({
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "restaurant",
      }))
      navigate("/food/restaurant/otp")
    } catch (apiErr) {
      const errMsg = apiErr?.response?.data?.error || apiErr?.response?.data?.message || apiErr?.message || "Failed to send OTP"
      if (/not found|not registered|no account|user not found|account not found/i.test(errMsg) || apiErr?.response?.status === 404) {
        // Automatically redirect to signup/onboarding if account does not exist
        sessionStorage.setItem("restaurantAuthData", JSON.stringify({
          method: "phone",
          phone: fullPhone,
          isSignUp: true,
          module: "restaurant",
        }))
        await restaurantAPI.sendOTP(fullPhone, "register").catch(() => {})
        navigate("/food/restaurant/otp")
        return
      }
      setError(errMsg)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <FloatingAuthLayout
      theme={AUTH_THEMES.restaurant}
      logo={logoImg}
      logoAlt={`${companyName} logo`}
      brand={`${companyName} Store`}
      badge="Restaurant Partner"
      BadgeIcon={Store}
      title="Restaurant Portal"
      subtitle="Sign in with your registered mobile number to manage your outlet."
      bottomInset={keyboardInset}
      footer={
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-500">
            By continuing, you accept our{" "}
            <Link to="/food/restaurant/terms" state={{ returnTo: "/food/restaurant/login" }} className="font-black text-[#9D174D]">Terms</Link>
            {" & "}
            <Link to="/food/restaurant/privacy" state={{ returnTo: "/food/restaurant/login" }} className="font-black text-[#9D174D]">Privacy Policy</Link>
          </p>
          <p className="text-[11px] font-medium text-zinc-400">
            Secure store login powered by <span className="font-black text-zinc-600">{companyName} Network</span>
          </p>
        </div>
      }
    >
      <AuthPhoneField
        theme={AUTH_THEMES.restaurant}
        inputRef={phoneInputRef}
        value={formData.phone}
        onChange={handlePhoneChange}
        hasError={Boolean(error)}
        label="Owner Contact Number"
      />

      <AuthError message={error} />

      <AuthButton
        theme={AUTH_THEMES.restaurant}
        onClick={handleSendOTP}
        loading={isSending}
        loadingLabel="Authorizing..."
        disabled={formData.phone.length !== 10}
      >
        Continue Securely
      </AuthButton>
    </FloatingAuthLayout>
  )
}
