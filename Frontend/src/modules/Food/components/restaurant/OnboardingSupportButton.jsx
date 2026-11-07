import { useState } from "react"
import { Headset } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
import { restaurantAPI } from "@food/api"

/**
 * "Support" button for restaurants that want to onboard or are stuck during registration.
 * Sends the message to admins (shows up in Admin > Support Tickets).
 */
export default function OnboardingSupportButton({
  defaultPhone = "",
  defaultName = "",
  defaultEmail = "",
  className = "",
  label = "Support",
}) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({
    name: defaultName,
    phone: defaultPhone,
    email: defaultEmail,
    message: "",
  })

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleOpenChange = (next) => {
    if (next) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || defaultName,
        phone: prev.phone || defaultPhone,
        email: prev.email || defaultEmail,
      }))
    }
    setOpen(next)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (sending) return
    const phone = String(form.phone || "").replace(/\D/g, "").slice(-10)
    if (!form.name.trim()) return toast.error("Please enter your name")
    if (phone.length !== 10) return toast.error("Enter a valid 10 digit phone number")
    if (!form.message.trim()) return toast.error("Please describe your problem")

    setSending(true)
    try {
      await restaurantAPI.sendOnboardingSupportRequest({
        name: form.name.trim(),
        phone,
        email: form.email.trim(),
        message: form.message.trim(),
      })
      toast.success("Message sent to support. We will contact you soon.")
      setForm((prev) => ({ ...prev, message: "" }))
      setOpen(false)
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || "Could not send your message. Please try again."
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => handleOpenChange(true)}
        className={`flex items-center gap-1.5 text-xs border-orange-300 text-orange-700 hover:bg-orange-50 ${className}`}
      >
        <Headset className="w-4 h-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contact support</DialogTitle>
            <DialogDescription>
              Want to join us, or facing a problem while registering? Tell us and our team will get
              back to you.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Your name"
              maxLength={100}
            />
            <Input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Phone number"
              inputMode="numeric"
            />
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="Email (optional)"
              maxLength={150}
            />
            <textarea
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
              placeholder="Describe your problem or question"
              rows={4}
              maxLength={2000}
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
            />
            <Button type="submit" disabled={sending} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
              {sending ? "Sending..." : "Send to support"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
