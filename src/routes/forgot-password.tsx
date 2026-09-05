import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getSiteUrl } from "@/lib/seo";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  component: ForgotPage,
  head: () => ({
    meta: [
      { title: "Reset Password — AVENTA SHOP" },
      { name: "description", content: "Reset your AVENTA SHOP account password with a secure email link." },
      { property: "og:title", content: "Reset Password — AVENTA SHOP" },
      { property: "og:description", content: "Reset your AVENTA SHOP account password." },
      { property: "og:url", content: `${getSiteUrl()}/forgot-password` },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `${getSiteUrl()}/forgot-password` }],
  }),
});


function ForgotPage() {
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link"
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
