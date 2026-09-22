import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { isSellerModeActive } from "@/lib/sellerMode";

/**
 * Enforces the Seller Mode "lock": if this account is currently in Seller
 * Mode (flag persisted in localStorage by SellerGate the moment the
 * approved seller dashboard is shown) and the user navigates — or reloads,
 * or reopens the browser — onto any non-/seller page, bounce them straight
 * back into the Seller Workspace. The only way out is the explicit
 * "Exit Seller Mode" action in SellerShell, which clears the flag first.
 *
 * Mounted once in the root layout so it runs on every route.
 */
export function SellerModeGuard() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (location.pathname.startsWith("/seller")) return;
    if (isSellerModeActive(user.uid)) {
      navigate({ to: "/seller", replace: true });
    }
  }, [loading, user, location.pathname, navigate]);

  return null;
}
