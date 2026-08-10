import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Store, Briefcase, IdCard, Wallet, FileText, CheckCircle2,
  ChevronRight, ChevronLeft, Loader, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSellerProfile } from "@/hooks/useSellerProfile";
import {
  initSellerDraft, saveStoreInfo, saveBusinessInfo,
  saveIdentityInfo, saveBankingInfo, acceptTerms, submitForReview,
} from "@/services/firebase/sellers";
import { firebaseConfigured } from "@/services/firebase/config";
import { REGISTRATION_STEPS, type RegistrationStep } from "@/types/seller";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/seller/register")({
  ssr: false,
  component: SellerRegisterPage,
  head: () => ({ meta: [{ title: "Seller Registration — Shop Nexa" }] }),
});

function SellerRegisterPage() {
  const { user } = useAuth();
  const { profile, refresh } = useSellerProfile();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<RegistrationStep>("store_info");
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      if (!firebaseConfigured) { setInitLoading(false); return; }
      if (!profile) {
        try {
          await initSellerDraft({ uid: user.uid, email: user.email });
          await refresh();
        } catch (_e) {
          // Profile may already exist
        }
      } else if (profile.status === "draft") {
        setCurrentStep(profile.currentStep);
      }
      setInitLoading(false);
    })();
  }, [user, profile]);

  if (initLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader className="w-8 h-8 animate-spin text-slate-300" />
      </div>
    );
  }

  // If already approved, redirect to dashboard
  if (profile?.status === "approved") {
    navigate({ to: "/seller" });
    return null;
  }

  // If under review, show review screen
  if (profile?.status === "pending_review") {
    return <ReviewPending />;
  }

  const stepIdx = REGISTRATION_STEPS.findIndex((s) => s.key === currentStep);
  const _isLastFormStep = currentStep === "terms";

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="bg-[#0f172a] text-white sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate({ to: "/seller" })} className="p-1.5 hover:bg-white/10 rounded-lg">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#f57224] rounded-lg flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold">Seller Registration</span>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-14 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-1">
            {REGISTRATION_STEPS.filter((s) => s.key !== "account" && s.key !== "submitted").map((step, i) => {
              const stepIndex = REGISTRATION_STEPS.findIndex((s) => s.key === step.key);
              const isActive = step.key === currentStep;
              const isDone = stepIdx > stepIndex;
              return (
                <div key={step.key} className="flex items-center flex-1 last:flex-none">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isDone ? "bg-[#059669] text-white"
                    : isActive ? "bg-[#f57224] text-white"
                    : "bg-slate-200 text-slate-400"
                  }`}>
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  {i < 4 && (
                    <div className={`flex-1 h-0.5 mx-1 ${isDone ? "bg-[#059669]" : "bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs font-medium text-slate-500 text-center">
            Step {stepIdx} of {REGISTRATION_STEPS.length - 2}: {REGISTRATION_STEPS[stepIdx]?.label}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {currentStep === "store_info" && (
          <StoreInfoForm
            initial={profile || undefined}
            onSubmit={async (data) => {
              setLoading(true);
              try {
                await saveStoreInfo(user!.uid, data);
                await refresh();
                setCurrentStep("business_info");
                toast.success("Store info saved");
              } catch (_e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              setLoading(false);
            }}
            loading={loading}
          />
        )}

        {currentStep === "business_info" && (
          <BusinessInfoForm
            initial={profile?.business}
            onBack={() => setCurrentStep("store_info")}
            onSubmit={async (data) => {
              setLoading(true);
              try {
                await saveBusinessInfo(user!.uid, data);
                await refresh();
                setCurrentStep("identity_verification");
                toast.success("Business info saved");
              } catch (_e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              setLoading(false);
            }}
            loading={loading}
          />
        )}

        {currentStep === "identity_verification" && (
          <IdentityForm
            initial={profile?.identity}
            onBack={() => setCurrentStep("business_info")}
            onSubmit={async (data) => {
              setLoading(true);
              try {
                await saveIdentityInfo(user!.uid, data);
                await refresh();
                setCurrentStep("banking");
                toast.success("Identity info saved");
              } catch (_e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              setLoading(false);
            }}
            loading={loading}
          />
        )}

        {currentStep === "banking" && (
          <BankingForm
            initial={profile?.bankInfo}
            onBack={() => setCurrentStep("identity_verification")}
            onSubmit={async (data) => {
              setLoading(true);
              try {
                await saveBankingInfo(user!.uid, data);
                await refresh();
                setCurrentStep("terms");
                toast.success("Banking info saved");
              } catch (_e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              setLoading(false);
            }}
            loading={loading}
          />
        )}

        {currentStep === "terms" && (
          <TermsForm
            onBack={() => setCurrentStep("banking")}
            onSubmit={async () => {
              setLoading(true);
              try {
                await acceptTerms(user!.uid);
                await submitForReview(user!.uid);
                await refresh();
                setCurrentStep("submitted");
                toast.success("Application submitted for review!");
              } catch (_e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              setLoading(false);
            }}
            loading={loading}
          />
        )}

        {currentStep === "submitted" && <ReviewPending />}
      </div>
    </div>
  );
}

// ====================================================================
// Review Pending Screen
// ====================================================================
function ReviewPending() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Loader className="w-10 h-10 text-amber-500 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-[#0f172a]">Application Submitted!</h2>
        <p className="mt-3 text-sm text-slate-500">
          Your seller application is now under review. Our team will verify your information and documents. You'll be notified within 24–48 hours.
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs text-slate-400 justify-center">
          <AlertCircle className="w-4 h-4" />
          You can close this page — we'll notify you when approved.
        </div>
        <button
          onClick={() => navigate({ to: "/" })}
          className="mt-6 bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3 px-8 rounded-xl text-sm transition-colors"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

// ====================================================================
// Step 1: Store Info Form
// ====================================================================
function StoreInfoForm({ initial, onSubmit, loading }: {
  initial?: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => void;
  loading: boolean;
}) {
  const [shopName, setShopName] = useState(initial?.shopName ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [addressLine, setAddressLine] = useState(initial?.addressLine ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [area, setArea] = useState(initial?.area ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");

  const valid = shopName.trim() && phone.trim() && addressLine.trim() && city.trim();

  return (
    <div className="space-y-4">
      <FormHeader icon={<Store className="w-5 h-5 text-[#f57224]" />} title="Store Information" subtitle="Tell us about your shop" />

      <Field label="Shop Name" required>
        <input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="My Awesome Store"
          className="input-field" />
      </Field>

      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of your shop"
          rows={3} className="input-field resize-none" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" required>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className="input-field" />
        </Field>
        <Field label="City" required>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dhaka" className="input-field" />
        </Field>
      </div>

      <Field label="Address" required>
        <input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="House, Road, Area" className="input-field" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Area">
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Mirpur" className="input-field" />
        </Field>
        <Field label="Postal Code">
          <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="1216" className="input-field" />
        </Field>
      </div>

      <SubmitButton onClick={() => onSubmit({ shopName, description, phone, addressLine, city, area, postalCode })} disabled={!valid} loading={loading} label="Continue" />
    </div>
  );
}

// ====================================================================
// Step 2: Business Info Form
// ====================================================================
function BusinessInfoForm({ initial, onBack, onSubmit, loading }: {
  initial?: Record<string, unknown>; onBack: () => void; onSubmit: (data: Record<string, unknown>) => void; loading: boolean;
}) {
  const [businessType, setBusinessType] = useState<"individual" | "company" | "partnership">(initial?.businessType ?? "individual");
  const [businessName, setBusinessName] = useState(initial?.businessName ?? "");
  const [taxId, setTaxId] = useState(initial?.taxId ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");

  const valid = businessName.trim();

  return (
    <div className="space-y-4">
      <FormHeader icon={<Briefcase className="w-5 h-5 text-[#f57224]" />} title="Business Information" subtitle="Tell us about your business" />

      <Field label="Business Type" required>
        <div className="grid grid-cols-3 gap-2">
          {(["individual", "company", "partnership"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setBusinessType(t)}
              className={`py-2.5 rounded-xl text-sm font-medium capitalize transition-colors ${
                businessType === t ? "bg-[#0f172a] text-white" : "bg-slate-100 text-slate-500"
              }`}>
              {t}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Business Name" required>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="ABC Trading Ltd." className="input-field" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tax ID / BIN">
          <input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="000000000" className="input-field" />
        </Field>
        <Field label="Website">
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." className="input-field" />
        </Field>
      </div>

      <div className="flex gap-3">
        <BackButton onClick={onBack} />
        <SubmitButton onClick={() => onSubmit({ businessType, businessName, taxId, website, socialMediaLinks: [] })} disabled={!valid} loading={loading} label="Continue" />
      </div>
    </div>
  );
}

// ====================================================================
// Step 3: Identity Verification Form
// ====================================================================
function IdentityForm({ initial, onBack, onSubmit, loading }: {
  initial?: Record<string, unknown>; onBack: () => void; onSubmit: (data: Record<string, unknown>) => void; loading: boolean;
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [nidNumber, setNidNumber] = useState(initial?.nidNumber ?? "");
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState(initial?.tradeLicenseNumber ?? "");

  const valid = fullName.trim() && nidNumber.trim();

  return (
    <div className="space-y-4">
      <FormHeader icon={<IdCard className="w-5 h-5 text-[#f57224]" />} title="Identity Verification" subtitle="Verify your identity for trust & safety" />

      <Field label="Full Name (as per NID)" required>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" className="input-field" />
      </Field>

      <Field label="National ID Number" required>
        <input value={nidNumber} onChange={(e) => setNidNumber(e.target.value)} placeholder="199XXXXXXXX" className="input-field" />
      </Field>

      <Field label="Trade License Number (optional for companies)">
        <input value={tradeLicenseNumber} onChange={(e) => setTradeLicenseNumber(e.target.value)} placeholder="0000000" className="input-field" />
      </Field>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
        📄 Document upload (NID front/back, trade license) will be available after admin review. You may be asked to provide additional documents.
      </div>

      <div className="flex gap-3">
        <BackButton onClick={onBack} />
        <SubmitButton onClick={() => onSubmit({ fullName, nidNumber, tradeLicenseNumber })} disabled={!valid} loading={loading} label="Continue" />
      </div>
    </div>
  );
}

// ====================================================================
// Step 4: Banking Form
// ====================================================================
function BankingForm({ initial, onBack, onSubmit, loading }: {
  initial?: Record<string, unknown>; onBack: () => void; onSubmit: (data: Record<string, unknown>) => void; loading: boolean;
}) {
  const [payoutMethod, setPayoutMethod] = useState<"bank" | "mobile">(initial?.mobileBankingType ? "mobile" : "bank");
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [accountName, setAccountName] = useState(initial?.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "");
  const [branchName, setBranchName] = useState(initial?.branchName ?? "");
  const [mobileBankingType, setMobileBankingType] = useState<"bkash" | "nagad" | "rocket">(initial?.mobileBankingType ?? "bkash");
  const [mobileBankingNumber, setMobileBankingNumber] = useState(initial?.mobileBankingNumber ?? "");

  const valid = payoutMethod === "bank"
    ? bankName.trim() && accountName.trim() && accountNumber.trim()
    : mobileBankingNumber.trim();

  return (
    <div className="space-y-4">
      <FormHeader icon={<Wallet className="w-5 h-5 text-[#f57224]" />} title="Banking & Payout" subtitle="Where should we send your earnings?" />

      <Field label="Payout Method" required>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPayoutMethod("bank")}
            className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${payoutMethod === "bank" ? "bg-[#0f172a] text-white" : "bg-slate-100 text-slate-500"}`}>
            Bank Transfer
          </button>
          <button type="button" onClick={() => setPayoutMethod("mobile")}
            className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${payoutMethod === "mobile" ? "bg-[#0f172a] text-white" : "bg-slate-100 text-slate-500"}`}>
            Mobile Banking
          </button>
        </div>
      </Field>

      {payoutMethod === "bank" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank Name" required>
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Dutch-Bangla Bank" className="input-field" />
            </Field>
            <Field label="Account Name" required>
              <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="John Doe" className="input-field" />
            </Field>
          </div>
          <Field label="Account Number" required>
            <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="000XXXXXXXXX" className="input-field" />
          </Field>
          <Field label="Branch Name">
            <input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Gulshan Branch" className="input-field" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Mobile Banking" required>
            <div className="grid grid-cols-3 gap-2">
              {(["bkash", "nagad", "rocket"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setMobileBankingType(t)}
                  className={`py-2.5 rounded-xl text-sm font-bold capitalize transition-colors ${mobileBankingType === t ? "bg-[#0f172a] text-white" : "bg-slate-100 text-slate-500"}`}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Mobile Number" required>
            <input value={mobileBankingNumber} onChange={(e) => setMobileBankingNumber(e.target.value)} placeholder="01XXXXXXXXX" className="input-field" />
          </Field>
        </>
      )}

      <div className="flex gap-3">
        <BackButton onClick={onBack} />
        <SubmitButton onClick={() => onSubmit(
          payoutMethod === "bank"
            ? { bankName, accountName, accountNumber, branchName }
            : { mobileBankingType, mobileBankingNumber }
        )} disabled={!valid} loading={loading} label="Continue" />
      </div>
    </div>
  );
}

// ====================================================================
// Step 5: Terms Form
// ====================================================================
function TermsForm({ onBack, onSubmit, loading }: {
  onBack: () => void; onSubmit: () => void; loading: boolean;
}) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="space-y-4">
      <FormHeader icon={<FileText className="w-5 h-5 text-[#f57224]" />} title="Terms & Conditions" subtitle="Review and accept to submit" />

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 text-sm text-slate-600 max-h-64 overflow-y-auto">
        <p className="font-bold text-[#0f172a]">Seller Agreement</p>
        <p>1. I confirm that all information provided is accurate and truthful.</p>
        <p>2. I agree to Shop Nexa's commission rate (default 8%) on each order.</p>
        <p>3. I will fulfill orders within the promised delivery timeline.</p>
        <p>4. I understand that Shop Nexa may suspend my account for policy violations.</p>
        <p>5. I agree to maintain product quality and handle customer returns as per policy.</p>
        <p>6. I understand that earnings are credited to my wallet only after order delivery.</p>
        <p>7. I agree to the minimum withdrawal amount and processing times.</p>
        <p>8. I will not list prohibited, counterfeit, or illegal products.</p>
        <p>9. I understand that Shop Nexa reserves the right to modify terms with notice.</p>
        <p>10. I agree to data processing as per the privacy policy.</p>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-5 h-5 rounded accent-[#f57224]" />
        <span className="text-sm text-slate-600">
          I have read and agree to the Shop Nexa Seller Terms & Conditions, Privacy Policy, and Commission Structure.
        </span>
      </label>

      <div className="flex gap-3">
        <BackButton onClick={onBack} />
        <SubmitButton onClick={onSubmit} disabled={!agreed} loading={loading} label="Submit Application" />
      </div>
    </div>
  );
}

// ====================================================================
// Shared Form Components
// ====================================================================
function FormHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">{icon}</div>
      <div>
        <h2 className="text-lg font-bold text-[#0f172a]">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-[#f57224] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SubmitButton({ onClick, disabled, loading, label }: { onClick: () => void; disabled: boolean; loading: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className="flex-1 bg-[#f57224] hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
      {loading ? <Loader className="w-4 h-4 animate-spin" /> : <>{label} <ChevronRight className="w-4 h-4" /></>}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 px-5 rounded-xl text-sm transition-colors flex items-center gap-1">
      <ChevronLeft className="w-4 h-4" />
    </button>
  );
}
