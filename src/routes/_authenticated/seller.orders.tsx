import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/seller/orders")({
  component: () => <Outlet />,
});
