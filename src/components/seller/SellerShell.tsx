import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Wallet,
  Store,
  Settings,
  Bell,
  BarChart3,
  Tag,
  DollarSign,
  Menu,
  X,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useSellerProfile } from "@/hooks/useSellerProfile";
import { signOut } from "@/services/firebase/auth";
import { toast } from "sonner";
import { SELLER_STATUS_CONFIG } from "@/types/seller";

interface Props {
  children: ReactNode;
}

export function SellerShell({ children }: Props) {
  const { profile } = useSellerProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const onSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  const navItems = [
    { to: "/seller", icon: LayoutDashboard, label: "Dashboard", exact: true },
    { to: "/seller/products", icon: Package, label: "Products" },
    { to: "/seller/orders", icon: ShoppingBag, label: "Orders" },
    { to: "/seller/earnings", icon: DollarSign, label: "Earnings" },
    { to: "/seller/wallet", icon: Wallet, label: "Wallet" },
    { to: "/seller/coupons", icon: Tag, label: "Coupons" },
    { to: "/seller/store", icon: Store, label: "Store" },
    { to: "/seller/analytics", icon: BarChart3, label: "Analytics" },
    { to: "/seller/notifications", icon: Bell, label: "Notifications" },
    { to: "/seller/settings", icon: Settings, label: "Settings" },
  ];

  const mobileTabs = [
    { to: "/seller", icon: LayoutDashboard, label: "Home", exact: true },
    { to: "/seller/products", icon: Package, label: "Products" },
    { to: "/seller/orders", icon: ShoppingBag, label: "Orders" },
    { to: "/seller/wallet", icon: Wallet, label: "Wallet" },
  ];

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  const statusConfig = profile
    ? SELLER_STATUS_CONFIG[profile.status]
    : null;

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-[#0f172a] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <Link to="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#f57224] rounded-lg flex items-center justify-center">
                  <Store className="w-5 h-5 text-white" />
                </div>
                <div className="hidden sm:block leading-tight">
                  <span className="text-sm font-bold">
                    <span className="text-white">Shop</span>
                    <span className="text-[#f57224]">Nexa</span>
                    <span className="text-slate-400 ml-1">Seller</span>
                  </span>
                  {profile?.shopName && (
                    <p className="text-[11px] text-slate-400">{profile.shopName}</p>
                  )}
                </div>
              </Link>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-3">
              {statusConfig && (
                <span
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: statusConfig.bgColor, color: statusConfig.color }}
                >
                  <span>{statusConfig.icon}</span>
                  {statusConfig.label}
                </span>
              )}
              {profile && (
                <span className="hidden md:block text-xs text-slate-400">
                  Balance: <span className="text-[#f57224] font-bold">${profile.availableBalance.toFixed(2)}</span>
                </span>
              )}
              <Link
                to="/seller/notifications"
                className="relative p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5" />
              </Link>
              <button
                onClick={onSignOut}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/10 bg-[#0f172a]">
            <nav className="max-w-7xl mx-auto px-3 py-2 space-y-0.5">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.to, item.exact)
                      ? "bg-[#f57224] text-white"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Desktop Layout */}
      <div className="flex-1 max-w-7xl mx-auto w-full lg:flex lg:gap-6 lg:px-6 lg:py-6">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <nav className="sticky top-20 space-y-0.5 bg-white rounded-xl border border-slate-200 p-2 shadow-sm">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.to, item.exact)
                    ? "bg-[#0f172a] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {isActive(item.to, item.exact) && <ChevronRight className="w-4 h-4 ml-auto" />}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 pb-20 lg:pb-6">{children}</main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 flex items-center justify-around px-2 py-1.5 safe-area-pb">
        {mobileTabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
              isActive(tab.to, tab.exact)
                ? "text-[#f57224]"
                : "text-slate-400"
            }`}
          >
            <tab.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </Link>
        ))}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-slate-400"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>
    </div>
  );
}
