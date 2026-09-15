import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Truck,
  Plus,
  Trash2,
  Edit3,
  Power,
  X,
  Save,
  AlertCircle,
  GripVertical,
} from "lucide-react";
import { getSiteSettings, saveSiteSettings } from "@/services/firebase/adminSettings";
import type { DeliveryZoneSetting } from "@/types/admin";
import { formatPrice } from "@/utils/format";

export const Route = createFileRoute("/_authenticated/admin/delivery-zones")({
  ssr: false,
  component: AdminDeliveryZonesPage,
  head: () => ({ meta: [{ title: "Delivery Zones — AVENTA SHOP Admin" }] }),
});

function AdminDeliveryZonesPage() {
  const qc = useQueryClient();
  const [editingZone, setEditingZone] = useState<DeliveryZoneSetting | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["siteSettings"],
    queryFn: getSiteSettings,
  });

  const zones = settings?.deliveryZones?.zones ?? [];
  const fallbackZoneId = settings?.deliveryZones?.fallbackZoneId ?? "OUTSIDE_DHAKA";
  const noZoneBehavior = settings?.deliveryZones?.noZoneBehavior ?? "fallback";

  const saveMutation = useMutation({
    mutationFn: async (newZones: DeliveryZoneSetting[]) => {
      await saveSiteSettings({
        deliveryZones: {
          zones: newZones,
          fallbackZoneId,
          noZoneBehavior,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["siteSettings"] });
    },
  });

  const toggleActive = (id: string) => {
    const updated = zones.map((z) => (z.id === id ? { ...z, active: !z.active } : z));
    saveMutation.mutate(updated);
  };

  const deleteZone = (id: string) => {
    const updated = zones.filter((z) => z.id !== id);
    saveMutation.mutate(updated);
  };

  const saveZone = (zone: DeliveryZoneSetting) => {
    const existing = zones.find((z) => z.id === zone.id);
    const updated = existing ? zones.map((z) => (z.id === zone.id ? zone : z)) : [...zones, zone];
    saveMutation.mutate(updated);
    setEditingZone(null);
    setShowForm(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const sortedZones = [...zones].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Truck className="h-5 w-5" /> Delivery Zones
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage delivery zones and charges. Sellers cannot modify these — only Admin.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingZone(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Zone
        </button>
      </div>

      {/* No-zone behavior info */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-amber-900">
              No-Zone Behavior:{" "}
              {noZoneBehavior === "block" ? "Block Checkout" : "Use Fallback Zone"}
            </p>
            <p className="text-amber-700 mt-1">
              When a customer's address doesn't match any active zone:{" "}
              {noZoneBehavior === "block"
                ? "Checkout is blocked with an error message."
                : `The fallback zone "${fallbackZoneId}" charge is applied.`}
            </p>
          </div>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No delivery zones configured. Click "Add Zone" to create one.
        </div>
      ) : (
        <>
          {/* Mobile zone cards */}
          <div className="space-y-3 lg:hidden">
            {sortedZones.map((zone) => (
              <div key={zone.id} className="rounded-lg border bg-background p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">{zone.labelEn}</div>
                    <div className="text-xs text-muted-foreground">{zone.labelBn}</div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      zone.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${zone.active ? "bg-emerald-500" : "bg-slate-400"}`}
                    />
                    {zone.active ? "Active" : "Disabled"}
                  </span>
                </div>

                {zone.description && (
                  <div className="text-xs text-muted-foreground">{zone.description}</div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-t pt-2 text-muted-foreground">
                  <div>
                    <span className="font-semibold text-foreground">{formatPrice(zone.charge)}</span>
                    <span className="mx-1">·</span>
                    <span>ETA: {zone.etaDays[0]}–{zone.etaDays[1]} days</span>
                  </div>
                  <div className="inline-flex items-center gap-1">
                    <GripVertical className="h-3 w-3" /> Priority: {zone.priority}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1 border-t pt-2">
                  <button
                    onClick={() => toggleActive(zone.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                    title={zone.active ? "Disable" : "Enable"}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingZone(zone);
                      setShowForm(true);
                    }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                    title="Edit"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteZone(zone.id)}
                    className="rounded p-1.5 text-red-500 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-background lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Priority</th>
                  <th className="px-4 py-3 text-left font-medium">Zone Name</th>
                  <th className="px-4 py-3 text-left font-medium">Charge</th>
                  <th className="px-4 py-3 text-left font-medium">ETA (days)</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedZones.map((zone) => (
                  <tr key={zone.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <GripVertical className="h-3 w-3" /> {zone.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{zone.labelEn}</div>
                      <div className="text-xs text-muted-foreground">{zone.labelBn}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{zone.description}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{formatPrice(zone.charge)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {zone.etaDays[0]}–{zone.etaDays[1]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          zone.active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${zone.active ? "bg-emerald-500" : "bg-slate-400"}`}
                        />
                        {zone.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => toggleActive(zone.id)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                          title={zone.active ? "Disable" : "Enable"}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingZone(zone);
                            setShowForm(true);
                          }}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteZone(zone.id)}
                          className="rounded p-1.5 text-red-500 hover:bg-red-50"
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
          </div>
        </>
      )}

      {/* Edit/Create form modal */}
      {showForm && (
        <ZoneForm
          zone={editingZone}
          existingIds={zones.map((z) => z.id)}
          maxPriority={Math.max(0, ...zones.map((z) => z.priority))}
          onSave={saveZone}
          onCancel={() => {
            setEditingZone(null);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function ZoneForm({
  zone,
  existingIds,
  maxPriority,
  onSave,
  onCancel,
}: {
  zone: DeliveryZoneSetting | null;
  existingIds: string[];
  maxPriority: number;
  onSave: (zone: DeliveryZoneSetting) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<DeliveryZoneSetting>(
    zone ?? {
      id: "",
      labelEn: "",
      labelBn: "",
      charge: 0,
      etaDays: [1, 2],
      description: "",
      active: true,
      priority: maxPriority + 1,
    },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim() || !form.labelEn.trim()) return;
    if (!zone && existingIds.includes(form.id)) {
      alert("A zone with this ID already exists.");
      return;
    }
    onSave({
      ...form,
      charge: Math.max(0, Number(form.charge)),
      priority: Math.max(1, Number(form.priority)),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{zone ? "Edit Zone" : "Add Delivery Zone"}</h2>
          <button onClick={onCancel} className="rounded p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Zone ID</label>
            <input
              type="text"
              value={form.id}
              onChange={(e) =>
                setForm({ ...form, id: e.target.value.toUpperCase().replace(/\s+/g, "_") })
              }
              disabled={!!zone}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              placeholder="e.g. INSIDE_DHAKA"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Label (English)</label>
            <input
              type="text"
              value={form.labelEn}
              onChange={(e) => setForm({ ...form, labelEn: e.target.value })}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="e.g. Inside Dhaka City"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Label (Bangla)</label>
            <input
              type="text"
              value={form.labelBn}
              onChange={(e) => setForm({ ...form, labelBn: e.target.value })}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="যেমন: ঢাকা শহরে"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Charge (৳)</label>
              <input
                type="number"
                min="0"
                value={form.charge}
                onChange={(e) => setForm({ ...form, charge: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Priority</label>
              <input
                type="number"
                min="1"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">ETA Min (days)</label>
              <input
                type="number"
                min="0"
                value={form.etaDays[0]}
                onChange={(e) =>
                  setForm({ ...form, etaDays: [Number(e.target.value), form.etaDays[1]] })
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">ETA Max (days)</label>
              <input
                type="number"
                min="0"
                value={form.etaDays[1]}
                onChange={(e) =>
                  setForm({ ...form, etaDays: [form.etaDays[0], Number(e.target.value)] })
                }
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              rows={2}
              placeholder="Areas covered by this zone"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
