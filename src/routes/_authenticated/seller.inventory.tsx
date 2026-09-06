/**
 * AVENTA SHOP — Seller Inventory Management
 *
 * Route: /seller/inventory
 * Dedicated inventory control center. Reuses existing infrastructure:
 * - listSellerProducts, setProductStock (sellerProducts service)
 * - Product type (commerce types)
 * - SellerGate for auth + seller authorization
 *
 * Ownership: products are scoped to the logged-in seller via sellerId.
 * Firestore rules enforce sellerId == auth.uid on every write.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Boxes,
  Loader,
  AlertTriangle,
  PackageX,
  CheckCircle2,
  Minus,
  Plus,
  Save,
  X,
} from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import { listSellerProducts, setProductStock } from "@/services/firebase/sellerProducts";
import { mapFirebaseError } from "@/utils/errors";
import { formatDate } from "@/utils/format";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/seller/inventory")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <InventoryPage sellerId={profile.uid} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Inventory — Seller — AVENTA SHOP" }] }),
});

/** Low-stock threshold used across the seller panel (matches dashboard). */
const LOW_STOCK_THRESHOLD = 5;

type StockState = "in_stock" | "low_stock" | "out_of_stock";

function stockState(stock: number): StockState {
  if (stock <= 0) return "out_of_stock";
  if (stock <= LOW_STOCK_THRESHOLD) return "low_stock";
  return "in_stock";
}

