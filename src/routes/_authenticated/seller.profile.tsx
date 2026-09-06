/**
 * AVENTA SHOP — Seller Profile
 *
 * Route: /seller/profile
 * Sections: Personal Information, Store Information, Contact Information,
 * Business Information (read-only after verification), Security.
 *
 * Reuses existing infrastructure:
 * - SellerProfile / SellerIdentityInfo / SellerBusinessInfo types
 * - changePassword (auth service), sessions service (active devices)
 * - SellerGate for auth + seller authorization
 *
 * Security: identity & verification fields are read-only here — they can only
 * change through the registration/verification flow, never freely editable.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  User as UserIcon,
  Store,
  Phone,
  Briefcase,
  ShieldCheck,
  Lock,
  Loader,
  MonitorSmartphone,
  BadgeCheck,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import { useAuth } from "@/context/AuthContext";
import { changePassword } from "@/services/firebase/auth";
import {
  getActiveSessions,
  revokeAllOtherSessions,
  type DeviceSession,
} from "@/services/firebase/sessions";
import { mapFirebaseError } from "@/utils/errors";
import { formatDate } from "@/utils/format";
import { SELLER_STATUS_CONFIG } from "@/types/seller";
import type { SellerProfile } from "@/types/seller";

export const Route = createFileRoute("/_authenticated/seller/profile")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <ProfilePage profile={profile} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Profile — Seller — AVENTA SHOP" }] }),
});

function ProfilePage({ profile }: { profile: SellerProfile }) {
  const { user } = useAuth();

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0f172a] sm:text-2xl">
            Seller Profile
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Your account, business, and security settings.
          </p>
        </div>
        <Link
          to="/store/$slug"
          params={{ slug: profile.shopSlug }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-50"
        >
          <ExternalLink className="h-4 w-4" /> View Store
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Personal Information */}
        <Section
          icon={<UserIcon className="h-4 w-4 text-slate-400" />}
          title="Personal Information"
        >
          <Row label="Full Name" value={profile.identity.fullName ?? "—"} />
          <Row label="Email" value={profile.email || user?.email || "—"} />
          <Row
            label="Account Status"
            value={SELLER_STATUS_CONFIG[profile.status]?.label ?? profile.status}
          />
        </Section>

        {/* Store Information */}
        <Section icon={<Store className="h-4 w-4 text-slate-400" />} title="Store Information">
          <Row label="Store Name" value={profile.shopName} />
          <Row label="Store Slug" value={`/store/${profile.shopSlug}`} />
          <Row
            label="Verified"
            value={
              profile.verified ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                  <BadgeCheck className="h-4 w-4" /> Verified
                </span>
              ) : (
                "Pending verification"
              )
            }
          />
          <Row
            label="Commission Rate"
            value={`${(profile.commissionRate * 100).toFixed(1)}% (platform-controlled)`}
          />
        </Section>

        {/* Contact Information */}
        <Section icon={<Phone className="h-4 w-4 text-slate-400" />} title="Contact Information">
          <Row label="Phone" value={profile.phone || "—"} />
          <Row label="City" value={profile.city || "—"} />
          <Row label="Address" value={profile.addressLine || "—"} />
          <Row label="Country" value={profile.country || "—"} />
          <Link
            to="/seller/settings"
            className="mt-3 inline-block rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
          >
            Edit contact details
          </Link>
        </Section>

        {/* Business Information (read-only after verification) */}
        <Section
          icon={<Briefcase className="h-4 w-4 text-slate-400" />}
          title="Business Information"
        >
          <Row label="Business Type" value={profile.business.businessType ?? "—"} />
          <Row label="Business Name" value={profile.business.businessName ?? "—"} />
          <Row label="Tax ID" value={profile.business.taxId ?? "—"} />
          <Row label="Trade License" value={profile.identity.tradeLicenseNumber ?? "—"} />
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            <Lock className="mr-1 inline h-3 w-3" />
            Identity and verification documents can only be changed through the verification flow.
          </p>
        </Section>
      </div>

      {/* Security */}
      <SecuritySection email={user?.email ?? profile.email} />
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        {icon}
        <h2 className="text-sm font-bold text-[#0f172a]">{title}</h2>
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-50 py-2 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="max-w-[60%] break-words text-right text-sm font-medium text-[#0f172a]">
        {value}
      </span>
    </div>
  );
}

function SecuritySection({ email }: { email: string }) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getActiveSessions(user.uid)
      .then((s) => {
        if (!cancelled) setSessions(s);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (next.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await changePassword(user, current, next);
      toast.success("Password updated successfully.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast.error(mapFirebaseError(err) || "Unable to change password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const onRevokeOthers = async () => {
    if (!user) return;
    setRevoking(true);
    try {
      await revokeAllOtherSessions(user.uid);
      setSessions((prev) => (prev ? prev.filter((s) => s.isCurrent) : prev));
      toast.success("Signed out of all other devices.");
    } catch {
      toast.error("Unable to revoke sessions. Please try again.");
    } finally {
      setRevoking(false);
    }
  };

  const otherCount = sessions?.filter((s) => !s.isCurrent).length ?? 0;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <ShieldCheck className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-bold text-[#0f172a]">Security</h2>
      </div>

      <div className="grid gap-6 px-4 py-4 sm:px-5 lg:grid-cols-2">
        {/* Change password */}
        <form onSubmit={onSubmitPassword} className="space-y-3" aria-label="Change password">
          <div className="space-y-1">
            <label htmlFor="cur-pw" className="text-xs font-semibold text-slate-500">
              Current password
            </label>
            <div className="relative">
              <input
                id="cur-pw"
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm focus:border-[#f57224] focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showCurrent ? "Hide password" : "Show password"}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="new-pw" className="text-xs font-semibold text-slate-500">
              New password
            </label>
            <input
              id="new-pw"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f57224] focus:outline-none focus:ring-2 focus:ring-orange-100"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="confirm-pw" className="text-xs font-semibold text-slate-500">
              Confirm new password
            </label>
            <input
              id="confirm-pw"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#f57224] focus:outline-none focus:ring-2 focus:ring-orange-100"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-[#0f172a] py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Updating…" : "Change Password"}
          </button>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Changing your password for {email || "your account"}. You&apos;ll stay signed in on this
            device.
          </p>
        </form>

        {/* Active sessions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-500">Active Sessions</h3>
            {otherCount > 0 && (
              <button
                onClick={() => void onRevokeOthers()}
                disabled={revoking}
                className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
              >
                {revoking ? "Signing out…" : "Sign out other devices"}
              </button>
            )}
          </div>
          {sessions === null ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
              <Loader className="h-4 w-4 animate-spin" /> Loading sessions…
            </div>
          ) : sessions.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No active sessions found.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.slice(0, 6).map((s) => (
                <li
                  key={s.sessionId}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MonitorSmartphone className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0f172a]">
                        {s.browser} · {s.os}
                        {s.isCurrent && (
                          <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            This device
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        Last active {s.lastActiveAt ? formatDate(s.lastActiveAt) : "—"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs capitalize text-slate-500">{s.deviceType}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
