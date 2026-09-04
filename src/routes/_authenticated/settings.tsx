import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  Mail,
  Smartphone,
  Lock,
  Shield,
  User,
  Store,
  CreditCard,
  MapPin,
  Heart,
  Package,
  LogOut,
  ChevronRight,
  Languages,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Headphones,
  Info,
  FileText,
  Monitor,
  Trash2,
} from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { getCustomerSettings, saveCustomerSettings } from "@/services/firebase/customerSettings";
import { resetPassword, signOut } from "@/services/firebase/auth";
import { DEFAULT_SETTINGS, type CustomerSettings } from "@/types/customer";
import type { Currency } from "@/services/currency";
import {
  subscribeToSessions,
  revokeSession,
  revokeAllOtherSessions,
  type DeviceSession,
} from "@/services/firebase/sessions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { locale, currency, t, updatePreferences } = useI18n();
  const [form, setForm] = useState<CustomerSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["customerSettings", user?.uid],
    queryFn: () => getCustomerSettings(user!.uid),
    enabled: !!user,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  // Subscribe to real-time sessions
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToSessions(user.uid, setSessions);
    return () => unsub();
  }, [user?.uid]);

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
      // Apply language + currency immediately via i18n context
      await updatePreferences(form.language, form.currency);
      toast.success(t("settings.saved"));
    } catch {
      toast.error(t("settings.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const sendResetLink = async () => {
    if (!user?.email) return;
    setResetting(true);
    try {
      await resetPassword(user.email);
      toast.success(t("auth.resetEmailSent"));
    } catch {
      toast.error(t("message.passwordResetError"));
    } finally {
      setResetting(false);
    }
  };

  const onSignOut = async () => {
    await signOut();
    toast.success(t("message.signedOut"));
    navigate({ to: "/" });
  };

  const handleRevoke = async (sessionId: string) => {
    if (!user?.uid) return;
    setRevokingId(sessionId);
    try {
      await revokeSession(user.uid, sessionId);
      toast.success(t("device.revoked"));
    } catch {
      toast.error(t("device.revokeError"));
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    if (!user?.uid) return;
    setRevokingAll(true);
    try {
      await revokeAllOtherSessions(user.uid);
      toast.success(t("device.revoked"));
    } catch {
      toast.error(t("device.revokeError"));
    } finally {
      setRevokingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="py-20 text-center">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <ServicePageLayout title={t("settings.title")} subtitle={t("settings.subtitle")}>
      <div className="space-y-4">
        {/* ===== Account Info Card ===== */}
        <DarazCard>
          <DarazCardHeader title={t("settings.accountInfo")} />
          <div className="divide-y divide-gray-100">
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-50 text-orange-500">
                <User className="h-6 w-6" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800">
                  {profile?.displayName || user?.displayName || "Shopper"}
                </div>
                <div className="truncate text-xs text-gray-500">{user?.email}</div>
              </div>
              {profile?.role === "seller" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold text-orange-600">
                  <Store className="h-3 w-3" /> SELLER
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-500">
                {user?.emailVerified ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" strokeWidth={2} />
                ) : (
                  <AlertCircle className="h-5 w-5 text-orange-500" strokeWidth={2} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800">
                  {user?.emailVerified
                    ? t("settings.emailVerified")
                    : t("settings.emailNotVerified")}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {user?.emailVerified
                    ? t("settings.emailVerifiedHint")
                    : t("settings.emailNotVerifiedHint")}
                </div>
              </div>
            </div>
          </div>
        </DarazCard>

        {/* ===== Notification Preferences ===== */}
        <DarazCard>
          <DarazCardHeader title={t("settings.notificationPrefs")} />
          <div className="divide-y divide-gray-100">
            <DarazToggleRow
              icon={<Bell className="h-5 w-5" />}
              label={t("settings.orderUpdatesEmail")}
              hint={t("settings.orderUpdatesEmailHint")}
              checked={form.emailOrderUpdates}
              onToggle={toggle("emailOrderUpdates")}
            />
            <DarazToggleRow
              icon={<Mail className="h-5 w-5" />}
              label={t("settings.promotionsEmail")}
              hint={t("settings.promotionsEmailHint")}
              checked={form.emailPromotions}
              onToggle={toggle("emailPromotions")}
            />
            <DarazToggleRow
              icon={<Smartphone className="h-5 w-5" />}
              label={t("settings.smsOrderUpdates")}
              hint={t("settings.smsOrderUpdatesHint")}
              checked={form.smsOrderUpdates}
              onToggle={toggle("smsOrderUpdates")}
            />
            <DarazToggleRow
              icon={<Bell className="h-5 w-5" />}
              label={t("settings.pushNotifications")}
              hint={t("settings.pushNotificationsHint")}
              checked={form.pushNotifications}
              onToggle={toggle("pushNotifications")}
            />
          </div>
        </DarazCard>

        {/* ===== Region & Language ===== */}
        <DarazCard>
          <DarazCardHeader title={t("settings.regionLanguage")} />
          <div className="divide-y divide-gray-100">
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-500">
                <DollarSign className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800">{t("settings.currency")}</div>
                <div className="text-xs text-gray-500">{t("settings.currencyHint")}</div>
              </div>
              <select
                value={form.currency}
                onChange={(e) => {
                  const newCurrency = e.target.value as Currency;
                  setForm((p) => ({ ...p, currency: newCurrency }));
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              >
                <option value="BDT">BDT (৳)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-500">
                <Languages className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800">{t("settings.language")}</div>
                <div className="text-xs text-gray-500">{t("settings.languageHint")}</div>
              </div>
              <select
                value={form.language}
                onChange={(e) => {
                  const newLang = e.target.value as "en" | "bn";
                  setForm((p) => ({ ...p, language: newLang }));
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              >
                <option value="en">English</option>
                <option value="bn">বাংলা</option>
              </select>
            </div>
          </div>
        </DarazCard>

        {/* ===== Account Security ===== */}
        <DarazCard>
          <DarazCardHeader title={t("settings.accountSecurity")} />
          <div className="divide-y divide-gray-100">
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-500">
                <Lock className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800">
                  {t("settings.changePassword")}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {t("settings.resetLinkHint")}: {user?.email}
                </div>
              </div>
              <button
                onClick={() => void sendResetLink()}
                disabled={resetting}
                className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-600 transition hover:bg-orange-100 active:scale-95 disabled:opacity-60"
              >
                {resetting && <Spinner />} {t("settings.reset")}
              </button>
            </div>
          </div>
        </DarazCard>

        {/* ===== Signed In Devices — Real Session Data ===== */}
        <DarazCard>
          <DarazCardHeader title={t("settings.signedInDevice")} />
          <div className="p-4">
            {sessions.length === 0 ? (
              <div className="flex items-center gap-3 py-4 text-sm text-gray-400">
                <Monitor className="h-5 w-5" />
                {t("device.notAvailable")}
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <SessionRow
                    key={session.sessionId}
                    session={session}
                    t={t}
                    onRevoke={handleRevoke}
                    revoking={revokingId === session.sessionId}
                  />
                ))}
              </div>
            )}

            {/* Revoke all other sessions button */}
            {sessions.filter((s) => !s.isCurrent).length > 0 && (
              <button
                onClick={() => void handleRevokeAll()}
                disabled={revokingAll}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-white px-4 py-2.5 text-xs font-semibold text-red-500 transition hover:bg-red-50 active:scale-[0.99] disabled:opacity-60"
              >
                {revokingAll ? <Spinner /> : <Trash2 className="h-4 w-4" />}
                {t("settings.revokeAllOther")}
              </button>
            )}
          </div>
        </DarazCard>

        {/* ===== Quick Links ===== */}
        <DarazCard>
          <DarazCardHeader title="Quick Links" />
          <div className="divide-y divide-gray-100">
            <DarazLinkRow
              to="/addresses"
              icon={<MapPin className="h-5 w-5" />}
              label={t("account.addressBook")}
              hint="Manage delivery addresses"
            />
            <DarazLinkRow
              to="/wallet"
              icon={<CreditCard className="h-5 w-5" />}
              label={t("account.paymentWallet")}
              hint="View balance & transactions"
            />
            <DarazLinkRow
              to="/wishlist"
              icon={<Heart className="h-5 w-5" />}
              label={t("account.myWishlist")}
              hint="Saved products"
            />
            <DarazLinkRow
              to="/orders"
              icon={<Package className="h-5 w-5" />}
              label={t("account.myOrders")}
              hint="Track & manage orders"
            />
            {profile?.role !== "seller" && (
              <DarazLinkRow
                to="/seller.register"
                icon={<Store className="h-5 w-5" />}
                label="Become a Seller"
                hint="Start selling on Aventa Shop"
                highlight
              />
            )}
          </div>
        </DarazCard>

        {/* ===== Help & Support ===== */}
        <DarazCard>
          <DarazCardHeader title="Help & Support" />
          <div className="divide-y divide-gray-100">
            <DarazLinkRow
              to="/support"
              icon={<Headphones className="h-5 w-5" />}
              label={t("account.customerService")}
              hint="Chat with our support team"
            />
            <DarazLinkRow
              to="/support"
              icon={<Info className="h-5 w-5" />}
              label={t("settings.aboutShop")}
              hint={t("settings.aboutHint")}
            />
          </div>
        </DarazCard>

        {/* ===== Legal ===== */}
        <DarazCard>
          <DarazCardHeader title={t("settings.legal")} />
          <div className="divide-y divide-gray-100">
            <DarazLinkRow
              to="/support"
              icon={<FileText className="h-5 w-5" />}
              label={t("settings.termsConditions")}
              hint="Read our policies"
            />
            <DarazLinkRow
              to="/support"
              icon={<Shield className="h-5 w-5" />}
              label={t("settings.privacyPolicy")}
              hint="How we handle your data"
            />
          </div>
        </DarazCard>

        {/* ===== Save Button ===== */}
        <button
          onClick={() => void save()}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600 active:scale-[0.98] disabled:opacity-50"
        >
          {saving && <Spinner />} {t("settings.savePreferences")}
        </button>

        {/* ===== Sign Out ===== */}
        <button
          onClick={onSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white px-4 py-3.5 text-sm font-semibold text-red-500 shadow-sm transition hover:bg-red-50 active:scale-[0.99]"
        >
          <LogOut className="h-5 w-5" strokeWidth={2} /> {t("auth.signOut")}
        </button>

        {/* ===== Footer ===== */}
        <div className="pt-2 text-center">
          <p className="text-xs text-gray-400">{t("misc.tagline")}</p>
          <p className="mt-1 text-[10px] text-gray-300">{t("misc.version")}</p>
        </div>
      </div>
    </ServicePageLayout>
  );
}

/* ===== Session Row Component ===== */
function SessionRow({
  session,
  t,
  onRevoke,
  revoking,
}: {
  session: DeviceSession;
  t: (key: any) => string;
  onRevoke: (sessionId: string) => void;
  revoking: boolean;
}) {
  const formatTime = (ms: number) => {
    if (!ms) return t("device.notAvailable");
    return new Date(ms).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const deviceIcon =
    session.deviceType === "Mobile" ? (
      <Smartphone className="h-5 w-5" />
    ) : session.deviceType === "Tablet" ? (
      <Smartphone className="h-5 w-5" />
    ) : (
      <Monitor className="h-5 w-5" />
    );

  return (
    <div
      className={`rounded-xl border p-3 transition ${
        session.isCurrent ? "border-green-200 bg-green-50/50" : "border-gray-100 bg-gray-50/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
            session.isCurrent ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-500"
          }`}
        >
          {deviceIcon}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">{session.browser}</span>
            {session.isCurrent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-bold text-green-600">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {t("settings.thisDevice")}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {session.os} · {session.deviceType} · {session.platform}
          </div>
          <div className="text-[11px] text-gray-400">
            {t("device.loginTime")}: {formatTime(session.loginAt)}
          </div>
          <div className="text-[11px] text-gray-400">
            {t("device.lastActive")}: {formatTime(session.lastActiveAt)}
          </div>
        </div>
        {!session.isCurrent && (
          <button
            onClick={() => onRevoke(session.sessionId)}
            disabled={revoking}
            className="shrink-0 rounded-lg border border-red-100 px-2.5 py-1.5 text-[11px] font-medium text-red-500 transition hover:bg-red-50 active:scale-95 disabled:opacity-60"
          >
            {revoking ? <Spinner className="h-3 w-3" /> : t("settings.revokeSession")}
          </button>
        )}
      </div>
    </div>
  );
}

/* ===== Daraz-style Components ===== */

function DarazCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {children}
    </section>
  );
}

function DarazCardHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-gray-100 bg-gray-50/50 px-4 py-2.5">
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
    </div>
  );
}

function DarazToggleRow({
  icon,
  label,
  hint,
  checked,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-500">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-gray-800">{label}</div>
        <div className="truncate text-xs text-gray-500">{hint}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-orange-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function DarazLinkRow({
  to,
  icon,
  label,
  hint,
  highlight = false,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 p-4 transition hover:bg-gray-50 active:scale-[0.99]"
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
          highlight
            ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white"
            : "bg-orange-50 text-orange-500 group-hover:bg-orange-100"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-800">{label}</div>
        <div className="truncate text-xs text-gray-500">{hint}</div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" strokeWidth={2.5} />
    </Link>
  );
}
