import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
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
} from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { getCustomerSettings, saveCustomerSettings } from "@/services/firebase/customerSettings";
import { resetPassword, signOut } from "@/services/firebase/auth";
import { DEFAULT_SETTINGS, type CustomerSettings } from "@/types/customer";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, _refreshProfile } = useAuth();
  const navigate = useNavigate();
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

  const sendResetLink = async () => {
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

  const onSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="py-20 text-center">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-6">
      {/* ===== Daraz-style Header ===== */}
      <header className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/account"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition hover:bg-white/25 active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2} />
            </Link>
            <div>
              <h1 className="text-lg font-bold">Settings</h1>
              <p className="text-xs text-white/80">Manage your account preferences</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6">
        {/* ===== Account Info Card ===== */}
        <DarazCard>
          <DarazCardHeader title="Account Information" />
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
                  {user?.emailVerified ? "Email Verified" : "Email Not Verified"}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {user?.emailVerified ? "Your email is confirmed" : "Please verify your email"}
                </div>
              </div>
            </div>
          </div>
        </DarazCard>

        {/* ===== Notification Preferences ===== */}
        <DarazCard>
          <DarazCardHeader title="Notification Preferences" />
          <div className="divide-y divide-gray-100">
            <DarazToggleRow
              icon={<Bell className="h-5 w-5" />}
              label="Order Updates (Email)"
              hint="Confirmation, shipping & delivery emails"
              checked={form.emailOrderUpdates}
              onToggle={toggle("emailOrderUpdates")}
            />
            <DarazToggleRow
              icon={<Mail className="h-5 w-5" />}
              label="Promotions & Offers"
              hint="Flash sales, coupons and campaigns"
              checked={form.emailPromotions}
              onToggle={toggle("emailPromotions")}
            />
            <DarazToggleRow
              icon={<Smartphone className="h-5 w-5" />}
              label="SMS Order Updates"
              hint="Delivery alerts to your phone"
              checked={form.smsOrderUpdates}
              onToggle={toggle("smsOrderUpdates")}
            />
            <DarazToggleRow
              icon={<Bell className="h-5 w-5" />}
              label="In-App Notifications"
              hint="Show alerts inside Shop Nexa"
              checked={form.pushNotifications}
              onToggle={toggle("pushNotifications")}
            />
          </div>
        </DarazCard>

        {/* ===== Region & Language ===== */}
        <DarazCard>
          <DarazCardHeader title="Region & Language" />
          <div className="divide-y divide-gray-100">
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-500">
                <DollarSign className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800">Currency</div>
                <div className="text-xs text-gray-500">Select your preferred currency</div>
              </div>
              <select
                value={form.currency}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value as "USD" | "BDT" }))}
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
                <div className="text-sm font-semibold text-gray-800">Language</div>
                <div className="text-xs text-gray-500">Choose your display language</div>
              </div>
              <select
                value={form.language}
                onChange={(e) => setForm((p) => ({ ...p, language: e.target.value as "en" | "bn" }))}
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
          <DarazCardHeader title="Account Security" />
          <div className="divide-y divide-gray-100">
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-500">
                <Lock className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800">Change Password</div>
                <div className="truncate text-xs text-gray-500">
                  Reset link will be sent to {user?.email}
                </div>
              </div>
              <button
                onClick={() => void sendResetLink()}
                disabled={resetting}
                className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-600 transition hover:bg-orange-100 active:scale-95 disabled:opacity-60"
              >
                {resetting && <Spinner />} Reset
              </button>
            </div>
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-500">
                <Smartphone className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800">Signed In Device</div>
                <div className="text-xs text-gray-500">
                  {typeof navigator !== "undefined" ? navigator.platform || "This device" : "This device"}
                </div>
              </div>
            </div>
          </div>
        </DarazCard>

        {/* ===== Quick Links ===== */}
        <DarazCard>
          <DarazCardHeader title="Quick Links" />
          <div className="divide-y divide-gray-100">
            <DarazLinkRow to="/addresses" icon={<MapPin className="h-5 w-5" />} label="Address Book" hint="Manage delivery addresses" />
            <DarazLinkRow to="/wallet" icon={<CreditCard className="h-5 w-5" />} label="Wallet & Payment" hint="View balance & transactions" />
            <DarazLinkRow to="/wishlist" icon={<Heart className="h-5 w-5" />} label="My Wishlist" hint="Saved products" />
            <DarazLinkRow to="/orders" icon={<Package className="h-5 w-5" />} label="Order History" hint="Track & manage orders" />
            {profile?.role !== "seller" && (
              <DarazLinkRow to="/seller.register" icon={<Store className="h-5 w-5" />} label="Become a Seller" hint="Start selling on Shop Nexa" highlight />
            )}
          </div>
        </DarazCard>

        {/* ===== Help & Support ===== */}
        <DarazCard>
          <DarazCardHeader title="Help & Support" />
          <div className="divide-y divide-gray-100">
            <DarazLinkRow to="/support" icon={<Headphones className="h-5 w-5" />} label="Customer Service" hint="Chat with our support team" />
            <DarazLinkRow to="/support" icon={<Info className="h-5 w-5" />} label="About Shop Nexa" hint="Smart Shopping, Better Life" />
          </div>
        </DarazCard>

        {/* ===== Legal ===== */}
        <DarazCard>
          <DarazCardHeader title="Legal" />
          <div className="divide-y divide-gray-100">
            <DarazLinkRow to="/support" icon={<FileText className="h-5 w-5" />} label="Terms & Conditions" hint="Read our policies" />
            <DarazLinkRow to="/support" icon={<Shield className="h-5 w-5" />} label="Privacy Policy" hint="How we handle your data" />
          </div>
        </DarazCard>

        {/* ===== Save Button ===== */}
        <button
          onClick={() => void save()}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600 active:scale-[0.98] disabled:opacity-50"
        >
          {saving && <Spinner />} Save Preferences
        </button>

        {/* ===== Sign Out ===== */}
        <button
          onClick={onSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white px-4 py-3.5 text-sm font-semibold text-red-500 shadow-sm transition hover:bg-red-50 active:scale-[0.99]"
        >
          <LogOut className="h-5 w-5" strokeWidth={2} /> Sign Out
        </button>

        {/* ===== Footer ===== */}
        <div className="pt-2 text-center">
          <p className="text-xs text-gray-400">Shop Nexa — Smart Shopping, Better Life</p>
          <p className="mt-1 text-[10px] text-gray-300">Version 1.0.0</p>
        </div>
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
