// ═══════════════════════════════════════════════════════════════
// AVENTA SHOP — Customer Support Chat Widget
// ═══════════════════════════════════════════════════════════════
// Floating chat bubble (navy + red AVENTA brand), opens a live
// support conversation with the Aventa Admin Hub console. All data
// flows through server bridges (ID-token verified); polling 5s
// while open, light 45s unread poll while closed. Signed-in
// customers only; guests see a sign-in prompt.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { MessageCircle, X, Send, Headset, ShieldCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchSupportChat,
  fetchSupportUnread,
  sendSupportChatMessage,
  type SupportMessage,
  type SupportThread,
} from "@/services/support/supportChat";

const BRAND_NAVY = "#1e2e7a";
const BRAND_RED = "#dc2626";

function fmtTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SupportChatWidget() {
  const { user, profile } = useAuth();
  const location = useLocation();

  // Hide on seller/admin surfaces — this widget is customer-facing
  if (location.pathname.startsWith("/seller") || location.pathname.startsWith("/admin")) {
    return null;
  }

  return user ? (
    <SupportChatPanel
      customerName={
        profile?.displayName ?? user.displayName ?? user.email?.split("@")[0] ?? "Customer"
      }
    />
  ) : null;
}

function SupportChatPanel({ customerName }: { customerName: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchSupportChat();
      setMessages(res.messages);
      setThread(res.thread);
      setError(null);
    } catch {
      setError("মেসেজ লোড করা যায়নি। আবার চেষ্টা হচ্ছে…");
    }
  }, []);

  // Closed-widget unread badge (light poll)
  useEffect(() => {
    if (open) return;
    let alive = true;
    const tick = async () => {
      try {
        const c = await fetchSupportUnread();
        if (alive) setUnread(c);
      } catch {
        /* badge best-effort */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 45_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open]);

  // Open-widget live polling
  useEffect(() => {
    if (!open) return;
    void refresh();
    const t = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(t);
  }, [open, refresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendSupportChatMessage(text);
      setInput("");
      await refresh();
    } catch {
      setError("মেসেজ পাঠানো যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 right-4 z-[60] flex h-13 w-13 items-center justify-center rounded-full shadow-xl transition hover:scale-105 sm:bottom-6 sm:right-6"
        style={{ backgroundColor: BRAND_NAVY, height: 52, width: 52 }}
        aria-label="Aventa Shop Support Chat"
      >
        {open ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <MessageCircle className="h-6 w-6 text-white" />
        )}
        {!open && unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white"
            style={{ backgroundColor: BRAND_RED }}
          >
            1
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-36 right-4 z-[60] flex h-[440px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:bottom-24 sm:right-6">
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 text-white"
            style={{ background: `linear-gradient(135deg, #16225e 0%, ${BRAND_NAVY} 100%)` }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <Headset className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold tracking-wide">
                AVENTA <span style={{ color: "#fbbf24" }}>SHOP</span> সাপোর্ট
              </p>
              <p className="flex items-center gap-1 text-[11px] text-white/70">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                আমরা অনলাইনে আছি
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 hover:bg-white/10"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
            {messages === null ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : messages.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm font-semibold text-slate-600">
                  আসসালামু আলাইকুম, {customerName}! 👋
                </p>
                <p className="mt-1 px-4 text-xs text-slate-400">
                  অর্ডার, ডেলিভারি, প্রোডাক্ট — যেকোনো প্রশ্ন করুন। আমাদের সাপোর্ট টিম দ্রুত উত্তর
                  দেবে ইনশাআল্লাহ।
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.sender === "customer" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      m.sender === "customer"
                        ? "rounded-br-md text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-700"
                    }`}
                    style={m.sender === "customer" ? { backgroundColor: BRAND_NAVY } : undefined}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    <p
                      className={`mt-0.5 text-right text-[10px] ${
                        m.sender === "customer" ? "text-white/60" : "text-slate-400"
                      }`}
                    >
                      {fmtTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
            {thread?.status === "resolved" && (
              <p className="pt-1 text-center text-[11px] text-emerald-600">
                ✓ আপনার প্রশ্নের সমাধান হয়েছে। নতুন প্রশ্ন থাকলে লিখুন!
              </p>
            )}
          </div>

          {error && (
            <p className="bg-amber-50 px-3 py-1.5 text-center text-[11px] text-amber-700">
              {error}
            </p>
          )}

          {/* Input */}
          <div className="flex items-end gap-2 border-t border-slate-100 p-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder="আপনার মেসেজ লিখুন…"
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || sending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow transition disabled:opacity-40"
              style={{ backgroundColor: BRAND_NAVY }}
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>

          <p className="flex items-center justify-center gap-1 bg-slate-50 py-1.5 text-[10px] text-slate-400">
            <ShieldCheck className="h-3 w-3" /> নিরাপদ চ্যাট — Aventa Shop সাপোর্ট টিম
          </p>
        </div>
      )}
    </>
  );
}
