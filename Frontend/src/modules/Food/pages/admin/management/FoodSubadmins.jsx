import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Crown, Loader2, Pencil, Plus, Search, Shield, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { adminAPI } from "@/services/api";
import { canWriteFood } from "@food/constants/foodAdminAccess";
import { getCurrentUser } from "@food/utils/auth";

const getApiErrorMessage = (error, fallback) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;

const ScopeBadgeList = ({ items = [], emptyLabel }) => {
  if (!items.length) {
    return <span className="text-xs font-semibold text-slate-400">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.id}
          className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-orange-700"
        >
          {item.name}
        </span>
      ))}
    </div>
  );
};

export default function FoodSubadmins() {
  const navigate = useNavigate();
  const currentAdmin = getCurrentUser("admin") || {};
  const canCreateAdmin = canWriteFood(currentAdmin, "subadmins");
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getFoodAdmins();
      const results = response?.data?.data?.results || response?.data?.results || [];
      setAdmins(Array.isArray(results) ? results : []);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to load admins."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const filteredAdmins = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return admins;

    return admins.filter((item) =>
      [item.name, item.email, item.phone, item.role, item.admin_type, ...(item.food_zones || []).map((zone) => zone.name)]
        .some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [admins, searchTerm]);

  const stats = useMemo(() => {
    const superadmins = admins.filter((item) => item.admin_type === "superadmin").length;
    const subadmins = admins.filter((item) => item.admin_type === "subadmin").length;
    const activeAdmins = admins.filter((item) => item.active !== false).length;
    return { superadmins, subadmins, activeAdmins };
  }, [admins]);

  const handleDelete = async (admin) => {
    if (!window.confirm(`Delete ${admin.name || "this admin"}?`)) return;

    setDeletingId(String(admin.id || admin._id || ""));
    try {
      await adminAPI.deleteFoodAdminAccount(admin.id || admin._id);
      toast.success("Admin removed.");
      await loadAdmins();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to delete admin."));
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#FFF7ED,_#F8FAFC_42%)] p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              <span>Admin Management</span>
              <ChevronRight size={12} />
              <span className="text-slate-700">Admins</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Food Admin Hierarchy</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
              Manage descendant food admins in your branch. Permissions and zones must stay within your scope.
            </p>
          </div>
          {canCreateAdmin && (
            <button
              type="button"
              onClick={() => navigate("/admin/food/management/admins/create")}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1d4ed8] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5 hover:bg-[#1e40af]"
            >
              <Plus size={16} />
              Create Admin
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Super Admins", value: stats.superadmins, icon: Crown },
            { label: "Subadmins", value: stats.subadmins, icon: Shield },
            { label: "Active", value: stats.activeAdmins, icon: Search },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-orange-50 p-3 text-orange-600">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
                  <p className="text-2xl font-black text-slate-950">{value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="relative mb-5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search admins..."
              className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-orange-500"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : filteredAdmins.length === 0 ? (
            <div className="py-16 text-center text-sm font-semibold text-slate-500">No descendant admins found.</div>
          ) : (
            <div className="space-y-4">
              {filteredAdmins.map((admin) => (
                <div key={admin.id || admin._id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-slate-950">{admin.name}</h3>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
                          {admin.adminLevel || admin.admin_type}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-500">{admin.email}</p>
                      <ScopeBadgeList
                        items={admin.food_zones || []}
                        emptyLabel={admin.admin_type === "superadmin" ? "All zones (superadmin)" : "No zones assigned"}
                      />
                      {Array.isArray(admin.permissions) && admin.permissions.length > 0 && !admin.permissions.includes("*") && (
                        <p className="text-xs font-semibold text-slate-400">
                          {admin.permissions.filter((p) => p.endsWith(".read") || p.endsWith(".view")).length} read ·{" "}
                          {admin.permissions.filter((p) => p.endsWith(".write") || p.endsWith(".manage")).length} write
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/admin/food/management/admins/edit/${admin.id || admin._id}`, { state: { admin } })
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil size={14} />
                      </button>
                      {admin.admin_type === "subadmin" && (
                        <button
                          type="button"
                          disabled={deletingId === String(admin.id || admin._id)}
                          onClick={() => handleDelete(admin)}
                          className="rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === String(admin.id || admin._id) ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
