import { useState, useMemo } from "react"
import { exportToCSV, exportToExcel, exportToPDF, exportToJSON } from "./ordersExportUtils"
import quickSpicyLogo from "@food/assets/eqosy-logo.png"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"
const debugError = () => {}


const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatMoney = (value) => `INR ${toNumber(value).toFixed(2)}`
const formatDisplayText = (value, fallback = "N/A") => {
  if (value === null || value === undefined) return fallback
  const normalized = String(value).trim()
  return normalized || fallback
}

const formatOrderAddress = (address) => {
  if (!address || typeof address !== "object") return "Not available"

  const formattedAddress = String(address.formattedAddress || "").trim()
  const rawAddress = String(address.address || "").trim()

  const primaryParts = [
    address.label,
    address.street,
    address.additionalDetails,
    address.landmark,
    address.addressLine1,
    address.addressLine2,
    address.area,
    address.city,
    address.state,
    address.zipCode,
    address.postalCode,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)

  const orderedParts = []
  const pushPart = (value) => {
    const normalized = String(value || "").trim()
    if (!normalized) return
    const key = normalized.toLowerCase()

    const isContained = orderedParts.some((existingPart) => {
      const existingKey = existingPart.toLowerCase()
      return existingKey === key || existingKey.includes(key) || key.includes(existingKey)
    })
    if (isContained) return

    orderedParts.push(normalized)
  }

  if (formattedAddress) pushPart(formattedAddress)
  if (rawAddress && rawAddress.toLowerCase() !== formattedAddress.toLowerCase()) pushPart(rawAddress)
  primaryParts.forEach(pushPart)

  return orderedParts.join(", ") || "Not available"
}

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

const imageUrlToDataUrl = async (url) => {
  if (!url) return null
  if (url.startsWith("data:")) return url
  
  const u = String(url).trim()
  // Allow all valid URLs but handle errors gracefully
  if (!u.startsWith("http") && !u.startsWith("/")) return null

  try {
    const response = await fetch(url, { mode: 'cors', cache: "force-cache" })
    if (!response.ok) return null
    const blob = await response.blob()
    return await blobToDataUrl(blob)
  } catch (err) {
    debugError('Error converting image to data URL:', err)
    return null
  }
}

