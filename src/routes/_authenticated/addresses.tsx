import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { MapPin, Plus, Star, Trash2, Pencil } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/common/Spinner";
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
      await saveAddress(
        user.uid,
        { ...v, isDefault: v.isDefault || list.length === 0 },
        editing?.id,
      );
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

  const field = "w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary";

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Address Book</h1>
            <p className="text-sm text-muted-foreground">Saved delivery addresses for faster checkout</p>
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add address
          </button>
        </div>

        {open && (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid gap-4 rounded-lg border bg-background p-6 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <h2 className="font-semibold">{editing ? "Edit address" : "New address"}</h2>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Label</label>
              <input {...register("label")} className={field} placeholder="Home, Office…" />
              {errors.label && <p className="mt-1 text-xs text-destructive">{errors.label.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Full name</label>
              <input {...register("fullName")} className={field} />
              {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Phone</label>
              <input {...register("phone")} className={field} />
              {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">City</label>
              <input {...register("city")} className={field} />
              {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">Street address</label>
              <input {...register("addressLine")} className={field} />
              {errors.addressLine && (
                <p className="mt-1 text-xs text-destructive">{errors.addressLine.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Postal code</label>
              <input {...register("postalCode")} className={field} />
              {errors.postalCode && (
                <p className="mt-1 text-xs text-destructive">{errors.postalCode.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Country</label>
              <input {...register("country")} className={field} />
              {errors.country && <p className="mt-1 text-xs text-destructive">{errors.country.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">Delivery notes (optional)</label>
              <textarea {...register("notes")} rows={2} className={field} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" {...register("isDefault")} className="h-4 w-4" />
              Use as my default address
            </label>
            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {isSubmitting && <Spinner />} Save address
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEditing(null);
                }}
                className="rounded-md border px-5 py-2.5 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="py-16 text-center">
            <Spinner />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border bg-background p-16 text-center">
            <MapPin className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No saved addresses</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add an address to check out faster next time.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.map((a) => (
              <div key={a.id} className="rounded-lg border bg-background p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{a.label}</span>
                      {a.isDefault && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm">{a.fullName}</div>
                    <div className="text-sm text-muted-foreground">{a.phone}</div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(a)}
                      aria-label="Edit address"
                      className="rounded-md border p-2 hover:bg-muted"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => void onDelete(a)}
                      aria-label="Delete address"
                      className="rounded-md border p-2 text-destructive hover:bg-muted"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {a.addressLine}, {a.city} {a.postalCode}, {a.country}
                </p>
                {a.notes && <p className="mt-1 text-xs text-muted-foreground">Note: {a.notes}</p>}
                {!a.isDefault && (
                  <button
                    onClick={() => void onDefault(a)}
                    className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <Star className="h-3.5 w-3.5" /> Set as default
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
