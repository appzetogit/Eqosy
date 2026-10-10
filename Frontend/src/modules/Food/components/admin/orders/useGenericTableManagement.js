import { useState, useMemo } from "react"
import { exportToExcel, exportToPDF } from "./ordersExportUtils"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export function useGenericTableManagement(data, title, searchFields = []) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({})
  const [visibleColumns, setVisibleColumns] = useState({})

  // Apply search
  const filteredData = useMemo(() => {
    let result = [...data]

    // Apply search query
    if (searchQuery.trim() && searchFields.length > 0) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(item => 
        searchFields.some(field => {
          const value = item[field]
          return value && value.toString().toLowerCase().includes(query)
        })
      )
    }

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "") {
        result = result.filter(item => {
          const itemValue = item[key]
          if (typeof value === 'string') {
            return itemValue === value || itemValue?.toString().toLowerCase() === value.toLowerCase()
          }
          return itemValue === value
        })
      }
    })

    return result
  }, [data, searchQuery, filters, searchFields])

  const count = filteredData.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => value !== "" && value !== null && value !== undefined).length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({})
  }

  const handleExport = async (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "excel":
        exportToExcel(filteredData, filename)
        break
      case "pdf":
        await exportToPDF(filteredData, filename)
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
      const orderId = order.orderId || order.id || order.subscriptionId || 'N/A'
      const orderDate = order.date && order.time ? `${order.date}, ${order.time}` : (order.date || new Date().toLocaleDateString())
      const customerName = order.customerName || 'N/A'
      const customerPhone = order.customerPhone || 'N/A'
      const restaurantName = order.restaurant || 'N/A'
      const orderStatus = order.orderStatus || order.status || 'N/A'
      const paymentStatus = order.paymentStatus || 'N/A'
      const totalAmountNum = typeof order.totalAmount === 'number' ? order.totalAmount : Number(order.totalAmount || 0)
      const items = Array.isArray(order.items) ? order.items : []

      // 1. Open browser print window
      try {
        const printWindow = window.open("", "_blank", "width=850,height=900")
        if (printWindow) {
          const itemsRows = items.length > 0
            ? items.map(item => {
              const qty = item.quantity || 1
              const price = Number(item.price || 0)
              return `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${qty}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${item.name || item.itemName || item.title || 'Item'}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${price.toFixed(2)}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">₹${(qty * price).toFixed(2)}</td>
                </tr>
              `
            }).join("")
            : `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #64748b;">Total Amount: ₹${totalAmountNum.toFixed(2)}</td></tr>`

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
                .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
                .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
                .card-title { font-size: 11px; font-weight: 700; color: #0f766e; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 8px; }
                .card p { margin: 4px 0; font-size: 12px; line-height: 1.4; }
                .card strong { color: #475569; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
                th { background: #0f766e; color: #ffffff; padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; }
                .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 24px; }
                .totals { width: 260px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
                .totals-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; font-weight: 700; color: #0f766e; }
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
                  <h1>Eqosy Food</h1>
                  <p>Order Summary & Billing Receipt</p>
                </div>
                <div style="text-align: right;">
                  <h2 style="margin: 0; font-size: 18px; font-weight: 700;">Order #${orderId}</h2>
                  <p>${orderDate}</p>
                </div>
              </div>

              <div class="info-grid">
                <div class="card">
                  <div class="card-title">Customer Info</div>
                  <p><strong>Name:</strong> ${customerName}</p>
                  <p><strong>Phone:</strong> ${customerPhone}</p>
                </div>
                <div class="card">
                  <div class="card-title">Order Info</div>
                  <p><strong>Restaurant:</strong> ${restaurantName}</p>
                  <p><strong>Order Status:</strong> ${orderStatus}</p>
                  <p><strong>Payment Status:</strong> ${paymentStatus}</p>
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
                  <div class="totals-row"><span>Total Amount:</span> <span>₹${totalAmountNum.toFixed(2)}</span></div>
                </div>
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

      // 2. Download PDF file
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      // Add title
      doc.setFontSize(18)
      doc.setTextColor(30, 30, 30)
      doc.text('Order Invoice', 105, 20, { align: 'center' })
      
      doc.setFontSize(12)
      doc.setTextColor(100, 100, 100)
      doc.text(`Order ID: ${orderId}`, 105, 28, { align: 'center' })
      
      doc.setFontSize(10)
      doc.text(`Date: ${orderDate}`, 105, 34, { align: 'center' })
      
      let startY = 45
      
      if (order.customerName || order.customerPhone) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Customer Information', 14, startY)
        startY += 8
        
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        if (order.customerName) {
          doc.text(`Name: ${order.customerName}`, 14, startY)
          startY += 6
        }
        if (order.customerPhone) {
          doc.text(`Phone: ${order.customerPhone}`, 14, startY)
          startY += 6
        }
        startY += 5
      }
      
      if (order.restaurant) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Restaurant', 14, startY)
        startY += 8
        
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        doc.text(order.restaurant, 14, startY)
        startY += 10
      }
      
      if (items.length > 0) {
        const tableData = items.map((item) => [
          item.quantity || 1,
          item.name || item.itemName || item.title || 'Unknown Item',
          `INR ${Number(item.price || 0).toFixed(2)}`,
          `INR ${(Number(item.quantity || 1) * Number(item.price || 0)).toFixed(2)}`
        ])
        
        autoTable(doc, {
          startY: startY,
          head: [['Qty', 'Item Name', 'Price', 'Total']],
          body: tableData,
          theme: 'striped',
          headStyles: {
            fillColor: [15, 118, 110],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 10
          },
          bodyStyles: {
            fontSize: 9,
            textColor: [30, 30, 30]
          },
          alternateRowStyles: {
            fillColor: [245, 247, 250]
          },
          styles: {
            cellPadding: 4,
            lineColor: [200, 200, 200],
            lineWidth: 0.5
          },
          columnStyles: {
            0: { cellWidth: 20, halign: 'center' },
            1: { cellWidth: 80 },
            2: { cellWidth: 35, halign: 'right' },
            3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
          },
          margin: { left: 14, right: 14 }
        })
        
        startY = doc.lastAutoTable.finalY + 10
      }
      
      if (totalAmountNum) {
        doc.setFontSize(14)
        doc.setTextColor(30, 30, 30)
        doc.setFont(undefined, 'bold')
        doc.text(`Total Amount: INR ${totalAmountNum.toFixed(2)}`, 14, startY)
        startY += 8
      }
      
      if (order.paymentStatus) {
        doc.setFontSize(10)
        doc.setTextColor(100, 100, 100)
        doc.setFont(undefined, 'normal')
        doc.text(`Payment Status: ${order.paymentStatus}`, 14, startY)
        startY += 6
      }
      
      if (order.orderStatus) {
        doc.setFontSize(10)
        doc.text(`Order Status: ${order.orderStatus}`, 14, startY)
      }
      
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

  const resetColumns = (defaultColumns) => {
    setVisibleColumns(defaultColumns || {})
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
    filteredData,
    count,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}

