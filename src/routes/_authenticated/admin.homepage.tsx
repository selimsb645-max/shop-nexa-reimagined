import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getSiteSettings, saveSiteSettings } from "@/services/firebase/adminSettings";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { mapFirebaseError } from "@/utils/errors";
import type { SiteSettings } from "@/types/admin";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/homepage")({
  component: HomepageAdmin,
});

function HomepageAdmin() {

  const { t } = useI18n();  const { user } = useAuth();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setSettings(await getSiteSettings());
    })();
  }, []);

  if (!settings) return <Spinner />;

  const update = (patch: Partial<SiteSettings["homepage"]>) => {
    setSettings({ ...settings, homepage: { ...settings.homepage, ...patch } });
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveSiteSettings({ homepage: settings.homepage });
      await logActivity(
        { uid: user.uid, email: user.email },
        "settings.update",
        "homepage",
      );
      toast.success(t("admin.homepageSaved"));
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.homepage")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.homepageDesc")}</p>
      </div>
      <div className="rounded-lg border bg-background p-4 space-y-3">
        <Field
          label="Hero headline"
          value={settings.homepage.heroHeadline}
          onChange={(v) => update({ heroHeadline: v })}
        />
        <Field
          label="Hero subheadline"
          value={settings.homepage.heroSubheadline}
          onChange={(v) => update({ heroSubheadline: v })}
          textarea
        />
        <Field
          label="Hero CTA label"
          value={settings.homepage.heroCtaLabel}
          onChange={(v) => update({ heroCtaLabel: v })}
        />
        <Field
          label="Hero CTA link"
          value={settings.homepage.heroCtaLink}
          onChange={(v) => update({ heroCtaLink: v })}
        />
        <Field
          label="Featured category slugs (comma separated)"
          value={settings.homepage.featuredCategorySlugs.join(", ")}
          onChange={(v) =>
            update({
              featuredCategorySlugs: v
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      )}
    </label>
  );
}
