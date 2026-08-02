import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Globe, Mail, Smartphone } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { getCustomerSettings, saveCustomerSettings } from "@/services/firebase/customerSettings";
import { resetPassword } from "@/services/firebase/auth";
import { DEFAULT_SETTINGS, type CustomerSettings } from "@/types/customer";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<CustomerSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["customerSettings", user?.uid],
    queryFn: () => getCustomerSettings(user!.uid),
    enabled: !!user,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const toggle = (key: keyof CustomerSettings) => () =>
    setForm((p) => ({ ...p, [key]: !p[key] }) as CustomerSettings);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveCustomerSettings(user.uid, {
        emailOrderUpdates: form.emailOrderUpdates,
        emailPromotions: form.emailPromotions,
        smsOrderUpdates: form.smsOrderUpdates,
        pushNotifications: form.pushNotifications,
        currency: form.currency,
        language: form.language,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!user?.email) return;
    setResetting(true);
    try {
      await resetPassword(user.email);
      toast.success("Password reset email sent");
    } catch {
      toast.error("Could not send the reset email");
    } finally {
      setResetting(false);
    }
  };

  const row = "flex items-center justify-between gap-4 border-b px-5 py-4 last:border-b-0";
  const field = "rounded-md border px-3 py-2 text-sm outline-none focus:border-primary";

  if (isLoading) {
    return (
      <AppShell>
        <div className="py-16 text-center">
          <Spinner />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Notification, language and account preferences</p>
        </div>

        <section className="rounded-lg border bg-background">
          <div className="flex items-center gap-2 border-b px-5 py-3 font-semibold">
            <Bell className="h-4 w-4" /> Notifications
          </div>
          <div className={row}>
            <div>
              <div className="text-sm font-medium">Order updates by email</div>
              <p className="text-xs text-muted-foreground">Confirmation, shipping and delivery emails</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={form.emailOrderUpdates}
              onChange={toggle("emailOrderUpdates")}
            />
          </div>
          <div className={row}>
            <div>
              <div className="text-sm font-medium">Promotions and offers</div>
              <p className="text-xs text-muted-foreground">Flash sales, coupons and campaigns</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={form.emailPromotions}
              onChange={toggle("emailPromotions")}
            />
          </div>
          <div className={row}>
            <div>
              <div className="text-sm font-medium">SMS order updates</div>
              <p className="text-xs text-muted-foreground">Delivery alerts to your phone</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={form.smsOrderUpdates}
              onChange={toggle("smsOrderUpdates")}
            />
          </div>
          <div className={row}>
            <div>
              <div className="text-sm font-medium">In-app notifications</div>
              <p className="text-xs text-muted-foreground">Show alerts inside Shop Nexa</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={form.pushNotifications}
              onChange={toggle("pushNotifications")}
            />
          </div>
        </section>

        <section className="rounded-lg border bg-background">
          <div className="flex items-center gap-2 border-b px-5 py-3 font-semibold">
            <Globe className="h-4 w-4" /> Region
          </div>
          <div className={row}>
            <div className="text-sm font-medium">Currency</div>
            <select
              value={form.currency}
              onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value as "USD" | "BDT" }))}
              className={field}
            >
              <option value="USD">USD ($)</option>
              <option value="BDT">BDT (৳)</option>
            </select>
          </div>
          <div className={row}>
            <div className="text-sm font-medium">Language</div>
            <select
              value={form.language}
              onChange={(e) => setForm((p) => ({ ...p, language: e.target.value as "en" | "bn" }))}
              className={field}
            >
              <option value="en">English</option>
              <option value="bn">বাংলা</option>
            </select>
          </div>
        </section>

        <section className="rounded-lg border bg-background">
          <div className="flex items-center gap-2 border-b px-5 py-3 font-semibold">
            <Mail className="h-4 w-4" /> Account security
          </div>
          <div className={row}>
            <div>
              <div className="text-sm font-medium">Password</div>
              <p className="text-xs text-muted-foreground">
                We will email a secure reset link to {user?.email}
              </p>
            </div>
            <button
              onClick={() => void resetPassword()}
              disabled={resetting}
              className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              {resetting && <Spinner />} Send reset link
            </button>
          </div>
          <div className={row}>
            <div>
              <div className="text-sm font-medium">Signed in device</div>
              <p className="text-xs text-muted-foreground">
                <Smartphone className="mr-1 inline h-3 w-3" />
                {typeof navigator !== "undefined" ? navigator.platform || "This device" : "This device"}
              </p>
            </div>
          </div>
        </section>

        <button
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {saving && <Spinner />} Save preferences
        </button>
      </div>
    </AppShell>
  );
}
