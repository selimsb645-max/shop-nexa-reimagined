import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign In — ShopNexa" },
      { name: "description", content: "Sign in to your ShopNexa account to track orders, save wishlists and checkout faster." },
      { property: "og:title", content: "Sign In — ShopNexa" },
      { property: "og:description", content: "Sign in to your ShopNexa account." },
      { property: "og:url", content: "https://shop-nexa.lovable.app/login" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://shop-nexa.lovable.app/login" }],
  }),
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
});


function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your ShopNexa account"
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
