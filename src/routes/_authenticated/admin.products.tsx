import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, X, Trash2, Search } from "lucide-react";
import {
  listAllProductsAdmin,
  approveProduct,
  deleteProductAdmin,
  bulkPriceUpdate,
  bulkSetStatus,
  bulkSetApproval,
  bulkSetStock,
  bulkDelete,
} from "@/services/firebase/adminProducts";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/services/firebase/adminLogs";
import { Spinner } from "@/components/common/Spinner";
import { formatPrice, formatDate } from "@/utils/format";
import { mapFirebaseError } from "@/utils/errors";
import type { Product } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/products")({
  component: ProductsAdmin,
});

type Row = Product & { approved: boolean };

function ProductsAdmin() {

  const { t } = useI18n();  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "draft" | "published" | "archived">("");
  const [approvalFilter, setApprovalFilter] = useState<"" | "approved" | "pending">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<
    "" | "price_set" | "price_inc_pct" | "price_dec_pct" | "stock_set" | "publish" | "draft" | "archive" | "approve" | "unapprove" | "delete"
  >("");
  const [bulkValue, setBulkValue] = useState<string>("");

  const refresh = async () => {
    setLoading(true);
    try {
      setRows(await listAllProductsAdmin());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (approvalFilter === "approved" && !r.approved) return false;
      if (approvalFilter === "pending" && r.approved) return false;
      if (term) {
        const hay = `${r.title} ${r.sku ?? ""} ${r.categorySlug}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, q, statusFilter, approvalFilter]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  const runBulk = async () => {
    if (!bulkMode || !selected.size || !user) return;
    const ids = Array.from(selected);
    const num = Number(bulkValue);
    try {
      let count = 0;
      switch (bulkMode) {
        case "price_set":
          count = await bulkPriceUpdate({ ids, mode: "set", value: num });
          break;
        case "price_inc_pct":
          count = await bulkPriceUpdate({ ids, mode: "increase_percent", value: num });
          break;
        case "price_dec_pct":
          count = await bulkPriceUpdate({ ids, mode: "decrease_percent", value: num });
          break;
        case "stock_set":
          count = await bulkSetStock(ids, num);
          break;
        case "publish":
          count = await bulkSetStatus(ids, "published");
          break;
        case "draft":
          count = await bulkSetStatus(ids, "draft");
          break;
        case "archive":
          count = await bulkSetStatus(ids, "archived");
          break;
        case "approve":
          count = await bulkSetApproval(ids, true);
          break;
        case "unapprove":
          count = await bulkSetApproval(ids, false);
          break;
        case "delete":
          if (!confirm(`Delete ${ids.length} products? This cannot be undone.`)) return;
          count = await bulkDelete(ids);
          break;
      }
      await logActivity(
        { uid: user.uid, email: user.email },
        "product.bulk_update",
        `products (${count})`,
        `${bulkMode} value=${bulkValue}`,
      );
      toast.success(`${count} product(s) updated`);
      setSelected(new Set());
      setBulkValue("");
      setBulkMode("");
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onApprove = async (id: string, approved: boolean) => {
    if (!user) return;
    try {
      await approveProduct(id, approved);
      await logActivity(
        { uid: user.uid, email: user.email },
        approved ? "product.approve" : "product.reject",
        id,
      );
      toast.success(approved ? "Product approved" : "Approval revoked");
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onDelete = async (id: string) => {
    if (!user) return;
    if (!confirm("Delete this product?")) return;
    try {
      await deleteProductAdmin(id);
      await logActivity({ uid: user.uid, email: user.email }, "product.delete", id);
      toast.success(t("admin.productDeleted"));
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.products")}</h1>
          <p className="text-sm text-muted-foreground">
            Approve listings, adjust inventory, bulk update prices.
          </p>
        </div>
        <Link
          to="/admin/products/new"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Add Product
        </Link>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by title, SKU, category…"
              className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("admin.allStatuses")}</option>
            <option value="published">{t("admin.published")}</option>
            <option value="draft">{t("admin.draft")}</option>
            <option value="archived">{t("admin.archived")}</option>
          </select>
          <select
            value={approvalFilter}
            onChange={(e) => setApprovalFilter(e.target.value as typeof approvalFilter)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("admin.allApprovals")}</option>
            <option value="approved">{t("admin.approved")}</option>
            <option value="pending">{t("admin.pendingApproval")}</option>
          </select>
        </div>

        {selected.size > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <select
              value={bulkMode}
              onChange={(e) => setBulkMode(e.target.value as typeof bulkMode)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Choose action…</option>
              <option value="price_set">Set price to…</option>
              <option value="price_inc_pct">Increase price by %</option>
              <option value="price_dec_pct">Decrease price by %</option>
              <option value="stock_set">Set stock to…</option>
              <option value="publish">{t("admin.publish")}</option>
              <option value="draft">{t("admin.setToDraft")}</option>
              <option value="archive">{t("admin.archive")}</option>
              <option value="approve">{t("admin.approve")}</option>
              <option value="unapprove">{t("admin.revokeApproval")}</option>
              <option value="delete">{t("admin.delete")}</option>
            </select>
            {["price_set", "price_inc_pct", "price_dec_pct", "stock_set"].includes(bulkMode) && (
              <input
                type="number"
                min={0}
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder={t("admin.value")}
                className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            )}
            <button
              onClick={runBulk}
              disabled={!bulkMode}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Apply
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Spinner /> Loading products…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">No products found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">{t("admin.product")}</th>
                <th className="px-3 py-2">{t("admin.price")}</th>
                <th className="px-3 py-2">{t("admin.stock")}</th>
                <th className="px-3 py-2">{t("admin.status")}</th>
                <th className="px-3 py-2">Approval</th>
                <th className="px-3 py-2">{t("admin.created")}</th>
                <th className="px-3 py-2 text-right">{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      {p.images[0] ? (
                        <img
                          src={p.images[0]}
                          alt=""
                          className="h-10 w-10 rounded-md object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-muted" />
                      )}
                      <div>
                        <div className="font-medium">{p.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.categorySlug} {p.sku ? `· SKU ${p.sku}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">{formatPrice(p.price)}</td>
                  <td className="px-3 py-2">{p.stock}</td>
                  <td className="px-3 py-2 capitalize">{p.status}</td>
                  <td className="px-3 py-2">
                    {p.approved ? (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
                        Approved
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(p.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => onApprove(p.id, !p.approved)}
                        title={p.approved ? "Revoke approval" : "Approve"}
                        className="rounded-md border p-1.5 hover:bg-muted"
                      >
                        {p.approved ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                      <Link
                        to="/admin/products/$id/edit"
                        params={{ id: p.id }}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => onDelete(p.id)}
                        className="rounded-md border p-1.5 text-destructive hover:bg-destructive/10"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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
