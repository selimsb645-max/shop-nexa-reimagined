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
} from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useAuth } from "@/context/AuthContext";
import { firebaseConfigured } from "@/services/firebase/config";
import {
  listThreads,
  listMessages,
  createThread,
  sendMessage,
  markThreadRead,
  countUnreadMessages,
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
  listTicketMessages,
  replyToTicket,
} from "@/services/firebase/support";
import { listOrders } from "@/services/firebase/orders";
import { formatPrice, formatDate } from "@/utils/format";
import type { MessageThread, ChatMessage } from "@/types/customer";
import type { CustomerNotification, NotificationType } from "@/types/customer";
import type { SupportTicket } from "@/types/customer";
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
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
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

  const unreadMsgQuery = useQuery({
    queryKey: ["messages", "unread", user?.uid],
    queryFn: () => countUnreadMessages(user!.uid),
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

  const threads = threadsQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];
  const tickets = ticketsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];

  // Filter threads
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

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 sm:px-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold sm:text-2xl">Communication Center</h1>
          <p className="text-sm text-muted-foreground">Your hub for orders, chats, support & notifications</p>
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats, orders, sellers, tickets..."
            className="w-full rounded-xl border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Tab navigation */}
        <TabBar activeTab={activeTab} onChange={setActiveTab} unreadNotif={unreadNotifQuery.data ?? 0} unreadMsg={unreadMsgQuery.data ?? 0} ticketCount={tickets.length} />

        {/* Content area */}
        <div className="mt-4">
          {activeTab === "inbox" && (
            <InboxDashboard
              threads={threads}
              notifications={notifications}
              tickets={tickets}
              orders={orders}
              unreadMsg={unreadMsgQuery.data ?? 0}
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
      </main>

      <SiteFooter />
      <WhatsAppFab />
      <MobileBottomNav />
    </div>
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
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "border bg-background text-muted-foreground hover:bg-muted/50"
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
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Recent Conversations</h3>
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
    return <EmptyState icon={<Package className="h-12 w-12" />} title="No orders yet" subtitle="Your order conversations will appear here" />;
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
    const threadId = await createThread(user!.uid, {
      subject: `Order #${order.id.slice(0, 8)}`,
      participant: "Shop Nexa Support",
      firstMessage: `I have a question about order #${order.id.slice(0, 8)}`,
    });
    await queryClient.invalidateQueries({ queryKey: ["threads"] });
    onChatWithSeller(threadId);
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 sm:px-6">
        <button onClick={onBack} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

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
            <span className="text-sm font-semibold">Total: </span>
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
              <p className="text-xs text-muted-foreground">No tracking updates yet</p>
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
                <span className="text-muted-foreground">Method</span>
                <span className="font-medium">{order.payment.method.replace(/_/g, " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={`font-medium ${order.payment.status === "paid" ? "text-green-500" : "text-orange-500"}`}>
                  {order.payment.status}
                </span>
              </div>
              {order.payment.transactionId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Txn ID</span>
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
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
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
        title="No seller conversations"
        subtitle="Chat with sellers about products and orders"
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
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportTicket["category"]>("order");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      createTicket(userId, { subject: subject.trim(), category, orderId: null, message: message.trim() }),
    onSuccess: () => {
      toast.success("Ticket created");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setShowForm(false);
      setSubject("");
      setMessage("");
    },
    onError: () => toast.error("Failed to create ticket"),
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
          <h3 className="mb-3 text-sm font-semibold">Create Support Ticket</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportTicket["category"])}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="order">Order Issue</option>
              <option value="payment">Payment Issue</option>
              <option value="delivery">Delivery Issue</option>
              <option value="account">Account Issue</option>
              <option value="other">Other</option>
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
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Your Tickets</h3>
        {filtered.length === 0 ? (
          <EmptyState icon={<Headphones className="h-10 w-10" />} title="No support tickets" subtitle="Create a ticket to get help" />
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
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Hi! I'm your AI Shopping Assistant. I can help you find products, track orders, suggest coupons, and more. How can I help today?" },
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
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setInput("");
    setLoading(true);

    // Simple AI response logic (connect to backend in production)
    const aiResponse = generateAIResponse(userMsg);
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "ai", text: aiResponse }]);
      setLoading(false);
    }, 800);
  };

  return (
    <div className="flex flex-col rounded-2xl border bg-background shadow-sm" style={{ minHeight: "60vh" }}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b p-4">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">AI Shopping Assistant</h3>
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

function generateAIResponse(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("track") || q.includes("order")) {
    return "To track your order, go to the Orders tab above and tap on any order to see real-time tracking updates. You can also visit the Track Orders page for live delivery tracking.";
  }
  if (q.includes("coupon") || q.includes("discount")) {
    return "You can find all available coupons on the Coupons page. We frequently offer flash sale discounts and promo codes. Check back often for new deals!";
  }
  if (q.includes("flash") || q.includes("sale")) {
    return "Flash sales are live on the Flash Sales page! These are limited-time deals with significant discounts. Act fast before they end!";
  }
  if (q.includes("return") || q.includes("refund")) {
    return "You can request a return from the Returns & Refunds page. We accept returns within 7 days of delivery for eligible products.";
  }
  if (q.includes("product") || q.includes("find") || q.includes("search")) {
    return "You can browse all products on the Shop page. Use the search bar at the top to find specific items, or filter by category to discover new products.";
  }
  return "I'm here to help! You can ask me about orders, products, coupons, returns, flash sales, and more. What would you like to know?";
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
  const [filter, setFilter] = useState<NotificationType | "all">("all");
  const queryClient = useQueryClient();

  const handleMarkAll = async () => {
    await markAllNotificationsRead(userId);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    toast.success("All notifications marked as read");
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
    { id: "all", label: "All" },
    { id: "order", label: "Orders" },
    { id: "promo", label: "Offers" },
    { id: "wallet", label: "Wallet" },
    { id: "reward", label: "Rewards" },
    { id: "system", label: "System" },
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
        <EmptyState icon={<Bell className="h-12 w-12" />} title="No notifications" subtitle="You're all caught up!" />
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

function AnnouncementCenter() {
  const announcements = [
    {
      title: "Mega Flash Sale",
      desc: "Up to 70% off on electronics, fashion & more!",
      gradient: "from-orange-500 to-red-500",
      icon: <Zap className="h-8 w-8" />,
      cta: "Shop Now",
      link: "/flash-sales",
    },
    {
      title: "New Seller Programs",
      desc: "Join Shop Nexa as a seller and reach millions of customers",
      gradient: "from-blue-500 to-indigo-600",
      icon: <Store className="h-8 w-8" />,
      cta: "Become a Seller",
      link: "/seller/register",
    },
    {
      title: "Nexa Prime Membership",
      desc: "Free shipping, exclusive deals & 3x reward points",
      gradient: "from-purple-500 to-pink-600",
      icon: <Sparkles className="h-8 w-8" />,
      cta: "Join Now",
      link: "/membership",
    },
    {
      title: "Gift Cards Available",
      desc: "Perfect gifts for any occasion — starting from ৳500",
      gradient: "from-green-500 to-teal-600",
      icon: <Gift className="h-8 w-8" />,
      cta: "Buy Gift Card",
      link: "/gift-cards",
    },
    {
      title: "System Maintenance",
      desc: "Scheduled maintenance on Aug 10, 2:00 AM - 4:00 AM BST",
      gradient: "from-gray-600 to-gray-800",
      icon: <AlertCircle className="h-8 w-8" />,
      cta: null,
      link: null,
    },
  ];

  return (
    <div className="space-y-3">
      {announcements.map((ann, i) => (
        <div
          key={i}
          className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${ann.gradient} p-5 text-white shadow-lg`}
        >
          <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10" />
          <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative z-10 flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              {ann.icon}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold">{ann.title}</h3>
              <p className="mt-0.5 text-sm opacity-90">{ann.desc}</p>
              {ann.cta && ann.link && (
                <Link
                  to={ann.link}
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur transition hover:bg-white/30"
                >
                  {ann.cta} <ChevronRight className="h-3 w-3" />
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
  const [draft, setDraft] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const thread = useQuery({
    queryKey: ["threads", userId],
    queryFn: () => listThreads(userId),
    enabled: !!userId,
  });

  const messages = useQuery({
    queryKey: ["messages", userId, threadId],
    queryFn: () => listMessages(userId, threadId),
    enabled: !!userId && !!threadId,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    markThreadRead(userId, threadId).catch(() => undefined);
  }, [userId, threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data]);

  const activeThread = thread.data?.find((t) => t.id === threadId);

  const sendMutation = useMutation({
    mutationFn: () => sendMessage(userId, threadId, draft.trim()),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages", userId, threadId] });
      queryClient.invalidateQueries({ queryKey: ["threads", userId] });
    },
    onError: () => toast.error("Message could not be sent"),
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
        {messages.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !messages.data || messages.data.length === 0 ? (
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
            {messages.data.map((msg) => {
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
      {messages.data && messages.data.length < 4 && (
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
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const tickets = useQuery({
    queryKey: ["tickets", userId],
    queryFn: () => listTickets(userId),
    enabled: !!userId,
  });

  const messages = useQuery({
    queryKey: ["ticketMessages", userId, ticketId],
    queryFn: () => listTicketMessages(userId, ticketId),
    enabled: !!userId && !!ticketId,
    refetchInterval: 10_000,
  });

  const activeTicket = tickets.data?.find((t) => t.id === ticketId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data]);

  const sendMutation = useMutation({
    mutationFn: () => replyToTicket(userId, ticketId, draft.trim()),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["ticketMessages", userId, ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets", userId] });
    },
    onError: () => toast.error("Failed to send"),
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
        {messages.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !messages.data || messages.data.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Headphones className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          messages.data.map((msg) => {
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
