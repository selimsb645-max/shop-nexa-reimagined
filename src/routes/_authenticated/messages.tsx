import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  Send,
  ArrowLeft,
  Package,
  Headphones,
  Bot,
  Bell,
  Megaphone,
  MessageCircle,
  Truck,
  Wallet,
  Gift,
  Tag,
  Zap,
  Star,
  CheckCircle2,
  Clock,
  Plus,
  Paperclip,
  Smile,
  Mic,
  CheckCheck,
  Store,
  Sparkles,
  FileText,
  AlertCircle,
  XCircle,
  Loader,
  Pin,
  ChevronRight,
  Heart,
} from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { firebaseConfigured } from "@/services/firebase/config";
import { subscribeActiveAnnouncements } from "@/services/firebase/adminAnnouncements";
import type { Announcement } from "@/types/admin";
import { Spinner } from "@/components/common/Spinner";
import { onSnapshot, collection, query, where, orderBy, limit } from "firebase/firestore";
import { getDb } from "@/services/firebase/config";
import {
  listThreads,
  listMessages,
  createThread,
  sendMessage,
  markThreadRead,
  dedupeThreads,
} from "@/services/firebase/messages";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  countUnreadNotifications,
} from "@/services/firebase/notifications";
import {
  listTickets,
  createTicket,
  replyToTicket,
} from "@/services/firebase/support";
import { listOrders } from "@/services/firebase/orders";
import { seedInbox } from "@/services/firebase/seedInbox";
import { formatPrice, formatDate } from "@/utils/format";
import type { MessageThread, ChatMessage, SellerConversation, ConversationMessage } from "@/types/customer";
import { getProductById } from "@/services/firebase/products";
import {
  createSellerConversation,
  subscribeConversationMessages,
  customerSendMessage,
  subscribeCustomerConversations,
  findConversationByThreadId,
} from "@/services/firebase/sellerConversations";
import { sendAIMessage } from "@/services/firebase/aiAssistant";

type TicketMessage = { id: string; body: string; from: "support" | "customer"; createdAt: number };
import type { CustomerNotification, NotificationType } from "@/types/customer";
import type { SupportTicket, TicketStatus } from "@/types/customer";
import type { Order } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/messages")({
  ssr: false,
  component: CommunicationCenter,
  head: () => ({
    meta: [
      { title: "Communication Center — ShopNexa" },
      { name: "description", content: "Your communication hub for orders, chats, support, and notifications." },
    ],
  }),
});

type Tab = "inbox" | "orders" | "sellers" | "support" | "ai" | "notifications" | "announcements";
type FilterType = "all" | "unread" | "orders" | "support" | "sellers" | "archived";

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

