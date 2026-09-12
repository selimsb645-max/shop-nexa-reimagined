/**
 * AVENTA SHOP — Seller Coupons
 *
 * Route: /seller/coupons
 * Reuses existing infrastructure:
 * - listSellerCoupons, createSellerCoupon, deleteSellerCoupon,
 * - toggleSellerCoupon — all via server-side functions (validation
 *   + ownership enforced server-side)
 * - Coupon, CouponType types (from commerce types)
 * - SellerGate for auth + seller authorization
 *
 * Ownership: All coupons are scoped to the logged-in seller via
 * sellerId field. Firestore rules enforce sellerId == auth.uid.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Tag,
  Plus,
  Trash2,
  Loader,
  CheckCircle2,
  XCircle,
  Calendar,
  Percent,
  DollarSign,
  X,
} from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import {
  listSellerCoupons,
  createSellerCoupon,
  deleteSellerCoupon,
  toggleSellerCoupon,
} from "@/services/firebase/sellerCoupons";
import { formatPrice, formatDate } from "@/utils/format";
import type { Coupon, CouponType } from "@/types/commerce";
import type { SellerProfile } from "@/types/seller";

export const Route = createFileRoute("/_authenticated/seller/coupons")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <CouponsPage profile={profile} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Coupons — AVENTA SHOP Seller" }] }),
});

interface CouponFormState {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  expiresAt: string;
  usageLimit: string;
  maxDiscount: string;
  active: boolean;
}

const EMPTY_FORM: CouponFormState = {
  code: "",
  type: "percent",
  value: 10,
  minSubtotal: 0,
  expiresAt: "",
  usageLimit: "",
  maxDiscount: "",
  active: true,
};

function CouponsPage({ profile }: { profile: SellerProfile }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CouponFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const list = await listSellerCoupons(profile.uid);
      setCoupons(list);
    } catch (err) {
      toast.error("Could not load coupons");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [profile.uid]);

  async function handleCreate() {
    if (!form.code.trim()) {
      toast.error("Coupon code is required");
      return;
    }
    if (form.value <= 0) {
      toast.error("Discount value must be greater than 0");
      return;
    }
    if (form.type === "percent" && form.value > 100) {
      toast.error("Percentage cannot exceed 100%");
      return;
    }
    if (form.type === "fixed" && form.minSubtotal > 0 && form.value > form.minSubtotal) {
      toast.error("Fixed discount cannot exceed minimum order amount");
      return;
    }

    setSubmitting(true);
    try {
      await createSellerCoupon(profile.uid, {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value),
        minSubtotal: Number(form.minSubtotal),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : null,
        usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
        maxDiscount: form.maxDiscount === "" ? null : Number(form.maxDiscount),
        productIds: [],
        active: form.active,
      });
      toast.success(`Coupon ${form.code.trim().toUpperCase()} created`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create coupon");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(c: Coupon) {
    try {
      await toggleSellerCoupon(profile.uid, c.code, !c.active);
      toast.success(c.active ? "Coupon deactivated" : "Coupon activated");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update coupon");
    }
  }

  async function handleDelete(c: Coupon) {
    if (!confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return;
    try {
      await deleteSellerCoupon(profile.uid, c.code);
      toast.success(`Coupon ${c.code} deleted`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete coupon");
    }
  }

  function isExpired(c: Coupon): boolean {
    return c.expiresAt != null && Date.now() > c.expiresAt;
  }

  function isUsageExhausted(c: Coupon): boolean {
    return c.usageLimit != null && c.uses >= c.usageLimit;
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">Coupons</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create discount codes for your products</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#f57224] hover:bg-orange-600 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center gap-1.5"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "Create Coupon"}
        </button>
      </div>

      {/* Create Coupon Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-sm font-bold text-[#0f172a] mb-4">New Coupon</h2>
          <div className="space-y-4">
            {/* Code + Type */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Coupon Code</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="SUMMER25"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono uppercase outline-none focus:border-[#f57224] transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Discount Type
                </label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setForm({ ...form, type: "percent" })}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      form.type === "percent"
                        ? "border-[#f57224] bg-[#fff7ed] text-[#f57224] font-semibold"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Percent className="w-4 h-4" /> Percentage
                  </button>
                  <button
                    onClick={() => setForm({ ...form, type: "fixed" })}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      form.type === "fixed"
                        ? "border-[#f57224] bg-[#fff7ed] text-[#f57224] font-semibold"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <DollarSign className="w-4 h-4" /> Fixed
                  </button>
                </div>
              </div>
            </div>

            {/* Value + Min Subtotal */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {form.type === "percent" ? "Percentage (%)" : "Amount"}
                </label>
                <input
                  type="number"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                  min={0}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Min Order Amount
                </label>
                <input
                  type="number"
                  value={form.minSubtotal}
                  onChange={(e) => setForm({ ...form, minSubtotal: Number(e.target.value) })}
                  min={0}
                  placeholder="0 = none"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Max Discount
                </label>
                <input
                  type="number"
                  value={form.maxDiscount}
                  onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                  min={0}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
                />
              </div>
            </div>

            {/* Expiry + Usage Limit */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Expiry Date</label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Usage Limit</label>
                <input
                  type="number"
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  min={0}
                  placeholder="Empty = unlimited"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
                />
              </div>
            </div>

            {/* Active toggle + Submit */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                Active immediately
              </label>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="rounded-lg bg-[#f57224] px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {submitting ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {submitting ? "Creating..." : "Create Coupon"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coupons List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="w-8 h-8 animate-spin text-slate-300" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 text-center">
            <Tag className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-400">No coupons yet</p>
            <p className="text-xs text-slate-300 mt-1">
              Create your first coupon to offer discounts to customers
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#f57224] px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Coupon
            </button>
          </div>
        ) : (
          coupons.map((c) => {
            const expired = isExpired(c);
            const exhausted = isUsageExhausted(c);
            const status = !c.active
              ? "inactive"
              : expired
                ? "expired"
                : exhausted
                  ? "exhausted"
                  : "active";

            const statusConfig = {
              active: { label: "Active", color: "#059669", bgColor: "#ecfdf5", icon: CheckCircle2 },
              inactive: { label: "Inactive", color: "#64748b", bgColor: "#f1f5f9", icon: XCircle },
              expired: { label: "Expired", color: "#dc2626", bgColor: "#fef2f2", icon: XCircle },
              exhausted: {
                label: "Limit Reached",
                color: "#d97706",
                bgColor: "#fffbeb",
                icon: XCircle,
              },
            };
            const sc = statusConfig[status as keyof typeof statusConfig];
            const StatusIcon = sc.icon;

            return (
              <div
                key={c.code}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Code */}
                    <div className="flex items-center gap-2 mb-2">
                      <code className="text-sm font-mono font-bold text-[#0f172a] bg-slate-100 px-2 py-1 rounded">
                        {c.code}
                      </code>
                      <span
                        className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: sc.bgColor, color: sc.color }}
                      >
                        <StatusIcon className="w-3 h-3" /> {sc.label}
                      </span>
                    </div>
                    {/* Details */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        {c.type === "percent" ? (
                          <>
                            <Percent className="w-3 h-3" /> {c.value}% off
                          </>
                        ) : (
                          <>
                            <DollarSign className="w-3 h-3" /> {formatPrice(c.value)} off
                          </>
                        )}
                      </span>
                      {c.minSubtotal > 0 && <span>Min order: {formatPrice(c.minSubtotal)}</span>}
                      {c.maxDiscount != null && (
                        <span>Max discount: {formatPrice(c.maxDiscount)}</span>
                      )}
                      {c.expiresAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Expires {formatDate(c.expiresAt)}
                        </span>
                      )}
                      <span>
                        Used: {c.uses}
                        {c.usageLimit ? `/${c.usageLimit}` : " (unlimited)"}
                      </span>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggle(c)}
                      className={`rounded-lg p-2 text-sm transition-colors ${
                        c.active
                          ? "text-slate-400 hover:bg-slate-100"
                          : "text-green-600 hover:bg-green-50"
                      }`}
                      title={c.active ? "Deactivate" : "Activate"}
                    >
                      {c.active ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      className="rounded-lg p-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
