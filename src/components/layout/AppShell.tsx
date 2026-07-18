import { Link, useNavigate } from "@tanstack/react-router";
import { ShoppingCart, User, LogOut, Package, Store, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "@/services/firebase/auth";
import { toast } from "sonner";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const onSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">
              <span className="text-primary">Shop</span>
              <span className="text-accent">Nexa</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground md:inline">
              {profile?.displayName || user?.displayName || user?.email}
            </span>
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 hover:bg-muted"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-[220px_1fr]">
        <aside className="rounded-lg border bg-background p-3">
          <nav className="space-y-1 text-sm">
            <NavItem to="/account" icon={<User className="h-4 w-4" />} label="Profile" />
            <NavItem to="/orders" icon={<Package className="h-4 w-4" />} label="Orders" />
            <NavItem to="/seller" icon={<Store className="h-4 w-4" />} label="Seller Panel" />
            {profile?.role === "admin" && (
              <NavItem to="/admin" icon={<Shield className="h-4 w-4" />} label="Admin" />
            )}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      activeProps={{ className: "bg-primary/10 text-primary" }}
      className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted"
    >
      {icon}
      {label}
    </Link>
  );
}