const STOCK_BADGE: Record<StockState, { label: string; cls: string; icon: typeof Boxes }> = {
  in_stock: {
    label: "In Stock",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  low_stock: {
    label: "Low Stock",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    icon: AlertTriangle,
  },
  out_of_stock: {
    label: "Out of Stock",
    cls: "bg-rose-50 text-rose-700 border-rose-200",
    icon: PackageX,
  },
};

function InventoryPage({ sellerId }: { sellerId: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setProducts(await listSellerProducts(sellerId));
    } catch {
      setError("Unable to load inventory. Please try again.");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  const applyStock = async (product: Product, raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      toast.error("Enter a valid whole number (0 or more).");
      return;
    }
    setSavingId(product.id);
    try {
      await setProductStock(sellerId, product.id, parsed);
      setProducts((prev) =>
        prev
          ? prev.map((p) => (p.id === product.id ? { ...p, stock: Math.floor(parsed) } : p))
          : prev,
      );
      toast.success(`Stock updated for "${product.title}"`);
      setEditingId(null);
    } catch (err) {
      toast.error(mapFirebaseError(err) || "Unable to update stock. Your changes were not saved.");
    } finally {
      setSavingId(null);
    }
  };

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-rose-200 p-6 text-sm text-rose-700">
        {error}
        <button
          onClick={() => void load()}
          className="mt-3 block rounded-lg bg-[#f57224] px-4 py-2 text-xs font-bold text-white hover:bg-orange-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (products === null) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  const active = products.filter((p) => p.status !== "archived");
  const lowStockItems = active.filter((p) => stockState(p.stock) !== "in_stock");

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">Inventory</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Track stock levels and restock before you run out.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Total Products" value={String(active.length)} />
        <SummaryCard
          label="Low Stock"
          value={String(active.filter((p) => stockState(p.stock) === "low_stock").length)}
          tone="warn"
        />
        <SummaryCard
          label="Out of Stock"
          value={String(active.filter((p) => stockState(p.stock) === "out_of_stock").length)}
          tone="danger"
        />
      </div>

      {/* Low stock alerts */}
      {lowStockItems.length > 0 && (
        <section
          className="bg-white rounded-xl border border-amber-200 p-4 sm:p-5"
          aria-label="Low stock alerts"
        >
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold text-[#0f172a]">Low Stock Alerts</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
              {lowStockItems.length}
            </span>
          </div>
          <ul className="space-y-2">
            {lowStockItems.slice(0, 6).map((p) => {
              const badge = STOCK_BADGE[stockState(p.stock)];
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-amber-50/60 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-[#0f172a]">
                    {p.title}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}
                  >
                    {p.stock <= 0 ? "Out of stock" : `${p.stock} left`}
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(p.id);
                      setEditValue(String(p.stock));
                    }}
                    className="rounded-lg bg-[#0f172a] px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    Restock
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Inventory table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <Boxes className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-bold text-[#0f172a]">Stock Overview</h2>
        </div>

        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-100">
              <Boxes className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="mt-4 text-base font-bold text-[#0f172a]">No Products Yet</h3>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              Add your first product to start selling on AVENTA SHOP.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 sm:px-5">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Updated</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const badge = STOCK_BADGE[stockState(p.stock)];
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-3 sm:px-5">
                          <div className="flex items-center gap-3">
                            {p.images[0] ? (
                              <img
                                src={p.images[0]}
                                alt=""
                                className="h-9 w-9 rounded-lg object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100">
                                <Boxes className="h-4 w-4 text-slate-400" />
                              </div>
                            )}
                            <span className="max-w-[220px] truncate font-medium text-[#0f172a]">
                              {p.title}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{p.sku || "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#0f172a]">
                          {p.stock}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}
                          >
                            <badge.icon className="h-3 w-3" />
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {p.updatedAt ? formatDate(p.updatedAt) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <StockEditor
                            product={p}
                            editingId={editingId}
                            savingId={savingId}
                            editValue={editValue}
                            onEdit={(id, val) => {
                              setEditingId(id);
                              setEditValue(val);
                            }}
                            onCancel={() => setEditingId(null)}
                            onSave={(prod, raw) => void applyStock(prod, raw)}
                            onEditValueChange={setEditValue}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-slate-50 md:hidden">
              {products.map((p) => {
                const badge = STOCK_BADGE[stockState(p.stock)];
                return (
                  <div key={p.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {p.images[0] ? (
                          <img
                            src={p.images[0]}
                            alt=""
                            className="h-10 w-10 rounded-lg object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100">
                            <Boxes className="h-4 w-4 text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#0f172a]">{p.title}</p>
                          <p className="text-xs text-slate-400">SKU: {p.sku || "—"}</p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#0f172a]">
                        {p.stock} in stock
                      </span>
                      <StockEditor
                        product={p}
                        editingId={editingId}
                        savingId={savingId}
                        editValue={editValue}
                        onEdit={(id, val) => {
                          setEditingId(id);
                          setEditValue(val);
                        }}
                        onCancel={() => setEditingId(null)}
                        onSave={(prod, raw) => void applyStock(prod, raw)}
                        onEditValueChange={setEditValue}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Inline stock editor (shared by desktop table + mobile cards). */
function StockEditor({
  product,
  editingId,
  savingId,
  editValue,
  onEdit,
  onCancel,
  onSave,
  onEditValueChange,
}: {
  product: Product;
  editingId: string | null;
  savingId: string | null;
  editValue: string;
  onEdit: (id: string, val: string) => void;
  onCancel: () => void;
  onSave: (product: Product, raw: string) => void;
  onEditValueChange: (val: string) => void;
}) {
  const isEditing = editingId === product.id;
  const isSaving = savingId === product.id;

  if (isSaving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
        <Loader className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  }

  if (isEditing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          min={0}
          step={1}
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(product, editValue);
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
          aria-label={`New stock for ${product.title}`}
          className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[#f57224] focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
        <button
          onClick={() => onSave(product, editValue)}
          className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          aria-label="Save stock"
        >
          <Save className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onCancel}
          className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={() => onEdit(product.id, String(product.stock))}
        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
      >
        Update
      </button>
      <button
        onClick={() => onSave(product, String(Math.max(0, product.stock + 1)))}
        className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
        aria-label={`Increase stock of ${product.title} by 1`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onSave(product, String(Math.max(0, product.stock - 1)))}
        disabled={product.stock <= 0}
        className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Decrease stock of ${product.title} by 1`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "danger";
}) {
  const toneCls =
    tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-rose-600" : "text-[#0f172a]";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneCls}`}>{value}</p>
    </div>
  );
}
