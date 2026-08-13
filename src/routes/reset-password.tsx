import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Spinner } from "@/components/common/Spinner";
import { resetPasswordSchema, type ResetPasswordValues } from "@/utils/validation";
import { verifyResetCode, completePasswordReset } from "@/services/firebase/auth";
import { mapFirebaseError } from "@/utils/errors";
import { firebaseConfigured } from "@/services/firebase/config";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset Password — ShopNexa" },
      {
        name: "description",
        content: "Set a new password for your ShopNexa account.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { oobCode?: string } => ({
    oobCode: typeof s.oobCode === "string" ? s.oobCode : undefined,
  }),
});

type PageStatus = "verifying" | "form" | "success" | "error";

function ResetPasswordPage() {
  const { oobCode } = useSearch({ from: "/reset-password" });
  const [status, setStatus] = useState<PageStatus>("verifying");
  const [errorMessage, setErrorMessage] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    if (!oobCode) {
      setStatus("error");
      setErrorMessage(
        "This reset link is incomplete. Please request a new password reset email.",
      );
      return;
    }

    if (!firebaseConfigured) {
      setStatus("error");
      setErrorMessage("Firebase is not configured. Please contact support.");
      return;
    }

    let cancelled = false;
    verifyResetCode(oobCode)
      .then((verifiedEmail: string) => {
        if (cancelled) return;
        setUserEmail(verifiedEmail);
        setStatus("form");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(mapFirebaseError(err));
      });

    return () => {
      cancelled = true;
    };
  }, [oobCode]);

  if (status === "verifying") {
    return (
      <AuthLayout title="Verifying reset link">
        <div className="flex items-center justify-center gap-3 py-6">
          <Spinner />
          <span className="text-sm text-muted-foreground">
            Please wait while we verify your reset link…
          </span>
        </div>
      </AuthLayout>
    );
  }

  if (status === "error") {
    return (
      <AuthLayout
        title="Reset link invalid"
        subtitle={errorMessage}
        footer={
          <Link to="/forgot-password" className="font-medium text-primary hover:underline">
            Request a new reset link
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 py-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-center text-sm text-muted-foreground">
            The reset link may have expired or already been used. Try requesting a new one.
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (status === "success") {
    return (
      <AuthLayout
        title="Password updated!"
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to Login
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 py-4">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-center text-sm text-muted-foreground">
            Your password has been successfully updated. You can now log in with your
            new password.
          </p>
        </div>
        <Link
          to="/login"
          className="mt-6 flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to Login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <ResetForm
      oobCode={oobCode!}
      userEmail={userEmail}
      onSuccess={() => setStatus("success")}
    />
  );
}

function ResetForm({
  oobCode,
  userEmail,
  onSuccess,
}: {
  oobCode: string;
  userEmail: string;
  onSuccess: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = async (values: ResetPasswordValues) => {
    try {
      await completePasswordReset(oobCode, values.password);
      toast.success("Password reset successful!");
      onSuccess();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  return (
    <AuthLayout
      title="Set a new password"
      subtitle={
        userEmail
          ? `Enter a new password for ${userEmail}`
          : "Enter your new password below"
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Password */}
        <div>
          <label className="mb-1 block text-sm font-medium">New password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              {...register("password")}
              className="w-full rounded-md border px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label className="mb-1 block text-sm font-medium">Confirm new password</label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              {...register("confirmPassword")}
              className="w-full rounded-md border px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showConfirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting && <Spinner />}
          {isSubmitting ? "Resetting…" : "Reset password"}
        </button>
      </form>
    </AuthLayout>
  );
}
