import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Package,
  Layers,
  Users,
  Store,
  ShoppingBag,
  Ticket,
  Image as ImageIcon,
  Settings,
  Activity,
  LogOut,
  Home,
MapPin,
  Megaphone,} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "@/services/firebase/auth";
import { toast } from "sonner";

export function AdminShell({ children }: { children: ReactNode }) {
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
            <img src="/brand/aventa-shop-logo.png" alt="AVENTA SHOP Admin" className="h-10 w-auto object-contain" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-muted-foreground">Admin</span>
              <span className="text-xs text-muted-foreground">Super Admin Panel</span>
            </div>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground md:inline">
              {profile?.displayName || user?.email}
            </span>
            <Link to="/account" className="rounded-md border px-3 py-1.5 hover:bg-muted">
              My Account
            </Link>
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 hover:bg-muted"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-[240px_1fr]">
        <aside className="rounded-lg border bg-background p-3">
          <nav className="space-y-1 text-sm">
            <AItem to="/admin" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" exact />
            <AItem to="/admin/products" icon={<Package className="h-4 w-4" />} label="Products" />
            <AItem to="/admin/categories" icon={<Layers className="h-4 w-4" />} label="Categories" />
            <AItem to="/admin/sellers" icon={<Store className="h-4 w-4" />} label="Sellers" />
            <AItem to="/admin/users" icon={<Users className="h-4 w-4" />} label="Users" />
            <AItem to="/admin/orders" icon={<ShoppingBag className="h-4 w-4" />} label="Orders" />
            <AItem to="/admin/coupons" icon={<Ticket className="h-4 w-4" />} label="Coupons" />
            <AItem to="/admin/banners" icon={<ImageIcon className="h-4 w-4" />} label="Banners" />
            <AItem to="/admin/announcements" icon={<Megaphone className="h-4 w-4" />} label="Announcements" />
            <AItem to="/admin/locations" icon={<MapPin className="h-4 w-4" />} label="Locations" />
            <AItem to="/admin/homepage" icon={<Home className="h-4 w-4" />} label="Homepage" />
            <AItem to="/admin/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
            <AItem to="/admin/logs" icon={<Activity className="h-4 w-4" />} label="Activity Logs" />
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

function AItem({
  to,
  icon,
  label,
  exact,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={exact ? { exact: true } : undefined}
      activeProps={{ className: "bg-primary/10 text-primary" }}
      className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted"
    >
      {icon}
      {label}
    </Link>
  );
}
