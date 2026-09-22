/**
 * Pocket Storefront design: a visible, safe-area-aware mobile navigation keeps
 * AVENTA SHOP's five primary destinations within thumb reach without covering content.
 */
import { Link, useLocation } from "@tanstack/react-router";
import { Home, LayoutGrid, MessageCircle, ShoppingCart, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { countUnreadMessages } from "@/services/firebase/messages";
import { firebaseConfigured } from "@/services/firebase/config";

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground shadow ring-2 ring-background">
      {n > 99 ? "99+" : n}
    </span>
  );
}

const itemCls =
  "group relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold text-muted-foreground transition-all duration-200 active:scale-[0.97]";
const activeCls = "text-primary";

function Indicator() {
  return (
    <span className="pointer-events-none absolute -top-0.5 left-1/2 h-1 w-0 -translate-x-1/2 rounded-full bg-primary transition-all duration-300 group-data-[status=active]:w-7" />
  );
}

export function MobileBottomNav() {
  const location = useLocation();
  const { count: cartCount } = useCart();
  const { user } = useAuth();
  const { data: msgCount = 0 } = useQuery({
    queryKey: ["messages", "unread", user?.uid],
    queryFn: () => countUnreadMessages(user!.uid),
    enabled: Boolean(user && firebaseConfigured),
    refetchInterval: 30_000,
  });

  // Hide on the dedicated Seller Workspace and Admin console — those surfaces
  // own their own navigation (SellerShell / SuperAdminLayout); the customer
  // bottom bar must never float on top of them.
  if (location.pathname.startsWith("/seller") || location.pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
      aria-label="Bottom navigation"
    >
      <div className="mx-auto flex max-w-md items-stretch gap-0.5 rounded-2xl border border-blue-100 bg-background/95 p-1 shadow-[0_8px_26px_rgba(20,85,198,0.18)] backdrop-blur-md">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          activeProps={{ className: activeCls }}
          className={itemCls}
        >
          <Indicator />
          <Home className="h-[26px] w-[26px]" strokeWidth={1.8} />
          <span>Home</span>
        </Link>
        <Link to="/shop" activeProps={{ className: activeCls }} className={itemCls}>
          <Indicator />
          <LayoutGrid className="h-[26px] w-[26px]" strokeWidth={1.8} />
          <span>Categories</span>
        </Link>
        <Link
          to={user ? "/messages" : "/login"}
          activeProps={{ className: activeCls }}
          className={itemCls}
        >
          <Indicator />
          <span className="relative">
            <MessageCircle className="h-[26px] w-[26px]" strokeWidth={1.8} />
            <Badge n={msgCount} />
          </span>
          <span>Inbox</span>
        </Link>

        <Link to="/cart" activeProps={{ className: activeCls }} className={itemCls}>
          <Indicator />
          <span className="relative">
            <ShoppingCart className="h-[26px] w-[26px]" strokeWidth={1.8} />
            <Badge n={cartCount} />
          </span>
          <span>Cart</span>
        </Link>
        <Link
          to={user ? "/account" : "/login"}
          activeProps={{ className: activeCls }}
          className={itemCls}
        >
          <Indicator />
          <User className="h-[26px] w-[26px]" strokeWidth={1.8} />
          <span>Account</span>
        </Link>
      </div>
    </nav>
  );
}