export function useOrdersManagement(orders, statusKey, title) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({
    paymentStatus: "",
    deliveryType: "",
    minAmount: "",
    maxAmount: "",
    fromDate: "",
    toDate: "",
    restaurant: "",
    zone: "",
  })
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    orderId: true,
    orderDate: true,
    orderOtp: true,
    customer: true,
    restaurant: true,
    foodItems: true,
    totalAmount: true,
    paymentType: true,
    paymentCollectionStatus: true,
    orderStatus: true,
    actions: true,
  })

  // Get unique restaurants from orders
  const restaurants = useMemo(() => {
    return [...new Set(orders.map(o => o.restaurant))]
  }, [orders])

  // Apply search and filters
  const filteredOrders = useMemo(() => {
    let result = [...orders]

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(order => {
        const safeTotal =
          order.totalAmount ??
          order.total ??
          order.pricing?.total ??
          0
        const totalStr = String(safeTotal)
        return (
          String(order.orderId || "")
            .toLowerCase()
            .includes(query) ||
          String(order.customerName || "")
            .toLowerCase()
            .includes(query) ||
          String(order.restaurant || "")
            .toLowerCase()
            .includes(query) ||
          String(order.customerPhone || "").includes(query) ||
          totalStr.includes(query)
        )
      })
    }

    // Apply filters
    if (filters.paymentStatus) {
      const wanted = filters.paymentStatus.toLowerCase()
      result = result.filter((order) => {
        const paymentStatus = String(order.paymentStatus || "").toLowerCase()
        const collectionStatus = String(order.paymentCollectionStatus || "").toLowerCase()
        return paymentStatus === wanted || collectionStatus === wanted
      })
    }

    if (filters.deliveryType) {
      result = result.filter(
        (order) => String(order.deliveryType || "").toLowerCase() === filters.deliveryType.toLowerCase(),
      )
    }

    if (filters.minAmount) {
      const min = parseFloat(filters.minAmount)
      result = result.filter(order => {
        const amount =
          order.totalAmount ??
          order.total ??
          order.pricing?.total ??
          0
        return Number(amount) >= min
      })
    }

    if (filters.maxAmount) {
      const max = parseFloat(filters.maxAmount)
      result = result.filter(order => {
        const amount =
          order.totalAmount ??
          order.total ??
          order.pricing?.total ??
          0
        return Number(amount) <= max
      })
    }

    if (filters.restaurant) {
      result = result.filter(order => order.restaurant === filters.restaurant)
    }

    if (filters.zone) {
      result = result.filter(order => String(order.zoneId || "") === filters.zone)
    }

    // Helper function to parse date format "16 JUL 2025"
    const parseOrderDate = (dateStr) => {
      const months = {
        "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04", "MAY": "05", "JUN": "06",
        "JUL": "07", "AUG": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"
      }
      const parts = dateStr.split(" ")
      if (parts.length === 3) {
        const day = parts[0].padStart(2, "0")
        const month = months[parts[1].toUpperCase()] || "01"
        const year = parts[2]
        return new Date(`${year}-${month}-${day}`)
      }
      return new Date(dateStr)
    }

    if (filters.fromDate) {
      result = result.filter(order => {
        const orderDate = parseOrderDate(order.date)
        const fromDate = new Date(filters.fromDate)
        return orderDate >= fromDate
      })
    }

    if (filters.toDate) {
      result = result.filter(order => {
        const orderDate = parseOrderDate(order.date)
        const toDate = new Date(filters.toDate)
        toDate.setHours(23, 59, 59, 999) // Include entire day
        return orderDate <= toDate
      })
    }

    return result
  }, [orders, searchQuery, filters])

  const count = filteredOrders.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => value !== "").length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({
      paymentStatus: "",
      deliveryType: "",
      minAmount: "",
      maxAmount: "",
      fromDate: "",
      toDate: "",
      restaurant: "",
      zone: "",
    })
  }

  const handleExport = (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "csv":
        exportToCSV(filteredOrders, filename)
        break
      case "excel":
        exportToExcel(filteredOrders, filename)
        break
      case "pdf":
        exportToPDF(filteredOrders, filename)
        break
      case "json":
        exportToJSON(filteredOrders, filename)
        break
      default:
        break
    }
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOrderOpen(true)
  }

  const handlePrintOrder = async (order) => {
    if (!order) return
    try {
      const orderId = order.orderId || order.id || order.subscriptionId || "N/A"
      const orderDate = order.date && order.time
        ? `${order.date}, ${order.time}`
        : (order.date || new Date().toLocaleDateString())

      const settings = getCachedSettings() || await loadBusinessSettings()
      const companyName = settings?.companyName || "Eqosy Food"

      const items = Array.isArray(order.items) ? order.items : []
      const itemsSubtotal = items.reduce((sum, item) => {
        const qty = toNumber(item?.quantity || 1)
        const unitPrice = toNumber(item?.price)
        return sum + (qty * unitPrice)
      }, 0)
      const subtotal = itemsSubtotal > 0
        ? itemsSubtotal
        : toNumber(
            order.totalItemAmount ??
            order.subtotal ??
            order.pricing?.subtotal ??
            order.totalAmount
          )
      const deliveryFee = toNumber(
        order.deliveryCharge ??
        order.deliveryFee ??
        order.pricing?.deliveryFee ??
        order.delivery?.fee
      )
      const taxAmount = toNumber(
        order.vatTax ??
        order.taxAmount ??
        order.tax ??
        order.pricing?.tax
      )
      const discountAmount = toNumber(
        order.couponDiscount ??
        order.itemDiscount ??
        order.discountAmount ??
        order.pricing?.discount
      )
      const computedTotal = subtotal + deliveryFee + taxAmount - discountAmount
      const totalAmount = toNumber(
        order.totalAmount ??
        order.pricing?.total ??
        computedTotal
      )
      const paymentType = order.paymentType || order.payment?.method || order.paymentMethod || "N/A"
      const deliveryPartnerName = formatDisplayText(
        order.deliveryPartnerName ||
        order.deliveryBoyName ||
        order.deliveryPartnerId?.name ||
        order.dispatch?.deliveryPartnerId?.name,
      )
      const deliveryPartnerPhone = formatDisplayText(
        order.deliveryPartnerPhone ||
        order.deliveryBoyNumber ||
        order.deliveryPartnerId?.phone ||
        order.dispatch?.deliveryPartnerId?.phone,
      )
      const orderStatus = formatDisplayText(order.orderStatus || order.status)
      const paymentStatus = formatDisplayText(
        order.paymentStatus
          || order.paymentCollectionStatus
          || (paymentType === "Cash on Delivery" ? "Not Collected" : null),
      )
      const customerName = formatDisplayText(order.customerName)
      const customerPhone = formatDisplayText(order.customerPhone)
      const restaurantName = formatDisplayText(order.restaurant)
      const deliveryType = formatDisplayText(order.deliveryType)
      const deliveryAddress = formatOrderAddress(order.address || order.customerAddress || order.deliveryAddress)
      const otpCode = order.orderOtp || ""

      // 1. Open browser native print window
      try {
        const printWindow = window.open("", "_blank", "width=850,height=900")
        if (printWindow) {
          const itemsRows = items.length > 0
            ? items.map(item => `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${item.quantity || 1}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${item.name || item.itemName || item.title || 'Item'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${toNumber(item.price).toFixed(2)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">₹${(toNumber(item.quantity || 1) * toNumber(item.price)).toFixed(2)}</td>
              </tr>
            `).join("")
            : `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #64748b;">Order Total: ₹${totalAmount.toFixed(2)}</td></tr>`

          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Order Invoice #${orderId}</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; color: #0f172a; background: #fff; }
                .header { background: #0f766e; color: #ffffff; padding: 20px 24px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
                .header p { margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; }
                .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
                .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
                .card-title { font-size: 11px; font-weight: 700; color: #0f766e; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 8px; }
                .card p { margin: 4px 0; font-size: 12px; line-height: 1.4; }
                .card strong { color: #475569; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
                th { background: #0f766e; color: #ffffff; padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; }
                .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 24px; }
                .totals { width: 280px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
                .totals-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
                .totals-row.grand { font-weight: 700; font-size: 16px; color: #0f766e; border-top: 2px solid #0f766e; padding-top: 10px; margin-top: 6px; }
                .otp-badge { background: #fff7ed; border: 1px solid #ffedd5; color: #c2410c; padding: 8px 14px; border-radius: 8px; font-weight: 700; display: inline-block; margin-bottom: 20px; font-size: 14px; }
                .footer { border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #64748b; text-align: center; margin-top: 30px; }
                @media print {
                  body { padding: 0; }
                  .no-print { display: none !important; }
                }
              </style>
            </head>
            <body>
              <div class="no-print" style="margin-bottom: 20px; text-align: right;">
                <button onclick="window.print()" style="background: #0f766e; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px;">🖨️ Print Order Invoice</button>
              </div>

              <div class="header">
                <div>
                  <h1>${companyName}</h1>
                  <p>Order Summary & Billing Receipt</p>
                </div>
                <div style="text-align: right;">
                  <h2 style="margin: 0; font-size: 18px; font-weight: 700;">Order #${orderId}</h2>
                  <p>${orderDate}</p>
                </div>
              </div>

              ${otpCode ? `<div class="otp-badge">🔑 Handover Code (OTP): <strong>${otpCode}</strong></div>` : ''}

              <div class="info-grid">
                <div class="card">
                  <div class="card-title">Customer Info</div>
                  <p><strong>Name:</strong> ${customerName}</p>
                  <p><strong>Phone:</strong> ${customerPhone}</p>
                  <p><strong>Address:</strong> ${deliveryAddress}</p>
                </div>
                <div class="card">
                  <div class="card-title">Restaurant Info</div>
                  <p><strong>Name:</strong> ${restaurantName}</p>
                  <p><strong>Delivery:</strong> ${deliveryType}</p>
                  <p><strong>Status:</strong> ${orderStatus}</p>
                </div>
                <div class="card">
                  <div class="card-title">Delivery & Payment</div>
                  <p><strong>Driver:</strong> ${deliveryPartnerName}</p>
                  <p><strong>Driver Phone:</strong> ${deliveryPartnerPhone}</p>
                  <p><strong>Payment:</strong> ${paymentType} (${paymentStatus})</p>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style="width: 60px; text-align: center;">Qty</th>
                    <th>Item Description</th>
                    <th style="width: 110px; text-align: right;">Unit Price</th>
                    <th style="width: 110px; text-align: right;">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows}
                </tbody>
              </table>

              <div class="totals-wrap">
                <div class="totals">
                  <div class="totals-row"><span>Subtotal:</span> <span>₹${subtotal.toFixed(2)}</span></div>
                  <div class="totals-row"><span>Delivery Fee:</span> <span>₹${deliveryFee.toFixed(2)}</span></div>
                  <div class="totals-row"><span>Tax (GST):</span> <span>₹${taxAmount.toFixed(2)}</span></div>
                  ${discountAmount > 0 ? `<div class="totals-row"><span>Discount:</span> <span>- ₹${discountAmount.toFixed(2)}</span></div>` : ''}
                  <div class="totals-row grand"><span>Grand Total:</span> <span>₹${totalAmount.toFixed(2)}</span></div>
                </div>
              </div>

              <div class="footer">
                Thank you for ordering with ${companyName}!
              </div>

              <script>
                window.onload = function() {
                  setTimeout(function() {
                    window.print();
                  }, 300);
                };
              </script>
            </body>
            </html>
          `)
          printWindow.document.close()
        }
      } catch (printErr) {
        debugError("Browser print window error:", printErr)
      }

      // 2. Also generate PDF download via jsPDF
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const logoUrl = settings?.logo?.url || quickSpicyLogo
      const logoDataUrl = await imageUrlToDataUrl(logoUrl)

      doc.setFillColor(15, 118, 110)
      doc.rect(0, 0, pageWidth, 46, "F")

      if (logoDataUrl) {
        try {
          const logoFormat = logoDataUrl.includes("image/jpeg") || logoDataUrl.includes("image/jpg") ? "JPEG" : "PNG"
          doc.addImage(logoDataUrl, logoFormat, 14, 8, 24, 24, undefined, "FAST")
        } catch (_) {}
      }

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(17)
      doc.setFont(undefined, "bold")
      doc.text(companyName, logoDataUrl ? 42 : 14, 17)
      doc.setFontSize(10)
      doc.setFont(undefined, "normal")
      doc.text("Order Invoice", logoDataUrl ? 42 : 14, 24)
      doc.setFontSize(8.5)
      doc.text("Admin order summary with billing and delivery details", logoDataUrl ? 42 : 14, 30)

      doc.setFontSize(9)
      doc.text(`Invoice #: ${orderId}`, pageWidth - 14, 14, { align: "right" })
      doc.text(`Date: ${orderDate}`, pageWidth - 14, 20, { align: "right" })
      doc.text(`Status: ${orderStatus}`, pageWidth - 14, 26, { align: "right" })
      doc.text(`Payment: ${paymentStatus}`, pageWidth - 14, 32, { align: "right" })

      const tableBody = items.length > 0
        ? items.map((item) => {
          const qty = toNumber(item.quantity || 1)
          const title = item.name || item.itemName || item.title || "Item"
          const unitPrice = toNumber(item.price)
          const lineTotal = qty * unitPrice
          return [qty, title, `INR ${unitPrice.toFixed(2)}`, `INR ${lineTotal.toFixed(2)}`]
        })
        : [[1, "Order Total", `INR ${totalAmount.toFixed(2)}`, `INR ${totalAmount.toFixed(2)}`]]

      autoTable(doc, {
        startY: 55,
        head: [["Qty", "Item", "Unit Price", "Line Total"]],
        body: tableBody,
        theme: "grid",
        headStyles: {
          fillColor: [15, 118, 110],
          textColor: 255,
          fontSize: 9,
          fontStyle: "bold",
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [30, 41, 59],
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        styles: {
          cellPadding: 3.2,
          lineColor: [226, 232, 240],
          lineWidth: 0.3,
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 18 },
          1: { cellWidth: 94 },
          2: { halign: "right", cellWidth: 36 },
          3: { halign: "right", cellWidth: 38 },
        },
        margin: { left: 14, right: 14 },
      })

      const summaryStartY = (doc.lastAutoTable?.finalY || 130) + 10
      doc.setDrawColor(226, 232, 240)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(pageWidth - 92, summaryStartY - 5, 78, 35, 2, 2, "FD")
      autoTable(doc, {
        startY: summaryStartY,
        body: [
          ["Subtotal", `INR ${subtotal.toFixed(2)}`],
          ["Delivery Fee", `INR ${deliveryFee.toFixed(2)}`],
          ["Tax", `INR ${taxAmount.toFixed(2)}`],
          ["Discount", `- INR ${discountAmount.toFixed(2)}`],
          ["Grand Total", `INR ${totalAmount.toFixed(2)}`],
        ],
        theme: "plain",
        styles: {
          fontSize: 10,
          textColor: [30, 41, 59],
          cellPadding: 1.8,
        },
        columnStyles: {
          0: { cellWidth: 34, fontStyle: "bold" },
          1: { cellWidth: 40, halign: "right" },
        },
        margin: { left: pageWidth - 88 },
        didParseCell: (hookData) => {
          if (hookData.row.index === 4) {
            hookData.cell.styles.fontStyle = "bold"
            hookData.cell.styles.fontSize = 11
            hookData.cell.styles.textColor = [15, 118, 110]
          }
        },
      })

      const filename = `Invoice_${orderId}_${new Date().toISOString().split("T")[0]}.pdf`
      doc.save(filename)
    } catch (error) {
      debugError("Error generating PDF invoice:", error)
      alert("Failed to download PDF invoice. Please try again.")
    }
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      orderId: true,
      orderDate: true,
      orderOtp: true,
      customer: true,
      restaurant: true,
      foodItems: true,
      totalAmount: true,
      paymentType: true,
      paymentCollectionStatus: true,
      orderStatus: true,
      actions: true,
    })
  }

  return {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    visibleColumns,
    filteredOrders,
    count,
    activeFiltersCount,
    restaurants,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}


