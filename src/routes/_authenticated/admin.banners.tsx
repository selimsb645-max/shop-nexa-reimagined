import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageUp, Trash2, Loader2 } from "lucide-react";
import {
  createBanner,
  deleteBanner,
  listBanners,
  updateBanner,
  uploadBannerImage,
} from "@/services/firebase/adminSettings";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { mapFirebaseError } from "@/utils/errors";
import type { Banner } from "@/types/admin";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/banners")({
  component: BannersAdmin,
});

const emptyForm = {
  title: "",
  subtitle: "",
  imageUrl: "",
  ctaLabel: "Shop Now",
  ctaLink: "/shop",
  position: "hero" as Banner["position"],
  active: true,
  order: 0,
};

function BannersAdmin() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setBanners(await listBanners());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadBannerImage(file);
      setForm((f) => ({ ...f, imageUrl: url }));
      toast.success(t("admin.imageUploaded"));
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setUploading(false);
    }
  };

  const onCreate = async () => {
    if (!user || !form.imageUrl) {
      toast.error("Upload a banner image first.");
      return;
    }
    try {
      const id = await createBanner({ ...form, order: Number(form.order) });
      await logActivity({ uid: user.uid, email: user.email }, "banner.create", id, form.title);
      setForm(emptyForm);
      toast.success(t("admin.bannerCreated"));
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onToggle = async (b: Banner) => {
    if (!user) return;
    try {
      await updateBanner(b.id, { active: !b.active });
      await logActivity({ uid: user.uid, email: user.email }, "banner.update", b.id);
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onDelete = async (b: Banner) => {
    if (!user) return;
    if (!confirm(`Delete banner "${b.title}"?`)) return;
    try {
      await deleteBanner(b.id);
      await logActivity({ uid: user.uid, email: user.email }, "banner.delete", b.id, b.title);
      toast.success(t("admin.deleted"));
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.banners")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.bannersDesc")}</p>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("admin.addBanner")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            placeholder={t("admin.title")}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder={t("admin.subtitle")}
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder={t("admin.ctaLabel")}
            value={form.ctaLabel}
            onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="CTA link (e.g. /shop)"
            value={form.ctaLink}
            onChange={(e) => setForm({ ...form, ctaLink: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <select
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value as Banner["position"] })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="hero">{t("admin.hero")}</option>
            <option value="middle">{t("admin.middle")}</option>
            <option value="footer">{t("admin.footer")}</option>
          </select>
          <input
            type="number"
            placeholder={t("admin.order")}
            value={form.order}
            onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageUp className="h-4 w-4" />
            )}
            Upload image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
          {form.imageUrl && (
            <img src={form.imageUrl} alt="" className="h-12 rounded-md object-cover" />
          )}
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
            className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create banner
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading banners…
        </div>
      ) : banners.length === 0 ? (
        <div className="rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          No banners yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {banners.map((b) => (
            <div key={b.id} className="overflow-hidden rounded-lg border bg-background">
              <img src={b.imageUrl} alt="" className="h-40 w-full object-cover" />
              <div className="p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                    {b.position}
                  </span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs " +
                      (b.active
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    {b.active ? "Active" : "Hidden"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">#{b.order}</span>
                </div>
                <h3 className="font-semibold">{b.title}</h3>
                <p className="text-sm text-muted-foreground">{b.subtitle}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onToggle(b)}
                    className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    {b.active ? "Hide" : "Show"}
                  </button>
                  <button
                    onClick={() => onDelete(b)}
                    className="ml-auto rounded-md border p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
