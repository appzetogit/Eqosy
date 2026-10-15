/**
 * Small note shown under a withdrawal's status in admin lists:
 * - whether the user's bank/UPI account passed the ownership check (penny drop + name match)
 * - the automatic RazorpayX payout state (processing / paid with UTR / failed with reason)
 */
const ACCOUNT_LABELS = {
  verified: ["text-emerald-700", "Account verified"],
  pending: ["text-amber-700", "Verification in progress"],
  name_mismatch: ["text-red-600", "Name mismatch"],
  failed: ["text-red-600", "Verification failed"],
  unverified: ["text-slate-500", "Account not verified"],
}

const PAYOUT_LABELS = {
  queued: ["text-amber-700", "Payout queued"],
  pending: ["text-amber-700", "Payout pending"],
  processing: ["text-amber-700", "Payout processing"],
  processed: ["text-emerald-700", "Paid"],
  failed: ["text-red-600", "Payout failed"],
  reversed: ["text-red-600", "Payout reversed"],
  cancelled: ["text-red-600", "Payout cancelled"],
  rejected: ["text-red-600", "Payout rejected"],
}

export default function PayoutStatusNote({ verification, payout }) {
  const account = ACCOUNT_LABELS[verification?.status || "unverified"] || ACCOUNT_LABELS.unverified
  const payoutLabel = payout?.status ? PAYOUT_LABELS[payout.status] : null

  return (
    <div className="mt-1 space-y-0.5 text-[11px] leading-tight">
      <p className={account[0]} title={verification?.failureReason || ""}>
        {account[1]}
        {verification?.status === "verified" && verification?.registeredName ? ` · ${verification.registeredName}` : ""}
      </p>
      {payoutLabel ? (
        <p className={payoutLabel[0]} title={payout?.failureReason || ""}>
          {payoutLabel[1]}
          {payout?.status === "processed" && payout?.utr ? ` · UTR ${payout.utr}` : ""}
          {["failed", "reversed", "cancelled", "rejected"].includes(payout?.status) && payout?.failureReason
            ? ` · ${payout.failureReason}`
            : ""}
        </p>
      ) : null}
    </div>
  )
}
