import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import {
  deleteCoupon,
  listCoupons,
  updateCouponActive,
  upsertCoupon,
} from "@/services/firebase/adminCoupons";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { formatPrice, formatDate } from "@/utils/format";
import { mapFirebaseError } from "@/utils/errors";
import type { Coupon, CouponType } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/admin/coupons")({
  component: CouponsAdmin,
});

function CouponsAdmin() {
  const { user } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    code: "",
    type: "percent" as CouponType,
    value: 10,
    minSubtotal: 0,
    expiresAt: "",
    active: true,
    usageLimit: "",
  });

  const refresh = async () => {
    setLoading(true);
    try {
      setCoupons(await listCoupons());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const onCreate = async () => {
    if (!user || !form.code.trim()) {
      toast.error("Coupon code is required");
      return;
    }
    try {
      const code = form.code.trim().toUpperCase();
      await upsertCoupon({
        code,
        type: form.type,
        value: Number(form.value),
        minSubtotal: Number(form.minSubtotal),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : null,
        active: form.active,
        usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
      });
      await logActivity({ uid: user.uid, email: user.email }, "coupon.create", code);
      toast.success("Coupon saved");
      setForm({
        code: "",
        type: "percent",
        value: 10,
        minSubtotal: 0,
        expiresAt: "",
        active: true,
        usageLimit: "",
      });
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onToggle = async (c: Coupon) => {
    if (!user) return;
    try {
      await updateCouponActive(c.code, !c.active);
      await logActivity({ uid: user.uid, email: user.email }, "coupon.update", c.code);
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onDelete = async (c: Coupon) => {
    if (!user) return;
    if (!confirm(`Delete coupon ${c.code}?`)) return;
    try {
      await deleteCoupon(c.code);
      await logActivity({ uid: user.uid, email: user.email }, "coupon.delete", c.code);
      toast.success("Deleted");
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Coupons</h1>
        <p className="text-sm text-muted-foreground">Promo codes and discounts.</p>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">Create / update coupon</h2>
        <div className="grid gap-3 md:grid-cols-6">
          <input
            placeholder="CODE"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            className="rounded-md border bg-background px-3 py-2 text-sm md:col-span-1"
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as CouponType })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="percent">Percent %</option>
            <option value="fixed">Fixed $</option>
          </select>
          <input
            type="number"
            placeholder="Value"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Min subtotal"
            value={form.minSubtotal}
            onChange={(e) => setForm({ ...form, minSubtotal: Number(e.target.value) })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Usage limit"
            value={form.usageLimit}
            onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-3 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>
          <button
            onClick={onCreate}
            className="flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Save coupon
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Spinner /> Loading coupons…
          </div>
        ) : coupons.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">No coupons yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Min subtotal</th>
                <th className="px-3 py-2">Uses</th>
                <th className="px-3 py-2">Expires</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {coupons.map((c) => (
                <tr key={c.code}>
                  <td className="px-3 py-2 font-mono">{c.code}</td>
                  <td className="px-3 py-2 capitalize">{c.type}</td>
                  <td className="px-3 py-2">
                    {c.type === "percent" ? `${c.value}%` : formatPrice(c.value)}
                  </td>
                  <td className="px-3 py-2">{formatPrice(c.minSubtotal)}</td>
                  <td className="px-3 py-2">
                    {c.uses}
                    {c.usageLimit ? `/${c.usageLimit}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {c.expiresAt ? formatDate(c.expiresAt) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => onToggle(c)}
                      className={
                        "rounded-full px-2 py-0.5 text-xs " +
                        (c.active
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground")
                      }
                    >
                      {c.active ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => onDelete(c)}
                      className="rounded-md border p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
