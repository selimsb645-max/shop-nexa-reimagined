import { useState, useRef, useEffect } from "react";
import {
  ShieldCheck,
  Phone,
  Lock,
  Package,
  MapPin,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { formatPrice } from "@/utils/format";
import { maskPhone, requestOtp, verifyOtp } from "@/services/firebase/verification";
import { getFirebaseAuth } from "@/services/firebase/config";
import type { CartItem } from "@/types/commerce";

interface VerificationGateProps {
  phoneNumber: string;
  cartItems: CartItem[];
  orderTotal: number;
  deliveryLocation: string;
  onVerified: (sessionId: string) => void;
  onBack: () => void;
  onChangePhone: () => void;
}

type Stage = "initial" | "otp_sent" | "verifying" | "verified" | "error";

export function VerificationGate({
  phoneNumber,
  cartItems,
  orderTotal,
  deliveryLocation,
  onVerified,
  onBack,
  onChangePhone,
}: VerificationGateProps) {
  const [stage, setStage] = useState<Stage>("initial");
  const [sessionId, setSessionId] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remainingResends, setRemainingResends] = useState(5);
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const [mockOtp, setMockOtp] = useState<string | undefined>(undefined);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const itemCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  const maskedPhone = maskPhone(phoneNumber);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Auto-focus first OTP input
  useEffect(() => {
    if (stage === "otp_sent" && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [stage]);

  // Handle OTP input change
  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]?.focus();
    }
    if (error) setError("");
  };

  // Handle OTP paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length > 0) {
      const newOtp = ["", "", "", "", "", ""];
      for (let i = 0; i < Math.min(pasted.length, 6); i++) {
        newOtp[i] = pasted[i];
      }
      setOtp(newOtp);
      if (pasted.length >= 6) {
        inputRefs.current[5]?.focus();
      } else if (pasted.length > 0) {
        inputRefs.current[Math.min(pasted.length, 5)]?.focus();
      }
      if (error) setError("");
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Send OTP
  const handleSendOtp = async () => {
    setLoading(true);
    setError("");
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please sign in to continue.");
      const idToken = await currentUser.getIdToken();

      const result = await requestOtp({
        idToken,
        phoneNumber,
        cartItems: cartItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        orderTotal,
        itemCount,
        deliveryLocation,
      });

      setSessionId(result.sessionId);
      setRemainingResends(result.remainingResends);
      setCountdown(60);
      setStage("otp_sent");
      setMockOtp(result.mockOtp);
      setRemainingAttempts(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send verification code.");
      setStage("error");
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const handleVerify = async () => {
    const otpString = otp.join("");
    if (otpString.length !== 6) {
      setError("Please enter the 6-digit code.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please sign in to continue.");
      const idToken = await currentUser.getIdToken();

      const result = await verifyOtp({
        idToken,
        sessionId,
        otp: otpString,
      });

      if (result.success) {
        setStage("verified");
        setTimeout(() => onVerified(sessionId), 600);
      } else {
        setRemainingAttempts(result.remainingAttempts);
        setError(result.message);
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true);
    setError("");
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please sign in to continue.");
      const idToken = await currentUser.getIdToken();

      const result = await requestOtp({
        idToken,
        phoneNumber,
        cartItems: cartItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        orderTotal,
        itemCount,
        deliveryLocation,
      });

      setSessionId(result.sessionId);
      setRemainingResends(result.remainingResends);
      setCountdown(60);
      setMockOtp(result.mockOtp);
      setOtp(["", "", "", "", "", ""]);
      setRemainingAttempts(5);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    } finally {
      setLoading(false);
    }
  };

  // Progress indicator
  const ProgressIndicator = () => (
    <div className="flex items-center justify-center gap-2 sm:gap-4 mb-6">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-white" />
        </div>
        <span className="text-xs font-medium text-green-600 hidden sm:inline">Checkout</span>
      </div>
      <div className="w-6 sm:w-12 h-px bg-green-400" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-white" />
        </div>
        <span className="text-xs font-medium text-green-600 hidden sm:inline">Review</span>
      </div>
      <div className="w-6 sm:w-12 h-px bg-slate-300" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-[#f57224] flex items-center justify-center ring-4 ring-orange-100">
          <Lock className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-bold text-[#f57224]">Verify</span>
      </div>
      <div className="w-6 sm:w-12 h-px bg-slate-300" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
          <Package className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <span className="text-xs font-medium text-slate-400 hidden sm:inline">Complete</span>
      </div>
    </div>
  );

  // Initial stage
  if (stage === "initial" || stage === "error") {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 font-sans antialiased">
        <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h1 className="text-base font-bold text-slate-800">Verify Your Order</h1>
          </div>
        </div>

        <main className="flex-1 max-w-lg w-full mx-auto px-4 py-6">
          <ProgressIndicator />

          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-50 border-2 border-orange-100 mb-4">
              <ShieldCheck className="w-8 h-8 text-[#f57224]" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">Verify Your Order</h2>
            <p className="text-sm text-slate-500 px-4">
              Please verify your phone number before placing your order.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1.5">
                <Phone className="w-3.5 h-3.5" />
                <span>Phone Number</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-slate-800 tracking-wider">
                  {maskedPhone}
                </span>
                <button
                  onClick={onChangePhone}
                  className="text-xs font-medium text-[#f57224] hover:underline"
                >
                  Change number
                </button>
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Order Total</span>
              <span className="text-lg font-bold text-slate-800">৳{formatPrice(orderTotal)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                Items
              </span>
              <span className="text-sm font-medium text-slate-700">
                {itemCount} {itemCount > 1 ? "items" : "item"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Delivery
              </span>
              <span className="text-sm font-medium text-slate-700 text-right max-w-[200px] truncate">
                {deliveryLocation}
              </span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleSendOtp}
            disabled={loading}
            className="w-full bg-[#f57224] hover:bg-[#e5631a] text-white font-bold py-4 rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Phone className="w-4 h-4" />
                <span>Send Verification Code</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-2 mt-4 text-xs text-slate-400">
            <Lock className="w-3 h-3" />
            <span>Your order is protected by secure verification.</span>
          </div>
        </main>
      </div>
    );
  }

  // Verified stage
  if (stage === "verified") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 font-sans">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 border-2 border-green-200 mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-1">Phone Verified</h2>
          <p className="text-sm text-slate-500">Placing your order...</p>
        </div>
      </div>
    );
  }

  // OTP input stage
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans antialiased">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-base font-bold text-slate-800">Verify OTP</h1>
        </div>
      </div>

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-6">
        <ProgressIndicator />

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-50 border-2 border-orange-100 mb-4">
            <Lock className="w-8 h-8 text-[#f57224]" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-1">Enter Verification Code</h2>
          <p className="text-sm text-slate-500">
            Code sent to <span className="font-medium text-slate-700">{maskedPhone}</span>
          </p>
          {mockOtp && (
            <div className="mt-2 inline-block bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
              <span className="text-xs font-medium text-amber-600">Dev mode — code: {mockOtp}</span>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-2 sm:gap-3 mb-6" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              aria-label={`Digit ${i + 1}`}
              className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-xl border-2 border-slate-200 focus:border-[#f57224] focus:ring-4 focus:ring-orange-100 outline-none transition-all bg-white text-slate-800"
            />
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-red-600">{error}</p>
              {remainingAttempts > 0 && remainingAttempts < 5 && (
                <p className="text-xs text-red-400 mt-0.5">
                  {remainingAttempts} attempt{remainingAttempts > 1 ? "s" : ""} remaining
                </p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={loading || otp.join("").length !== 6}
          className="w-full bg-[#f57224] hover:bg-[#e5631a] text-white font-bold py-4 rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Verifying...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Verify & Place Order</span>
            </>
          )}
        </button>

        <div className="text-center mt-5">
          {countdown > 0 ? (
            <p className="text-sm text-slate-400">
              Resend available in{" "}
              <span className="font-mono font-medium text-slate-600">
                00:{countdown.toString().padStart(2, "0")}
              </span>
            </p>
          ) : (
            <div>
              <p className="text-sm text-slate-400 mb-1">Didn't receive the code?</p>
              <button
                onClick={handleResend}
                disabled={loading || remainingResends <= 0}
                className="text-sm font-medium text-[#f57224] hover:underline disabled:opacity-50 disabled:no-underline"
              >
                Resend Code
                {remainingResends < 5 && (
                  <span className="text-slate-400 ml-1">({remainingResends} left)</span>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-slate-400">
          <Lock className="w-3 h-3" />
          <span>Secured by AVENTA SHOP verification</span>
        </div>
      </main>
    </div>
  );
}
