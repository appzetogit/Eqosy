export const determineIsVeg = (item) => {
  if (!item) return true;

  // Explicit boolean checks first
  if (item.isVeg === true || item.veg === true || item.is_veg === true || item.is_veg === 1) return true;
  if (item.isVeg === false || item.veg === false || item.is_veg === false || item.is_veg === 0) return false;

  // Check foodType string
  const foodType = String(item.foodType || item.food_type || item.type || item.category || '').toLowerCase().trim();
  if (foodType === 'veg' || foodType === 'vegetarian') return true;
  if (foodType === 'non-veg' || foodType === 'nonveg' || foodType === 'non-vegetarian' || foodType === 'egg') return false;

  // Fallback to name inspection for non-veg keywords
  const name = String(item.name || item.foodName || '').toLowerCase();
  const nonVegKeywords = ['chicken', 'mutton', 'fish', 'prawn', 'egg', 'lamb', 'beef', 'pork', 'keema', 'biryani', 'kabab', 'kebab', 'tandoori', 'tikka', 'shorma', 'shawarma', 'meat', 'wings', 'lollipop'];
  if (nonVegKeywords.some((kw) => name.includes(kw))) {
    return false;
  }

  return true;
};

const normalizeItem = (item = {}, sectionName = "", subsectionName = "") => {
  const isVeg = determineIsVeg(item);
  return {
    ...item,
    id: String(item?.id || item?._id || ""),
    sectionName,
    subsectionName,
    image: item?.image || item?.images?.[0] || "",
    name: item?.name || "Unnamed Item",
    category: item?.category || sectionName || "Varieties",
    isVeg,
    foodType: item?.foodType || (isVeg ? "Veg" : "Non-Veg"),
    price: getFoodDisplayPrice(item),
    rating: Number(item?.rating || 0),
    reviews: Number(item?.reviews || 0),
    stock: item?.stock || "Unlimited",
    approvalStatus: item?.approvalStatus || "pending",
    isAvailable: item?.isAvailable !== false,
    variants: getFoodVariants(item),
    variations: getFoodVariants(item),
  };
};

export const flattenMenuItems = (menu) => {
  if (!menu || !Array.isArray(menu.sections)) return []

  const items = []
  menu.sections.forEach((section = {}) => {
    const sectionName = section?.name || "Unknown Section"

    ;(section?.items || []).forEach((item = {}) => {
      items.push(normalizeItem(item, sectionName, ""))
    })

    ;(section?.subsections || []).forEach((subsection = {}) => {
      const subsectionName = subsection?.name || "Unknown Subsection"
      ;(subsection?.items || []).forEach((item = {}) => {
        items.push(normalizeItem(item, sectionName, subsectionName))
      })
    })
  })

  return items
}

export const getMenuFromResponse = (response) => {
  if (!response) return null;
  const data = response?.data?.data || response?.data || response;
  if (data?.menu) return data.menu;
  if (data?.sections) return data;
  return data;
};

export const findItemInSections = (sections = [], targetId) => {
  const wantedId = String(targetId || "")
  if (!wantedId || !Array.isArray(sections)) return null

  for (let sIdx = 0; sIdx < sections.length; sIdx += 1) {
    const section = sections[sIdx] || {}
    const sectionItems = Array.isArray(section.items) ? section.items : []

    for (let iIdx = 0; iIdx < sectionItems.length; iIdx += 1) {
      const item = sectionItems[iIdx]
      if (String(item?.id || item?._id || "") === wantedId) {
        return { sectionIndex: sIdx, itemIndex: iIdx, inSubsection: false }
      }
    }

    const subsections = Array.isArray(section.subsections) ? section.subsections : []
    for (let ssIdx = 0; ssIdx < subsections.length; ssIdx += 1) {
      const subsection = subsections[ssIdx] || {}
      const subsectionItems = Array.isArray(subsection.items) ? subsection.items : []
      for (let iIdx = 0; iIdx < subsectionItems.length; iIdx += 1) {
        const item = subsectionItems[iIdx]
        if (String(item?.id || item?._id || "") === wantedId) {
          return {
            sectionIndex: sIdx,
            subsectionIndex: ssIdx,
            itemIndex: iIdx,
            inSubsection: true,
          }
        }
      }
    }
  }

  return null
}
