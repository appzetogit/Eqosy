import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Car,
  ChevronRight,
  Trash2,
  Edit2,
  ArrowLeft,
  Upload,
  Info,
  Save,
  Activity,
  X,
  CheckCircle2,
  Package
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../../../shared/api/axiosInstance";
import { useTaxiTransportTypes } from "../../../../shared/hooks/useTaxiTransportTypes";
import CarIcon from "../../../../assets/icons/car.png";
import BikeIcon from "../../../../assets/icons/bike.png";
import AutoIcon from "../../../../assets/icons/auto.png";
import TruckIcon from "../../../../assets/icons/truck.png";
import EhcvIcon from "../../../../assets/icons/ehcv.png";
import HcvIcon from "../../../../assets/icons/hcv.png";
import LcvIcon from "../../../../assets/icons/LCV.png";
import McvIcon from "../../../../assets/icons/mcv.png";
import LuxuryIcon from "../../../../assets/icons/Luxury.png";
import PremiumIcon from "../../../../assets/icons/Premium.png";
import SuvIcon from "../../../../assets/icons/SUV.png";
import MapBackground from "../../../../assets/map_image.png";
import trucksImg from "@/assets/images/delivery/trucks.png";
import bikeImg from "@/assets/images/delivery/bike.png";
import moversImg from "@/assets/images/delivery/movers.png";
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-orange-300 focus:ring-2 focus:ring-orange-100";
const labelClass = "mb-2 block text-[12px] font-bold text-slate-700";
const iconMap = {
  car: CarIcon,
  bike: BikeIcon,
  cycle: BikeIcon,
  electric_scooty: BikeIcon,
  scooter: BikeIcon,
  auto: AutoIcon,
  truck: TruckIcon,
  ehcb: EhcvIcon,
  HCV: HcvIcon,
  LCV: LcvIcon,
  MCV: McvIcon,
  Luxary: LuxuryIcon,
  premium: PremiumIcon,
  suv: SuvIcon
};
const ICON_TYPE_ALIASES = {
  motor_bike: "bike",
  motorbike: "bike",
  mini_truck: "truck",
  "mini truck": "truck",
  pooling_truck: "truck",
  "pooling truck": "truck",
  loader: "truck",
  hcv: "HCV",
  lcv: "LCV",
  mcv: "MCV",
  luxary: "Luxary"
};
const normalizeIconType = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "car";
  const lower = raw.toLowerCase();
  if (ICON_TYPE_ALIASES[lower]) return ICON_TYPE_ALIASES[lower];
  const exactKey = Object.keys(iconMap).find((key) => key.toLowerCase() === lower);
  return exactKey || "car";
};
const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const SERVICE_LABELS = {
  taxi: "Ride",
  delivery: "Parcel",
  both: "Ride + Parcel",
  pooling: "Car Pooling"
};
const normalizeTransportType = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "delivery") return "delivery";
  if (normalized === "pooling") return "pooling";
  if (normalized === "outstation") return "outstation";
  if (normalized === "both" || normalized === "all") return "both";
  return "taxi";
};
const normalizeTaxiMode = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "delivery") return "delivery";
  if (normalized === "pooling") return "pooling";
  if (normalized === "both" || normalized === "all") return "both";
  return "taxi";
};
const sanitizeObjectIdList = (items = []) => (Array.isArray(items) ? items : []).map((item) => {
  if (typeof item === "string") return item.trim();
  if (item && typeof item === "object") {
    return String(item._id || item.id || "").trim();
  }
  return "";
}).filter((item, index, array) => OBJECT_ID_PATTERN.test(item) && array.indexOf(item) === index);
const defaultFormData = {
  name: "",
  short_description: "",
  description: "",
  transport_type: "taxi",
  dispatch_type: "normal",
  icon_types: "car",
  image: "",
  map_icon: "",
  capacity: 0,
  size: "",
  is_taxi: "taxi",
  is_accept_share_ride: 0,
  delivery_category: "",
  delivery_distance_pricing: {
    enabled: false,
    base_price: "",
    free_distance: "",
    distance_price: "",
    free_time: "",
    time_price: ""
  },
  status: 1,
  active: true,
  supported_other_vehicle_types: [],
  vehicle_preference: []
};
const DELIVERY_CATEGORY_OPTIONS = [
  {
    id: "trucks",
    title: "Trucks",
    image: trucksImg,
    description: "Heavy goods, loaders, and cargo-style delivery vehicles."
  },
  {
    id: "2wheeler",
    title: "2 Wheeler",
    image: bikeImg,
    description: "Fast lightweight parcel bikes and two-wheel delivery options."
  },
  {
    id: "movers",
    title: "Packers & Movers",
    image: moversImg,
    description: "Home shifting, helper-based, and larger move services."
  }
];
const TRANSPORT_TYPE_OPTIONS = [
  { id: "taxi", name: "taxi", display_name: "Ride" },
  { id: "delivery", name: "delivery", display_name: "Delivery" },
  { id: "both", name: "both", display_name: "Both" }
];
const unwrap = (response) => response?.data?.data || response?.data || response;
const normalizeDeliveryDistancePricing = (value = {}) => ({
  enabled: Boolean(value?.enabled),
  base_price: String(value?.base_price ?? ""),
  free_distance: String(value?.free_distance ?? ""),
  distance_price: String(value?.distance_price ?? ""),
  free_time: String(value?.free_time ?? ""),
  time_price: String(value?.time_price ?? "")
});
const normalizeVehicle = (item = {}) => ({
  ...item,
  id: String(item?._id || item?.id || "")
});
const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});
const StatusToggle = ({ active, onToggle }) => /* @__PURE__ */ jsx(
  "button",
  {
    type: "button",
    onClick: (e) => {
      e.stopPropagation();
      onToggle();
    },
    className: `relative h-6 w-12 rounded-full transition-all ${active ? "bg-emerald-500" : "bg-slate-300"}`,
    children: /* @__PURE__ */ jsx("span", { className: `absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${active ? "left-7" : "left-1"}` })
  }
);
const VehicleMultiSelect = ({
  label,
  options,
  value,
  onChange,
  placeholder = "Select options"
}) => {
  const selectedItems = options.filter((item) => value.includes(String(item.id || item._id)));
  const handleSelect = (event) => {
    const nextValue = event.target.value;
    if (!nextValue || value.includes(nextValue)) {
      return;
    }
    onChange([...value, nextValue]);
  };
  const removeItem = (id) => onChange(value.filter((item) => item !== id));
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("label", { className: labelClass, children: label }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-xl border border-slate-200 bg-white p-3", children: [
      /* @__PURE__ */ jsx("div", { className: "mb-3 flex flex-wrap gap-2", children: selectedItems.length ? selectedItems.map((item) => /* @__PURE__ */ jsxs(
        "span",
        {
          className: "inline-flex items-center gap-2 rounded-full bg-slate-700 px-3 py-1.5 text-[12px] font-semibold text-white",
          children: [
            item.name,
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => removeItem(String(item.id || item._id)),
                className: "opacity-80 transition hover:opacity-100",
                children: /* @__PURE__ */ jsx(X, { size: 12 })
              }
            )
          ]
        },
        String(item.id || item._id)
      )) : /* @__PURE__ */ jsx("p", { className: "text-[12px] text-slate-400", children: placeholder }) }),
      /* @__PURE__ */ jsxs("select", { value: "", onChange: handleSelect, className: inputClass, children: [
        /* @__PURE__ */ jsx("option", { value: "", children: "Add option" }),
        options.filter((item) => !value.includes(String(item.id || item._id))).map((item) => /* @__PURE__ */ jsx("option", { value: String(item.id || item._id), children: item.name }, String(item.id || item._id)))
      ] })
    ] })
  ] });
};
const VehicleType = ({ mode: propMode }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditor = propMode === "create" || propMode === "edit";
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, current_page: 1 });
  const [errorMessage, setErrorMessage] = useState("");
  const [formData, setFormData] = useState({ ...defaultFormData, transport_type: "" });
  const { transportTypes: dbTransportTypes } = useTaxiTransportTypes();
  const transportTypeOptions = useMemo(() => {
    if (Array.isArray(dbTransportTypes) && dbTransportTypes.length > 0) {
      return dbTransportTypes.map((t) => ({
        id: String(t.id || t._id || t.name || "").toLowerCase(),
        name: String(t.name || t.id || "").toLowerCase(),
        display_name: t.display_name || t.name || t.id
      }));
    }
    return [
      { id: "taxi", name: "taxi", display_name: "Taxi / Ride" },
      { id: "delivery", name: "delivery", display_name: "Delivery" },
      { id: "both", name: "both", display_name: "Both (Taxi & Delivery)" },
      { id: "pooling", name: "pooling", display_name: "Pooling" },
      { id: "outstation", name: "outstation", display_name: "Outstation" }
    ];
  }, [dbTransportTypes]);
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const [vehicleResponse] = await Promise.all([
          api.get("/admin/types/vehicle-types")
        ]);
        if (!mounted) {
          return;
        }
        const vehiclePayload = unwrap(vehicleResponse);
        const vehicleResults = Array.isArray(vehiclePayload?.results) ? vehiclePayload.results : Array.isArray(vehiclePayload) ? vehiclePayload : [];
        const normalizedVehicles = vehicleResults.map(normalizeVehicle);
        setVehicles(normalizedVehicles);
        setPagination(vehiclePayload?.paginator || { total: normalizedVehicles.length, current_page: 1 });
        if (id) {
          const selectedVehicle = normalizedVehicles.find((item) => String(item.id) === String(id));
          if (selectedVehicle) {
            setFormData({
              name: selectedVehicle.name || "",
              short_description: selectedVehicle.short_description || "",
              description: selectedVehicle.description || "",
              transport_type: selectedVehicle.transport_type || "taxi",
              dispatch_type: selectedVehicle.dispatch_type || selectedVehicle.trip_dispatch_type || "normal",
              icon_types: normalizeIconType(selectedVehicle.icon_types || selectedVehicle.icon_types_for),
              image: selectedVehicle.image || "",
              map_icon: selectedVehicle.map_icon || selectedVehicle.icon || selectedVehicle.image || "",
              capacity: Number(selectedVehicle.capacity || 0),
              size: String(selectedVehicle.size || ""),
              is_taxi: selectedVehicle.is_taxi || "taxi",
              is_accept_share_ride: Number(selectedVehicle.is_accept_share_ride || 0),
              delivery_category: String(selectedVehicle.delivery_category || ""),
              delivery_distance_pricing: normalizeDeliveryDistancePricing(selectedVehicle.delivery_distance_pricing),
              status: Number(selectedVehicle.status ?? (selectedVehicle.active !== false ? 1 : 0)),
              active: selectedVehicle.active !== false && Number(selectedVehicle.status ?? 1) !== 0,
              supported_other_vehicle_types: Array.isArray(selectedVehicle.supported_other_vehicle_types) ? selectedVehicle.supported_other_vehicle_types.map((item) => String(item?._id || item)) : typeof selectedVehicle.supported_vehicles === "string" && selectedVehicle.supported_vehicles ? selectedVehicle.supported_vehicles.split(",").map((item) => item.trim()).filter(Boolean) : [],
              vehicle_preference: Array.isArray(selectedVehicle.vehicle_preference) ? selectedVehicle.vehicle_preference.map((item) => String(item?._id || item)) : []
            });
          }
        } else if (propMode === "create") {
          setFormData(defaultFormData);
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error.message || "Could not load vehicle types.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    loadData();
    return () => {
      mounted = false;
    };
  }, [id, propMode]);
  const previewImage = useMemo(() => {
    if (formData.image && typeof formData.image === "string") {
      return formData.image;
    }
    return "";
  }, [formData.image]);
  const mapIconPreview = useMemo(() => {
    if (formData.map_icon && typeof formData.map_icon === "string") {
      return formData.map_icon;
    }
    return iconMap[formData.icon_types] || CarIcon;
  }, [formData.icon_types, formData.map_icon]);
  const availableSupportVehicles = useMemo(
    () => vehicles.filter((item) => String(item.id) !== String(id)),
    [id, vehicles]
  );
  const showsDeliveryCategorySelector = useMemo(
    () => ["delivery", "both"].includes(normalizeTransportType(formData.transport_type)),
    [formData.transport_type]
  );
  const updateForm = (field, value) => {
    let sanitizedValue = value;
    if (field === "capacity" && value !== "") {
      const num = Number(value);
      if (!isNaN(num) && num < 0) {
        sanitizedValue = 0;
      }
    }
    if (field === "delivery_distance_pricing") {
      const pricing = { ...value };
      const keys = ["base_price", "free_distance", "distance_price", "free_time", "time_price"];
      for (const k of keys) {
        if (pricing[k] !== void 0 && pricing[k] !== "") {
          const num = Number(pricing[k]);
          if (!isNaN(num) && num < 0) {
            pricing[k] = "0";
          }
        }
      }
      sanitizedValue = pricing;
    }
    setFormData((prev) => ({ ...prev, [field]: sanitizedValue }));
  };
  const handleImageChange = async (event, field = "image") => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    updateForm(field, dataUrl);
    event.target.value = "";
  };
  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage("");
    try {
      if (showsDeliveryCategorySelector && !formData.delivery_category) {
        throw new Error("Choose a delivery category for this delivery-enabled vehicle type.");
      }
      const payload = {
        name: formData.name.trim(),
        short_description: formData.short_description.trim(),
        description: formData.description.trim(),
        transport_type: normalizeTransportType(formData.transport_type),
        dispatch_type: formData.dispatch_type,
        icon_types: normalizeIconType(formData.icon_types),
        image: formData.image || "",
        icon: formData.map_icon || "",
        map_icon: formData.map_icon || "",
        capacity: Number(formData.capacity || 0),
        size: formData.size,
        is_taxi: normalizeTaxiMode(formData.transport_type),
        is_accept_share_ride: Number(formData.is_accept_share_ride || 0),
        delivery_category: showsDeliveryCategorySelector ? formData.delivery_category : "",
        delivery_distance_pricing: showsDeliveryCategorySelector ? {
          enabled: Boolean(formData.delivery_distance_pricing?.enabled),
          base_price: Number(formData.delivery_distance_pricing?.base_price || 0),
          free_distance: Number(formData.delivery_distance_pricing?.free_distance || 0),
          distance_price: Number(formData.delivery_distance_pricing?.distance_price || 0),
          free_time: Number(formData.delivery_distance_pricing?.free_time || 0),
          time_price: Number(formData.delivery_distance_pricing?.time_price || 0)
        } : {
          enabled: false,
          base_price: 0,
          free_distance: 0,
          distance_price: 0,
          free_time: 0,
          time_price: 0
        },
        status: formData.active ? 1 : 0,
        active: formData.active,
        supported_other_vehicle_types: sanitizeObjectIdList(formData.supported_other_vehicle_types),
        vehicle_preference: sanitizeObjectIdList(formData.vehicle_preference)
      };
      if (id) {
        await api.patch(`/admin/types/vehicle-types/${id}`, payload);
      } else {
        await api.post("/admin/types/vehicle-types", payload);
      }
      navigate("/taxi/admin/pricing/vehicle-type");
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || error.message || "Could not save vehicle type.");
    } finally {
      setIsSaving(false);
    }
  };
  const handleDelete = async (vehicleId) => {
    if (!window.confirm("Delete this vehicle type?")) {
      return;
    }
    try {
      await api.delete(`/admin/types/vehicle-types/${vehicleId}`);
      setVehicles((prev) => prev.filter((item) => String(item.id) !== String(vehicleId)));
    } catch (error) {
      setErrorMessage(error.message || "Could not delete vehicle type.");
    }
  };
  const handleToggleStatus = async (vehicle) => {
    const isCurrentlyActive = vehicle.active !== false && Number(vehicle.status ?? 1) !== 0;
    const nextActive = !isCurrentlyActive;
    const nextStatus = nextActive ? 1 : 0;
    setVehicles(
      (prev) => prev.map(
        (item) => String(item.id) === String(vehicle.id) ? { ...item, active: nextActive, status: nextStatus } : item
      )
    );
    try {
      await api.patch(`/admin/types/vehicle-types/${vehicle.id}`, {
        active: nextActive,
        status: nextStatus
      });
    } catch (error) {
      setVehicles(
        (prev) => prev.map(
          (item) => String(item.id) === String(vehicle.id) ? { ...item, active: vehicle.active, status: vehicle.status } : item
        )
      );
      setErrorMessage(error?.response?.data?.message || error.message || "Could not update vehicle status.");
    }
  };
  if (!isEditor) {
    return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-[#f6f7fb] p-6 lg:p-8", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-center gap-1.5 text-xs text-slate-400", children: [
          /* @__PURE__ */ jsx("span", { children: "Pricing" }),
          /* @__PURE__ */ jsx(ChevronRight, { size: 12 }),
          /* @__PURE__ */ jsx("span", { className: "text-slate-700", children: "Vehicle Type" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold text-slate-900", children: "Vehicle Type" }),
            /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Manage the ride and delivery vehicle catalog." })
          ] }),
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => navigate("/taxi/admin/pricing/vehicle-type/create"),
              className: "inline-flex items-center gap-2 rounded-xl bg-[#ff6b4a] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition hover:bg-[#f55a37]",
              children: [
                /* @__PURE__ */ jsx(Plus, { size: 18 }),
                "Add Vehicle"
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mb-6 grid grid-cols-1 gap-5 md:grid-cols-3", children: [
        /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-slate-200 bg-white p-5", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-500", children: /* @__PURE__ */ jsx(Car, { size: 20 }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-slate-400", children: "Total Types" }),
            /* @__PURE__ */ jsx("p", { className: "text-2xl font-bold text-slate-900", children: vehicles.length })
          ] })
        ] }) }),
        /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-slate-200 bg-white p-5", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500", children: /* @__PURE__ */ jsx(Activity, { size: 20 }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-slate-400", children: "Active" }),
            /* @__PURE__ */ jsx("p", { className: "text-2xl font-bold text-slate-900", children: vehicles.filter((item) => item.active !== false).length })
          ] })
        ] }) }),
        /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-slate-200 bg-white p-5", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-500", children: /* @__PURE__ */ jsx(Package, { size: 20 }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-slate-400", children: "Delivery Types" }),
            /* @__PURE__ */ jsx("p", { className: "text-2xl font-bold text-slate-900", children: vehicles.filter((item) => ["delivery", "both"].includes(String(item.transport_type || "").toLowerCase())).length })
          ] })
        ] }) })
      ] }),
      errorMessage ? /* @__PURE__ */ jsx("div", { className: "mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600", children: errorMessage }) : null,
      /* @__PURE__ */ jsx("div", { className: "overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm", children: /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-left", children: [
        /* @__PURE__ */ jsx("thead", { className: "bg-slate-50", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500", children: "Vehicle" }),
          /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500", children: "Transport" }),
          /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500", children: "Dispatch" }),
          /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500", children: "Active" }),
          /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-right text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500", children: "Action" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: loading ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: "5", className: "px-6 py-20 text-center text-sm text-slate-400", children: "Loading vehicle types..." }) }) : !vehicles.length ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: "5", className: "px-6 py-20 text-center text-sm text-slate-400", children: "No vehicle types found." }) }) : vehicles.map((vehicle) => /* @__PURE__ */ jsxs("tr", { className: "border-t border-slate-100", children: [
          /* @__PURE__ */ jsx("td", { className: "px-6 py-5", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
            /* @__PURE__ */ jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50", children: /* @__PURE__ */ jsx("img", { src: vehicle.image || vehicle.map_icon || vehicle.icon || iconMap[normalizeIconType(vehicle.icon_types)] || CarIcon, alt: vehicle.name, className: "h-10 w-10 object-contain" }) }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-900", children: vehicle.name }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: vehicle.short_description || vehicle.description || "No description added" })
            ] })
          ] }) }),
          /* @__PURE__ */ jsx("td", { className: "px-6 py-5", children: /* @__PURE__ */ jsx("span", { className: `inline-flex rounded-full px-3 py-1 text-xs font-semibold ${String(vehicle.transport_type || "").toLowerCase() === "delivery" ? "bg-orange-50 text-orange-600" : String(vehicle.transport_type || "").toLowerCase() === "both" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`, children: vehicle.transport_type }) }),
          /* @__PURE__ */ jsx("td", { className: "px-6 py-5 text-sm font-medium text-slate-700", children: vehicle.trip_dispatch_type || vehicle.dispatch_type || "normal" }),
          /* @__PURE__ */ jsx("td", { className: "px-6 py-5", children: /* @__PURE__ */ jsx(
            StatusToggle,
            {
              active: vehicle.active !== false && Number(vehicle.status ?? 1) !== 0,
              onToggle: () => handleToggleStatus(vehicle)
            }
          ) }),
          /* @__PURE__ */ jsx("td", { className: "px-6 py-5", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-end gap-2", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => navigate(`/taxi/admin/pricing/vehicle-type/edit/${vehicle.id}`),
                className: "rounded-xl p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600",
                children: /* @__PURE__ */ jsx(Edit2, { size: 15 })
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => handleDelete(vehicle.id),
                className: "rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600",
                children: /* @__PURE__ */ jsx(Trash2, { size: 15 })
              }
            )
          ] }) })
        ] }, vehicle.id)) })
      ] }) }) })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-[#f6f7fb] p-6 lg:p-8", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-6 flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-center gap-1.5 text-xs text-slate-400", children: [
          /* @__PURE__ */ jsx("span", { children: "Pricing" }),
          /* @__PURE__ */ jsx(ChevronRight, { size: 12 }),
          /* @__PURE__ */ jsx("span", { className: "text-slate-700", children: "Vehicle Type" }),
          /* @__PURE__ */ jsx(ChevronRight, { size: 12 }),
          /* @__PURE__ */ jsx("span", { className: "text-slate-700", children: id ? "Edit" : "Create" })
        ] }),
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold text-slate-900", children: id ? "Edit Vehicle Type" : "Create Vehicle Type" }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Update the live vehicle catalog with real transport, icon, dispatch, and compatibility data." })
      ] }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => navigate("/taxi/admin/pricing/vehicle-type"),
          className: "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50",
          children: [
            /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
            "Back"
          ]
        }
      )
    ] }),
    errorMessage ? /* @__PURE__ */ jsx("div", { className: "mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600", children: errorMessage }) : null,
    /* @__PURE__ */ jsxs("div", { className: "overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-8 p-6 lg:grid-cols-2 lg:p-8", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: labelClass, children: "Service *" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: formData.transport_type,
              onChange: (e) => {
                const nextTransportType = e.target.value;
                updateForm("transport_type", nextTransportType);
                updateForm("is_taxi", nextTransportType);
                if (!["delivery", "both"].includes(normalizeTransportType(nextTransportType))) {
                  updateForm("delivery_category", "");
                  updateForm("delivery_distance_pricing", normalizeDeliveryDistancePricing());
                  if (["cycle", "electric_scooty", "scooter"].includes(formData.icon_types)) {
                    updateForm("icon_types", "bike");
                  }
                }
              },
              className: inputClass,
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Select Service" }),
                transportTypeOptions.map((t) => /* @__PURE__ */ jsx("option", { value: t.name, children: SERVICE_LABELS[t.name] || t.display_name }, t.id || t._id || t.name))
              ]
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-slate-500", children: "Choose `Ride + Parcel` for vehicle types like bikes that can handle both ride and parcel flows." })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: labelClass, children: "Icon Type *" }),
          /* @__PURE__ */ jsx("select", { value: formData.icon_types, onChange: (e) => updateForm("icon_types", e.target.value), className: inputClass, children: Object.keys(iconMap).filter((key) => {
            const isDeliveryOnlyIcon = ["cycle", "electric_scooty", "scooter"].includes(key);
            const isDeliveryTransport = ["delivery", "both"].includes(normalizeTransportType(formData.transport_type));
            return isDeliveryOnlyIcon ? isDeliveryTransport : true;
          }).map((key) => /* @__PURE__ */ jsx("option", { value: key, children: key }, key)) })
        ] }),
        showsDeliveryCategorySelector ? /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2", children: [
          /* @__PURE__ */ jsx("label", { className: labelClass, children: "Delivery Category *" }),
          /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-3", children: DELIVERY_CATEGORY_OPTIONS.map((option) => {
            const selected = formData.delivery_category === option.id;
            return /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: () => updateForm("delivery_category", option.id),
                className: `rounded-[24px] border p-4 text-left transition-all ${selected ? "border-[#0047AB] bg-[#EEF4FF] shadow-md" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`,
                children: [
                  /* @__PURE__ */ jsx("div", { className: "rounded-[20px] bg-slate-50 p-3", children: /* @__PURE__ */ jsx("img", { src: option.image, alt: option.title, className: "mx-auto h-24 w-full object-contain" }) }),
                  /* @__PURE__ */ jsxs("div", { className: "mt-4 flex items-start justify-between gap-3", children: [
                    /* @__PURE__ */ jsxs("div", { children: [
                      /* @__PURE__ */ jsx("p", { className: "text-sm font-black text-slate-900", children: option.title }),
                      /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs font-medium leading-5 text-slate-500", children: option.description })
                    ] }),
                    /* @__PURE__ */ jsx("span", { className: `mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-[#0047AB] bg-[#0047AB] text-white" : "border-slate-300 bg-white"}`, children: selected ? /* @__PURE__ */ jsx(CheckCircle2, { size: 12 }) : null })
                  ] })
                ]
              },
              option.id
            );
          }) }),
          /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-slate-500", children: "This decides which delivery card this vehicle type appears under in the user parcel flow." })
        ] }) : null,
        showsDeliveryCategorySelector ? /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2 rounded-[28px] border border-slate-200 bg-slate-50/70 p-5", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Delivery Distance Based Charges" }),
              /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500", children: "Enable quick parcel pricing defaults for this delivery-enabled vehicle type." })
            ] }),
            /* @__PURE__ */ jsxs("label", { className: "inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "checkbox",
                  checked: Boolean(formData.delivery_distance_pricing?.enabled),
                  onChange: (e) => updateForm("delivery_distance_pricing", {
                    ...formData.delivery_distance_pricing,
                    enabled: e.target.checked
                  }),
                  className: "h-4 w-4 rounded border-slate-300"
                }
              ),
              "Enable distance based charges"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Base Price" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  min: "0",
                  value: formData.delivery_distance_pricing?.base_price ?? "",
                  onChange: (e) => updateForm("delivery_distance_pricing", {
                    ...formData.delivery_distance_pricing,
                    base_price: e.target.value
                  }),
                  className: inputClass,
                  placeholder: "45",
                  disabled: !formData.delivery_distance_pricing?.enabled
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Free Distance (KM)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  min: "0",
                  value: formData.delivery_distance_pricing?.free_distance ?? "",
                  onChange: (e) => updateForm("delivery_distance_pricing", {
                    ...formData.delivery_distance_pricing,
                    free_distance: e.target.value
                  }),
                  className: inputClass,
                  placeholder: "2",
                  disabled: !formData.delivery_distance_pricing?.enabled
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Distance Price" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  min: "0",
                  value: formData.delivery_distance_pricing?.distance_price ?? "",
                  onChange: (e) => updateForm("delivery_distance_pricing", {
                    ...formData.delivery_distance_pricing,
                    distance_price: e.target.value
                  }),
                  className: inputClass,
                  placeholder: "12",
                  disabled: !formData.delivery_distance_pricing?.enabled
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Free Time (Min)" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  min: "0",
                  value: formData.delivery_distance_pricing?.free_time ?? "",
                  onChange: (e) => updateForm("delivery_distance_pricing", {
                    ...formData.delivery_distance_pricing,
                    free_time: e.target.value
                  }),
                  className: inputClass,
                  placeholder: "0",
                  disabled: !formData.delivery_distance_pricing?.enabled
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Time Price" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  min: "0",
                  value: formData.delivery_distance_pricing?.time_price ?? "",
                  onChange: (e) => updateForm("delivery_distance_pricing", {
                    ...formData.delivery_distance_pricing,
                    time_price: e.target.value
                  }),
                  className: inputClass,
                  placeholder: "0",
                  disabled: !formData.delivery_distance_pricing?.enabled
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mt-3 text-xs text-slate-500", children: "This section only appears when the vehicle supports `Delivery` or `Both`." })
        ] }) : null,
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: labelClass, children: "Preview Image" }),
          /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-dashed border-slate-300 p-4", children: /* @__PURE__ */ jsx("div", { className: "group relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-2xl bg-slate-50", children: previewImage ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("img", { src: previewImage, alt: "Vehicle preview", className: "max-h-[280px] w-full object-contain p-4" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => updateForm("image", ""),
                className: "absolute right-3 top-3 rounded-xl bg-white p-2 text-red-500 shadow-sm transition hover:bg-red-500 hover:text-white",
                children: /* @__PURE__ */ jsx(Trash2, { size: 16 })
              }
            )
          ] }) : /* @__PURE__ */ jsxs("label", { className: "flex cursor-pointer flex-col items-center gap-3", children: [
            /* @__PURE__ */ jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: (event) => handleImageChange(event, "image") }),
            /* @__PURE__ */ jsx("span", { className: "flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-orange-500 shadow-sm", children: /* @__PURE__ */ jsx(Upload, { size: 20 }) }),
            /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold text-slate-700", children: "Upload preview image" }),
            /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-400", children: "This shows in the user vehicle selection card" })
          ] }) }) }),
          /* @__PURE__ */ jsxs("div", { className: "mt-4 rounded-[24px] border border-orange-100 bg-gradient-to-r from-white via-orange-50/30 to-white p-3 shadow-sm", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
              /* @__PURE__ */ jsx("p", { className: "text-[11px] font-black uppercase tracking-[0.18em] text-slate-400", children: "User Card Preview" }),
              /* @__PURE__ */ jsx("span", { className: "text-[10px] font-bold text-slate-400", children: formData.delivery_distance_pricing?.enabled ? "Distance Base Fare Enabled" : "Pricing via Set Price" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 rounded-[20px] border border-orange-400 bg-white px-3 py-3", children: [
              /* @__PURE__ */ jsx("div", { className: "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100", children: /* @__PURE__ */ jsx(
                "img",
                {
                  src: previewImage || mapIconPreview,
                  alt: "User card vehicle preview",
                  className: "h-10 w-10 object-contain"
                }
              ) }),
              /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx("p", { className: "truncate text-sm font-black text-slate-900", children: formData.name || "Taxi" }),
                  /* @__PURE__ */ jsx("span", { className: "rounded bg-orange-500 px-1.5 py-0.5 text-[7px] font-black text-white", children: "FASTEST" })
                ] }),
                /* @__PURE__ */ jsx("p", { className: "truncate text-[11px] font-bold text-slate-500", children: formData.short_description || formData.description || "Closest driver 940 m away" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "text-right", children: [
                /* @__PURE__ */ jsx("p", { className: "text-sm font-black text-slate-900", children: formData.delivery_distance_pricing?.enabled ? `\u20B9${formData.delivery_distance_pricing?.base_price || 0}` : "Zone Rate" }),
                /* @__PURE__ */ jsx("p", { className: "text-[9px] font-medium text-slate-400", children: formData.delivery_distance_pricing?.enabled ? "Base Charge" : "Set Price" })
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-slate-100 bg-slate-50/70 p-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "mb-3 flex items-center justify-between gap-3", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-slate-800", children: "Live Map Icon Preview" }),
                /* @__PURE__ */ jsx("p", { className: "text-[11px] font-medium text-slate-500", children: "This uploaded icon is saved to the DB and used on app maps." })
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm transition hover:text-orange-500", children: [
                /* @__PURE__ */ jsx(Upload, { size: 14 }),
                "Change",
                /* @__PURE__ */ jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: (event) => handleImageChange(event, "map_icon") })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "relative h-[228px] overflow-hidden rounded-2xl border border-slate-200 bg-white", children: [
              /* @__PURE__ */ jsx("img", { src: MapBackground, alt: "Map preview", className: "absolute inset-0 h-full w-full object-cover opacity-25" }),
              /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsx("img", { src: mapIconPreview, alt: "Icon preview", className: "h-16 w-16 object-contain drop-shadow-xl" }) })
            ] }),
            formData.map_icon ? /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => updateForm("map_icon", ""),
                className: "mt-3 text-[11px] font-bold text-red-500 transition hover:text-red-600",
                children: "Remove uploaded map icon and use the selected icon type fallback"
              }
            ) : null
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: labelClass, children: "Maximum Weight / Capacity *" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "number",
                value: formData.capacity,
                onChange: (e) => updateForm("capacity", e.target.value),
                className: inputClass,
                placeholder: "e.g. 4 seats, or 150 (kg) for parcels"
              }
            ),
            /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] font-medium text-gray-500", children: "Passenger vehicles: enter the number of seats (Cab 4, Auto 3, Bike 1). Delivery vehicles: enter the maximum weight in kg. Numbers above 60 are treated as weight, so the rider app will not show them as passenger seats." })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { className: labelClass, children: "Short Description *" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: formData.short_description,
                onChange: (e) => updateForm("short_description", e.target.value),
                className: inputClass,
                placeholder: "Normal Delivery"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: labelClass, children: "Name *" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              value: formData.name,
              onChange: (e) => updateForm("name", e.target.value),
              className: inputClass,
              placeholder: "Parcel"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: labelClass, children: "Fare Mode *" }),
          /* @__PURE__ */ jsxs("select", { value: formData.dispatch_type, onChange: (e) => updateForm("dispatch_type", e.target.value), className: inputClass, children: [
            /* @__PURE__ */ jsx("option", { value: "normal", children: "Fixed" }),
            /* @__PURE__ */ jsx("option", { value: "bidding", children: "Bidding" }),
            /* @__PURE__ */ jsx("option", { value: "both", children: "Fixed + Bidding" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { className: labelClass, children: "Size *" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "text",
              value: formData.size,
              onChange: (e) => updateForm("size", e.target.value),
              className: inputClass,
              placeholder: "2"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "lg:col-span-2", children: [
          /* @__PURE__ */ jsx("label", { className: labelClass, children: "Description *" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              rows: "4",
              value: formData.description,
              onChange: (e) => updateForm("description", e.target.value),
              className: inputClass,
              placeholder: "Parcel Delivery"
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsx(
          VehicleMultiSelect,
          {
            label: "Supported Other Vehicle Types",
            options: availableSupportVehicles,
            value: formData.supported_other_vehicle_types,
            onChange: (next) => updateForm("supported_other_vehicle_types", next),
            placeholder: "No supporting vehicle types selected"
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-4 border-t border-slate-100 bg-slate-50/50 p-6 lg:grid-cols-[1fr_auto] lg:items-center", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3", children: [
            /* @__PURE__ */ jsx(Info, { size: 16, className: "mt-0.5 shrink-0 text-amber-600" }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-amber-800", children: "This form is fully dynamic from your DB. Transport type, icon type, and supported vehicles all save to the real vehicle catalog." })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-3 text-sm font-medium text-slate-700", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: formData.is_accept_share_ride === 1,
                onChange: (e) => updateForm("is_accept_share_ride", e.target.checked ? 1 : 0),
                className: "h-4 w-4 rounded border-slate-300"
              }
            ),
            "Accept share ride"
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-3 text-sm font-medium text-slate-700", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: formData.active,
                onChange: (e) => {
                  updateForm("active", e.target.checked);
                  updateForm("status", e.target.checked ? 1 : 0);
                },
                className: "h-4 w-4 rounded border-slate-300"
              }
            ),
            "Active vehicle type"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 lg:items-end", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: handleSave,
              disabled: isSaving || loading,
              className: "inline-flex min-w-[180px] items-center justify-center gap-2 rounded-xl bg-[#2e3c78] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#24305f] disabled:opacity-60",
              children: [
                /* @__PURE__ */ jsx(Save, { size: 16 }),
                isSaving ? "Saving..." : id ? "Update" : "Create"
              ]
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => navigate("/taxi/admin/pricing/vehicle-type"),
              className: "text-sm font-medium text-slate-500 transition hover:text-slate-700",
              children: "Cancel"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(AnimatePresence, { children: !loading && formData.active ? /* @__PURE__ */ jsx(
      motion.div,
      {
        initial: { opacity: 0, scale: 0.8 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.8 },
        className: "fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-[#14b8a6] text-white shadow-2xl",
        children: /* @__PURE__ */ jsx(CheckCircle2, { size: 24 })
      }
    ) : null })
  ] });
};
export default VehicleType;
