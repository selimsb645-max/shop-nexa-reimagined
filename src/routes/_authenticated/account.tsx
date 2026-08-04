import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
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
  LifeBuoy,
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
  ShieldCheck,
  LogOut,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWishlist } from "@/context/WishlistContext";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { profileSchema, type ProfileValues } from "@/utils/validation";
import { setDisplayName, setPhotoURL, resendVerification, signOut } from "@/services/firebase/auth";
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
    pending: orders.filter((o) => o.status === "pending").length,
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
  const { count: wishlistCount } = useWishlist();
  const { ids: recentIds } = useRecentlyViewed();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [resending, setResending] = useState(false);
  const [editing, setEditing] = useState(false);

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


  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { displayName: profile?.displayName || user?.displayName || "" },
  });

  if (!user) return null;

  const counts = bucketOrders(orders ?? []);

  const onSave = async (v: ProfileValues) => {
    try {
      await setDisplayName(user, v.displayName);
      await refreshProfile();
      reset({ displayName: v.displayName });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(user.uid, file);
      await setPhotoURL(user, url);
      await refreshProfile();
      toast.success("Avatar updated");
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
      toast.success("Verification email sent");
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setResending(false);
    }
  };

  const onSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  const avatar = profile?.photoURL || user.photoURL;
  const name = profile?.displayName || user.displayName || user.email || "Shopper";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-muted/30 pb-10">
      {/* Premium gradient profile header */}
      <header className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-accent text-primary-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary-foreground/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-primary-foreground/10 blur-2xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-5 sm:px-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <Link
              to="/"
              className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-primary-foreground/85 transition hover:text-primary-foreground"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span className="truncate">Continue shopping</span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/notifications"
                aria-label="Notifications"
                className="relative grid h-10 w-10 place-items-center rounded-full bg-primary-foreground/15 backdrop-blur transition hover:bg-primary-foreground/25 active:scale-95"
              >
                <Bell className="h-5 w-5" strokeWidth={2} />
                {Boolean(unreadNotifs) && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                    {unreadNotifs! > 9 ? "9+" : unreadNotifs}
                  </span>
                )}
              </Link>
              <Link
                to="/settings"
                aria-label="Settings"
                className="grid h-10 w-10 place-items-center rounded-full bg-primary-foreground/15 backdrop-blur transition hover:bg-primary-foreground/25 active:scale-95"
              >
                <Settings className="h-5 w-5" strokeWidth={2} />
              </Link>
            </div>
          </div>

          <div className="mt-6 flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              {avatar ? (
                <img
                  src={avatar}
                  alt={name}
                  className="h-20 w-20 rounded-2xl border-2 border-primary-foreground/40 object-cover shadow-lg sm:h-24 sm:w-24"
                />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-2xl border-2 border-primary-foreground/40 bg-primary-foreground/15 text-3xl font-bold shadow-lg sm:h-24 sm:w-24">
                  {initial}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Change avatar"
                className="absolute -bottom-1.5 -right-1.5 grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground shadow-md transition hover:opacity-90 active:scale-95 disabled:opacity-60"
              >
                {uploading ? <Spinner /> : <Upload className="h-4 w-4" strokeWidth={2} />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold sm:text-2xl">{name}</h1>
              <p className="truncate text-sm text-primary-foreground/80">{user.email}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                Shop Nexa Member
              </span>
            </div>
          </div>

          {/* Member strip — real reward points & wallet cashback */}
          <Link
            to="/rewards"
            className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-primary-foreground/12 p-4 backdrop-blur transition hover:bg-primary-foreground/20 active:scale-[0.99]"
          >
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="hidden min-w-0 items-center gap-2 sm:flex">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-foreground/15">
                  <ShieldCheck className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">Member benefits</span>
                  <span className="block truncate text-[11px] text-primary-foreground/75">
                    Earn on every order
                  </span>
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-foreground/15">
                  <Sparkles className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{points ?? 0}</span>
                  <span className="block truncate text-[11px] text-primary-foreground/75">
                    {points ? "Points" : "No Rewards"}
                  </span>
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-foreground/15">
                  <Wallet className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">
                    {formatPrice(balance ?? 0)}
                  </span>
                  <span className="block truncate text-[11px] text-primary-foreground/75">
                    {balance ? "Cashback" : "No Cashback"}
                  </span>
                </span>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-primary-foreground/80" strokeWidth={2} />
          </Link>
        </div>
      </header>

      <div className="mx-auto -mt-14 max-w-5xl space-y-6 px-4 sm:px-6">
        {/* Account summary — live Firestore values */}
        <section className="grid grid-cols-4 divide-x rounded-2xl border bg-background p-4 shadow-sm">
          <StatTile
            to="/wallet"
            icon={<Wallet className="h-5 w-5" strokeWidth={2} />}
            label="Wallet"
            value={formatPrice(balance ?? 0)}
          />
          <StatTile
            to="/wishlist"
            icon={<Heart className="h-5 w-5" strokeWidth={2} />}
            label="Wishlist"
            value={String(wishlistCount)}
          />
          <StatTile
            to="/coupons"
            icon={<TicketPercent className="h-5 w-5" strokeWidth={2} />}
            label="Coupons"
            value={String(coupons?.length ?? 0)}
          />
          <StatTile
            to="/orders"
            icon={<Package className="h-5 w-5" strokeWidth={2} />}
            label="Orders"
            value={String(orders?.length ?? 0)}
          />
        </section>

        {/* Quick services */}
        <Section title="Quick services">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ServiceCard
              to="/wallet"
              icon={<Wallet className="h-6 w-6" strokeWidth={2} />}
              label="Wallet"
              hint={balance ? formatPrice(balance) : "No Wallet Balance"}
            />
            <ServiceCard
              to="/coupons"
              icon={<TicketPercent className="h-6 w-6" strokeWidth={2} />}
              label="Coupons"
              hint={coupons?.length ? `${coupons.length} available` : "No Coupons"}
            />
            <ServiceCard
              to="/rewards"
              icon={<Sparkles className="h-6 w-6" strokeWidth={2} />}
              label="Rewards"
              hint={points ? `${points} points` : "No Rewards"}
            />
            <ServiceCard
              to="/referral"
              icon={<UserPlus className="h-6 w-6" strokeWidth={2} />}
              label="Refer & Earn"
              hint="Invite friends"
            />
            <ServiceCard
              to="/messages"
              icon={<MessageCircle className="h-6 w-6" strokeWidth={2} />}
              label="Messages"
              hint={unreadMsgs ? `${unreadMsgs} unread` : "See all"}
              badge={unreadMsgs || 0}
            />
            <ServiceCard
              to="/addresses"
              icon={<MapPin className="h-6 w-6" strokeWidth={2} />}
              label="Addresses"
              hint={addresses?.length ? `${addresses.length} saved` : "No addresses"}
            />
            <ServiceCard
              to="/support"
              icon={<LifeBuoy className="h-6 w-6" strokeWidth={2} />}
              label="Support"
              hint="Get help"
            />
            <ServiceCard
              to="/settings"
              icon={<Settings className="h-6 w-6" strokeWidth={2} />}
              label="Settings"
              hint="Manage account"
            />
          </div>
        </Section>

        {/* My orders */}
        <Section
          title="My orders"
          action={
            <Link to="/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              View all orders <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          }
        >
          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-2 rounded-2xl border bg-background p-3 shadow-sm sm:min-w-0 sm:justify-between">
              <OrderTile icon={<Clock3 className="h-6 w-6" strokeWidth={2} />} label="Pending" count={counts.pending} />
              <OrderTile icon={<Loader className="h-6 w-6" strokeWidth={2} />} label="Processing" count={counts.processing} />
              <OrderTile icon={<Box className="h-6 w-6" strokeWidth={2} />} label="Packed" count={counts.packed} />
              <OrderTile icon={<Truck className="h-6 w-6" strokeWidth={2} />} label="Shipped" count={counts.shipped} />
              <OrderTile icon={<Bike className="h-6 w-6" strokeWidth={2} />} label="Out for Delivery" count={counts.outForDelivery} />
              <OrderTile icon={<PackageCheck className="h-6 w-6" strokeWidth={2} />} label="Delivered" count={counts.delivered} />
              <OrderTile icon={<Undo2 className="h-6 w-6" strokeWidth={2} />} label="Returns" count={counts.returns} />
              <OrderTile icon={<BadgeDollarSign className="h-6 w-6" strokeWidth={2} />} label="Refunds" count={counts.refunds} />
            </div>
          </div>
        </Section>


        {/* Shopping */}
        <Section title="Shopping">
          <div className="grid gap-3 sm:grid-cols-3">
            <RowCard
              to="/wishlist"
              icon={<Heart className="h-5 w-5" strokeWidth={2} />}
              label="Wishlist"
              hint={`${wishlistCount} saved item${wishlistCount === 1 ? "" : "s"}`}
            />
            <RowCard
              to="/"
              icon={<History className="h-5 w-5" strokeWidth={2} />}
              label="Recently viewed"
              hint={`${recentIds.length} product${recentIds.length === 1 ? "" : "s"}`}
            />
            <RowCard
              to="/addresses"
              icon={<MapPin className="h-5 w-5" strokeWidth={2} />}
              label="Saved addresses"
              hint={`${addresses?.length ?? 0} address${(addresses?.length ?? 0) === 1 ? "" : "es"}`}
            />
          </div>
        </Section>

        {/* Communication */}
        <Section title="Communication">
          <div className="grid gap-3 sm:grid-cols-2">
            <RowCard
              to="/messages"
              icon={<MessageCircle className="h-5 w-5" strokeWidth={2} />}
              label="Messages"
              hint={unreadMsgs ? `${unreadMsgs} unread` : "All caught up"}
              badge={unreadMsgs || 0}
            />
            <RowCard
              to="/notifications"
              icon={<Bell className="h-5 w-5" strokeWidth={2} />}
              label="Notifications"
              hint={unreadNotifs ? `${unreadNotifs} unread` : "All caught up"}
              badge={unreadNotifs || 0}
            />
          </div>
        </Section>

        {/* Support */}
        <Section title="Support">
          <div className="grid gap-3 sm:grid-cols-3">
            <RowCard
              to="/support"
              icon={<LifeBuoy className="h-5 w-5" strokeWidth={2} />}
              label="Customer support"
              hint="Open a ticket"
            />
            <RowCard
              to="/support"
              icon={<BookOpen className="h-5 w-5" strokeWidth={2} />}
              label="Help center"
              hint="FAQs & guides"
            />
            <ExternalRowCard
              href="https://wa.me/8801324997271"
              icon={<Phone className="h-5 w-5" strokeWidth={2} />}
              label="Contact us"
              hint="WhatsApp 01324997271"
            />
          </div>
        </Section>

        {/* Settings & account */}
        <Section
          title="Settings"
          action={
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-sm font-semibold text-primary hover:underline"
            >
              {editing ? "Close" : "Edit profile"}
            </button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <RowCard
              to="/settings"
              icon={<Settings className="h-5 w-5" strokeWidth={2} />}
              label="Preferences"
              hint="Notifications, currency & language"
            />
            <div className="flex items-center gap-3 rounded-2xl border bg-background p-4 shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                {user.emailVerified ? (
                  <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
                ) : (
                  <AlertCircle className="h-5 w-5" strokeWidth={2} />
                )}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {user.emailVerified ? "Email verified" : "Email not verified"}
                </div>
                {user.emailVerified ? (
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                ) : (
                  <button
                    type="button"
                    onClick={onResend}
                    disabled={resending}
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
                  >
                    {resending ? "Sending..." : "Resend verification email"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {editing && (
            <form
              onSubmit={handleSubmit(onSave)}
              className="mt-3 animate-fade-in space-y-4 rounded-2xl border bg-background p-5 shadow-sm"
            >
              <div>
                <label className="mb-1 block text-sm font-medium">Display name</label>
                <input
                  {...register("displayName")}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
                {errors.displayName && (
                  <p className="mt-1 text-xs text-destructive">{errors.displayName.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <input
                  value={user.email ?? ""}
                  readOnly
                  className="w-full rounded-xl border bg-muted px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Account type</label>
                <input
                  value={profile?.role ?? "customer"}
                  readOnly
                  className="w-full rounded-xl border bg-muted px-3 py-2.5 text-sm capitalize text-muted-foreground"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !isDirty}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
              >
                {isSubmitting && <Spinner />} Save changes
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={onSignOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border bg-background px-4 py-3 text-sm font-semibold text-destructive shadow-sm transition hover:bg-destructive/5 active:scale-[0.99]"
          >
            <LogOut className="h-5 w-5" strokeWidth={2} /> Sign out
          </button>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-fade-in">
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="truncate text-base font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatTile({
  to,
  icon,
  label,
  value,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1 rounded-xl px-2 py-1 text-center transition hover:bg-muted/60 active:scale-[0.98]"
    >
      <span className="text-primary">{icon}</span>
      <span className="truncate text-sm font-bold">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </Link>
  );
}

function ServiceCard({
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
      className="group flex flex-col items-start gap-3 rounded-2xl border bg-background p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
    >
      <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
        {icon}
        {badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </Link>
  );
}


function OrderTile({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <Link
      to="/orders"
      className="group flex w-[84px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center transition hover:bg-muted/60 active:scale-[0.97] sm:w-auto sm:flex-1"
    >
      <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
        {icon}
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</span>
      <span className="text-sm font-bold leading-none">{count}</span>
    </Link>
  );

}

function RowCard({
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
      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-background p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{label}</span>
          {badge > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
    </Link>
  );
}

function ExternalRowCard({
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
      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-background p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
    </a>
  );
}