function CommunicationCenter() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, _setActiveFilter] = useState<FilterType>("all");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  // Data queries
  const threadsQuery = useQuery({
    queryKey: ["threads", user?.uid],
    queryFn: () => listThreads(user!.uid),
    enabled: !!user && firebaseConfigured,
    refetchInterval: 30_000,
  });

  const notificationsQuery = useQuery({
    queryKey: ["notifications", user?.uid],
    queryFn: () => listNotifications(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  const unreadNotifQuery = useQuery({
    queryKey: ["notifications", "unread", user?.uid],
    queryFn: () => countUnreadNotifications(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  const ticketsQuery = useQuery({
    queryKey: ["tickets", user?.uid],
    queryFn: () => listTickets(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  const ordersQuery = useQuery({
    queryKey: ["orders", user?.uid],
    queryFn: () => listOrders(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  // Realtime threads subscription (replaces 30s polling for live updates)
  const [realtimeThreads, setRealtimeThreads] = useState<MessageThread[]>([]);
  useEffect(() => {
    if (!user?.uid || !firebaseConfigured) return;
    const unsub = onSnapshot(
      query(collection(getDb(), "users", user.uid, "threads"), orderBy("lastAt", "desc"), limit(50)),
      (snap) => {
        const mapped = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            subject: String(data.subject ?? "Conversation"),
            participant: String(data.participant ?? "Shop Nexa Support"),
            sellerId: (data.sellerId as string | null) ?? null,
            lastMessage: String(data.lastMessage ?? ""),
            lastAt: typeof data.lastAt === "number"
              ? data.lastAt
              : (data.lastAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
            unread: Number(data.unread ?? 0),
            createdAt: typeof data.createdAt === "number"
              ? data.createdAt
              : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
          } as MessageThread;
        });
        setRealtimeThreads(dedupeThreads(mapped));
      },
      () => undefined,
    );
    return () => unsub();
  }, [user?.uid]);

  // Realtime notifications subscription
  const [realtimeNotifs, setRealtimeNotifs] = useState<CustomerNotification[]>([]);
  useEffect(() => {
    if (!user?.uid || !firebaseConfigured) return;
    const unsub = onSnapshot(
      query(collection(getDb(), "users", user.uid, "notifications"), orderBy("createdAt", "desc"), limit(60)),
      (snap) => {
        const mapped = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            type: (data.type as NotificationType) ?? "system",
            title: String(data.title ?? ""),
            message: String(data.message ?? ""),
            link: (data.link as string | null) ?? null,
            read: Boolean(data.read),
            createdAt: typeof data.createdAt === "number"
              ? data.createdAt
              : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
          } as CustomerNotification;
        });
        setRealtimeNotifs(mapped);
      },
      () => undefined,
    );
    return () => unsub();
  }, [user?.uid]);

  // Realtime tickets subscription
  const [realtimeTickets, setRealtimeTickets] = useState<SupportTicket[]>([]);
  useEffect(() => {
    if (!user?.uid || !firebaseConfigured) return;
    const unsub = onSnapshot(
      query(collection(getDb(), "users", user.uid, "tickets"), orderBy("createdAt", "desc"), limit(100)),
      (snap) => {
        const mapped = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            subject: String(data.subject ?? ""),
            category: (data.category as SupportTicket["category"]) ?? "other",
            orderId: (data.orderId as string | null) ?? null,
            status: (data.status as TicketStatus) ?? "open",
            lastMessage: String(data.lastMessage ?? ""),
            createdAt: typeof data.createdAt === "number"
              ? data.createdAt
              : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
            updatedAt: typeof data.updatedAt === "number"
              ? data.updatedAt
              : (data.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
          } as SupportTicket;
        });
        setRealtimeTickets(mapped);
      },
      () => undefined,
    );
    return () => unsub();
  }, [user?.uid]);

  // Seed inbox with demo data for new users
  useEffect(() => {
    if (user?.uid && firebaseConfigured) {
      seedInbox(user.uid).catch(() => undefined);
    }
  }, [user?.uid]);

  // Derived data — must be computed BEFORE any early returns so that
  // hooks (useMemo) are always called in the same order on every render.
  // Placing a hook after a conditional return violates the Rules of Hooks
  // and causes React to crash with "This page didn't load".
  // dedupeThreads collapses any conceptual duplicate conversations (e.g.
  // two "Shop Nexa Support" welcome threads) so the list, the recent
  // conversations preview, and the unread badge all agree on one entry.
  const threads = dedupeThreads(realtimeThreads.length > 0 ? realtimeThreads : (threadsQuery.data ?? []));
  const notifications = realtimeNotifs.length > 0 ? realtimeNotifs : (notificationsQuery.data ?? []);
  const tickets = realtimeTickets.length > 0 ? realtimeTickets : (ticketsQuery.data ?? []);
  const orders = ordersQuery.data ?? [];
  // Derived from the already-deduped threads list — avoids double-counting
  // duplicate threads the way the separate countUnreadMessages() query could.
  const unreadMsg = threads.reduce((sum, t) => sum + t.unread, 0);

  // Filter threads — useMemo MUST be called unconditionally (before early returns)
  const filteredThreads = useMemo(() => {
    let result = threads;
    if (activeFilter === "unread") result = result.filter((t) => t.unread > 0);
    if (activeFilter === "orders") result = result.filter((t) => t.subject.toLowerCase().includes("order"));
    if (activeFilter === "support") result = result.filter((t) => t.participant.includes("Support"));
    if (activeFilter === "sellers") result = result.filter((t) => t.sellerId !== null);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.participant.toLowerCase().includes(q) ||
          t.lastMessage.toLowerCase().includes(q),
      );
    }
    return result;
  }, [threads, activeFilter, searchQuery]);

  // If a thread is active, show the chat view
  if (activeThreadId) {
    return (
      <ChatView
        threadId={activeThreadId}
        onBack={() => setActiveThreadId(null)}
        userId={user!.uid}
      />
    );
  }

  // If a ticket is active, show ticket chat
  if (activeTicketId) {
    return (
      <TicketChatView
        ticketId={activeTicketId}
        onBack={() => setActiveTicketId(null)}
        userId={user!.uid}
      />
    );
  }

  // If an order is active, show order conversation
  if (activeOrderId) {
    const order = ordersQuery.data?.find((o) => o.id === activeOrderId);
    if (order) {
      return (
        <OrderConversationView
          order={order}
          onBack={() => setActiveOrderId(null)}
          onChatWithSeller={(threadId) => {
            setActiveOrderId(null);
            setActiveThreadId(threadId);
          }}
        />
      );
    }
  }

  return (
    <ServicePageLayout title={t("messages.titleMessages")} subtitle="Your hub for orders, chats, support & notifications">
        {/* Search bar */}

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats, orders, sellers, tickets..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#f57224]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Tab navigation */}
        <TabBar activeTab={activeTab} onChange={setActiveTab} unreadNotif={unreadNotifQuery.data ?? 0} unreadMsg={unreadMsg} ticketCount={tickets.length} />

        {/* Content area */}
        <div className="mt-4">
          {activeTab === "inbox" && (
            <InboxDashboard
              threads={threads}
              notifications={notifications}
              tickets={tickets}
              orders={orders}
              unreadMsg={unreadMsg}
              unreadNotif={unreadNotifQuery.data ?? 0}
              onTabChange={setActiveTab}
              onThreadClick={setActiveThreadId}
            />
          )}

          {activeTab === "orders" && (
            <OrderConversations
              orders={orders}
              searchQuery={searchQuery}
              onOrderClick={(id) => setActiveOrderId(id)}
            />
          )}

          {activeTab === "sellers" && (
            <SellerChats
              threads={filteredThreads.filter((t) => t.sellerId !== null)}
              searchQuery={searchQuery}
              onThreadClick={setActiveThreadId}
            />
          )}

          {activeTab === "support" && (
            <SupportCenter
              tickets={tickets}
              searchQuery={searchQuery}
              onTicketClick={setActiveTicketId}
              userId={user!.uid}
            />
          )}

          {activeTab === "ai" && <AIAssistant />}

          {activeTab === "notifications" && (
            <NotificationCenter
              notifications={notifications}
              searchQuery={searchQuery}
              onMarkRead={(id) => markNotificationRead(user!.uid, id)}
              onMarkAllRead={() => markAllNotificationsRead(user!.uid)}
              userId={user!.uid}
            />
          )}

          {activeTab === "announcements" && <AnnouncementCenter />}
        </div>
    </ServicePageLayout>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB BAR
// ═══════════════════════════════════════════════════════════════

function TabBar({
  activeTab,
  onChange,
  unreadNotif,
  unreadMsg,
  ticketCount,
}: {
  activeTab: Tab;
  onChange: (t: Tab) => void;
  unreadNotif: number;
  unreadMsg: number;
  ticketCount: number;
}) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "inbox", label: "Inbox", icon: <MessageCircle className="h-4 w-4" />, badge: unreadMsg },
    { id: "orders", label: "Orders", icon: <Package className="h-4 w-4" /> },
    { id: "sellers", label: "Sellers", icon: <Store className="h-4 w-4" /> },
    { id: "support", label: "Support", icon: <Headphones className="h-4 w-4" />, badge: ticketCount },
    { id: "ai", label: "AI", icon: <Bot className="h-4 w-4" /> },
    { id: "notifications", label: "Alerts", icon: <Bell className="h-4 w-4" />, badge: unreadNotif },
    { id: "announcements", label: "News", icon: <Megaphone className="h-4 w-4" /> },
  ];

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[#f57224] text-white shadow-md"
                  : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {tab.icon}
              <span className="whitespace-nowrap">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  isActive ? "bg-white/25 text-white" : "bg-accent text-accent-foreground"
                }`}>
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INBOX DASHBOARD
// ═══════════════════════════════════════════════════════════════

function InboxDashboard({
  threads,
  notifications,
  tickets,
  orders,
  unreadMsg,
  unreadNotif,
  onTabChange,
  onThreadClick,
}: {
  threads: MessageThread[];
  notifications: CustomerNotification[];
  tickets: SupportTicket[];
  orders: Order[];
  unreadMsg: number;
  unreadNotif: number;
  onTabChange: (t: Tab) => void;
  onThreadClick: (id: string) => void;
}) {
  const { t } = useI18n();
  const sellerThreads = threads.filter((t) => t.sellerId !== null);
  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "pending");
  const recentNotifs = notifications.slice(0, 5);
  const activeOrders = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");

  const cards = [
    {
      tab: "orders" as Tab,
      icon: <Package className="h-5 w-5" />,
      title: "Order Updates",
      count: activeOrders.length,
      preview: activeOrders[0] ? `Order #${activeOrders[0].id.slice(0, 8)} — ${activeOrders[0].status}` : "No active orders",
      time: activeOrders[0] ? formatRelativeTime(activeOrders[0].updatedAt) : "",
      color: "bg-blue-50 text-blue-600",
      priority: activeOrders.length > 0 ? "high" : "normal",
    },
    {
      tab: "sellers" as Tab,
      icon: <Store className="h-5 w-5" />,
      title: "Seller Chats",
      count: sellerThreads.length,
      unread: threads.filter((t) => t.sellerId && t.unread > 0).reduce((s, t) => s + t.unread, 0),
      preview: sellerThreads[0]?.lastMessage || "No seller conversations",
      time: sellerThreads[0] ? formatRelativeTime(sellerThreads[0].lastAt) : "",
      color: "bg-purple-50 text-purple-600",
      priority: "normal",
    },
    {
      tab: "support" as Tab,
      icon: <Headphones className="h-5 w-5" />,
      title: "Customer Support",
      count: openTickets.length,
      preview: openTickets[0]?.subject || "No open tickets",
      time: openTickets[0] ? formatRelativeTime(openTickets[0].updatedAt) : "",
      color: "bg-orange-50 text-orange-600",
      priority: openTickets.length > 0 ? "high" : "normal",
    },
    {
      tab: "ai" as Tab,
      icon: <Bot className="h-5 w-5" />,
      title: "AI Assistant",
      count: 0,
      preview: "Get instant help with shopping, tracking & more",
      time: "Always available",
      color: "bg-indigo-50 text-indigo-600",
      priority: "normal",
    },
    {
      tab: "notifications" as Tab,
      icon: <Bell className="h-5 w-5" />,
      title: "Notifications",
      count: unreadNotif,
      preview: recentNotifs[0]?.title || "You're all caught up!",
      time: recentNotifs[0] ? formatRelativeTime(recentNotifs[0].createdAt) : "",
      color: "bg-green-50 text-green-600",
      priority: unreadNotif > 0 ? "high" : "normal",
    },
    {
      tab: "announcements" as Tab,
      icon: <Megaphone className="h-5 w-5" />,
      title: "Announcements",
      count: 0,
      preview: "Latest deals & marketplace updates",
      time: "",
      color: "bg-pink-50 text-pink-600",
      priority: "normal",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-primary/80 p-5 text-primary-foreground shadow-lg">
        <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/5" />
        <div className="relative z-10">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5" /> Welcome to your Inbox
          </h2>
          <p className="mt-1 text-sm opacity-90">
            {unreadMsg + unreadNotif > 0
              ? `You have ${unreadMsg + unreadNotif} unread items`
              : "You're all caught up! ✨"}
          </p>
        </div>
      </div>

      {/* Dashboard cards grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.title}
            onClick={() => onTabChange(card.tab)}
            className="group relative overflow-hidden rounded-2xl border bg-background p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]"
          >
            {/* Priority indicator */}
            {card.priority === "high" && (
              <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500" />
            )}

            <div className="flex items-start gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${card.color}`}>
                {card.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{card.title}</h3>
                  {card.count > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                      {card.count}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{card.preview}</p>
                {card.time && (
                  <p className="mt-1 text-[10px] text-muted-foreground/60">{card.time}</p>
                )}
              </div>
            </div>
            <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-1" />
          </button>
        ))}
      </div>

      {/* Recent threads */}
      {threads.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t("messages.recentConversations")}</h3>
          <div className="space-y-2">
            {threads.slice(0, 5).map((thread) => (
              <button
                key={thread.id}
                onClick={() => onThreadClick(thread.id)}
                className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left shadow-sm transition hover:shadow-md active:scale-[0.98]"
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                  thread.sellerId ? "bg-purple-100 text-purple-600" : "bg-primary/10 text-primary"
                }`}>
                  {thread.sellerId ? <Store className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{thread.participant}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelativeTime(thread.lastAt)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{thread.lastMessage}</p>
                </div>
                {thread.unread > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                    {thread.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ORDER CONVERSATIONS
// ═══════════════════════════════════════════════════════════════

function OrderConversations({
  orders,
  searchQuery,
  onOrderClick,
}: {
  orders: Order[];
  searchQuery: string;
  onOrderClick: (id: string) => void;
}) {
  const { t } = useI18n();
  const filtered = useMemo(() => {
    if (!searchQuery) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.items.some((i) => i.title.toLowerCase().includes(q)),
    );
  }, [orders, searchQuery]);

  if (orders.length === 0) {
    return <EmptyState icon={<Package className="h-12 w-12" />} title={t("messages.titleNoOrders")} subtitle={t("messages.titleOrderConvos")} />;
  }

  return (
    <div className="space-y-2">
      {filtered.map((order) => (
        <button
          key={order.id}
          onClick={() => onOrderClick(order.id)}
          className="group flex w-full items-center gap-3 rounded-2xl border bg-background p-4 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
        >
          {/* Product thumbnails */}
          <div className="flex -space-x-3">
            {order.items.slice(0, 3).map((item, i) => (
              <img
                key={i}
                src={item.image}
                alt={item.title}
                className="h-12 w-12 rounded-xl border-2 border-background object-cover shadow-sm"
              />
            ))}
            {order.items.length > 3 && (
              <span className="grid h-12 w-12 place-items-center rounded-xl border-2 border-background bg-muted text-xs font-bold">
                +{order.items.length - 3}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Order #{order.id.slice(0, 8)}</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {order.items.length} item{order.items.length === 1 ? "" : "s"} • {formatPrice(order.total)}
            </p>
            <div className="mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Truck className="h-3 w-3" /> {order.tracking.length > 0 ? order.tracking[order.tracking.length - 1].note : "Awaiting shipment"}
              </span>
              <span className={`flex items-center gap-1 text-[10px] ${
                order.payment.status === "paid" ? "text-green-500" : "text-orange-500"
              }`}>
                <Wallet className="h-3 w-3" /> {order.payment.status}
              </span>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-1" />
        </button>
      ))}
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    pending: { color: "bg-orange-100 text-orange-700", label: "Pending" },
    confirmed: { color: "bg-blue-100 text-blue-700", label: "Confirmed" },
    processing: { color: "bg-blue-100 text-blue-700", label: "Processing" },
    shipped: { color: "bg-purple-100 text-purple-700", label: "Shipped" },
    delivered: { color: "bg-green-100 text-green-700", label: "Delivered" },
    cancelled: { color: "bg-red-100 text-red-700", label: "Cancelled" },
  };
  const c = config[status] ?? { color: "bg-gray-100 text-gray-700", label: status };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${c.color}`}>
      {c.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// ORDER CONVERSATION DETAIL
// ═══════════════════════════════════════════════════════════════

function OrderConversationView({
  order,
  onBack,
  onChatWithSeller,
}: {
  order: Order;
  onBack: () => void;
  onChatWithSeller: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Check if there's an existing thread for this order
  const threadsQuery = useQuery({
    queryKey: ["threads", user?.uid],
    queryFn: () => listThreads(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  const orderThread = threadsQuery.data?.find(
    (t) => t.subject.toLowerCase().includes(order.id.toLowerCase()) || t.subject.toLowerCase().includes(order.id.slice(0, 8).toLowerCase()),
  );

  const startOrderChat = async () => {
    if (orderThread) {
      onChatWithSeller(orderThread.id);
      return;
    }

    // Look up the product's sellerId from the first item
    let sellerId: string | null = null;
    let sellerShopName = "Seller";
    if (order.items.length > 0) {
      try {
        const product = await getProductById(order.items[0].productId);
        if (product?.sellerId) {
          sellerId = product.sellerId;
        }
      } catch { /* ignore — product may not be found */ }
    }

    // Create the personal thread (existing system)
    const threadId = await createThread(user!.uid, {
      subject: `Order #${order.id.slice(0, 8)}`,
      participant: sellerId ? sellerShopName : "Shop Nexa Support",
      sellerId: sellerId,
      firstMessage: `I have a question about order #${order.id.slice(0, 8)}`,
    });
    await queryClient.invalidateQueries({ queryKey: ["threads"] });

    // Also create a shared conversation (for seller inbox)
    if (sellerId && user) {
      try {
        const idToken = await user.getIdToken();
        await createSellerConversation({
          idToken,
          sellerId,
          subject: `Order #${order.id.slice(0, 8)}`,
          firstMessage: `I have a question about order #${order.id.slice(0, 8)}`,
          threadId,
          sellerShopName,
        });
      } catch (err) {
        console.warn("Failed to create seller conversation:", err);
      }
    }

    onChatWithSeller(threadId);
  };

  return (
    <ServicePageLayout title={`Order #${order.id.slice(0, 8)}`} subtitle="Order conversation & details" backTo="/messages">
      <div className="mx-auto w-full max-w-3xl">

        {/* Order header */}
        <div className="mb-4 rounded-2xl border bg-background p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Order #{order.id.slice(0, 8)}</h2>
              <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>

          {/* Items */}
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.productId} className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
                <img src={item.image} alt={item.title} className="h-14 w-14 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">Qty: {item.quantity} • {formatPrice(item.price)}</p>
                </div>
                <span className="text-sm font-semibold">{formatPrice(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <span className="text-sm font-semibold">{t("messages.total")}</span>
            <span className="text-lg font-bold text-primary">{formatPrice(order.total)}</span>
          </div>
        </div>

        {/* Order info cards */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {/* Tracking */}
          <div className="rounded-2xl border bg-background p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Truck className="h-4 w-4 text-primary" /> Shipment Tracking
            </h3>
            {order.tracking.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("messages.noTracking")}</p>
            ) : (
              <div className="space-y-2">
                {order.tracking.map((event, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <p className="text-xs font-medium">{event.note}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(event.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment */}
          <div className="rounded-2xl border bg-background p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Wallet className="h-4 w-4 text-primary" /> Payment Status
            </h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("messages.paymentMethod")}</span>
                <span className="font-medium">{order.payment.method.replace(/_/g, " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("messages.paymentStatus")}</span>
                <span className={`font-medium ${order.payment.status === "paid" ? "text-green-500" : "text-orange-500"}`}>
                  {order.payment.status}
                </span>
              </div>
              {order.payment.transactionId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("messages.txnId")}</span>
                  <span className="font-mono text-[10px]">{order.payment.transactionId}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={startOrderChat}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.98]"
          >
            <MessageCircle className="h-4 w-4" /> Chat About This Order
          </button>
          <Link
            to="/returns"
            className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition hover:bg-muted active:scale-[0.98]"
          >
            <AlertCircle className="h-4 w-4" /> Return / Refund
          </Link>
          <Link
            to="/track-orders"
            className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition hover:bg-muted active:scale-[0.98]"
          >
            <Truck className="h-4 w-4" /> Track Delivery
          </Link>
          <Link
            to="/orders"
            className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition hover:bg-muted active:scale-[0.98]"
          >
            <FileText className="h-4 w-4" /> View Invoice
          </Link>
        </div>
      </div>
    </ServicePageLayout>
  );
}

// ═══════════════════════════════════════════════════════════════
// SELLER CHATS
// ═══════════════════════════════════════════════════════════════

function SellerChats({
  threads,
  searchQuery,
  onThreadClick,
}: {
  threads: MessageThread[];
  searchQuery: string;
  onThreadClick: (id: string) => void;
}) {
  const { t } = useI18n();
  const filtered = useMemo(() => {
    if (!searchQuery) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter(
      (t) => t.participant.toLowerCase().includes(q) || t.lastMessage.toLowerCase().includes(q),
    );
  }, [threads, searchQuery]);

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={<Store className="h-12 w-12" />}
        title={t("messages.titleNoSellerConvos")}
        subtitle={t("messages.titleSellerConvos")}
      />
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((thread) => (
        <button
          key={thread.id}
          onClick={() => onThreadClick(thread.id)}
          className="group flex w-full items-center gap-3 rounded-2xl border bg-background p-3.5 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
        >
          <div className="relative">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-purple-100 text-purple-600">
              <Store className="h-6 w-6" />
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{thread.participant}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatRelativeTime(thread.lastAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="h-3 w-3 fill-orange-400 text-orange-400" />
              <span className="text-[10px] text-muted-foreground">4.{Math.floor(Math.random() * 9)} rating • Responds in ~2h</span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{thread.lastMessage}</p>
          </div>
          {thread.unread > 0 && (
            <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
              {thread.unread}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPORT CENTER
// ═══════════════════════════════════════════════════════════════

function SupportCenter({
  tickets,
  searchQuery,
  onTicketClick,
  userId,
}: {
  tickets: SupportTicket[];
  searchQuery: string;
  onTicketClick: (id: string) => void;
  userId: string;
}) {
  const { t } = useI18n();
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportTicket["category"]>("order");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      createTicket(userId, { subject: subject.trim(), category, orderId: null, message: message.trim() }),
    onSuccess: () => {
      toast.success(t("messages.ticketCreated"));
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setShowForm(false);
      setSubject("");
      setMessage("");
    },
    onError: () => toast.error(t("messages.ticketCreateFailed")),
  });

  const filtered = useMemo(() => {
    if (!searchQuery) return tickets;
    const q = searchQuery.toLowerCase();
    return tickets.filter((t) => t.subject.toLowerCase().includes(q) || t.lastMessage.toLowerCase().includes(q));
  }, [tickets, searchQuery]);

  const supportOptions = [
    { icon: <MessageCircle className="h-5 w-5" />, title: "Live Chat", desc: "Chat with our team", color: "bg-green-50 text-green-600" },
    { icon: <Plus className="h-5 w-5" />, title: "Create Ticket", desc: "Open a support ticket", color: "bg-blue-50 text-blue-600" },
    { icon: <Bot className="h-5 w-5" />, title: "AI Assistant", desc: "Get instant answers", color: "bg-indigo-50 text-indigo-600" },
    { icon: <Megaphone className="h-5 w-5" />, title: "FAQ", desc: "Common questions", color: "bg-orange-50 text-orange-600" },
  ];

  const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    open: { color: "bg-green-100 text-green-700", label: "Open", icon: <CheckCircle2 className="h-3 w-3" /> },
    pending: { color: "bg-orange-100 text-orange-700", label: "Pending", icon: <Clock className="h-3 w-3" /> },
    resolved: { color: "bg-blue-100 text-blue-700", label: "Resolved", icon: <CheckCircle2 className="h-3 w-3" /> },
    closed: { color: "bg-gray-100 text-gray-600", label: "Closed", icon: <XCircle className="h-3 w-3" /> },
  };

  return (
    <div className="space-y-4">
      {/* Support options grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {supportOptions.map((opt) => (
          <button
            key={opt.title}
            onClick={() => opt.title === "Create Ticket" ? setShowForm(true) : undefined}
            className="flex flex-col items-center gap-2 rounded-2xl border bg-background p-4 text-center shadow-sm transition hover:shadow-md active:scale-[0.98]"
          >
            <span className={`grid h-12 w-12 place-items-center rounded-xl ${opt.color}`}>{opt.icon}</span>
            <span className="text-xs font-semibold">{opt.title}</span>
            <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Create ticket form */}
      {showForm && (
        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">{t("messages.createTicket")}</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("messages.subjectPlaceholder")}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportTicket["category"])}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="order">{t("messages.orderIssue")}</option>
              <option value="payment">{t("messages.paymentIssue")}</option>
              <option value="delivery">{t("messages.deliveryIssue")}</option>
              <option value="account">{t("messages.accountIssue")}</option>
              <option value="other">{t("messages.other")}</option>
            </select>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Describe your issue..."
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !subject.trim() || !message.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {createMutation.isPending && <Loader className="h-4 w-4" />} Submit Ticket
              </button>
              <button onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing tickets */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t("messages.yourTickets")}</h3>
        {filtered.length === 0 ? (
          <EmptyState icon={<Headphones className="h-10 w-10" />} title={t("messages.titleNoTickets")} subtitle={t("messages.titleCreateTicket")} />
        ) : (
          <div className="space-y-2">
            {filtered.map((ticket) => {
              const sc = statusConfig[ticket.status] ?? statusConfig.open;
              return (
                <button
                  key={ticket.id}
                  onClick={() => onTicketClick(ticket.id)}
                  className="group flex w-full items-center gap-3 rounded-xl border bg-background p-3.5 text-left shadow-sm transition hover:shadow-md active:scale-[0.98]"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-orange-100 text-orange-600">
                    <Headphones className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{ticket.subject}</span>
                    <span className="block truncate text-xs text-muted-foreground">{ticket.lastMessage}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">{formatRelativeTime(ticket.updatedAt)}</span>
                  </div>
                  <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${sc.color}`}>
                    {sc.icon} {sc.label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-1" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AI SHOPPING ASSISTANT
// ═══════════════════════════════════════════════════════════════

function AIAssistant() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: t("messages.aiWelcome") },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const quickActions = [
    { icon: <Search className="h-4 w-4" />, label: "Find a product" },
    { icon: <Package className="h-4 w-4" />, label: "Track my order" },
    { icon: <Tag className="h-4 w-4" />, label: "Available coupons" },
    { icon: <Zap className="h-4 w-4" />, label: "Flash sales" },
  ];

  const handleSend = async () => {
    if (!input.trim() || loading || !user) return;
    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setInput("");
    setLoading(true);

    try {
      // Build conversation history for context (map "ai" → "assistant" for the API)
      const history = messages
        .filter((m) => m.text)
        .map((m) => ({
          role: m.role === "ai" ? "assistant" as const : "user" as const,
          content: m.text,
        }));

      const idToken = await user.getIdToken();
      const result = await sendAIMessage(idToken, userMsg, history);
      setMessages((prev) => [...prev, { role: "ai", text: result.reply }]);
    } catch (err) {
      const errMsg = err instanceof Error && err.message
        ? err.message
        : "Something went wrong. Please try again.";
      setMessages((prev) => [...prev, { role: "ai", text: errMsg }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border bg-background shadow-sm" style={{ minHeight: "60vh" }}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b p-4">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">{t("messages.aiAssistant")}</h3>
          <p className="text-[10px] text-green-500">● Online — Always available</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === "user"
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-muted"
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick actions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 border-t p-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => setInput(action.label)}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
            >
              {action.icon} {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask me anything..."
          className="flex-1 rounded-full border bg-muted/30 px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION CENTER
// ═══════════════════════════════════════════════════════════════

const NOTIF_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  order: { icon: <Package className="h-5 w-5" />, color: "bg-blue-50 text-blue-600" },
  promo: { icon: <Tag className="h-5 w-5" />, color: "bg-orange-50 text-orange-600" },
  wallet: { icon: <Wallet className="h-5 w-5" />, color: "bg-green-50 text-green-600" },
  reward: { icon: <Gift className="h-5 w-5" />, color: "bg-purple-50 text-purple-600" },
  support: { icon: <Headphones className="h-5 w-5" />, color: "bg-indigo-50 text-indigo-600" },
  system: { icon: <Bell className="h-5 w-5" />, color: "bg-gray-50 text-gray-600" },
};

function NotificationCenter({
  notifications,
  searchQuery,
  onMarkRead,
  userId,
}: {
  notifications: CustomerNotification[];
  searchQuery: string;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  userId: string;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<NotificationType | "all">("all");
  const queryClient = useQueryClient();

  const handleMarkAll = async () => {
    await markAllNotificationsRead(userId);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    toast.success(t("messages.notifAllRead"));
  };

  const filtered = useMemo(() => {
    let result = notifications;
    if (filter !== "all") result = result.filter((n) => n.type === filter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((n) => n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q));
    }
    return result;
  }, [notifications, filter, searchQuery]);

  const filterTabs: { id: NotificationType | "all"; label: string }[] = [
    { id: "all", label: t("messages.filterAll") },
    { id: "order", label: t("messages.filterOrders") },
    { id: "promo", label: t("messages.filterOffers") },
    { id: "wallet", label: t("messages.filterWallet") },
    { id: "reward", label: t("messages.filterRewards") },
    { id: "system", label: t("messages.filterSystem") },
  ];

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-3">
      {/* Header with mark all */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5 overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === tab.id ? "bg-primary text-primary-foreground" : "border hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAll} className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Bell className="h-12 w-12" />} title={t("messages.titleNoNotifs")} subtitle="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {filtered.map((notif) => {
            const config = NOTIF_CONFIG[notif.type] ?? NOTIF_CONFIG.system;
            return (
              <button
                key={notif.id}
                onClick={() => onMarkRead(notif.id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left shadow-sm transition hover:shadow-md active:scale-[0.98] ${
                  notif.read ? "bg-background" : "bg-primary/5 border-primary/20"
                }`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${config.color}`}>
                  {config.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{notif.title}</span>
                    {!notif.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{notif.message}</p>
                  <span className="mt-1 block text-[10px] text-muted-foreground/60">{formatRelativeTime(notif.createdAt)}</span>
                </div>
                {notif.link && (
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/30" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ANNOUNCEMENT CENTER
// ═══════════════════════════════════════════════════════════════

// Icon mapping from string names to components
const ANNOUNCEMENT_ICONS: Record<string, React.ReactNode> = {
  Zap: <Zap className="h-8 w-8" />,
  Store: <Store className="h-8 w-8" />,
  Sparkles: <Sparkles className="h-8 w-8" />,
  Gift: <Gift className="h-8 w-8" />,
  AlertCircle: <AlertCircle className="h-8 w-8" />,
  Megaphone: <Megaphone className="h-8 w-8" />,
  Star: <Star className="h-8 w-8" />,
  Heart: <Heart className="h-8 w-8" />,
};

function AnnouncementCenter() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Real-time listener for published, active announcements
    const unsub = subscribeActiveAnnouncements((items) => {
      setAnnouncements(items);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        <Spinner /> Loading announcements…
      </div>
    );
  }

  if (announcements.length === 0) {
    return (
      <div className="rounded-2xl border bg-background p-8 text-center text-sm text-muted-foreground">
        <Megaphone className="mx-auto mb-2 h-8 w-8 opacity-40" />
        No active announcements right now. Check back soon!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {announcements.map((ann) => (
        <div
          key={ann.id}
          className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${ann.gradient} p-5 text-white shadow-lg`}
        >
          <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10" />
          <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative z-10 flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              {ANNOUNCEMENT_ICONS[ann.icon] ?? <Megaphone className="h-8 w-8" />}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold">{ann.title}</h3>
              <p className="mt-0.5 text-sm opacity-90">{ann.message}</p>
              {ann.ctaLabel && ann.ctaLink && (
                <Link
                  to={ann.ctaLink}
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur transition hover:bg-white/30"
                >
                  {ann.ctaLabel} <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PREMIUM CHAT VIEW
// ═══════════════════════════════════════════════════════════════

function ChatView({ threadId, onBack, userId }: { threadId: string; onBack: () => void; userId: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const thread = useQuery({
    queryKey: ["threads", userId],
    queryFn: () => listThreads(userId),
    enabled: !!userId,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);

  useEffect(() => {
    if (!userId || !threadId || !firebaseConfigured) return;
    setMessagesLoading(true);
    const unsub = onSnapshot(
      query(
        collection(getDb(), "users", userId, "messages"),
        where("threadId", "==", threadId),
        orderBy("createdAt", "asc"),
        limit(300),
      ),
      (snap) => {
        const mapped = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            threadId: String(data.threadId ?? ""),
            body: String(data.body ?? ""),
            from: data.from === "support" ? "support" as const : "customer" as const,
            createdAt: typeof data.createdAt === "number"
              ? data.createdAt
              : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
          };
        });
        setMessages(mapped);
        setMessagesLoading(false);
      },
      (err) => {
        console.warn("Messages snapshot error:", err);
        setMessagesLoading(false);
      },
    );
    return () => unsub();
  }, [userId, threadId]);

  useEffect(() => {
    markThreadRead(userId, threadId).catch(() => undefined);
  }, [userId, threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeThread = thread.data?.find((t) => t.id === threadId);

  const sendMutation = useMutation({
    mutationFn: async () => {
      // Send via existing personal thread (backward compat)
      await sendMessage(userId, threadId, draft.trim());

      // If this is a seller thread, also sync to shared conversation
      if (activeThread?.sellerId) {
        try {
          const conv = await findConversationByThreadId(userId, threadId);
          if (conv) {
            await customerSendMessage(conv.id, userId, draft.trim(), threadId);
          }
        } catch (err) {
          console.warn("Failed to sync message to conversation:", err);
        }
      }
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages", userId, threadId] });
      queryClient.invalidateQueries({ queryKey: ["threads", userId] });
    },
    onError: () => toast.error(t("messages.msgSendFailed")),
  });

  const handleSend = () => {
    if (!draft.trim() || sendMutation.isPending) return;
    sendMutation.mutate();
  };

  const quickReplies = ["Thank you!", "Got it 👍", "When will it arrive?", "Can I get a refund?"];
  const emojis = ["😀", "😍", "👍", "🙏", "❤️", "🔥", "🎉", "😅", "😎", "🤝"];

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      {/* Chat header */}
      <div className="flex items-center gap-3 border-b bg-background px-4 py-3 shadow-sm">
        <button onClick={onBack} className="rounded-full p-1.5 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className={`grid h-10 w-10 place-items-center rounded-full ${
          activeThread?.sellerId ? "bg-purple-100 text-purple-600" : "bg-primary/10 text-primary"
        }`}>
          {activeThread?.sellerId ? <Store className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{activeThread?.participant ?? "Chat"}</h3>
          <p className="flex items-center gap-1 text-[10px] text-green-500">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Online
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3 w-3 fill-orange-400 text-orange-400" /> 4.8
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messagesLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageCircle className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
          </div>
        ) : (
          <>
            {/* Pinned message */}
            <div className="mb-2 flex justify-center">
              <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[10px] text-muted-foreground">
                <Pin className="h-3 w-3" /> {activeThread?.subject}
              </span>
            </div>
            {messages.map((msg) => {
              const isMe = msg.from === "customer";
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                    <div className={`relative rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      isMe
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-background"
                    }`}>
                      {msg.body}
                    </div>
                    <div className={`mt-0.5 flex items-center gap-1 px-1 text-[10px] text-muted-foreground`}>
                      {formatRelativeTime(msg.createdAt)}
                      {isMe && <CheckCheck className="h-3 w-3 text-blue-400" />}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </>
        )}
      </div>

      {/* Quick replies */}
      {messages && messages.length < 4 && (
        <div className="flex flex-wrap gap-1.5 border-t bg-background/80 px-3 py-2 backdrop-blur">
          {quickReplies.map((reply) => (
            <button
              key={reply}
              onClick={() => setDraft(reply)}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition hover:bg-muted"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="flex gap-1 border-t bg-background p-2">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => { setDraft((prev) => prev + emoji); setShowEmoji(false); }}
              className="rounded-lg p-1.5 text-lg transition hover:bg-muted"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 border-t bg-background p-3">
        <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted">
          <Paperclip className="h-5 w-5 text-muted-foreground" />
        </button>
        <button onClick={() => setShowEmoji(!showEmoji)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted">
          <Smile className={`h-5 w-5 ${showEmoji ? "text-primary" : "text-muted-foreground"}`} />
        </button>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 rounded-full border bg-muted/30 px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted">
          <Mic className="h-5 w-5 text-muted-foreground" />
        </button>
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sendMutation.isPending}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TICKET CHAT VIEW
// ═══════════════════════════════════════════════════════════════

function TicketChatView({ ticketId, onBack, userId }: { ticketId: string; onBack: () => void; userId: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const tickets = useQuery({
    queryKey: ["tickets", userId],
    queryFn: () => listTickets(userId),
    enabled: !!userId,
  });

  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);

  useEffect(() => {
    if (!userId || !ticketId || !firebaseConfigured) return;
    setMessagesLoading(true);
    const unsub = onSnapshot(
      query(
        collection(getDb(), "users", userId, "tickets", ticketId, "messages"),
        orderBy("createdAt", "asc"),
        limit(200),
      ),
      (snap) => {
        const mapped = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            body: String(data.body ?? ""),
            from: data.from === "support" ? "support" as const : "customer" as const,
            createdAt: typeof data.createdAt === "number"
              ? data.createdAt
              : (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now(),
          };
        });
        setMessages(mapped);
        setMessagesLoading(false);
      },
      (err) => {
        console.warn("Ticket messages snapshot error:", err);
        setMessagesLoading(false);
      },
    );
    return () => unsub();
  }, [userId, ticketId]);

  const activeTicket = tickets.data?.find((t) => t.id === ticketId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: () => replyToTicket(userId, ticketId, draft.trim()),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["ticketMessages", userId, ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets", userId] });
    },
    onError: () => toast.error(t("messages.sendFailed")),
  });

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      {/* Header */}
      <div className="flex items-center gap-3 border-t bg-background px-4 py-3 shadow-sm">
        <button onClick={onBack} className="rounded-full p-1.5 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-orange-100 text-orange-600">
          <Headphones className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{activeTicket?.subject ?? "Support"}</h3>
          <p className="text-[10px] text-muted-foreground">
            Ticket #{ticketId.slice(0, 8)} • {activeTicket?.status}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messagesLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Headphones className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t("messages.noMessages")}</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.from === "customer";
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                  isMe ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-background"
                }`}>
                  {msg.body}
                  <div className={`mt-0.5 text-[10px] ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {formatRelativeTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t bg-background p-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && draft.trim() && sendMutation.mutate()}
          placeholder="Reply..."
          className="flex-1 rounded-full border bg-muted/30 px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => draft.trim() && sendMutation.mutate()}
          disabled={!draft.trim() || sendMutation.isPending}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/30 py-16 text-center">
      <span className="mb-3 text-muted-foreground/40">{icon}</span>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return formatDate(ms);
}
