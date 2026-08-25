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

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsAdmin,
});

function SettingsAdmin() {

  const { t } = useI18n();  const { user } = useAuth();
  const [s, setS] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => setS(await getSiteSettings()))();
  }, []);

  if (!s) return <Spinner />;

  const save = async (section: string, patch: Partial<SiteSettings>) => {
    if (!user) return;
    setSaving(true);
    try {
      await saveSiteSettings(patch);
      await logActivity({ uid: user.uid, email: user.email }, "settings.update", section);
      toast.success(t("admin.saved"));
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.settings")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.siteWideConfig")}</p>
      </div>

      <section className="rounded-lg border bg-background p-4 space-y-3">
        <h2 className="text-sm font-semibold">{t("admin.website")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Text label="Site name" value={s.siteName} onChange={(v) => setS({ ...s, siteName: v })} />
          <Text label="Currency" value={s.currency} onChange={(v) => setS({ ...s, currency: v })} />
          <Text label="Support email" value={s.supportEmail} onChange={(v) => setS({ ...s, supportEmail: v })} />
          <Text label="Support phone" value={s.supportPhone} onChange={(v) => setS({ ...s, supportPhone: v })} />
          <Text label="WhatsApp number" value={s.whatsappNumber} onChange={(v) => setS({ ...s, whatsappNumber: v })} />
          <Text label="Facebook URL" value={s.facebookUrl} onChange={(v) => setS({ ...s, facebookUrl: v })} />
        </div>
        <button
          onClick={() =>
            save("website", {
              siteName: s.siteName,
              currency: s.currency,
              supportEmail: s.supportEmail,
              supportPhone: s.supportPhone,
              whatsappNumber: s.whatsappNumber,
              facebookUrl: s.facebookUrl,
            })
          }
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Save website settings
        </button>
      </section>

      <section className="rounded-lg border bg-background p-4 space-y-3">
        <h2 className="text-sm font-semibold">{t("admin.shipping")}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.shipping.enabled}
            onChange={(e) => setS({ ...s, shipping: { ...s.shipping, enabled: e.target.checked } })}
          />
          Enable shipping charges
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <Num
            label="Flat rate"
            value={s.shipping.flatRate}
            onChange={(v) => setS({ ...s, shipping: { ...s.shipping, flatRate: v } })}
          />
          <Num
            label="Free shipping threshold"
            value={s.shipping.freeShippingThreshold}
            onChange={(v) =>
              setS({ ...s, shipping: { ...s.shipping, freeShippingThreshold: v } })
            }
          />
        </div>
        <button
          onClick={() => save("shipping", { shipping: s.shipping })}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Save shipping
        </button>
      </section>

      <section className="rounded-lg border bg-background p-4 space-y-3">
        <h2 className="text-sm font-semibold">{t("admin.cashOnDelivery")}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.cod.enabled}
            onChange={(e) => setS({ ...s, cod: { ...s.cod, enabled: e.target.checked } })}
          />
          Enable Cash on Delivery
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <Num
            label="Min order"
            value={s.cod.minOrder}
            onChange={(v) => setS({ ...s, cod: { ...s.cod, minOrder: v } })}
          />
          <Num
            label="Max order"
            value={s.cod.maxOrder}
            onChange={(v) => setS({ ...s, cod: { ...s.cod, maxOrder: v } })}
          />
        </div>
        <Text
          label="Note"
          value={s.cod.note}
          onChange={(v) => setS({ ...s, cod: { ...s.cod, note: v } })}
        />
        <button
          onClick={() => save("cod", { cod: s.cod })}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Save COD
        </button>
      </section>

      <section className="rounded-lg border bg-background p-4 space-y-3">
        <h2 className="text-sm font-semibold">Tax / VAT</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.tax.enabled}
            onChange={(e) => setS({ ...s, tax: { ...s.tax, enabled: e.target.checked } })}
          />
          Enable tax/VAT on checkout
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <Num
            label="Tax rate (%)"
            value={s.tax.rate}
            onChange={(v) => setS({ ...s, tax: { ...s.tax, rate: Math.min(Math.max(v, 0), 100) } })}
          />
          <Text
            label="Tax label (e.g. VAT, Tax, GST)"
            value={s.tax.label}
            onChange={(v) => setS({ ...s, tax: { ...s.tax, label: v } })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.tax.perProductOverride}
            onChange={(e) => setS({ ...s, tax: { ...s.tax, perProductOverride: e.target.checked } })}
          />
          Allow per-product tax rate override (uses product tax field when set)
        </label>
        <button
          onClick={() => save("tax", { tax: s.tax })}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Save tax settings
        </button>
      </section>

      <section className="rounded-lg border bg-background p-4 space-y-3">
        <h2 className="text-sm font-semibold">Commission / Platform Fee</h2>
        <p className="text-xs text-muted-foreground">
          Configure the default platform commission rate applied to new sellers.
          Individual seller rates can be overridden from the seller management page.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Num
            label="Default commission rate (%)"
            value={s.commission.defaultRate}
            onChange={(v) => setS({ ...s, commission: { ...s.commission, defaultRate: Math.min(Math.max(v, 0), 100) } })}
          />
          <Num
            label="Min withdrawal amount"
            value={s.commission.minWithdrawalAmount}
            onChange={(v) => setS({ ...s, commission: { ...s.commission, minWithdrawalAmount: Math.max(v, 0) } })}
          />
          <Num
            label="Settlement hold period (days)"
            value={s.commission.holdPeriodDays}
            onChange={(v) => setS({ ...s, commission: { ...s.commission, holdPeriodDays: Math.max(v, 0) } })}
          />
        </div>
        <button
          onClick={() => save("commission", { commission: s.commission })}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Save commission settings
        </button>
      </section>

      <section className="rounded-lg border bg-background p-4 space-y-3">
        <h2 className="text-sm font-semibold">Inventory / Stock Alerts</h2>
        <p className="text-xs text-muted-foreground">
          Set the stock threshold below which low-stock notifications are sent
          to sellers and admins automatically (after order placement or manual stock updates).
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Num
            label="Low stock alert threshold"
            value={s.inventory.alertThreshold}
            onChange={(v) => setS({ ...s, inventory: { ...s.inventory, alertThreshold: Math.max(1, Math.floor(v)) } })}
          />
        </div>
        <button
          onClick={() => save("inventory", { inventory: s.inventory })}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Save inventory settings
        </button>
      </section>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
