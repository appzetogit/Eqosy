const toArray = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === "object") return Object.values(value)
  return []
}

export const normalizeFoodVariants = (value) =>
  toArray(value)
    .map((entry = {}, index) => {
      if (typeof entry === "string") {
        const trimmed = entry.trim()
        if (!trimmed) return null
        return { id: `variant-${index}`, _id: `variant-${index}`, name: trimmed, price: 0 }
      }
      const id = String(entry?.id || entry?._id || `variant-${index}`)
      const name = String(entry?.name || entry?.title || entry?.variantName || entry?.label || entry?.size || "").trim()
      const rawPrice = entry?.price ?? entry?.variantPrice ?? entry?.additionalPrice
      const price = Number(rawPrice)
      if (!name) return null
      const validPrice = Number.isFinite(price) && price >= 0 ? price : 0

      return {
        id,
        _id: id,
        name,
        price: validPrice,
      }
    })
    .filter(Boolean)

export const getFoodVariants = (item = {}) => {
  if (!item) return []
  const rawVariants =
    (Array.isArray(item.variants) && item.variants.length > 0 ? item.variants : null) ||
    (Array.isArray(item.variations) && item.variations.length > 0 ? item.variations : null) ||
    (Array.isArray(item.options) && item.options.length > 0 ? item.options : null) ||
    (Array.isArray(item.sizes) && item.sizes.length > 0 ? item.sizes : null) ||
    (Array.isArray(item.variantList) && item.variantList.length > 0 ? item.variantList : null) ||
    []
  return normalizeFoodVariants(rawVariants)
}

export const hasFoodVariants = (item = {}) => getFoodVariants(item).length > 0

export const getDefaultFoodVariant = (item = {}) => getFoodVariants(item)[0] || null

export const getFoodDisplayPrice = (item = {}) => {
  const variants = getFoodVariants(item)
  if (variants.length > 0) {
    return Math.min(...variants.map((variant) => Number(variant.price) || 0))
  }

  const price = Number(item?.price)
  return Number.isFinite(price) ? price : 0
}

export const getFoodPriceLabel = (item = {}) => {
  const price = getFoodDisplayPrice(item)
  return hasFoodVariants(item) ? `Starting from ₹${Math.round(price)}` : `₹${Math.round(price)}`
}

export const buildCartLineId = (itemId, variantId = "") =>
  `${String(itemId || "")}::${String(variantId || "base")}`
