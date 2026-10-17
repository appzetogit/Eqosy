import { jsx, jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  ChevronRight,
  Loader2,
  Upload,
  ArrowLeft,
  Filter,
  Save,
  ImageIcon,
  FileSearch,
  ChevronDown,
  X
} from "lucide-react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { adminService } from "../../services/adminService";
import { useImageUpload } from "../../../../shared/hooks/useImageUpload";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors";
const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";
const selectClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M6%209L12%2015L18%209%22%20stroke%3D%22%2364748B%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:18px] bg-[right_12px_center] bg-no-repeat";
const SERVICE_OPTIONS = [
  { value: "normal", label: "Ride", transport: "taxi" },
  { value: "outstation", label: "Outstation", transport: "taxi" },
  { value: "rental", label: "Rental", transport: "taxi" },
  { value: "parcel", label: "Parcel", transport: "delivery" },
  { value: "bus", label: "Bus", transport: "taxi" },
  { value: "pooling", label: "Car Pooling", transport: "pooling" }
];
const getServiceLabel = (value) => SERVICE_OPTIONS.find((s) => s.value === String(value || "normal").toLowerCase())?.label || String(value || "").replace(/^./, (c) => c.toUpperCase());
const getTransportForService = (value, fallback = "taxi") => SERVICE_OPTIONS.find((s) => s.value === String(value || "").toLowerCase())?.transport || fallback;
const StatusToggle = ({ active, onToggle }) => /* @__PURE__ */ jsx(
  "button",
  {
    type: "button",
    onClick: (e) => {
      e.stopPropagation();
      onToggle();
    },
    className: `w-12 h-6.5 rounded-full transition-colors relative flex items-center px-1 ${active ? "bg-[#10B981]" : "bg-gray-300"}`,
    children: /* @__PURE__ */ jsx("div", { className: `w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${active ? "translate-x-5.5" : "translate-x-0"}` })
  }
);
const AppModules = ({ mode: propMode }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const isCreate = propMode === "create" || location.pathname.endsWith("/create");
  const isEdit = propMode === "edit" || location.pathname.includes("/edit/");
  const isList = !isCreate && !isEdit;
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState([]);
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    service_type: "",
    active: ""
  });
  const [formData, setFormData] = useState({
    name: "",
    transport_type: "",
    service_type: "",
    icon_type: "",
    order_by: "",
    short_description: "",
    description: "",
    active: true,
    mobile_menu_icon: ""
  });
  const fetchModules = async () => {
    try {
      setLoading(true);
      const res = await adminService.getAppModules({});
      const data = res.data?.data?.results || res.data?.results || (Array.isArray(res.data?.data) ? res.data.data : []);
      setModules(data);
    } catch (err) {
      toast.error("Failed to load application modules");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (isList) {
      fetchModules();
    } else if (isEdit && id) {
      const fetchItem = async () => {
        try {
          const res = await adminService.getAppModules({});
          const data = res.data?.data?.results || res.data?.results || (Array.isArray(res.data?.data) ? res.data.data : []);
          const item = data.find((m) => String(m._id || m.id) === String(id));
          if (item) {
            setFormData({
              name: item.name || "",
              transport_type: item.transport_type || "",
              service_type: item.service_type || "",
              icon_type: item.icon_type || "",
              order_by: item.order_by || "",
              short_description: item.short_description || "",
              description: item.description || "",
              active: item.active !== false,
              mobile_menu_icon: item.mobile_menu_icon || ""
            });
          }
        } catch (err) {
          toast.error("Failed to fetch module details");
        } finally {
          setLoading(false);
        }
      };
      fetchItem();
    } else {
      setLoading(false);
    }
  }, [isList, isEdit, id]);
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  const {
    uploading: imageUploading,
    preview: imagePreview,
    handleFileChange: onImageFileChange
  } = useImageUpload({
    folder: "app-modules",
    onSuccess: (url) => setFormData((prev) => ({ ...prev, mobile_menu_icon: url }))
  });
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData.name) return toast.error("Name is required");
    try {
      setSubmitting(true);
      if (!formData.service_type) return toast.error("Service is required");
      const payload = {
        ...formData,
        transport_type: getTransportForService(formData.service_type, formData.transport_type || "taxi"),
        order_by: Number(formData.order_by)
      };
      if (isEdit) {
        await adminService.updateAppModule(id, payload);
        toast.success("Module successfully updated");
      } else {
        await adminService.createAppModule(payload);
        toast.success("New module created");
      }
      navigate("/taxi/admin/pricing/app-modules");
    } catch (err) {
      toast.error(err.message || "Failed to save module");
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (mid) => {
    if (!window.confirm("Delete this app module?")) return;
    try {
      await adminService.deleteAppModule(mid);
      toast.success("Module deleted");
      fetchModules();
    } catch (err) {
      toast.error("Failed to delete module");
    }
  };
  const filteredModules = useMemo(() => {
    return modules.filter((moduleItem) => {
      const matchesSearch = (moduleItem.name || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesService = !filters.service_type || String(moduleItem.service_type || "").toLowerCase() === String(filters.service_type).toLowerCase();
      const matchesStatus = filters.active === "" || String(Boolean(moduleItem.active)) === String(filters.active === "true");
      return matchesSearch && matchesService && matchesStatus;
    });
  }, [filters, modules, searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filteredModules.length / entriesPerPage));
  const paginatedModules = useMemo(() => {
    const startIndex = (currentPage - 1) * entriesPerPage;
    return filteredModules.slice(startIndex, startIndex + entriesPerPage);
  }, [currentPage, entriesPerPage, filteredModules]);
  useEffect(() => {
    setCurrentPage(1);
  }, [entriesPerPage, filters, searchTerm]);
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);
  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const clearFilters = () => {
    setFilters({
      service_type: "",
      active: ""
    });
  };
  if (isList) {
    return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-[#F3F4F9] animate-in fade-in duration-500 font-sans flex flex-col", children: [
      /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-100 px-8 py-5 flex items-center justify-between shrink-0", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-[14px] font-black text-slate-800 uppercase tracking-tight", children: "APP MODULES" }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-[11px] font-bold text-gray-400", children: [
          /* @__PURE__ */ jsx("span", { children: "App Modules" }),
          /* @__PURE__ */ jsx(ChevronRight, { size: 12, className: "opacity-30" }),
          /* @__PURE__ */ jsx("span", { className: "text-gray-500", children: "App Modules" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto p-8 lg:p-10", children: /* @__PURE__ */ jsx(
        motion.div,
        {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -10 },
          className: "max-w-7xl mx-auto",
          children: /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[500px]", children: [
            /* @__PURE__ */ jsxs("div", { className: "p-8 flex flex-col md:flex-row md:items-center justify-between gap-6", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 text-[13px] text-gray-400 font-medium", children: [
                /* @__PURE__ */ jsx("span", { children: "show" }),
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: entriesPerPage,
                    onChange: (e) => setEntriesPerPage(Number(e.target.value)),
                    className: "bg-white border border-gray-300 rounded-md px-2 py-1 text-slate-700 outline-none focus:border-indigo-500",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: 10, children: "10" }),
                      /* @__PURE__ */ jsx("option", { value: 20, children: "20" }),
                      /* @__PURE__ */ jsx("option", { value: 50, children: "50" })
                    ]
                  }
                ),
                /* @__PURE__ */ jsx("span", { children: "entries" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                  /* @__PURE__ */ jsx(Search, { size: 16, className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" }),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      value: searchTerm,
                      onChange: (e) => setSearchTerm(e.target.value),
                      placeholder: "Search modules",
                      className: "h-10 w-52 rounded-full border border-gray-200 bg-white pl-9 pr-4 text-[13px] font-medium text-slate-700 outline-none transition-colors focus:border-indigo-500"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: () => setIsFilterOpen((current) => !current),
                    className: "flex items-center gap-2 px-5 py-2.5 bg-[#EF6C4D] text-white rounded-lg text-[13px] font-bold shadow-md hover:bg-[#D95B3D] transition-colors",
                    children: [
                      /* @__PURE__ */ jsx(Filter, { size: 16 }),
                      " ",
                      isFilterOpen ? "Hide Filters" : "Filters"
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => navigate("create"),
                    className: "flex items-center gap-2 px-5 py-2.5 bg-[#3B488C] text-white rounded-lg text-[13px] font-bold shadow-md hover:bg-[#2D3870] transition-colors",
                    children: [
                      /* @__PURE__ */ jsx(Plus, { size: 18 }),
                      " Add App Modules"
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx(AnimatePresence, { initial: false, children: isFilterOpen ? /* @__PURE__ */ jsxs(
              motion.div,
              {
                initial: { opacity: 0, height: 0 },
                animate: { opacity: 1, height: "auto" },
                exit: { opacity: 0, height: 0 },
                className: "overflow-hidden border-t border-gray-100",
                children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-8 pt-5", children: [
                    /* @__PURE__ */ jsx("div", { className: "text-[11px] font-bold uppercase tracking-widest text-gray-400", children: "Filter Sub Module List" }),
                    /* @__PURE__ */ jsxs(
                      "button",
                      {
                        type: "button",
                        onClick: () => setIsFilterOpen(false),
                        className: "inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-50",
                        children: [
                          /* @__PURE__ */ jsx(X, { size: 14 }),
                          " Close"
                        ]
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-4 px-8 py-6 md:grid-cols-3", children: [
                    /* @__PURE__ */ jsxs("div", { children: [
                      /* @__PURE__ */ jsx("label", { className: labelClass, children: "Service" }),
                      /* @__PURE__ */ jsxs(
                        "select",
                        {
                          value: filters.service_type,
                          onChange: (e) => updateFilter("service_type", e.target.value),
                          className: selectClass,
                          children: [
                            /* @__PURE__ */ jsx("option", { value: "", children: "All services" }),
                            SERVICE_OPTIONS.map((s) => /* @__PURE__ */ jsx("option", { value: s.value, children: s.label }, s.value))
                          ]
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs("div", { children: [
                      /* @__PURE__ */ jsx("label", { className: labelClass, children: "Status" }),
                      /* @__PURE__ */ jsxs(
                        "select",
                        {
                          value: filters.active,
                          onChange: (e) => updateFilter("active", e.target.value),
                          className: selectClass,
                          children: [
                            /* @__PURE__ */ jsx("option", { value: "", children: "All statuses" }),
                            /* @__PURE__ */ jsx("option", { value: "true", children: "Active" }),
                            /* @__PURE__ */ jsx("option", { value: "false", children: "Inactive" })
                          ]
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsx("div", { className: "flex items-end", children: /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        onClick: clearFilters,
                        className: "h-[42px] w-full rounded-lg border border-gray-200 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50",
                        children: "Reset Filters"
                      }
                    ) })
                  ] })
                ]
              }
            ) : null }),
            /* @__PURE__ */ jsxs("div", { className: "px-8 pb-8", children: [
              /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-left", children: [
                /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "bg-[#E9E9E9]", children: [
                  /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-[13px] font-bold text-slate-700", children: "Name" }),
                  /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-[13px] font-bold text-slate-700", children: "Service" }),
                  /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-[13px] font-bold text-slate-700", children: "Thumbnail" }),
                  /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-[13px] font-bold text-slate-700", children: "Status" }),
                  /* @__PURE__ */ jsx("th", { className: "px-6 py-4 text-[13px] font-bold text-slate-700", children: "Action" })
                ] }) }),
                /* @__PURE__ */ jsx("tbody", { className: "divide-y divide-gray-50", children: loading ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: "5", className: "py-24 text-center", children: /* @__PURE__ */ jsx(Loader2, { className: "animate-spin text-indigo-600 mx-auto", size: 32 }) }) }) : paginatedModules.length > 0 ? paginatedModules.map((m) => /* @__PURE__ */ jsxs("tr", { className: "hover:bg-gray-50/50 transition-colors group border-b border-gray-50 last:border-0", children: [
                  /* @__PURE__ */ jsx("td", { className: "px-6 py-5", children: /* @__PURE__ */ jsx("span", { className: "text-[14px] font-bold text-slate-700", children: m.name }) }),
                  /* @__PURE__ */ jsx("td", { className: "px-6 py-5", children: /* @__PURE__ */ jsx("span", { className: "text-[14px] font-medium text-slate-600", children: getServiceLabel(m.service_type) }) }),
                  /* @__PURE__ */ jsx("td", { className: "px-6 py-5", children: /* @__PURE__ */ jsx("div", { className: "w-10 h-10 rounded bg-indigo-50/60 border border-indigo-100 flex items-center justify-center overflow-hidden font-bold text-xs text-indigo-600", children: m.mobile_menu_icon ? /* @__PURE__ */ jsx(
                    "img",
                    {
                      src: m.mobile_menu_icon,
                      className: "w-full h-full object-contain",
                      alt: m.name || "",
                      onError: (e) => {
                        e.target.style.display = "none";
                      }
                    }
                  ) : /* @__PURE__ */ jsx("span", { children: m.name?.substring(0, 2).toUpperCase() || "MOD" }) }) }),
                  /* @__PURE__ */ jsx("td", { className: "px-6 py-5", children: /* @__PURE__ */ jsx(
                    StatusToggle,
                    {
                      active: m.active,
                      onToggle: () => {
                        adminService.updateAppModule(m._id || m.id, { active: !m.active }).then(() => {
                          toast.success("Status Updated");
                          fetchModules();
                        });
                      }
                    }
                  ) }),
                  /* @__PURE__ */ jsx("td", { className: "px-6 py-5", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ jsx("button", { onClick: () => navigate(`edit/${m._id || m.id}`), className: "p-2 bg-orange-50 text-orange-400 hover:bg-orange-100 rounded-lg transition-colors", children: /* @__PURE__ */ jsx(Edit2, { size: 16 }) }),
                    /* @__PURE__ */ jsx("button", { onClick: () => handleDelete(m._id || m.id), className: "p-2 bg-rose-50 text-rose-400 hover:bg-rose-100 rounded-lg transition-colors", children: /* @__PURE__ */ jsx(Trash2, { size: 16 }) })
                  ] }) })
                ] }, m._id || m.id)) : /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: "5", className: "py-32 text-center text-gray-400 font-medium italic", children: "No records integrated in the system database." }) }) })
              ] }) }),
              /* @__PURE__ */ jsxs("div", { className: "mt-6 flex flex-col gap-4 border-t border-gray-100 pt-5 text-sm text-gray-500 md:flex-row md:items-center md:justify-between", children: [
                /* @__PURE__ */ jsxs("span", { children: [
                  "Showing ",
                  paginatedModules.length ? (currentPage - 1) * entriesPerPage + 1 : 0,
                  " to",
                  " ",
                  (currentPage - 1) * entriesPerPage + paginatedModules.length,
                  " of ",
                  filteredModules.length,
                  " entries"
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => setCurrentPage((page) => Math.max(1, page - 1)),
                      disabled: currentPage === 1,
                      className: "rounded-lg border border-gray-200 px-3 py-2 font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
                      children: "Previous"
                    }
                  ),
                  /* @__PURE__ */ jsxs("span", { className: "min-w-[90px] text-center font-semibold text-slate-700", children: [
                    "Page ",
                    currentPage,
                    " / ",
                    totalPages
                  ] }),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => setCurrentPage((page) => Math.min(totalPages, page + 1)),
                      disabled: currentPage === totalPages,
                      className: "rounded-lg border border-gray-200 px-3 py-2 font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
                      children: "Next"
                    }
                  )
                ] })
              ] })
            ] })
          ] })
        },
        "list"
      ) })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-[#F3F4F9] animate-in fade-in duration-500 font-sans flex flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0 shadow-sm relative z-10", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-[14px] font-black text-slate-900 uppercase tracking-tight", children: isEdit ? "EDIT" : "CREATE" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-[11px] font-bold text-gray-400", children: [
        /* @__PURE__ */ jsx("span", { className: "hover:text-indigo-600 cursor-pointer", onClick: () => navigate("/taxi/admin/pricing/app-modules"), children: "App Modules" }),
        /* @__PURE__ */ jsx(ChevronRight, { size: 12, className: "opacity-50" }),
        /* @__PURE__ */ jsx("span", { className: "text-gray-700", children: isEdit ? "Edit" : "Create" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto p-8 lg:p-10 shrink-0", children: /* @__PURE__ */ jsxs(
      motion.div,
      {
        initial: { opacity: 0, x: 20 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -20 },
        className: "max-w-[1400px] mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-8 lg:p-12 mb-20",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8", children: [
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Name *" }),
              /* @__PURE__ */ jsx("input", { name: "name", value: formData.name, onChange: handleInputChange, placeholder: "Enter Name", className: inputClass })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5 font-sans", children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Service *" }),
              /* @__PURE__ */ jsxs("select", { name: "service_type", value: formData.service_type, onChange: handleInputChange, className: selectClass, children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Choose Service" }),
                SERVICE_OPTIONS.map((s) => /* @__PURE__ */ jsx("option", { value: s.value, children: s.label }, s.value)),
                formData.service_type && !SERVICE_OPTIONS.some((s) => s.value === formData.service_type) ? /* @__PURE__ */ jsxs("option", { value: formData.service_type, children: [
                  getServiceLabel(formData.service_type),
                  " (legacy)"
                ] }) : null
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Icon Type" }),
              /* @__PURE__ */ jsxs("select", { name: "icon_type", value: formData.icon_type, onChange: handleInputChange, className: selectClass, children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Choose Icon Type" }),
                /* @__PURE__ */ jsx("option", { value: "car", children: "Car" }),
                /* @__PURE__ */ jsx("option", { value: "bike", children: "Bike" }),
                /* @__PURE__ */ jsx("option", { value: "auto", children: "Auto" }),
                /* @__PURE__ */ jsx("option", { value: "truck", children: "Truck" }),
                /* @__PURE__ */ jsx("option", { value: "ehcv", children: "EHCV" }),
                /* @__PURE__ */ jsx("option", { value: "hatchback", children: "Hatchback" }),
                /* @__PURE__ */ jsx("option", { value: "hcv", children: "HCV" }),
                /* @__PURE__ */ jsx("option", { value: "lcv", children: "LCV" }),
                /* @__PURE__ */ jsx("option", { value: "mcv", children: "MCV" }),
                /* @__PURE__ */ jsx("option", { value: "luxury", children: "Luxury" }),
                /* @__PURE__ */ jsx("option", { value: "premium", children: "Premium" }),
                /* @__PURE__ */ jsx("option", { value: "suv", children: "SUV" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Order Number *" }),
              /* @__PURE__ */ jsx("input", { type: "number", name: "order_by", value: formData.order_by, onChange: handleInputChange, placeholder: "Enter Order Number", className: inputClass })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx("label", { className: labelClass, children: "Short Description *" }),
              /* @__PURE__ */ jsx("input", { name: "short_description", value: formData.short_description, onChange: handleInputChange, placeholder: "Enter Short Description", className: inputClass })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mt-8 space-y-1.5", children: [
            /* @__PURE__ */ jsx("label", { className: labelClass, children: "Description *" }),
            /* @__PURE__ */ jsx("textarea", { name: "description", value: formData.description, onChange: handleInputChange, rows: 4, placeholder: "Enter Description", className: inputClass + " resize-none" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mt-10", children: [
            /* @__PURE__ */ jsx("label", { className: labelClass, children: "Thumbnail (512px x 512px) *" }),
            /* @__PURE__ */ jsxs(
              "div",
              {
                onClick: () => document.getElementById("module_icon_up").click(),
                className: "mt-2 w-full max-w-[400px] h-[300px] border-2 border-dashed border-gray-100 rounded-xl flex flex-col items-center justify-center bg-gray-50/30 hover:bg-gray-50 hover:border-indigo-400 transition-all cursor-pointer group group relative overflow-hidden shadow-inner",
                children: [
                  imagePreview || formData.mobile_menu_icon ? /* @__PURE__ */ jsxs("div", { className: "relative w-full h-full p-8 flex items-center justify-center", children: [
                    /* @__PURE__ */ jsx("img", { src: imagePreview || formData.mobile_menu_icon, className: "max-w-full max-h-full object-contain", alt: "Preview" }),
                    imageUploading && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-sm", children: /* @__PURE__ */ jsx(Loader2, { className: "animate-spin text-indigo-600" }) })
                  ] }) : /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
                    /* @__PURE__ */ jsx("div", { className: "text-gray-400 mb-3 font-semibold group-hover:text-indigo-500 transition-colors", children: "Upload Image" }),
                    /* @__PURE__ */ jsx("div", { className: "w-10 h-10 border border-gray-200 rounded-lg flex items-center justify-center mx-auto text-gray-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-all", children: /* @__PURE__ */ jsx(ImageIcon, { size: 20 }) })
                  ] }),
                  /* @__PURE__ */ jsx("input", { id: "module_icon_up", type: "file", accept: "image/*", className: "hidden", onChange: onImageFileChange })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mt-12 flex justify-end gap-3 pt-8 border-t border-gray-100", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => navigate("/taxi/admin/pricing/app-modules"),
                className: "px-6 py-2.5 bg-gray-50 text-gray-500 border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-100 transition-all active:scale-95",
                children: "Cancel"
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: handleSubmit,
                disabled: submitting || imageUploading,
                className: "px-8 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 active:scale-95 flex items-center gap-2",
                children: [
                  submitting ? /* @__PURE__ */ jsx(Loader2, { size: 16, className: "animate-spin" }) : /* @__PURE__ */ jsx(Save, { size: 16 }),
                  isEdit ? "Update Module" : "Push to Production"
                ]
              }
            )
          ] })
        ]
      },
      "form"
    ) })
  ] });
};
export default AppModules;
