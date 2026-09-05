import { useEffect, useRef, useState, useCallback } from "react";
import {
  Loader,
  MessageSquare,
  Send,
  ArrowLeft,
  Search,
  AlertCircle,
  Inbox,
  User,
} from "lucide-react";
import type { SellerProfile } from "@/types/seller";
import type { SellerConversation, ConversationMessage } from "@/types/customer";
import {
  subscribeSellerConversations,
  subscribeConversationMessages,
  sellerSendReply,
  markSellerConversationRead,
} from "@/services/firebase/sellerConversations";
import { useAuth } from "@/context/AuthContext";

// ----------------------------------------------------------------
// Time formatting
// ----------------------------------------------------------------
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ----------------------------------------------------------------
// Main Page
// ----------------------------------------------------------------
export function SellerMessagesPage({ profile }: { profile: SellerProfile }) {
  const sellerId = profile.uid;
  const shopName = profile.shopName || "Your Shop";

  const [conversations, setConversations] = useState<SellerConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<SellerConversation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Subscribe to conversations (realtime)
  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = subscribeSellerConversations(
      sellerId,
      (convs) => {
        setConversations(convs);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [sellerId]);

  // Track the active conversation object
  useEffect(() => {
    if (activeConvId) {
      const conv = conversations.find((c) => c.id === activeConvId);
      setActiveConv(conv ?? null);
    } else {
      setActiveConv(null);
    }
  }, [activeConvId, conversations]);

  const filteredConversations = searchQuery
    ? conversations.filter((c) =>
        c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : conversations;

  const unreadTotal = conversations.reduce((s, c) => s + c.sellerUnread, 0);

  // Mobile: show conversation list or chat view
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a] flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#f57224]" />
            Messages
            {unreadTotal > 0 && (
              <span className="px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full">
                {unreadTotal}
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Customer conversations for {shopName}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex h-[calc(100vh-220px)] min-h-[400px]">
          {/* Conversation List */}
          <div className={`${
            activeConvId ? "hidden sm:flex" : "flex"
          } w-full sm:w-80 lg:w-96 flex-col border-r border-slate-200`}>
            {/* Search */}
            <div className="p-3 border-b border-slate-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#f57224]"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-6 h-6 animate-spin text-slate-300" />
                </div>
              ) : error ? (
                <div className="p-4 text-sm text-rose-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <Inbox className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-sm font-medium text-slate-400">No conversations yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    When customers message you, their conversations will appear here
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => (
                  <ConversationListItem
                    key={conv.id}
                    conv={conv}
                    isActive={conv.id === activeConvId}
                    onClick={() => setActiveConvId(conv.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Chat View */}
          <div className={`${
            activeConvId ? "flex" : "hidden sm:flex"
          } flex-1 flex-col min-w-0`}>
            {activeConvId && activeConv ? (
              <ChatView
                convId={activeConvId}
                conv={activeConv}
                sellerId={sellerId}
                onBack={() => setActiveConvId(null)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                <MessageSquare className="w-12 h-12 text-slate-200 mb-3" />
                <p className="text-sm font-medium text-slate-400">Select a conversation</p>
                <p className="text-xs text-slate-400 mt-1">
                  Choose a conversation from the list to view messages
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Conversation List Item
// ----------------------------------------------------------------
function ConversationListItem({
  conv,
  isActive,
  onClick,
}: {
  conv: SellerConversation;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-3 text-left border-b border-slate-100 transition-colors ${
        isActive ? "bg-orange-50/50" : "hover:bg-slate-50"
      }`}
    >
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
        <User className="w-5 h-5 text-slate-400" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-[#0f172a] truncate">
            {conv.customerName}
          </p>
          <span className="text-[10px] text-slate-400 flex-shrink-0">
            {timeAgo(conv.lastAt)}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">{conv.subject}</p>
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="text-xs text-slate-400 truncate flex-1">{conv.lastMessage}</p>
          {conv.sellerUnread > 0 && (
            <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex-shrink-0">
              {conv.sellerUnread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ----------------------------------------------------------------
// Chat View
// ----------------------------------------------------------------
function ChatView({
  convId,
  conv,
  sellerId,
  onBack,
}: {
  convId: string;
  conv: SellerConversation;
  sellerId: string;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Subscribe to messages (realtime)
  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = subscribeConversationMessages(
      convId,
      (msgs) => {
        setMessages(msgs);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [convId]);

  // Mark as read when opening or when new messages arrive
  useEffect(() => {
    markSellerConversationRead(convId).catch(() => undefined);
  }, [convId, messages.length]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!draft.trim() || sending || !user) return;
    setSending(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      await sellerSendReply(convId, sellerId, idToken, conv.customerId, draft.trim());
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [draft, sending, convId, sellerId, conv.customerId, user]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-slate-200 bg-slate-50">
        <button
          onClick={onBack}
          className="sm:hidden p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#0f172a] truncate">{conv.customerName}</p>
          <p className="text-xs text-slate-400 truncate">{conv.subject}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/30">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-rose-600 flex items-center gap-2 justify-center">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-8 h-8 text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No messages yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Start the conversation by sending a reply
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} isSeller={msg.from === "seller"} />
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-slate-200 bg-white">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type your reply..."
          className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-[#f57224]"
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className="grid h-10 w-10 place-items-center rounded-full bg-[#f57224] text-white transition hover:opacity-90 disabled:opacity-50 flex-shrink-0"
        >
          {sending ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Message Bubble
// ----------------------------------------------------------------
function MessageBubble({ msg, isSeller }: { msg: ConversationMessage; isSeller: boolean }) {
  return (
    <div className={`flex ${isSeller ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] sm:max-w-[70%] flex flex-col ${
        isSeller ? "items-end" : "items-start"
      }`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm break-words ${
          isSeller
            ? "rounded-br-md bg-[#f57224] text-white"
            : "rounded-bl-md bg-white border border-slate-200 text-[#0f172a]"
        }`}>
          {msg.body}
        </div>
        <span className="mt-0.5 px-1 text-[10px] text-slate-400">
          {formatTime(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}
