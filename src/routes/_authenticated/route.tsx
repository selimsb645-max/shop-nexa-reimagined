import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { FullPageSpinner } from "@/components/common/Spinner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: pathname }, replace: true });
    }
  }, [loading, user, navigate, pathname]);

  if (loading || !user) return <FullPageSpinner />;
  return <Outlet />;
}
