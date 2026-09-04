import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const Route = createFileRoute("/register")({
  ssr: false,
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: "Create Account — Aventa Shop" },
      {
        name: "description",
        content: "Create a free Aventa Shop account to shop deals, track orders and earn rewards.",
      },
      { property: "og:title", content: "Create Account — Aventa Shop" },
      { property: "og:description", content: "Create a free Aventa Shop account." },
      { property: "og:url", content: "https://shop-nexa.lovable.app/register" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://shop-nexa.lovable.app/register" }],
  }),
});

function RegisterPage() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Shop smarter with Aventa Shop"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
