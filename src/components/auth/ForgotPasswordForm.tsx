import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { toast } from "sonner";
import { forgotSchema, type ForgotValues } from "@/utils/validation";
import { resetPassword } from "@/services/firebase/auth";
import { mapFirebaseError } from "@/utils/errors";
import { Spinner } from "@/components/common/Spinner";
import { firebaseConfigured } from "@/services/firebase/config";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = async (values: ForgotValues) => {
    if (!firebaseConfigured) {
      toast.error("Firebase is not configured yet. Add your .env keys.");
      return;
    }
    try {
      await resetPassword(values.email);
      setSent(true);
      toast.success("Password reset email sent");
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  if (sent) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        We've sent a password reset link to your email. Check your inbox and follow the link to
        choose a new password.
      </div>
    );
  }

  return (
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
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {isSubmitting && <Spinner />} Send reset link
      </button>
    </form>
  );
}
