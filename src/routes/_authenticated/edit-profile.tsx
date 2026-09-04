import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Upload, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { profileSchema, type ProfileValues } from "@/utils/validation";
import { setDisplayName, setPhotoURL } from "@/services/firebase/auth";
import { uploadAvatar } from "@/services/firebase/storage";
import { mapFirebaseError } from "@/utils/errors";
import { Spinner } from "@/components/common/Spinner";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";

export const Route = createFileRoute("/_authenticated/edit-profile")({
  component: EditProfilePage,
});

function EditProfilePage() {
  const { t } = useI18n();
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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

  const avatar = profile?.photoURL || user.photoURL;
  const name = profile?.displayName || user.displayName || user.email || "Shopper";
  const initial = name.charAt(0).toUpperCase();

  const onSave = async (v: ProfileValues) => {
    try {
      await setDisplayName(user, v.displayName);
      await refreshProfile();
      reset({ displayName: v.displayName });
      toast.success(t("editProfile.profileUpdated"));
      navigate({ to: "/account" });
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
      toast.success(t("editProfile.avatarUpdated"));
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <ServicePageLayout title={t("editProfile.title")} subtitle={t("editProfile.subtitle")}>
      <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        {/* Avatar section */}
        <div className="mb-6 flex flex-col items-center gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="relative">
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="h-24 w-24 rounded-full border-2 border-orange-200 object-cover shadow-md"
              />
            ) : (
              <div className="grid h-24 w-24 place-items-center rounded-full border-2 border-orange-200 bg-orange-50 text-3xl font-bold text-orange-500 shadow-md">
                {initial}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Change avatar"
              className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-orange-500 text-white shadow-md transition hover:bg-orange-600 active:scale-95 disabled:opacity-60"
            >
              {uploading ? <Spinner /> : <Upload className="h-4 w-4" strokeWidth={2.5} />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              className="hidden"
            />
          </div>
          <p className="text-xs text-gray-500">{t("editProfile.changePhoto")}</p>
        </div>

        {/* Edit form */}
        <form
          onSubmit={handleSubmit(onSave)}
          className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {t("editProfile.displayName")}
            </label>
            <input
              {...register("displayName")}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              placeholder={t("editProfile.namePlaceholder")}
            />
            {errors.displayName && (
              <p className="mt-1 text-xs text-red-500">{errors.displayName.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {t("editProfile.emailLabel")}
            </label>
            <input
              value={user.email ?? ""}
              readOnly
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">{t("editProfile.emailLocked")}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {t("editProfile.accountType")}
            </label>
            <input
              value={profile?.role ?? "customer"}
              readOnly
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm capitalize text-gray-500"
            />
          </div>

          {user.emailVerified && (
            <div className="flex items-center gap-2 text-xs text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Email verified
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600 active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting && <Spinner />} {t("editProfile.save")}
          </button>
        </form>
      </div>
    </ServicePageLayout>
  );
}
