import { Link } from "@tanstack/react-router";
import { Home, MessageCircle, ShoppingCart, User } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useActiveOrdersCount } from "@/hooks/useActiveOrdersCount";

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground shadow">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function MobileBottomNav() {
  const { count: cartCount } = useCart();
  const { user } = useAuth();
  const msgCount = useActiveOrdersCount();

  const item =
    "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground transition hover:text-primary active:scale-95";
  const activeCls = "text-primary";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] backdrop-blur md:hidden"
      aria-label="Bottom navigation"
    >
      <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: activeCls }} className={item}>
        <Home className="h-5 w-5" />
        <span>Home</span>
      </Link>
      <Link to="/orders" activeProps={{ className: activeCls }} className={item}>
        <span className="relative">
          <MessageCircle className="h-5 w-5" />
          <Badge n={msgCount} />
        </span>
        <span>Messages</span>
      </Link>
      <Link to="/cart" activeProps={{ className: activeCls }} className={item}>
        <span className="relative">
          <ShoppingCart className="h-5 w-5" />
          <Badge n={cartCount} />
        </span>
        <span>Cart</span>
      </Link>
      <Link
        to={user ? "/account" : "/login"}
        activeProps={{ className: activeCls }}
        className={item}
      >
        <User className="h-5 w-5" />
        <span>Account</span>
      </Link>
    </nav>
  );
}
