import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { registerSchema, type RegisterValues } from "@/utils/validation";
import { signInWithGoogle, signUpWithEmail } from "@/services/firebase/auth";
import { mapFirebaseError } from "@/utils/errors";
import { Spinner } from "@/components/common/Spinner";
import { GoogleButton } from "./GoogleButton";
import { firebaseConfigured } from "@/services/firebase/config";

export function RegisterForm() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });
  const [googleLoading, setGoogleLoading] = useState(false);

  const onSubmit = async (values: RegisterValues) => {
    if (!firebaseConfigured) {
      toast.error("Firebase is not configured yet. Add your .env keys.");
      return;
    }
    try {
      await signUpWithEmail(values.email, values.password, values.displayName);
      toast.success("Account created — check your inbox to verify your email");
      navigate({ to: "/verify-email" });
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
      toast.success("Welcome to ShopNexa");
      navigate({ to: "/" });
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
