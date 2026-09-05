import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  Clock,
  Lock,
  FileWarning,
  Loader,
  XCircle,
} from "lucide-react";
import { SellerShell } from "./SellerShell";
import { useSellerProfile } from "@/hooks/useSellerProfile";
import { REGISTRATION_STEPS } from "@/types/seller";

interface Props {
  children: (profile: NonNullable<ReturnType<typeof useSellerProfile>["profile"]>) => ReactNode;
}

export function SellerGate({ children }: Props) {
  const { profile, loading, error } = useSellerProfile();

  if (loading) {
    return (
      <SellerShell>
        <div className="flex items-center justify-center py-20">
          <Loader className="w-8 h-8 animate-spin text-slate-300" />
        </div>
      </SellerShell>
    );
  }

  if (error) {
    return (
      <SellerShell>
        <div className="bg-white rounded-xl border border-rose-200 p-6 text-sm text-rose-700">
          {error}
        </div>
      </SellerShell>
    );
  }

  // No profile → registration CTA
  if (!profile) {
    return (
      <SellerShell>
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 py-16 px-4 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a]">Become a Seller on AVENTA SHOP</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Register your shop to start listing products, managing orders, and growing your business.
          </p>
          <Link
            to="/seller/register"
            className="mt-6 bg-[#f57224] hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-xl text-sm transition-colors"
          >
            Start Registration
          </Link>
        </div>
      </SellerShell>
    );
  }

  // Draft → continue registration
  if (profile.status === "draft") {
    const stepIdx = REGISTRATION_STEPS.findIndex((s) => s.key === profile.currentStep);
    return (
      <SellerShell>
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 py-12 px-4 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
            <FileWarning className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a]">Complete Your Registration</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Your application is at the "{REGISTRATION_STEPS[stepIdx]?.label || "Store Info"}" step.
            Complete all steps to submit for review.
          </p>
          <Link
            to="/seller/register"
            className="mt-6 bg-[#f57224] hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-xl text-sm transition-colors"
          >
            Continue Registration
          </Link>
        </div>
      </SellerShell>
    );
  }

  // Pending review
  if (profile.status === "pending_review") {
    return (
      <SellerShell>
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 py-16 px-4 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a]">Application Under Review</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Our team is reviewing your seller application. You'll be notified as soon as your shop is approved.
          </p>
          <div className="mt-4 px-4 py-2 bg-amber-50 rounded-lg text-xs text-amber-700 font-medium">
            ⏳ Review typically takes 24–48 hours
          </div>
        </div>
      </SellerShell>
    );
  }

  // Need documents
  if (profile.status === "need_documents") {
    return (
      <SellerShell>
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-rose-200 py-16 px-4 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mb-4">
            <FileWarning className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a]">Additional Documents Required</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            {profile.rejectionReason || "Please upload the requested documents to continue the review process."}
          </p>
          <Link
            to="/seller/register"
            className="mt-6 bg-[#f57224] hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-xl text-sm transition-colors"
          >
            Upload Documents
          </Link>
        </div>
      </SellerShell>
    );
  }

  // Rejected
  if (profile.status === "rejected") {
    return (
      <SellerShell>
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-rose-200 py-16 px-4 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mb-4">
            <XCircle className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a]">Application Not Approved</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            {profile.rejectionReason || "Unfortunately your seller application wasn't approved. Please contact support for more information."}
          </p>
          <Link
            to="/seller/register"
            className="mt-6 bg-[#f57224] hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-xl text-sm transition-colors"
          >
            Re-apply
          </Link>
        </div>
      </SellerShell>
    );
  }

  // Suspended
  if (profile.status === "suspended") {
    return (
      <SellerShell>
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-rose-200 py-16 px-4 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mb-4">
            <Ban className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a]">Account Suspended</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Your seller account has been suspended. Please contact AVENTA SHOP support to resolve this.
          </p>
        </div>
      </SellerShell>
    );
  }

  // Blocked
  if (profile.status === "blocked") {
    return (
      <SellerShell>
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-rose-200 py-16 px-4 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mb-4">
            <Ban className="w-8 h-8 text-rose-700" />
          </div>
          <h2 className="text-lg font-bold text-[#0f172a]">Account Blocked</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            This account has been permanently blocked. Contact support for more information.
          </p>
        </div>
      </SellerShell>
    );
  }

  // Approved → show dashboard
  return <SellerShell>{children(profile)}</SellerShell>;
}
