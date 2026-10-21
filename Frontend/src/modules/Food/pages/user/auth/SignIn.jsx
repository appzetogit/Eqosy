import { useState, useEffect, useRef } from "react"
import { useNavigate, Link, useSearchParams } from "react-router-dom"
import { UtensilsCrossed } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { authAPI } from "@food/api"
import { useCompanyName } from "@food/hooks/useCompanyName"
import logoImg from "@food/assets/eqosy-logo.png"
import FloatingAuthLayout, { AUTH_THEMES, AuthButton, AuthError, AuthPhoneField } from "@/shared/components/auth/FloatingAuthLayout"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }


export default function SignIn() {
  const navigate = useNavigate()
  const companyName = useCompanyName()
  const [searchParams] = useSearchParams()

  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91", // required; default +91 for India
  })
  const [agreedTerms, setAgreedTerms] = useState(true)

  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const submittingRef = useRef(false)

  const handleClose = () => {
    navigate("/food/user", { replace: true })
  }

  useEffect(() => {
    const stored = sessionStorage.getItem("userAuthData")
    if (!stored) return

    try {
      const data = JSON.parse(stored)
      const fullPhone = String(data.phone || "").trim()
      const phoneDigits = fullPhone.replace(/^\+91\s*/, "").replace(/\D/g, "").slice(0, 10)

      setFormData((prev) => ({
        ...prev,
        phone: phoneDigits || prev.phone,
      }))
    } catch (err) {
      debugError("Error parsing stored auth data:", err)
    }
  }, [])

  const validatePhone = (phone) => {
    if (!phone.trim()) return "Phone number is required"
    const cleanPhone = phone.replace(/\D/g, "")
    if (!/^\d{10}$/.test(cleanPhone)) return "Phone number must be exactly 10 digits"
    return ""
  }

  const handleChange = (e) => {
    const { name } = e.target
    let { value } = e.target

    if (name === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10)
      setError(validatePhone(value))
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const phoneError = validatePhone(formData.phone)
    setError(phoneError)
    if (phoneError) return
    if (submittingRef.current) return
    submittingRef.current = true
    setIsLoading(true)
    setError("")

    try {
      const countryCode = formData.countryCode?.trim() || "+91"
      const phoneDigits = String(formData.phone ?? "").replace(/\D/g, "").slice(0, 10)
      if (phoneDigits.length !== 10) {
        setError("Phone number must be exactly 10 digits")
        setIsLoading(false)
        submittingRef.current = false
        return
      }
      const fullPhone = `${countryCode} ${phoneDigits}`
      const response = await authAPI.sendOTP(fullPhone, "login", null)
      const responseData = response?.data?.data || response?.data || {}

      const ref = String(searchParams.get("ref") || "").trim()
      const authData = {
        method: "phone",
        phone: fullPhone,
        email: null,
        name: null,
        referralCode: ref || null,
        isSignUp: false,
        expectedNewUser: responseData?.isExistingUser === false || responseData?.needsNamePrompt === true,
        module: "user",
      }

      sessionStorage.setItem("userAuthData", JSON.stringify(authData))
      navigate("/food/user/auth/otp")
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <AnimatedPage className="min-h-[100dvh]">
      <FloatingAuthLayout
        theme={AUTH_THEMES.food}
        logo={logoImg}
        logoAlt={`${companyName} logo`}
        brand={companyName}
        badge="Food"
        BadgeIcon={UtensilsCrossed}
        title="Hungry? Let's go"
        subtitle="Enter your mobile number and get your favourites delivered."
        onBack={handleClose}
        footer={
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            By joining, you agree to our{" "}
            <Link to="/terms" target="_blank" className="font-black text-[#7A3410]">Terms of Service</Link>
            {" & "}
            <Link to="/privacy" target="_blank" className="font-black text-[#7A3410]">Privacy Policy</Link>
          </p>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <AuthPhoneField
            theme={AUTH_THEMES.food}
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            hasError={Boolean(error)}
            placeholder="Mobile Number"
          />

          <AuthError message={error} />

          <label htmlFor="foodSignInTerms" className="flex cursor-pointer select-none items-start gap-2.5 px-1 text-xs font-medium leading-relaxed text-zinc-600">
            <input
              type="checkbox"
              id="foodSignInTerms"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-zinc-300 accent-[#D9661A]"
            />
            <span>I agree to the Terms of Service and Privacy Policy</span>
          </label>

          <AuthButton
            theme={AUTH_THEMES.food}
            type="submit"
            loading={isLoading}
            loadingLabel="Verifying..."
            disabled={!agreedTerms || formData.phone.length !== 10}
          >
            Continue
          </AuthButton>
        </form>
      </FloatingAuthLayout>
    </AnimatedPage>
  )
}
