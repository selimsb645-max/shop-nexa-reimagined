import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { registerSchema, type RegisterValues } from "@/utils/validation";
import { signInWithGoogle, signUpWithEmail, waitForAuthUser } from "@/services/firebase/auth";
import { mapFirebaseError } from "@/utils/errors";
import { generatePromoCode } from "@/lib/promo.functions";
import { grantSignupReward, ensurePromoNotification } from "@/lib/rewards.functions";
import { Spinner } from "@/components/common/Spinner";
import { GoogleButton } from "./GoogleButton";
import { firebaseConfigured } from "@/services/firebase/config";
import { useAuth } from "@/context/AuthContext";

/**
 * Completes the signup benefit flow for a newly registered user.
 * Called after successful registration / Google sign-in.
 * All three steps are idempotent and non-blocking:
 * 1. Grant 100 welcome reward points (+ real notification)
 * 2. Generate AVENTA###### welcome promo code (existing system)
 * 3. Create promo notification with the actual code
 *
 * Failures are non-blocking — we don't want reward/promo issues to break
 * the registration flow. All functions are idempotent so retries are safe.
 */
async function completeSignupBenefits(
  user: { uid: string; getIdToken: () => Promise<string> },
  queryClient: { invalidateQueries: (opts: { queryKey: unknown[] }) => Promise<void> },
): Promise<void> {
  try {
    const idToken = await user.getIdToken();

    // 1. Grant 100 signup reward points (idempotent, transaction-safe)
    await grantSignupReward({ data: { idToken } });

    // 2. Generate AVENTA###### welcome promo code (existing system, idempotent)
    await generatePromoCode({ data: { idToken, campaignType: "welcome" } });

    // 3. Create promo notification with the actual generated code (idempotent)
    await ensurePromoNotification({ data: { idToken } });

    // 4. Sync account state — make sure every page showing reward points or
    // vouchers refetches the freshly awarded data instead of serving stale caches.
    await queryClient.invalidateQueries({ queryKey: ["rewards", "points"] });
    await queryClient.invalidateQueries({ queryKey: ["rewardTx"] });
    await queryClient.invalidateQueries({ queryKey: ["promoCodes"] });
  } catch {
    // Non-blocking: duplicate / network / server errors are swallowed.
    // All functions are idempotent — safe to retry on next login/signup.
  }
}

export function RegisterForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  const onSubmit = async (values: RegisterValues) => {
    if (!firebaseConfigured) {
      toast.error("Firebase is not configured yet. Add your .env keys.");
      return;
    }
    try {
      await signUpWithEmail(values.email, values.password, values.displayName);
      const authUser = await waitForAuthUser();
      // Grant 100 reward points + welcome promo + notifications (idempotent, non-blocking)
      await completeSignupBenefits(authUser, queryClient);
      toast.success("Account created! You got 100 bonus points and a welcome promo code.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onGoogle = async () => {
    if (!firebaseConfigured) {
      toast.error("Firebase is not configured yet. Add your .env keys.");
      return;
    }
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      const authUser = await waitForAuthUser();
      // Grant 100 reward points + welcome promo + notifications (idempotent, non-blocking)
      await completeSignupBenefits(authUser, queryClient);
      toast.success("Welcome to AVENTA SHOP! You got 100 bonus points and a welcome promo code.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setGoogleLoading(false);
    }
  };


  return (
    <div className="space-y-4">
      <GoogleButton onClick={onGoogle} loading={googleLoading} label="Sign up with Google" />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label className="mb-1 block text-sm font-medium">Full name</label>
          <input
            type="text"
            autoComplete="name"
            {...register("displayName")}
            className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          {errors.displayName && (
            <p className="mt-1 text-xs text-destructive">{errors.displayName.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            autoComplete="email"
            {...register("email")}
            className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            type="password"
            autoComplete="new-password"
            {...register("password")}
            className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Confirm password</label>
          <input
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
            className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting && <Spinner />} Create account
        </button>
      </form>
    </div>
  );
}
