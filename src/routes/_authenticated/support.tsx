import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, Phone, Plus, Send, MessageSquare, Loader, X } from "lucide-react";
import { toast } from "sonner";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { listOrders } from "@/services/firebase/orders";
import {
  closeTicket,
  createTicket,
  listTicketMessages,
  listTickets,
  replyToTicket,
} from "@/services/firebase/support";
import { formatDateTime } from "@/utils/format";
import type { SupportTicket } from "@/types/customer";

export const Route = createFileRoute("/_authenticated/support")({
  component: SupportPage,
});

const CATEGORIES: SupportTicket["category"][] = ["order", "payment", "delivery", "account", "other"];

const FAQS = [
  { q: "How long does delivery take?", a: "Orders are dispatched within 24 hours and usually arrive in 2–5 business days depending on your city." },
  { q: "How do I track my order?", a: "Open Orders from your account menu and select an order to see its live tracking timeline." },
  { q: "When do I receive cashback?", a: "Cashback is credited to your wallet as soon as your order is placed and can be redeemed on any future purchase." },
  { q: "Can I change my delivery address?", a: "Save multiple addresses in your Address Book and pick one at checkout. Contact support for changes on an order already placed." },
];

const STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-slate-100 text-slate-500",
};

function SupportPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportTicket["category"]>("order");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const tickets = useQuery({ queryKey: ["tickets", user?.uid], queryFn: () => listTickets(user!.uid), enabled: !!user });
  const orders = useQuery({ queryKey: ["orders", user?.uid], queryFn: () => listOrders(user!.uid), enabled: !!user });
  const messages = useQuery({ queryKey: ["ticketMessages", user?.uid, activeId], queryFn: () => listTicketMessages(user!.uid, activeId!), enabled: !!user && !!activeId });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.data]);

  const field = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition";

  const submitTicket = async () => {
    if (!user) return;
    if (subject.trim().length < 4) { toast.error(t("support.shortSubject")); return; }
    if (message.trim().length < 10) { toast.error("Describe your issue in at least 10 characters"); return; }
    setBusy(true);
    try {
      const id = await createTicket(user.uid, { subject: subject.trim(), category, orderId: orderId || null, message: message.trim() });
      toast.success(t("support.ticketCreatedToast"));
      setSubject(""); setMessage(""); setOrderId(""); setCreating(false);
      await tickets.refetch(); setActiveId(id);
    } catch { toast.error(t("support.createTicketFailed")); }
    finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!user || !activeId || !reply.trim()) return;
    setBusy(true);
    try { await replyToTicket(user.uid, activeId, reply.trim()); setReply(""); await Promise.all([messages.refetch(), tickets.refetch()]); }
    catch { toast.error(t("support.sendReplyFailed")); }
    finally { setBusy(false); }
  };

  return (
    <ServicePageLayout title={t("support.title")} subtitle={t("support.subtitle")}>
      {/* Quick contact cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <a href="https://wa.me/8801324997271" target="_blank" rel="noreferrer" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md">
          <Phone className="h-5 w-5 text-[#f57224]" />
          <div className="mt-2 font-bold text-slate-800">{t("support.whatsapp")}</div>
          <p className="text-sm text-slate-500">01324997271 · 9am–9pm</p>
        </a>
        <Link to="/messages" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md">
          <MessageSquare className="h-5 w-5 text-[#f57224]" />
          <div className="mt-2 font-bold text-slate-800">{t("support.liveMessages")}</div>
          <p className="text-sm text-slate-500">{t("support.chatWithTeam")}</p>
        </Link>
        <Link to="/orders" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md">
          <LifeBuoy className="h-5 w-5 text-[#f57224]" />
          <div className="mt-2 font-bold text-slate-800">{t("support.orderHelp")}</div>
          <p className="text-sm text-slate-500">{t("support.trackOrReview")}</p>
        </Link>
      </div>

      {/* New ticket button */}
      <div className="mt-4 flex justify-end">
        <button onClick={() => setCreating(v => !v)} className="inline-flex items-center gap-2 rounded-xl bg-[#f57224] px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95">
          <Plus className="h-4 w-4" /> New ticket
        </button>
      </div>

      {/* Create ticket form */}
      {creating && (
        <div className="mt-4 grid gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <h2 className="font-bold text-slate-800">{t("support.createTicket")}</h2>
            <button type="button" onClick={() => setCreating(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("support.subjectLabel")}</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={100} className={field} placeholder={t("support.briefDescPlaceholder")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("support.category")}</label>
            <select value={category} onChange={e => setCategory(e.target.value as SupportTicket["category"])} className={field}>
              {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Related order (optional)</label>
            <select value={orderId} onChange={e => setOrderId(e.target.value)} className={field}>
              <option value="">{t("support.none")}</option>
              {(orders.data ?? []).map(o => <option key={o.id} value={o.id}>#{o.id.slice(0, 8).toUpperCase()} · {o.items.length} item{o.items.length === 1 ? "" : "s"}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("support.howCanWeHelp")}</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={1500} className={field} placeholder="Describe your issue..." />
          </div>
          <div className="sm:col-span-2">
            <button onClick={() => void submitTicket()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#f57224] px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95 disabled:opacity-50">
              {busy && <Loader className="h-4 w-4 animate-spin" />} Submit ticket
            </button>
          </div>
        </div>
      )}

      {/* My tickets */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3.5 font-bold text-slate-800">My tickets</div>
        {tickets.isLoading ? (
          <div className="py-16 text-center"><Loader className="mx-auto h-8 w-8 animate-spin text-slate-300" /></div>
        ) : !tickets.data || tickets.data.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">{t("support.noTickets")}</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tickets.data.map(ticket => (
              <li key={ticket.id}>
                <button onClick={() => setActiveId(ticket.id === activeId ? null : ticket.id)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-700">{ticket.subject}</div>
                    <div className="truncate text-xs text-slate-400">{ticket.lastMessage}</div>
                    <div className="text-xs text-slate-400">{formatDateTime(ticket.createdAt)} · {ticket.category}{ticket.orderId ? ` · #${ticket.orderId.slice(0, 8).toUpperCase()}` : ""}</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${STATUS_STYLE[ticket.status] ?? STATUS_STYLE.closed}`}>{ticket.status}</span>
                </button>
                {activeId === ticket.id && (
                  <div className="border-t border-gray-100 bg-slate-50/50 p-4">
                    <div className="max-h-72 space-y-3 overflow-y-auto">
                      {messages.isLoading ? (
                        <div className="py-6 text-center"><Loader className="mx-auto h-6 w-6 animate-spin text-slate-300" /></div>
                      ) : (
                        (messages.data ?? []).map(m => (
                          <div key={m.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.from === "customer" ? "ml-auto bg-[#f57224] text-white" : "bg-white border border-gray-100"}`}>
                            <p>{m.body}</p>
                            <div className="mt-1 text-[10px] opacity-70">{formatDateTime(m.createdAt)}</div>
                          </div>
                        ))
                      )}
                      <div ref={endRef} />
                    </div>
                    {ticket.status !== "closed" && (
                      <div className="mt-3 flex items-center gap-2">
                        <input value={reply} onChange={e => setReply(e.target.value)} placeholder={t("support.replyPlaceholder")} maxLength={1000} className={field} />
                        <button onClick={() => void sendReply()} disabled={busy || !reply.trim()} aria-label="Send reply" className="rounded-xl bg-[#f57224] p-2.5 text-white shadow-md transition hover:bg-orange-600 active:scale-95 disabled:opacity-50">
                          <Send className="h-4 w-4" />
                        </button>
                        <button onClick={async () => { if (!user) return; await closeTicket(user.uid, ticket.id); toast.success(t("support.ticketClosed")); await tickets.refetch(); }} className="whitespace-nowrap rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                          Close ticket
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* FAQ */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3.5 font-bold text-slate-800">{t("support.faqTitle")}</div>
        <div className="divide-y divide-gray-100">
          {FAQS.map(f => (
            <details key={f.q} className="px-5 py-3.5">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">{f.q}</summary>
              <p className="mt-2 text-sm text-slate-500">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </ServicePageLayout>
  );
}
