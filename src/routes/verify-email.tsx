import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useAuth } from "@/context/AuthContext";
import { resendVerification, signOut } from "@/services/firebase/auth";
import { toast } from "sonner";
import { mapFirebaseError } from "@/utils/errors";
import { useState } from "react";
import { Spinner } from "@/components/common/Spinner";
import { MailCheck } from "lucide-react";

export const Route = createFileRoute("/verify-email")({
  ssr: false,
  component: VerifyPage,
  head: () => ({
    meta: [
      { title: "Verify Your Email — ShopNexa" },
      { name: "description", content: "Confirm your email address to activate your ShopNexa account." },
      { property: "og:title", content: "Verify Your Email — ShopNexa" },
      { property: "og:description", content: "Confirm your email address to activate your ShopNexa account." },
      { property: "og:url", content: "https://shop-nexa.lovable.app/verify-email" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://shop-nexa.lovable.app/verify-email" }],
  }),
});


function VerifyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);

  const onResend = async () => {
    if (!user) return;
    setSending(true);
    try {
      await resendVerification(user);
      toast.success("Verification email sent");
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setSending(false);
    }
  };

  const onCheck = async () => {
    if (!user) return;
    await user.reload();
    if (user.emailVerified) {
      toast.success("Email verified");
      navigate({ to: "/account" });
    } else {
      toast.message("Not verified yet. Please click the link in your email.");
    }
  };

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={user?.email ? `We've sent a link to ${user.email}` : "Check your inbox for a verification link"}
      footer={
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
          className="text-primary hover:underline"
        >
          Sign out
        </button>
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="h-7 w-7" />
        </div>
        <p className="text-sm text-muted-foreground">
          Click the link in the email to activate your account. You can continue browsing without
          verifying, but some features require a verified email.
        </p>
        <div className="flex w-full flex-col gap-2">
          <button
            onClick={onCheck}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            I've verified my email
          </button>
          <button
            onClick={onResend}
            disabled={sending}
            className="flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {sending && <Spinner />} Resend email
          </button>
          <Link
            to="/"
            className="w-full rounded-md px-4 py-2.5 text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Back to home
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
