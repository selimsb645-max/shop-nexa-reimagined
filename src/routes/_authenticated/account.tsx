import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Upload } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { profileSchema, type ProfileValues } from "@/utils/validation";
import { setDisplayName, setPhotoURL, resendVerification } from "@/services/firebase/auth";
import { uploadAvatar } from "@/services/firebase/storage";
import { mapFirebaseError } from "@/utils/errors";
import { Spinner } from "@/components/common/Spinner";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user, profile, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [resending, setResending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { displayName: profile?.displayName || user?.displayName || "" },
  });

  if (!user) return null;

  const onSave = async (v: ProfileValues) => {
    try {
      await setDisplayName(user, v.displayName);
      await refreshProfile();
      reset({ displayName: v.displayName });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(user.uid, file);
      await setPhotoURL(user, url);
      await refreshProfile();
      toast.success("Avatar updated");
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onResend = async () => {
    setResending(true);
    try {
      await resendVerification(user);
      toast.success("Verification email sent");
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setResending(false);
    }
  };

  const avatar = profile?.photoURL || user.photoURL;
  const initial = (profile?.displayName || user.displayName || user.email || "?").charAt(0).toUpperCase();

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your ShopNexa account</p>
        </div>

        <section className="rounded-lg border bg-background p-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              {avatar ? (
                <img src={avatar} alt="Avatar" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  {initial}
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white">
                  <Spinner />
                </div>
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                <Upload className="h-4 w-4" /> Change avatar
              </button>
              <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, up to 5MB</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onFile}
                className="hidden"
              />
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit(onSave)} className="space-y-4 rounded-lg border bg-background p-6">
          <div>
            <label className="mb-1 block text-sm font-medium">Display name</label>
            <input
              {...register("displayName")}
              className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            {errors.displayName && (
              <p className="mt-1 text-xs text-destructive">{errors.displayName.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <div className="flex items-center gap-2">
              <input
                value={user.email ?? ""}
                readOnly
                className="w-full rounded-md border bg-muted px-3 py-2.5 text-sm text-muted-foreground"
              />
              {user.emailVerified ? (
                <span className="flex items-center gap-1 whitespace-nowrap rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 whitespace-nowrap rounded-md bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                  <AlertCircle className="h-3.5 w-3.5" /> Unverified
                </span>
              )}
            </div>
            {!user.emailVerified && (
              <button
                type="button"
                onClick={onResend}
                disabled={resending}
                className="mt-2 text-xs text-primary hover:underline disabled:opacity-60"
              >
                {resending ? "Sending..." : "Resend verification email"}
              </button>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Account type</label>
            <input
              value={profile?.role ?? "customer"}
              readOnly
              className="w-full rounded-md border bg-muted px-3 py-2.5 text-sm capitalize text-muted-foreground"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting && <Spinner />} Save changes
          </button>
        </form>
      </div>
    </AppShell>
  );
}
