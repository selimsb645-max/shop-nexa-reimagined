import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertCircle,
  Upload,
  Bell,
  Settings,
  Wallet,
  TicketPercent,
  Sparkles,
  UserPlus,
  Heart,
  History,
  MapPin,
  MessageCircle,
  BookOpen,
  Phone,
  ChevronRight,
  Clock3,
  Loader,
  Box,
  Package,
  Truck,
  Bike,
  PackageCheck,
  Undo2,
  BadgeDollarSign,
  LogOut,
  ArrowLeft,
  Store,
  Eye,
  Gift,
  CreditCard,
  Headphones,
  Info,
  Star,
  Crown,
  ClipboardList,
  Gift as GiftCardIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { useWishlist } from "@/context/WishlistContext";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { setPhotoURL, resendVerification, signOut } from "@/services/firebase/auth";
import { uploadAvatar } from "@/services/firebase/storage";
import { mapFirebaseError } from "@/utils/errors";
import { Spinner } from "@/components/common/Spinner";
import { firebaseConfigured } from "@/services/firebase/config";
import { listOrders } from "@/services/firebase/orders";
import { getWalletBalance, getRewardPoints } from "@/services/firebase/wallet";
import { listAvailableCoupons } from "@/services/firebase/customerCoupons";
import { countUnreadNotifications } from "@/services/firebase/notifications";
import { countUnreadMessages } from "@/services/firebase/messages";
import { listAddresses } from "@/services/firebase/addresses";
import { formatPrice } from "@/utils/format";
import type { Order } from "@/types/commerce";
import { type OrderView } from "@/utils/orderStatus";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function isOutForDelivery(o: Order) {
  return o.tracking?.some((t) => /out for delivery/i.test(t.note ?? "")) ?? false;
}

function bucketOrders(orders: Order[]) {
  const out = orders.filter((o) => o.status === "shipped" && isOutForDelivery(o));
  const outIds = new Set(out.map((o) => o.id));
  return {
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    pending: 0, // Orders auto-confirm, so pending is always 0
    processing: orders.filter((o) => o.status === "processing").length,
    packed: orders.filter((o) => o.status === "confirmed").length,
    shipped: orders.filter((o) => o.status === "shipped" && !outIds.has(o.id)).length,
    outForDelivery: out.length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    returns: orders.filter((o) => o.status === "cancelled").length,
    refunds: orders.filter((o) => o.payment?.status === "refunded").length,
  };
}

function AccountPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const { count: wishlistCount } = useWishlist();
  const { ids: recentIds } = useRecentlyViewed();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [resending, setResending] = useState(false);

  const enabled = Boolean(user && firebaseConfigured);
  const uid = user?.uid;

  const live = { enabled, refetchInterval: 15_000, refetchOnWindowFocus: true } as const;

  const { data: orders } = useQuery({
    queryKey: ["orders", uid],
    queryFn: () => listOrders(uid!),
    ...live,
  });
  const { data: balance } = useQuery({
    queryKey: ["wallet", "balance", uid],
    queryFn: () => getWalletBalance(uid!),
    ...live,
  });
  const { data: points } = useQuery({
    queryKey: ["rewards", "points", uid],
    queryFn: () => getRewardPoints(uid!),
    ...live,
  });
  const { data: coupons } = useQuery({
    queryKey: ["coupons", "available"],
    queryFn: () => listAvailableCoupons(),
    ...live,
  });
  const { data: unreadNotifs } = useQuery({
    queryKey: ["notifications", "unread", uid],
    queryFn: () => countUnreadNotifications(uid!),
    ...live,
  });
  const { data: unreadMsgs } = useQuery({
    queryKey: ["messages", "unread", uid],
    queryFn: () => countUnreadMessages(uid!),
    ...live,
  });
  const { data: addresses } = useQuery({
    queryKey: ["addresses", uid],
    queryFn: () => listAddresses(uid!),
    ...live,
  });


  if (!user) return null;

  const counts = bucketOrders(orders ?? []);


  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(user.uid, file);
      await setPhotoURL(user, url);
      await refreshProfile();
      toast.success(t("editProfile.avatarUpdated"));
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onResend = async () => {
    setResending(true);
    try {
      await resendVerification(user);
      toast.success(t("account.verificationEmailSent"));
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setResending(false);
    }
  };

  const onSignOut = async () => {
    await signOut();
    toast.success(t("account.signedOut"));
    navigate({ to: "/" });
  };

  const avatar = profile?.photoURL || user.photoURL;
  const name = profile?.displayName || user.displayName || user.email || "Shopper";
  const initial = name.charAt(0).toUpperCase();
  const totalOrders = orders?.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-6">
      {/* ===== Daraz-style Orange Header ===== */}
      <header className="relative overflow-hidden bg-gradient-to-r from-orange-500 via-orange-500 to-orange-600 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"
        />

        <div className="relative mx-auto max-w-5xl px-4 pb-6 pt-4 sm:px-6">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white/90 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span className="truncate">{t("account.backHome")}</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to="/notifications"
                aria-label="Notifications"
                className="relative grid h-9 w-9 place-items-center rounded-full bg-white/15 transition hover:bg-white/25 active:scale-95"
              >
                <Bell className="h-5 w-5" strokeWidth={2} />
                {Boolean(unreadNotifs) && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadNotifs! > 9 ? "9+" : unreadNotifs}
                  </span>
                )}
              </Link>
              <Link
                to="/settings"
                aria-label="Settings"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition hover:bg-white/25 active:scale-95"
              >
                <Settings className="h-5 w-5" strokeWidth={2} />
              </Link>
            </div>
          </div>

          {/* User info row */}
          <div className="mt-5 flex items-center gap-4">
            <div className="relative shrink-0">
              {avatar ? (
                <img
                  src={avatar}
                  alt={name}
                  className="h-16 w-16 rounded-full border-2 border-white/50 object-cover shadow-lg sm:h-20 sm:w-20"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-white/50 bg-white/15 text-2xl font-bold shadow-lg sm:h-20 sm:w-20">
                  {initial}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Change avatar"
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-white text-orange-500 shadow-md transition hover:opacity-90 active:scale-95 disabled:opacity-60"
              >
                {uploading ? <Spinner /> : <Upload className="h-3.5 w-3.5" strokeWidth={2.5} />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold sm:text-xl">{name}</h1>
                {profile?.role === "seller" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                    <Store className="h-3 w-3" /> SELLER
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-white/80">{user.email}</p>
              <Link
                to="/edit-profile"
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-white/90 underline-offset-2 hover:underline"
              >
                <Settings className="h-3 w-3" /> Edit Profile
              </Link>
            </div>
          </div>

          {/* Wallet + Rewards + Vouchers strip */}
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-white/15 p-3 backdrop-blur">
            <Link to="/wallet" className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition hover:bg-white/10">
              <Wallet className="h-5 w-5" strokeWidth={2} />
              <span className="text-sm font-bold">{formatPrice(balance ?? 0)}</span>
              <span className="text-[10px] text-white/80">{t("account.wallet")}</span>
            </Link>
            <Link to="/rewards" className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition hover:bg-white/10">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
              <span className="text-sm font-bold">{points ?? 0}</span>
              <span className="text-[10px] text-white/80">{t("account.rewardPoints")}</span>
            </Link>
            <Link to="/coupons" className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition hover:bg-white/10">
              <TicketPercent className="h-5 w-5" strokeWidth={2} />
              <span className="text-sm font-bold">{coupons?.length ?? 0}</span>
              <span className="text-[10px] text-white/80">{t("account.vouchers")}</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-4 sm:px-6">
        {/* ===== My Orders ===== */}
        <DarazCard>
          <DarazCardHeader
            title={t("account.myOrders")}
            action={
              <Link to="/orders" className="inline-flex items-center gap-1 text-xs font-semibold text-orange-500 hover:underline">
                View All <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </Link>
            }
          />
          <div className="grid grid-cols-5 gap-1 px-2 py-3">
            <DarazOrderIcon status="packed" icon={<CheckCircle2 className="h-6 w-6" />} label={t("account.confirmed")} count={counts.packed} />
            <DarazOrderIcon status="processing" icon={<Loader className="h-6 w-6" />} label={t("account.processing")} count={counts.processing} />
            <DarazOrderIcon status="shipped" icon={<Truck className="h-6 w-6" />} label={t("account.shipped")} count={counts.shipped} />
            <DarazOrderIcon status="delivery" icon={<Bike className="h-6 w-6" />} label={t("account.delivery")} count={counts.outForDelivery} />
            <DarazOrderIcon status="delivered" icon={<PackageCheck className="h-6 w-6" />} label={t("account.delivered")} count={counts.delivered} />
          </div>
          <div className="grid grid-cols-5 gap-1 px-2 pb-3">
            <DarazOrderIcon status="returns" icon={<Undo2 className="h-6 w-6" />} label={t("account.returns")} count={counts.returns} />
            <DarazOrderIcon status="refunds" icon={<BadgeDollarSign className="h-6 w-6" />} label={t("account.refunds")} count={counts.refunds} />
            <DarazOrderIcon status="packed" icon={<Box className="h-6 w-6" />} label={t("account.packed")} count={counts.packed} />
          </div>
        </DarazCard>

        {/* ===== My Services ===== */}
        <DarazCard>
          <DarazCardHeader title={t("account.myServices")} />
          <div className="grid grid-cols-4 gap-1 px-2 py-3 sm:grid-cols-5">
            <DarazServiceIcon to="/wishlist" icon={<Heart className="h-6 w-6" />} label={t("account.wishlist")} badge={wishlistCount} />
            <DarazServiceIcon to="/coupons" icon={<TicketPercent className="h-6 w-6" />} label={t("account.vouchers")} badge={coupons?.length ?? 0} />
            <DarazServiceIcon to="/rewards" icon={<Gift className="h-6 w-6" />} label={t("account.rewards")} />
            <DarazServiceIcon to="/referral" icon={<UserPlus className="h-6 w-6" />} label={t("account.referEarn")} />
            <DarazServiceIcon to="/wallet" icon={<Wallet className="h-6 w-6" />} label={t("account.wallet")} />
            <DarazServiceIcon to="/messages" icon={<MessageCircle className="h-6 w-6" />} label={t("account.messages")} badge={unreadMsgs || 0} />
            <DarazServiceIcon to="/addresses" icon={<MapPin className="h-6 w-6" />} label={t("account.addresses")} badge={addresses?.length ?? 0} />
            <DarazServiceIcon to="/notifications" icon={<Bell className="h-6 w-6" />} label={t("account.notifs")} badge={unreadNotifs || 0} />
            <DarazServiceIcon to="/recently-viewed" icon={<History className="h-6 w-6" />} label={t("account.recentlyViewed")} badge={recentIds.length} />
            <DarazServiceIcon to="/seller/register" icon={<Store className="h-6 w-6" />} label={t("account.beSeller")} highlight />
          </div>
        </DarazCard>

        {/* ===== Become a Seller banner ===== */}
        {profile?.role !== "seller" && (
          <Link
            to="/seller/register"
            className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-4 transition hover:shadow-md active:scale-[0.99]"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-orange-500 text-white shadow-md">
              <Store className="h-6 w-6" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-gray-900">{t("account.becomeSeller")}</h3>
              <p className="truncate text-xs text-gray-500">{t("account.becomeSellerHint")}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-orange-500" strokeWidth={2.5} />
          </Link>
        )}

        {/* ===== Account Settings ===== */}
        <DarazCard>
          <DarazCardHeader title={t("account.accountSettings")} />
          <div className="divide-y divide-gray-100">
            <DarazListRow to="/settings" icon={<Settings className="h-5 w-5" />} label={t("account.accountPrefs")} hint={t("account.accountPrefsHint")} />
            <DarazListRow to="/addresses" icon={<MapPin className="h-5 w-5" />} label={t("account.addressBook")} hint={t("account.addressBookHint", { count: addresses?.length ?? 0, suffix: (addresses?.length ?? 0) === 1 ? "" : "es" })} />
            <DarazListRow to="/wallet" icon={<CreditCard className="h-5 w-5" />} label={t("account.paymentWallet")} hint={balance ? formatPrice(balance) : t("account.managePayment")} />
            <DarazListRow to="/coupons" icon={<TicketPercent className="h-5 w-5" />} label={t("account.myVouchers")} hint={coupons?.length ? t("account.available", { count: coupons.length }) : t("account.noVouchers")} />
            <DarazListRow to="/referral" icon={<UserPlus className="h-5 w-5" />} label={t("account.referEarn")} hint={t("account.referEarnHint")} />
            <DarazListRow to="/rewards" icon={<Sparkles className="h-5 w-5" />} label={t("account.rewardPoints")} hint={points ? `${points} ${t("account.points")}` : t("account.earnEveryOrder")} />
          </div>
        </DarazCard>

        {/* ===== My Shopping ===== */}
        <DarazCard>
          <DarazCardHeader title={t("account.myShopping")} />
          <div className="divide-y divide-gray-100">
            <DarazListRow to="/wishlist" icon={<Heart className="h-5 w-5" />} label={t("account.myWishlist")} hint={`${wishlistCount} ${t(wishlistCount === 1 ? "account.savedItem" : "account.savedItems")}`} badge={wishlistCount} />
            <DarazListRow to="/recently-viewed" icon={<Eye className="h-5 w-5" />} label={t("account.recentlyViewed")} hint={`${recentIds.length} ${t(recentIds.length === 1 ? "account.product" : "account.products")}`} />
            <DarazListRow to="/orders" icon={<Package className="h-5 w-5" />} label={t("account.orderHistory")} hint={t("account.orderHistoryHint", { count: totalOrders, suffix: totalOrders === 1 ? "" : "s" })} />
            <DarazListRow to="/track-orders" icon={<Truck className="h-5 w-5" />} label={t("account.trackOrders")} hint={t("account.trackOrdersHint")} />
            <DarazListRow to="/my-reviews" icon={<Star className="h-5 w-5" />} label={t("account.myReviews")} hint={t("account.myReviewsHint")} />
            <DarazListRow to="/returns" icon={<Undo2 className="h-5 w-5" />} label={t("account.returnsRefunds")} hint={t("account.returnsRefundsHint")} />
          </div>
        </DarazCard>

        {/* ===== Membership & Gift Cards ===== */}
        <DarazCard>
          <DarazCardHeader title={t("account.membershipGifts")} />
          <div className="divide-y divide-gray-100">
            <DarazListRow to="/membership" icon={<Crown className="h-5 w-5" />} label={t("account.nexaPrime")} hint={t("account.nexaPrimeHint")} />
            <DarazListRow to="/gift-cards" icon={<GiftCardIcon className="h-5 w-5" />} label={t("account.giftCards")} hint={t("account.giftCardsHint")} />
          </div>
        </DarazCard>

        {/* ===== Communication ===== */}
        <DarazCard>
          <DarazCardHeader title={t("account.communication")} />
          <div className="divide-y divide-gray-100">
            <DarazListRow to="/messages" icon={<MessageCircle className="h-5 w-5" />} label={t("account.messages")} hint={unreadMsgs ? t("account.unread", { count: unreadMsgs }) : t("account.allCaughtUp")} badge={unreadMsgs || 0} />
            <DarazListRow to="/notifications" icon={<Bell className="h-5 w-5" />} label={t("notifications.title")} hint={unreadNotifs ? t("account.unread", { count: unreadNotifs }) : t("account.allCaughtUp")} badge={unreadNotifs || 0} />
          </div>
        </DarazCard>

        {/* ===== Help & Support ===== */}
        <DarazCard>
          <DarazCardHeader title={t("account.helpSupport")} />
          <div className="divide-y divide-gray-100">
            <DarazListRow to="/support" icon={<Headphones className="h-5 w-5" />} label={t("account.customerService")} hint={t("account.customerServiceHint")} />
            <DarazListRow to="/support" icon={<BookOpen className="h-5 w-5" />} label={t("account.helpCenter")} hint={t("account.helpCenterHint")} />
            <DarazExternalRow href="https://wa.me/8801324997271" icon={<Phone className="h-5 w-5" />} label={t("account.contactUs")} hint={t("account.contactUsHint")} />
          </div>
        </DarazCard>

        {/* ===== About ===== */}
        <DarazCard>
          <DarazCardHeader title={t("account.about")} />
          <div className="divide-y divide-gray-100">
            <DarazListRow to="/support" icon={<Info className="h-5 w-5" />} label={t("settings.aboutShopNexa")} hint={t("settings.aboutHint")} />
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600">
                {user.emailVerified ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" strokeWidth={2} />
                ) : (
                  <AlertCircle className="h-5 w-5 text-orange-500" strokeWidth={2} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {user.emailVerified ? "Email Verified" : "Email Not Verified"}
                </div>
                {user.emailVerified ? (
                  <div className="truncate text-xs text-gray-500">{user.email}</div>
                ) : (
                  <button
                    type="button"
                    onClick={onResend}
                    disabled={resending}
                    className="text-xs font-medium text-orange-500 hover:underline disabled:opacity-60"
                  >
                    {resending ? "Sending..." : "Resend verification email"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </DarazCard>

        {/* ===== Sign Out ===== */}
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white px-4 py-3.5 text-sm font-semibold text-red-500 shadow-sm transition hover:bg-red-50 active:scale-[0.99]"
        >
          <LogOut className="h-5 w-5" strokeWidth={2} /> Sign Out
        </button>

        {/* ===== Footer ===== */}
        <div className="pt-2 text-center">
          <p className="text-xs text-gray-400">{t("misc.tagline")}</p>
        </div>
      </div>
    </div>
  );
}

/* ===== Daraz-style Components ===== */

function DarazCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {children}
    </section>
  );
}

function DarazCardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-4 py-2.5">
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      {action}
    </div>
  );
}

function DarazOrderIcon({
  status,
  icon,
  label,
  count,
}: {
  status: OrderView;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <Link
      to="/orders/$status"
      params={{ status }}
      className="group flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 transition hover:bg-orange-50 active:scale-95"
    >
      <span className="relative text-gray-500 transition group-hover:text-orange-500">
        {icon}
        {count > 0 && (
          <span className="absolute -right-3 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium leading-tight text-gray-600">{label}</span>
    </Link>
  );
}

function DarazServiceIcon({
  to,
  icon,
  label,
  badge = 0,
  highlight = false,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center gap-2 rounded-xl px-1.5 py-3 transition hover:bg-orange-50 active:scale-95"
    >
      <span
        className={`relative grid h-12 w-12 place-items-center rounded-2xl transition ${
          highlight
            ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md"
            : "bg-orange-50 text-orange-500 group-hover:bg-orange-100"
        }`}
      >
        {icon}
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="text-center text-[11px] font-medium leading-tight text-gray-600">{label}</span>
    </Link>
  );
}

function DarazListRow({
  to,
  icon,
  label,
  hint,
  badge = 0,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 p-4 transition hover:bg-gray-50 active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-500 transition group-hover:bg-orange-100">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-800">{label}</span>
          {badge > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </div>
        <span className="block truncate text-xs text-gray-500">{hint}</span>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" strokeWidth={2.5} />
    </Link>
  );
}

function DarazExternalRow({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 p-4 transition hover:bg-gray-50 active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-500 transition group-hover:bg-orange-100">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-gray-800">{label}</span>
        <span className="block truncate text-xs text-gray-500">{hint}</span>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" strokeWidth={2.5} />
    </a>
  );
}
