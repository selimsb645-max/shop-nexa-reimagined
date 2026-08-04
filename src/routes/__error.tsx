import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Home, Search } from "lucide-react";

export const Route = createFileRoute("/__error")({
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        <div className="mb-6 text-8xl font-bold text-muted/30">404</div>
        <h1 className="mb-2 text-2xl font-bold">Page Not Found</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Home className="h-4 w-4" /> Back to Home
          </Link>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 rounded-xl border px-6 py-2.5 text-sm font-medium transition hover:bg-muted"
          >
            <Search className="h-4 w-4" /> Browse Products
          </Link>
        </div>
      </div>
    </div>
  );
}
