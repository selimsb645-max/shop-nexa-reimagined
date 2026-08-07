import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  DollarSign, Package, ShoppingBag, TrendingUp, Plus, Eye,
  Wallet, Tag, Settings, BarChart3, Truck, MessageCircle,
  ArrowUpRight, ArrowDownRight, Bell, Star, AlertTriangle,
  Clock, CheckCircle2, XCircle, PackageX, Loader, Banknote,
  ShoppingBag as OrdersIcon, Inventory,
} from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import { listSellerProducts } from "@/services/firebase/sellerProducts";
import { listSellerOrders } from "@/services/firebase/sellerOrders";
import { getSellerWalletBalance, getSellerTotalEarnings, getSellerPendingBalance } from "@/services/firebase/sellerWallet";
import { countUnreadNotifications } from "@/services/firebase/sellers";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";
import type { SellerOrder, SellerProfile } from "@/types/seller";

export const Route = createFileRoute("/_authenticated/seller/")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <Dashboard sellerId={profile.uid} profile={profile} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Seller Dashboard — Shop Nexa" }] }),
});

function Dashboard({ sellerId, profile }: { sellerId: string; profile: SellerProfile }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [orders, setOrders] = useState<SellerOrder[] | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [p, o, bal, earn, pend, unread] = await Promise.all([
          listSellerProducts(sellerId),
          listSellerOrders(sellerId),
          getSellerWalletBalance(sellerId),
          getSellerTotalEarnings(sellerId),
          getSellerPendingBalance(sellerId),
          countUnreadNotifications(sellerId),
        ]);
        if (cancelled) return;
        setProducts(p);
        setOrders(o);
        setWalletBalance(bal);
        setTotalEarnings(earn);
        setPendingBalance(pend);
        setUnreadCount(unread);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sellerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-8 h-8 animate-spin text-slate-300" />
      </div>
    );
  }

  // KPI Calculations
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const todayOrders = orders?.filter(o => o.createdAt >= todayStart) ?? [];
  const yesterdayOrders = orders?.filter(o => o.createdAt >= yesterdayStart && o.createdAt < todayStart) ?? [];
  const weekOrders = orders?.filter(o => o.createdAt >= weekStart) ?? [];
  const monthOrders = orders?.filter(o => o.createdAt >= monthStart) ?? [];

  const sumEarnings = (list: SellerOrder[]) => list.reduce((s, o) => s + (o.earnings || 0), 0);
  const countByStatus = (status: string) => orders?.filter(o => o.status === status).length ?? 0;

  const todaySales = sumEarnings(todayOrders);
  const yesterdaySales = sumEarnings(yesterdayOrders);
  const weekSales = sumEarnings(weekOrders);
  const monthSales = sumEarnings(monthOrders);
  const totalSales = totalEarnings;

  const outOfStock = products?.filter(p => p.stock === 0).length ?? 0;
  const lowStock = products?.filter(p => p.stock > 0 && p.stock <= 5).length ?? 0;
  const couponCount = 0; // Will be fetched from sellerCoupons service

  // Sales trend (up/down vs yesterday)
  const salesTrend = yesterdaySales > 0
    ? ((todaySales - yesterdaySales) / yesterdaySales) * 100
    : todaySales > 0 ? 100 : 0;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">
            Welcome back, {profile.shopName} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Here's what's happening with your store today
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/seller/products/new" className="bg-[#f57224] hover:bg-orange-600 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Product
          </Link>
        </div>
      </div>

      {/* KPI Cards — Row 1: Sales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Today's Sales" value={formatPrice(todaySales)} icon={<DollarSign className="w-4 h-4" />}
          trend={salesTrend} color="#059669" bgColor="#ecfdf5" />
        <KpiCard label="Yesterday" value={formatPrice(yesterdaySales)} icon={<DollarSign className="w-4 h-4" />} color="#64748b" bgColor="#f8fafc" />
        <KpiCard label="This Week" value={formatPrice(weekSales)} icon={<TrendingUp className="w-4 h-4" />} color="#0f172a" bgColor="#f1f5f9" />
        <KpiCard label="This Month" value={formatPrice(monthSales)} icon={<TrendingUp className="w-4 h-4" />} color="#f57224" bgColor="#fff7ed" />
      </div>

      {/* KPI Cards — Row 2: Orders + Wallet */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Sales" value={formatPrice(totalSales)} icon={<Banknote className="w-4 h-4" />} color="#059669" bgColor="#ecfdf5" />
        <KpiCard label="Wallet Balance" value={formatPrice(walletBalance)} icon={<Wallet className="w-4 h-4" />} color="#f57224" bgColor="#fff7ed" link="/seller/wallet" />
        <KpiCard label="Pending Balance" value={formatPrice(pendingBalance)} icon={<Clock className="w-4 h-4" />} color="#d97706" bgColor="#fffbeb" />
        <KpiCard label="Withdrawable" value={formatPrice(walletBalance)} icon={<Banknote className="w-4 h-4" />} color="#0f172a" bgColor="#f1f5f9" link="/seller/withdrawals" />
      </div>

      {/* Order Status Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-bold text-[#0f172a] mb-3">Order Overview</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <OrderStat label="Pending" count={countByStatus("pending")} icon={<Clock className="w-4 h-4" />} color="#d97706" bgColor="#fffbeb" />
          <OrderStat label="Processing" count={countByStatus("processing")} icon={<Package className="w-4 h-4" />} color="#0ea5e9" bgColor="#f0f9ff" />
          <OrderStat label="Shipped" count={countByStatus("shipped")} icon={<Truck className="w-4 h-4" />} color="#6366f1" bgColor="#eef2ff" />
          <OrderStat label="Delivered" count={countByStatus("delivered")} icon={<CheckCircle2 className="w-4 h-4" />} color="#059669" bgColor="#ecfdf5" />
          <OrderStat label="Cancelled" count={countByStatus("cancelled")} icon={<XCircle className="w-4 h-4" />} color="#dc2626" bgColor="#fef2f2" />
          <OrderStat label="Returned" count={countByStatus("returned")} icon={<PackageX className="w-4 h-4" />} color="#f59e0b" bgColor="#fffbeb" />
        </div>
      </div>

      {/* KPI Cards — Row 3: Products + Store */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Products" value={String(products?.length ?? 0)} icon={<Package className="w-4 h-4" />} color="#0f172a" bgColor="#f1f5f9" link="/seller/products" />
        <KpiCard label="Out of Stock" value={String(outOfStock)} icon={<PackageX className="w-4 h-4" />} color="#dc2626" bgColor="#fef2f2" link="/seller/products" />
        <KpiCard label="Low Stock" value={String(lowStock)} icon={<AlertTriangle className="w-4 h-4" />} color="#d97706" bgColor="#fffbeb" link="/seller/products" />
        <KpiCard label="Store Rating" value={profile.rating > 0 ? `${profile.rating.toFixed(1)}⭐` : "N/A"} icon={<Star className="w-4 h-4" />} color="#f59e0b" bgColor="#fffbeb" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-bold text-[#0f172a] mb-3">Quick Actions</h3>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          <QuickAction to="/seller/products/new" icon={<Plus className="w-5 h-5" />} label="Add Product" color="#f57224" />
          <QuickAction to="/seller/orders" icon={<ShoppingBag className="w-5 h-5" />} label="Orders" color="#0ea5e9" />
          <QuickAction to="/seller/withdrawals" icon={<Banknote className="w-5 h-5" />} label="Withdraw" color="#059669" />
          <QuickAction to="/seller/coupons" icon={<Tag className="w-5 h-5" />} label="Coupons" color="#d97706" />
          <QuickAction to="/seller/analytics" icon={<BarChart3 className="w-5 h-5" />} label="Analytics" color="#6366f1" />
          <QuickAction to="/seller/products" icon={<Inventory className="w-5 h-5" />} label="Inventory" color="#0f172a" />
          <QuickAction to="/seller/settings" icon={<Settings className="w-5 h-5" />} label="Settings" color="#64748b" />
          <QuickAction to="/seller/notifications" icon={<Bell className="w-5 h-5" />} label="Support" color="#f59e0b" badge={unreadCount} />
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-[#0f172a]">Recent Orders</h3>
          <Link to="/seller/orders" className="text-xs font-medium text-[#f57224] hover:underline">
            View All
          </Link>
        </div>
        {orders && orders.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {orders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  {order.items[0]?.image ? (
                    <img src={order.items[0].image} alt="" className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <Package className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    #{order.id.slice(0, 8).toUpperCase()} · {order.buyerName}
                  </p>
                  <p className="text-xs text-slate-400">{order.items.length} item(s) · {formatPrice(order.earnings)}</p>
                </div>
                <OrderBadge status={order.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-400">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-200" />
            No orders yet
          </div>
        )}
      </div>

      {/* Low Stock Alerts */}
      {lowStock > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-amber-800">Low Stock Alert</h3>
          </div>
          <div className="space-y-1.5">
            {products?.filter(p => p.stock > 0 && p.stock <= 5).slice(0, 3).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="text-amber-700">{p.title}</span>
                <span className="font-bold text-amber-800">{p.stock} left</span>
              </div>
            ))}
          </div>
          <Link to="/seller/products" className="mt-2 inline-block text-xs font-medium text-amber-700 hover:underline">
            Manage Inventory →
          </Link>
        </div>
      )}
    </div>
  );
}

// ====================================================================
// KPI Card Component
// ====================================================================
function KpiCard({ label, value, icon, trend, color, bgColor, link }: {
  label: string; value: string; icon: React.ReactNode; trend?: number;
  color: string; bgColor: string; link?: string;
}) {
  const content = (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bgColor, color }}>
          {icon}
        </div>
        {trend != null && (
          <span className={`text-xs font-bold flex items-center gap-0.5 ${trend >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-[#0f172a] mt-0.5">{value}</p>
    </div>
  );
  return link ? <Link to={link}>{content}</Link> : content;
}

// ====================================================================
// Order Stat Component
// ====================================================================
function OrderStat({ label, count, icon, color, bgColor }: {
  label: string; count: number; icon: React.ReactNode; color: string; bgColor: string;
}) {
  return (
    <div className="text-center p-2.5 rounded-lg" style={{ background: bgColor }}>
      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mx-auto mb-1.5" style={{ color }}>
        {icon}
      </div>
      <p className="text-lg font-bold text-[#0f172a]">{count}</p>
      <p className="text-[10px] text-slate-500 font-medium">{label}</p>
    </div>
  );
}

// ====================================================================
// Quick Action Component
// ====================================================================
function QuickAction({ to, icon, label, color, badge }: {
  to: string; icon: React.ReactNode; label: string; color: string; badge?: number;
}) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center relative group-hover:scale-110 transition-transform" style={{ background: `${color}15`, color }}>
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
      <span className="text-[10px] font-medium text-slate-600 text-center">{label}</span>
    </Link>
  );
}

// ====================================================================
// Order Badge Component
// ====================================================================
function OrderBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; bgColor: string; label: string }> = {
    pending: { color: "#d97706", bgColor: "#fffbeb", label: "Pending" },
    confirmed: { color: "#0ea5e9", bgColor: "#f0f9ff", label: "Confirmed" },
    processing: { color: "#6366f1", bgColor: "#eef2ff", label: "Processing" },
    shipped: { color: "#6366f1", bgColor: "#eef2ff", label: "Shipped" },
    delivered: { color: "#059669", bgColor: "#ecfdf5", label: "Delivered" },
    cancelled: { color: "#dc2626", bgColor: "#fef2f2", label: "Cancelled" },
    returned: { color: "#f59e0b", bgColor: "#fffbeb", label: "Returned" },
  };
  const c = config[status] || { color: "#64748b", bgColor: "#f8fafc", label: status };
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: c.bgColor, color: c.color }}>
      {c.label}
    </span>
  );
}
