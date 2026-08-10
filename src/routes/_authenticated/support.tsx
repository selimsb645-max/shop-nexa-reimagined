import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, Phone, Plus, Send, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
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

const CATEGORIES: SupportTicket["category"][] = [
  "order",
  "payment",
  "delivery",
  "account",
  "other",
];

const FAQS = [
  {
    q: "How long does delivery take?",
    a: "Orders are dispatched within 24 hours and usually arrive in 2–5 business days depending on your city.",
  },
  {
    q: "How do I track my order?",
    a: "Open Orders from your account menu and select an order to see its live tracking timeline.",
  },
  {
    q: "When do I receive cashback?",
    a: "Cashback is credited to your wallet as soon as your order is placed and can be redeemed on any future purchase.",
  },
  {
    q: "Can I change my delivery address?",
    a: "Save multiple addresses in your Address Book and pick one at checkout. Contact support for changes on an order already placed.",
  },
];

const STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  pending: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-muted text-muted-foreground",
};

function SupportPage() {
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

  const tickets = useQuery({
    queryKey: ["tickets", user?.uid],
    queryFn: () => listTickets(user!.uid),
    enabled: !!user,
  });
  const orders = useQuery({
    queryKey: ["orders", user?.uid],
    queryFn: () => listOrders(user!.uid),
    enabled: !!user,
  });
  const messages = useQuery({
    queryKey: ["ticketMessages", user?.uid, activeId],
    queryFn: () => listTicketMessages(user!.uid, activeId!),
    enabled: !!user && !!activeId,
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data]);

  const field = "w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary";

  const submitTicket = async () => {
    if (!user) return;
    if (subject.trim().length < 4) {
      toast.error("Add a short subject");
      return;
    }
    if (message.trim().length < 10) {
      toast.error("Describe your issue in at least 10 characters");
      return;
    }
    setBusy(true);
    try {
      const id = await createTicket(user.uid, {
        subject: subject.trim(),
        category,
        orderId: orderId || null,
        message: message.trim(),
      });
      toast.success("Support ticket created");
      setSubject("");
      setMessage("");
      setOrderId("");
      setCreating(false);
      await tickets.refetch();
      setActiveId(id);
    } catch {
      toast.error("Could not create the ticket");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!user || !activeId || !reply.trim()) return;
    setBusy(true);
    try {
      await replyToTicket(user.uid, activeId, reply.trim());
      setReply("");
      await Promise.all([messages.refetch(), tickets.refetch()]);
    } catch {
      toast.error("Could not send the reply");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Support Center</h1>
            <p className="text-sm text-muted-foreground">Get help with orders, payments and your account</p>
          </div>
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New ticket
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <a
            href="https://wa.me/8801324997271"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border bg-background p-5 hover:border-primary"
          >
            <Phone className="h-5 w-5 text-primary" />
            <div className="mt-2 font-semibold">WhatsApp</div>
            <p className="text-sm text-muted-foreground">01324997271 · 9am–9pm</p>
          </a>
          <Link to="/messages" className="rounded-lg border bg-background p-5 hover:border-primary">
            <MessageSquare className="h-5 w-5 text-primary" />
            <div className="mt-2 font-semibold">Live messages</div>
            <p className="text-sm text-muted-foreground">Chat with our team</p>
          </Link>
          <Link to="/orders" className="rounded-lg border bg-background p-5 hover:border-primary">
            <LifeBuoy className="h-5 w-5 text-primary" />
            <div className="mt-2 font-semibold">Order help</div>
            <p className="text-sm text-muted-foreground">Track or review an order</p>
          </Link>
        </div>

        {creating && (
          <div className="grid gap-4 rounded-lg border bg-background p-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={100} className={field} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SupportTicket["category"])}
                className={field}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Related order (optional)</label>
              <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className={field}>
                <option value="">None</option>
                {(orders.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.id.slice(0, 8).toUpperCase()} · {o.items.length} item
                    {o.items.length === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">How can we help?</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={1500}
                className={field}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                onClick={() => void submitTicket()}
                disabled={busy}
                className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Spinner />} Submit ticket
              </button>
            </div>
          </div>
        )}

        <section className="rounded-lg border bg-background">
          <div className="border-b px-5 py-3 font-semibold">My tickets</div>
          {tickets.isLoading ? (
            <div className="py-16 text-center">
              <Spinner />
            </div>
          ) : !tickets.data || tickets.data.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              You have no support tickets.
            </div>
          ) : (
            <ul className="divide-y">
              {tickets.data.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveId(t.id === activeId ? null : t.id)}
                    className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{t.subject}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.lastMessage}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(t.createdAt)} · {t.category}
                        {t.orderId ? ` · #${t.orderId.slice(0, 8).toUpperCase()}` : ""}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[t.status]}`}
                    >
                      {t.status}
                    </span>
                  </button>

                  {activeId === t.id && (
                    <div className="border-t bg-muted/30 p-4">
                      <div className="max-h-72 space-y-3 overflow-y-auto">
                        {messages.isLoading ? (
                          <div className="py-6 text-center">
                            <Spinner />
                          </div>
                        ) : (
                          (messages.data ?? []).map((m) => (
                            <div
                              key={m.id}
                              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                m.from === "customer"
                                  ? "ml-auto bg-primary text-primary-foreground"
                                  : "bg-background"
                              }`}
                            >
                              <p>{m.body}</p>
                              <div className="mt-1 text-[10px] opacity-70">
                                {formatDateTime(m.createdAt)}
                              </div>
                            </div>
                          ))
                        )}
                        <div ref={endRef} />
                      </div>
                      {t.status !== "closed" && (
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            placeholder="Add a reply"
                            maxLength={1000}
                            className={field}
                          />
                          <button
                            onClick={() => void sendReply()}
                            disabled={busy || !reply.trim()}
                            aria-label="Send reply"
                            className="rounded-md bg-primary p-2.5 text-primary-foreground hover:opacity-90 disabled:opacity-60"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!user) return;
                              await closeTicket(user.uid, t.id);
                              toast.success("Ticket closed");
                              await tickets.refetch();
                            }}
                            className="whitespace-nowrap rounded-md border px-3 py-2.5 text-xs font-medium hover:bg-muted"
                          >
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
        </section>

        <section className="rounded-lg border bg-background">
          <div className="border-b px-5 py-3 font-semibold">Frequently asked questions</div>
          <div className="divide-y">
            {FAQS.map((f) => (
              <details key={f.q} className="px-5 py-3">
                <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
