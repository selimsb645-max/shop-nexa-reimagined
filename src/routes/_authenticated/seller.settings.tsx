import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ImageUp, Store } from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { updateSellerProfile } from "@/services/firebase/sellers";
import { uploadShopLogo } from "@/services/firebase/storage";
import {
  sellerSettingsSchema,
  type SellerSettingsValues,
} from "@/utils/validation";
import { mapFirebaseError } from "@/utils/errors";
import type { SellerProfile } from "@/types/seller";

export const Route = createFileRoute("/_authenticated/seller/settings")({
  component: () => <SellerGate>{(profile) => <SettingsPage profile={profile} />}</SellerGate>,
});

function SettingsPage({ profile }: { profile: SellerProfile }) {
  const { user } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(profile.logoUrl);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SellerSettingsValues>({
    resolver: zodResolver(sellerSettingsSchema),
    defaultValues: {
      shopName: profile.shopName,
      description: profile.description,
      phone: profile.phone,
      addressLine: profile.addressLine,
      city: profile.city,
      country: profile.country,
    },
  });

  useEffect(() => {
    reset({
      shopName: profile.shopName,
      description: profile.description,
      phone: profile.phone,
      addressLine: profile.addressLine,
      city: profile.city,
      country: profile.country,
    });
    setLogoUrl(profile.logoUrl);
  }, [profile, reset]);

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setUploading(true);
    try {
      const url = await uploadShopLogo(user.uid, f);
      setLogoUrl(url);
      await updateSellerProfile(user.uid, { logoUrl: url });
      toast.success("Logo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onSubmit = async (values: SellerSettingsValues) => {
    try {
      await updateSellerProfile(profile.uid, values);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seller settings</h1>
        <p className="text-sm text-muted-foreground">Manage your shop profile and branding.</p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-5 rounded-lg border bg-background p-6"
        noValidate
      >
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted">
            {logoUrl ? (
              <img src={logoUrl} alt="Shop logo" className="h-full w-full object-cover" />
            ) : (
              <Store className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
            >
              {uploading ? <Spinner /> : <ImageUp className="h-4 w-4" />}
              Change logo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onLogo}
            />
          </div>
        </div>

        <Field label="Shop name" error={errors.shopName?.message}>
          <input
            {...register("shopName")}
            className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <textarea
            rows={4}
            {...register("description")}
            className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" error={errors.phone?.message}>
            <input
              {...register("phone")}
              className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="City" error={errors.city?.message}>
            <input
              {...register("city")}
              className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
        <Field label="Address" error={errors.addressLine?.message}>
          <input
            {...register("addressLine")}
            className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Country" error={errors.country?.message}>
          <input
            {...register("country")}
            className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting && <Spinner />} Save changes
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
