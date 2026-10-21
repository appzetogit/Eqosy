import { useState, useEffect, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { deliveryAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { Bike } from "lucide-react"
import logoImg from "@food/assets/eqosy-logo.png"
import FloatingAuthLayout, { AUTH_THEMES, AuthButton, AuthError, AuthPhoneField } from "@/shared/components/auth/FloatingAuthLayout"

export default function DeliverySignIn() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const phoneInputRef = useRef(null)
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    const stored = sessionStorage.getItem("deliveryAuthData")
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.phone) {
          const phoneDigits = data.phone.replace("+91", "").trim()
          setFormData(prev => ({ ...prev, phone: phoneDigits }))
        }
      } catch (err) { }
    }
  }, [])

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
    if (!phone || phone.trim() === "") return "Phone number required"
    const digitsOnly = phone.replace(/\D/g, "")
    if (digitsOnly.length !== 10) return "Must be 10 digits"
    if (!["6", "7", "8", "9"].includes(digitsOnly[0])) return "Invalid number"
    return ""
  }

  const handleSendOTP = async () => {
    setError("")
    const phoneError = validatePhone(formData.phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      clearModuleAuth("delivery")
      await deliveryAPI.sendOTP(fullPhone, "login")
      sessionStorage.setItem("deliveryAuthData", JSON.stringify({
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        purpose: "login",
        module: "delivery",
      }))
      navigate("/food/delivery/otp")
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to send OTP")
    } finally {
      setIsSending(false)
    }
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10)
    setFormData(prev => ({ ...prev, phone: value }))
    if (error) setError(validatePhone(value))
  }

  return (
    <FloatingAuthLayout
      theme={AUTH_THEMES.delivery}
      logo={logoImg}
      logoAlt={`${companyName} logo`}
      brand={`${companyName} Partner`}
      badge="Delivery Partner"
      BadgeIcon={Bike}
      title="Start your shift"
      subtitle="Enter your mobile number to sign in and go online."
      bottomInset={keyboardInset}
      footer={
        <p className="text-xs font-medium leading-relaxed text-zinc-500">
          By continuing you agree to the{" "}
          <Link to="/food/delivery/terms" target="_blank" className="font-black text-[#15803D]">Delivery Charter</Link>
          {" & "}
          <Link to="/food/pages/delivery-privacy" target="_blank" className="font-black text-[#15803D]">Privacy Policy</Link>
        </p>
      }
    >
      <AuthPhoneField
        theme={AUTH_THEMES.delivery}
        inputRef={phoneInputRef}
        value={formData.phone}
        onChange={handlePhoneChange}
        hasError={Boolean(error)}
        label="Linked Identity"
        placeholder="Mobile Number"
      />

      <AuthError message={error} />

      <AuthButton
        theme={AUTH_THEMES.delivery}
        onClick={handleSendOTP}
        loading={isSending}
        loadingLabel="Checking..."
        disabled={formData.phone.length !== 10}
      >
        Go Online
      </AuthButton>
    </FloatingAuthLayout>
  )
}
