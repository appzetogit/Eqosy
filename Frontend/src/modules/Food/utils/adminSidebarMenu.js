export const adminSidebarMenu = [
  {
    type: "expandable",
    label: "Admin Management",
    icon: "UserCog",
    resource: "subadmins",
    subItems: [
      {
        label: "Admins",
        path: "/admin/food/management/admins",
        resource: "subadmins",
      },
    ],
  },
  {
    type: "link",
    label: "Dashboard",
    path: "/admin/food",
    icon: "LayoutDashboard",
  },
  {
    type: "link",
    label: "Point of Sale",
    path: "/admin/food/point-of-sale",
    icon: "CreditCard",
  },
  {
    type: "section",
    label: "FOOD MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Food Approval",
        path: "/admin/food/food-approval",
        icon: "CheckCircle2",
      },
      {
        type: "expandable",
        label: "Foods",
        icon: "Utensils",
        subItems: [
          { label: "Restaurant Foods List", path: "/admin/food/foods" },
          { label: "Restaurant Addons List", path: "/admin/food/addons" },
        ],
      },
      {
        type: "expandable",
        label: "Categories",
        icon: "FolderTree",
        subItems: [{ label: "Category", path: "/admin/food/categories" }],
      },
    ],
  },
  {
    type: "section",
    label: "RESTAURANT MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Zone Setup",
        path: "/admin/food/zone-setup",
        icon: "MapPin",
      },
      {
        type: "expandable",
        label: "Restaurants",
        icon: "UtensilsCrossed",
        subItems: [
          { label: "Restaurants List", path: "/admin/food/restaurants" },
          { label: "New Joining Request", path: "/admin/food/restaurants/joining-request" },
          { label: "Restaurant Commission", path: "/admin/food/restaurants/commission" },
          { label: "Restaurant Reviews", path: "/admin/food/restaurants/reviews" },
          { label: "Restaurant Complaints", path: "/admin/food/restaurants/complaints" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "ORDER MANAGEMENT",
    items: [
      {
        type: "expandable",
        label: "Orders",
        icon: "FileText",
        subItems: [
          { label: "All", path: "/admin/food/orders/all" },
          { label: "Scheduled", path: "/admin/food/orders/scheduled" },
          { label: "Pending", path: "/admin/food/orders/pending" },
          { label: "Accepted", path: "/admin/food/orders/accepted" },
          { label: "Processing", path: "/admin/food/orders/processing" },
          { label: "Food On The Way", path: "/admin/food/orders/food-on-the-way" },
          { label: "Delivered", path: "/admin/food/orders/delivered" },
          { label: "Cancelled", path: "/admin/food/orders/canceled" },
          { label: "Restaurant cancelled", path: "/admin/food/orders/restaurant-cancelled" },
          { label: "Payment Failed", path: "/admin/food/orders/payment-failed" },
          { label: "Refunded", path: "/admin/food/orders/refunded" },
          { label: "Offline Payments", path: "/admin/food/orders/offline-payments" },
        ],
      },
      {
        type: "link",
        label: "Order Detect Delivery",
        path: "/admin/food/order-detect-delivery",
        icon: "Truck",
      },
    ],
  },
  {
    type: "section",
    label: "PROMOTIONS MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Restaurant Coupons & Offers",
        path: "/admin/food/coupons",
        icon: "Gift",
      },
    ],
  },
  {
    type: "section",
    label: "REFERRAL & REWARDS",
    items: [
      { type: "link", label: "Referral Settings", path: "/admin/food/referral-settings", icon: "Gift" },
    ],
  },
  {
    type: "section",
    label: "CUSTOMER MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Customers",
        path: "/admin/food/customers",
        icon: "Users",
      },
      {
        type: "link",
        label: "Support Tickets (User & Restaurant)",
        path: "/admin/food/support-tickets",
        icon: "MessageSquare",
      },
    ],
  },
  {
    type: "section",
    label: "DELIVERYMAN MANAGEMENT",
    items: [
      { type: "link", label: "Delivery Cash Limit", path: "/admin/food/delivery-cash-limit", icon: "IndianRupee" },
      { type: "link", label: "Delivery & Platform Fee", path: "/admin/food/fee-settings", icon: "DollarSign" },
      { type: "link", label: "Cash limit settlement", path: "/admin/food/cash-limit-settlement", icon: "Receipt" },
      { type: "link", label: "Delivery Withdrawal", path: "/admin/food/delivery-withdrawal", icon: "Wallet" },
      { type: "link", label: "Delivery boy Wallet", path: "/admin/food/delivery-boy-wallet", icon: "PiggyBank" },
      { type: "link", label: "Delivery Emergency Help", path: "/admin/food/delivery-emergency-help", icon: "Phone" },
      { type: "link", label: "Delivery Support Tickets", path: "/admin/food/delivery-support-tickets", icon: "MessageSquare" },
      {
        type: "expandable",
        label: "Deliveryman",
        icon: "Package",
        subItems: [
          { label: "New Join Request", path: "/admin/food/delivery-partners/join-request" },
          { label: "Deliveryman List", path: "/admin/food/delivery-partners" },
          { label: "Shift / Gig Booking", path: "/admin/food/delivery-partners/gigs" },
          { label: "Selfie Verification Logs", path: "/admin/food/delivery-partners/selfie-logs" },
          { label: "Deliveryman Reviews", path: "/admin/food/delivery-partners/reviews" },
          { label: "Bonus", path: "/admin/food/delivery-partners/bonus" },
          { label: "Earning Addon", path: "/admin/food/delivery-partners/earning-addon" },
          { label: "Earning Addon History", path: "/admin/food/delivery-partners/earning-addon-history" },
          { label: "Delivery Earning", path: "/admin/food/delivery-partners/earnings" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "HELP & SUPPORT",
    items: [
      { type: "link", label: "User Feedback", path: "/admin/food/contact-messages", icon: "Mail" },
      { type: "link", label: "Safety Emergency Reports", path: "/admin/food/safety-emergency-reports", icon: "AlertTriangle" },
    ],
  },
  {
    type: "section",
    label: "REPORT MANAGEMENT",
    items: [
      { type: "link", label: "Transaction Report", path: "/admin/food/transaction-report", icon: "FileText" },
      { type: "link", label: "Order Report", path: "/admin/food/order-report/regular", icon: "FileText" },
      { type: "link", label: "New vs Repeat Orders", path: "/admin/food/new-repeat-orders", icon: "FileText" },
      { type: "link", label: "Tax Report", path: "/admin/food/tax-report", icon: "Receipt" },
      {
        type: "expandable",
        label: "Restaurant Report",
        icon: "FileText",
        subItems: [{ label: "Restaurant Report", path: "/admin/food/restaurant-report" }],
      },
      {
        type: "expandable",
        label: "Customer Report",
        icon: "FileText",
        subItems: [{ label: "Feedback Experience", path: "/admin/food/customer-report/feedback-experience" }],
      },
    ],
  },
  {
    type: "section",
    label: "TRANSACTION MANAGEMENT",
    items: [
      { type: "link", label: "Restaurant Withdraws", path: "/admin/food/restaurant-withdraws", icon: "CreditCard" },
    ],
  },
  {
    type: "section",
    label: "DINING MANAGEMENT",
    items: [
      { type: "link", label: "Dining Banners", path: "/admin/food/dining-management", icon: "UtensilsCrossed" },
      { type: "link", label: "Dining List", path: "/admin/food/dining-list", icon: "FileText" },
    ],
  },
  {
    type: "section",
    label: "SYSTEM SETTINGS",
    items: [
      { type: "link", label: "Broadcast Notification", path: "/admin/food/broadcast-notification", icon: "Bell" },
    ],
  },
];

// Settings shared by Food and Taxi live here (opened from the "Global" tab).
export const globalSidebarMenu = [
  {
    type: "section",
    label: "APP SETTINGS",
    items: [
      { type: "link", label: "Branding & Colors", path: "/admin/global/branding", icon: "Palette" },
      { type: "link", label: "Customization", path: "/admin/global/customization", icon: "Settings" },
      { type: "link", label: "Wallet Settings", path: "/admin/global/app/wallet", icon: "Settings" },
      { type: "link", label: "Tip Settings", path: "/admin/global/app/tip", icon: "Settings" },
      { type: "link", label: "GST Settings", path: "/admin/global/app/gst", icon: "Settings" },
      { type: "link", label: "App Onboarding Screens", path: "/admin/global/app/onboard", icon: "Image" },
    ],
  },
  {
    type: "section",
    label: "THIRD-PARTY",
    items: [
      { type: "link", label: "Payment Gateway", path: "/admin/global/third-party/payment", icon: "CreditCard" },
      { type: "link", label: "SMS Gateway", path: "/admin/global/third-party/sms", icon: "Bell" },
      { type: "link", label: "Firebase", path: "/admin/global/third-party/firebase", icon: "Bell" },
      { type: "link", label: "Maps & Map APIs", path: "/admin/global/third-party/map-apis", icon: "Globe" },
      { type: "link", label: "Mail Configuration", path: "/admin/global/third-party/mail", icon: "Globe" },
    ],
  },
  {
    type: "section",
    label: "LANDING & BANNERS",
    items: [
      { type: "link", label: "Eqosy Landing Settings", path: "/admin/global/landing-settings", icon: "Settings" },
      { type: "link", label: "Landing Page Management", path: "/admin/global/landing-management", icon: "Image" },
      { type: "link", label: "Promotional Banners", path: "/admin/global/promotional-banners", icon: "Megaphone" },
      { type: "link", label: "General Banners", path: "/admin/global/banners", icon: "Image" },
      { type: "link", label: "Website Header-Footer", path: "/admin/global/cms/header-footer", icon: "Globe" },
      { type: "link", label: "Website Home", path: "/admin/global/cms/home", icon: "Globe" },
      { type: "link", label: "Website About Us", path: "/admin/global/cms/about", icon: "Globe" },
      { type: "link", label: "Website Driver Page", path: "/admin/global/cms/driver", icon: "Globe" },
      { type: "link", label: "Website User Page", path: "/admin/global/cms/user", icon: "Globe" },
      { type: "link", label: "Website Contact", path: "/admin/global/cms/contact", icon: "Globe" },    ],
  },
  {
    type: "section",
    label: "LEGAL & PAGES",
    items: [
      { type: "link", label: "About Us", path: "/admin/global/legal/about", icon: "Globe" },
      { type: "link", label: "Terms & Conditions", path: "/admin/global/legal/terms", icon: "FileText" },
      { type: "link", label: "Privacy Policy", path: "/admin/global/legal/privacy", icon: "Lock" },
      { type: "link", label: "Refund Policy", path: "/admin/global/legal/refund", icon: "Receipt" },
      { type: "link", label: "Shipping Policy", path: "/admin/global/legal/shipping", icon: "Truck" },
      { type: "link", label: "Cancellation Policy", path: "/admin/global/legal/cancellation", icon: "X" },
      { type: "link", label: "Driver & DMV Documents", path: "/admin/global/legal/driver-dmv", icon: "FileText" },
    ],
  },
];
