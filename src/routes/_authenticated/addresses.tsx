import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { MapPin, Plus, Star, Trash2, Pencil, Loader, X } from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import {
  deleteAddress,
  listAddresses,
  saveAddress,
  setDefaultAddress,
} from "@/services/firebase/addresses";
import type { Address } from "@/types/customer";

export const Route = createFileRoute("/_authenticated/addresses")({
  component: AddressesPage,
});

const schema = z.object({
  label: z.string().trim().min(2, "Label is required").max(30),
  fullName: z.string().trim().min(2, "Enter the full name").max(80),
  phone: z.string().trim().min(6, "Enter a valid phone").max(20),
  addressLine: z.string().trim().min(4, "Enter the street address").max(200),
  city: z.string().trim().min(2, "Enter the city").max(60),
  postalCode: z.string().trim().min(2, "Enter a postal code").max(20),
  country: z.string().trim().min(2, "Enter the country").max(60),
  notes: z.string().max(300).optional(),
  isDefault: z.boolean(),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  label: "Home",
  fullName: "",
  phone: "",
  addressLine: "",
  city: "",
  postalCode: "",
  country: "Bangladesh",
  notes: "",
  isDefault: false,
};

function AddressesPage() {
  const { user } = useAuth();
  const [editing, setEditing] = useState<Address | null>(null);
  const [open, setOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["addresses", user?.uid],
    queryFn: () => listAddresses(user!.uid),
    enabled: !!user,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const startNew = () => {
    setEditing(null);
    reset(EMPTY);
    setOpen(true);
  };

  const startEdit = (a: Address) => {
    setEditing(a);
    reset({
      label: a.label,
      fullName: a.fullName,
      phone: a.phone,
      addressLine: a.addressLine,
      city: a.city,
      postalCode: a.postalCode,
      country: a.country,
      notes: a.notes ?? "",
      isDefault: a.isDefault,
    });
    setOpen(true);
  };

  const onSubmit = async (v: Values) => {
    if (!user) return;
    try {
      const list = data ?? [];
      await saveAddress(user.uid, { ...v, isDefault: v.isDefault || list.length === 0 }, editing?.id);
      toast.success(editing ? "Address updated" : "Address saved");
      setOpen(false);
      setEditing(null);
      reset(EMPTY);
      await refetch();
    } catch {
      toast.error("Could not save this address");
    }
  };

  const onDelete = async (a: Address) => {
    if (!user) return;
    try {
      await deleteAddress(user.uid, a.id);
      toast.success("Address removed");
      await refetch();
    } catch {
      toast.error("Could not remove this address");
    }
  };

  const onDefault = async (a: Address) => {
    if (!user) return;
    await setDefaultAddress(user.uid, a.id);
    toast.success("Default address updated");
    await refetch();
  };

  const field = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition";

  return (
    <ServicePageLayout title="Address Book" subtitle="Manage your delivery addresses">
      <div className="mb-4 flex justify-end">
        <button
          onClick={startNew}
          className="inline-flex items-center gap-2 rounded-xl bg-[#f57224] px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95"
        >
          <Plus className="h-4 w-4" /> Add address
        </button>
      </div>

      {/* Add/Edit form */}
      {open && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mb-4 grid gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:grid-cols-2"
        >
          <div className="flex items-center justify-between sm:col-span-2">
            <h2 className="font-bold text-slate-800">{editing ? "Edit address" : "New address"}</h2>
            <button type="button" onClick={() => { setOpen(false); setEditing(null); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Label</label>
            <input {...register("label")} className={field} placeholder="Home, Office…" />
            {errors.label && <p className="mt-1 text-xs text-red-500">{errors.label.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
            <input {...register("fullName")} className={field} />
            {errors.fullName && <p className="mt-1 text-xs text-red-500">{errors.fullName.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
            <input {...register("phone")} className={field} />
            {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
            <input {...register("city")} className={field} />
            {errors.city && <p className="mt-1 text-xs text-red-500">{errors.city.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Street address</label>
            <input {...register("addressLine")} className={field} />
            {errors.addressLine && <p className="mt-1 text-xs text-red-500">{errors.addressLine.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Postal code</label>
            <input {...register("postalCode")} className={field} />
            {errors.postalCode && <p className="mt-1 text-xs text-red-500">{errors.postalCode.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
            <input {...register("country")} className={field} />
            {errors.country && <p className="mt-1 text-xs text-red-500">{errors.country.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Delivery notes (optional)</label>
            <textarea {...register("notes")} rows={2} className={field} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" {...register("isDefault")} className="h-4 w-4 accent-orange-500" />
            Use as my default address
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#f57224] px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting && <Loader className="h-4 w-4 animate-spin" />} Save address
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setEditing(null); }}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Address list */}
      {isLoading ? (
        <div className="py-20 text-center">
          <Loader className="mx-auto h-8 w-8 animate-spin text-slate-300" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-orange-50 text-[#f57224]">
            <MapPin className="h-7 w-7" />
          </span>
          <h3 className="mt-4 text-base font-bold text-slate-800">No saved addresses</h3>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            Add an address to check out faster next time.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((a) => (
            <div key={a.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{a.label}</span>
                    {a.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-[#f57224]">
                        <Star className="h-3 w-3 fill-current" /> Default
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{a.fullName}</div>
                  <div className="text-sm text-slate-400">{a.phone}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => startEdit(a)}
                    aria-label="Edit address"
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 active:scale-95"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void onDelete(a)}
                    aria-label="Delete address"
                    className="rounded-lg border border-slate-200 p-2 text-red-500 transition hover:bg-red-50 active:scale-95"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 text-sm text-slate-500">
                {a.addressLine}, {a.city}, {a.postalCode}, {a.country}
              </div>
              {!a.isDefault && (
                <button
                  onClick={() => void onDefault(a)}
                  className="mt-3 text-xs font-bold text-[#f57224] hover:underline"
                >
                  Set as default
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </ServicePageLayout>
  );
}
