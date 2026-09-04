import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { loginSchema, type LoginValues } from "@/utils/validation";
import { signInWithEmail, signInWithGoogle, waitForAuthUser } from "@/services/firebase/auth";
import { mapFirebaseError } from "@/utils/errors";
import { Spinner } from "@/components/common/Spinner";
import { GoogleButton } from "./GoogleButton";
import { firebaseConfigured } from "@/services/firebase/config";
import { useAuth } from "@/context/AuthContext";

export function LoginForm() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const [googleLoading, setGoogleLoading] = useState(false);

  const redirectTo = "/";

  useEffect(() => {
    if (!loading && user) navigate({ to: redirectTo, replace: true });
  }, [loading, user, navigate]);

  const onSubmit = async (values: LoginValues) => {
    if (!firebaseConfigured) {
      toast.error("Firebase is not configured yet. Add your .env keys.");
      return;
    }
    try {
      await signInWithEmail(values.email, values.password);
      await waitForAuthUser();
      toast.success("Signed in");
      navigate({ to: redirectTo, replace: true });
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
      await waitForAuthUser();
      toast.success("Signed in");
      navigate({ to: redirectTo, replace: true });
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <GoogleButton onClick={onGoogle} loading={googleLoading} />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium">Password</label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot?
            </Link>
          </div>
          <input
            type="password"
            autoComplete="current-password"
            {...register("password")}
            className="w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting && <Spinner />} Sign in
        </button>
      </form>
    </div>
  );
}
