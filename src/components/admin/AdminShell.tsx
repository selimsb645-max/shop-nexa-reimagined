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
  Megaphone,
  Bell,
  DollarSign,
  Percent,
  BarChart3,
  Boxes,
  Tag,
  Search,
  Truck,
  MessageSquare,
  Crown,
  ClipboardCheck,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "@/services/firebase/auth";
import { toast } from "sonner";
import { hasPermission, type AdminPermission } from "@/types/user";

// ── Sidebar item definition with permission gating ──────────────────────────
interface NavItem {
  to: string;
  icon: ReactNode;
  label: string;
  exact?: boolean;
  permission?: AdminPermission;
  superAdminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/admin", icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard", exact: true },
  {
    to: "/admin/manage-admins",
    icon: <Crown className="h-4 w-4" />,
    label: "Manage Admins",
    superAdminOnly: true,
  },
  {
    to: "/admin/analytics",
    icon: <BarChart3 className="h-4 w-4" />,
    label: "Analytics",
    permission: "analytics.view",
  },
  {
    to: "/admin/finance",
    icon: <DollarSign className="h-4 w-4" />,
    label: "Finance",
    permission: "finance.view",
  },
  {
    to: "/admin/wallets",
    icon: <Wallet className="h-4 w-4" />,
    label: "Wallets",
    permission: "finance.view",
  },
  {
    to: "/admin/products",
    icon: <Package className="h-4 w-4" />,
    label: "Products",
    permission: "products.view",
  },
  {
    to: "/admin/qc",
    icon: <ClipboardCheck className="h-4 w-4" />,
    label: "Product QC",
    permission: "products.view",
  },
  {
    to: "/admin/inventory",
    icon: <Boxes className="h-4 w-4" />,
    label: "Inventory",
    permission: "products.view",
  },
  {
    to: "/admin/categories",
    icon: <Layers className="h-4 w-4" />,
    label: "Categories",
    permission: "categories.view",
  },
  {
    to: "/admin/commission-setup",
    icon: <Percent className="h-4 w-4" />,
    label: "Commission Setup",
    permission: "finance.commissions",
  },
  {
    to: "/admin/sellers",
    icon: <Store className="h-4 w-4" />,
    label: "Sellers",
    permission: "sellers.view",
  },
  {
    to: "/admin/users",
    icon: <Users className="h-4 w-4" />,
    label: "Users",
    permission: "users.view",
  },
  {
    to: "/admin/orders",
    icon: <ShoppingBag className="h-4 w-4" />,
    label: "Orders",
    permission: "orders.view",
  },
  {
    to: "/admin/delivery",
    icon: <Truck className="h-4 w-4" />,
    label: "Delivery",
    permission: "orders.view",
  },
  {
    to: "/admin/delivery-zones",
    icon: <MapPin className="h-4 w-4" />,
    label: "Delivery Zones",
    permission: "settings.view",
  },
  {
    to: "/admin/coupons",
    icon: <Ticket className="h-4 w-4" />,
    label: "Coupons",
    permission: "coupons.view",
  },
  {
    to: "/admin/promo-codes",
    icon: <Tag className="h-4 w-4" />,
    label: "Promo Codes",
    permission: "coupons.view",
  },
  {
    to: "/admin/banners",
    icon: <ImageIcon className="h-4 w-4" />,
    label: "Banners",
    permission: "settings.view",
  },
  {
    to: "/admin/announcements",
    icon: <Megaphone className="h-4 w-4" />,
    label: "Announcements",
    permission: "settings.view",
  },
  {
    to: "/admin/locations",
    icon: <MapPin className="h-4 w-4" />,
    label: "Locations",
    permission: "settings.view",
  },
  {
    to: "/admin/homepage",
    icon: <Home className="h-4 w-4" />,
    label: "Homepage",
    permission: "settings.view",
  },
  {
    to: "/admin/seo",
    icon: <Search className="h-4 w-4" />,
    label: "SEO",
    permission: "settings.view",
  },
  {
    to: "/admin/reviews",
    icon: <MessageSquare className="h-4 w-4" />,
    label: "Reviews",
    permission: "products.view",
  },
  {
    to: "/admin/notifications",
    icon: <Bell className="h-4 w-4" />,
    label: "Notifications",
    permission: "settings.view",
  },
  {
    to: "/admin/settings",
    icon: <Settings className="h-4 w-4" />,
    label: "Settings",
    permission: "settings.view",
  },
  {
    to: "/admin/logs",
    icon: <Activity className="h-4 w-4" />,
    label: "Activity Logs",
    permission: "settings.view",
  },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const isSuperAdmin = profile?.role === "admin" && profile?.adminRole === "super_admin";

  // Filter nav items based on permissions
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin;
    if (!item.permission) return true; // Dashboard always visible
    if (isSuperAdmin) return true; // Super admin sees everything
    return hasPermission(profile, item.permission);
  });

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
            <img
              src="/brand/aventa-shop-logo.png"
              alt="AVENTA SHOP Admin"
              className="h-10 w-auto object-contain"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-muted-foreground">Admin</span>
              <span className="text-xs text-muted-foreground">
                {isSuperAdmin ? "Super Admin Panel" : "Admin Panel"}
              </span>
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
            {visibleItems.map((item) => (
              <AItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                exact={item.exact}
              />
            ))}
          </nav>
          {isSuperAdmin && (
            <div className="mt-4 rounded-lg bg-amber-50 p-2.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <Crown className="h-3.5 w-3.5" />
                Super Admin
              </p>
              <p className="mt-1 text-[10px] text-amber-600/80">Full access to everything</p>
            </div>
          )}
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
