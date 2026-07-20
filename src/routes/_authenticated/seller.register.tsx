import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ImageUp, Store } from "lucide-react";
import { SellerShell } from "@/components/seller/SellerShell";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import {
  applyForSeller,
  getSellerProfile,
} from "@/services/firebase/sellers";
import { uploadShopLogo } from "@/services/firebase/storage";
import {
  sellerApplicationSchema,
  type SellerApplicationValues,
} from "@/utils/validation";
import { mapFirebaseError } from "@/utils/errors";

export const Route = createFileRoute("/_authenticated/seller/register")({
  component: RegisterSellerPage,
});

function RegisterSellerPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SellerApplicationValues>({
    resolver: zodResolver(sellerApplicationSchema),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const existing = await getSellerProfile(user.uid);
      if (cancelled) return;
      if (existing && (existing.status === "pending" || existing.status === "approved")) {
        navigate({ to: "/seller" });
        return;
      }
      if (existing?.logoUrl) setLogoUrl(existing.logoUrl);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const url = await uploadShopLogo(user.uid, file);
      setLogoUrl(url);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onSubmit = async (values: SellerApplicationValues) => {
    if (!user) return;
    try {
      await applyForSeller({
        uid: user.uid,
        email: user.email,
        ...values,
        logoUrl,
      });
      toast.success("Application submitted. We'll review it shortly.");
      navigate({ to: "/seller" });
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  return (
    <SellerShell>
      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading...
        </div>
      ) : (
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Register as a seller</h1>
              <p className="text-sm text-muted-foreground">
                Tell us about your shop. Our team reviews new sellers within 1-2 business days.
              </p>
            </div>
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
                  {logoUrl ? "Change logo" : "Upload logo"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onLogoChange}
                />
                <p className="mt-1 text-xs text-muted-foreground">PNG or JPG, max 5MB.</p>
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
              {isSubmitting && <Spinner />} Submit application
            </button>
          </form>
        </div>
      )}
    </SellerShell>
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
