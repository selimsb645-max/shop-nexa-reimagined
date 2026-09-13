import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSiteUrl } from "@/lib/seo";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign In — AVENTA SHOP" },
      {
        name: "description",
        content:
          "Sign in to your AVENTA SHOP account to track orders, save wishlists and checkout faster.",
      },
      { property: "og:title", content: "Sign In — AVENTA SHOP" },
      { property: "og:description", content: "Sign in to your AVENTA SHOP account." },
      { property: "og:url", content: `${getSiteUrl()}/login` },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `${getSiteUrl()}/login` }],
  }),
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
});

function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your AVENTA SHOP account"
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
