import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import {
  createThread,
  deleteThread,
  listMessages,
  listThreads,
  markThreadRead,
  sendMessage,
} from "@/services/firebase/messages";
import { formatDateTime } from "@/utils/format";

export const Route = createFileRoute("/_authenticated/messages")({
  component: MessagesPage,
});

function MessagesPage() {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const threads = useQuery({
    queryKey: ["threads", user?.uid],
    queryFn: () => listThreads(user!.uid),
    enabled: !!user,
  });

  const messages = useQuery({
    queryKey: ["messages", user?.uid, activeId],
    queryFn: () => listMessages(user!.uid, activeId!),
    enabled: !!user && !!activeId,
  });

  useEffect(() => {
    if (!activeId && threads.data?.length) setActiveId(threads.data[0].id);
  }, [threads.data, activeId]);

  useEffect(() => {
    if (user && activeId) void markThreadRead(user.uid, activeId).catch(() => undefined);
  }, [user, activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data]);

  const active = threads.data?.find((t) => t.id === activeId) ?? null;

  const startThread = async () => {
    if (!user) return;
    if (subject.trim().length < 3) {
      toast.error("Add a short subject");
      return;
    }
    if (draft.trim().length < 2) {
      toast.error("Write your message");
      return;
    }
    setSending(true);
    try {
      const id = await createThread(user.uid, {
        subject: subject.trim(),
        firstMessage: draft.trim(),
      });
      setSubject("");
      setDraft("");
      setComposing(false);
      await threads.refetch();
      setActiveId(id);
    } catch {
      toast.error("Could not start the conversation");
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    if (!user || !activeId || draft.trim().length < 1) return;
    setSending(true);
    try {
      await sendMessage(user.uid, activeId, draft.trim());
      setDraft("");
      await Promise.all([messages.refetch(), threads.refetch()]);
    } catch {
      toast.error("Message could not be sent");
    } finally {
      setSending(false);
    }
  };

  const field = "w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:border-primary";

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Messages</h1>
            <p className="text-sm text-muted-foreground">Chat with the Shop Nexa team about your orders</p>
          </div>
          <button
            onClick={() => setComposing((v) => !v)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New message
          </button>
        </div>

        {composing && (
          <div className="space-y-3 rounded-lg border bg-background p-5">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              maxLength={80}
              className={field}
            />
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="How can we help?"
              className={field}
            />
            <button
              onClick={() => void startThread()}
              disabled={sending}
              className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {sending && <Spinner />} Start conversation
            </button>
          </div>
        )}

        {threads.isLoading ? (
          <div className="py-16 text-center">
            <Spinner />
          </div>
        ) : !threads.data || threads.data.length === 0 ? (
          <div className="rounded-lg border bg-background p-16 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No conversations yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a message and our team will reply here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[260px_1fr]">
            <div className="space-y-2">
              {threads.data.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`w-full rounded-lg border p-3 text-left ${t.id === activeId ? "border-primary bg-primary/5" : "bg-background hover:bg-muted"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{t.subject}</span>
                    {t.unread > 0 && (
                      <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                        {t.unread}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{t.lastMessage}</p>
                </button>
              ))}
            </div>

            <div className="flex min-h-[420px] flex-col rounded-lg border bg-background">
              {active ? (
                <>
                  <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <div>
                      <div className="font-semibold">{active.subject}</div>
                      <div className="text-xs text-muted-foreground">{active.participant}</div>
                    </div>
                    <button
                      aria-label="Delete conversation"
                      onClick={async () => {
                        if (!user) return;
                        await deleteThread(user.uid, active.id);
                        setActiveId(null);
                        await threads.refetch();
                        toast.success("Conversation deleted");
                      }}
                      className="rounded-md border p-2 text-destructive hover:bg-muted"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {messages.isLoading ? (
                      <div className="py-10 text-center">
                        <Spinner />
                      </div>
                    ) : (
                      (messages.data ?? []).map((m) => (
                        <div
                          key={m.id}
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            m.from === "customer"
                              ? "ml-auto bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p>{m.body}</p>
                          <div className="mt-1 text-[10px] opacity-70">{formatDateTime(m.createdAt)}</div>
                        </div>
                      ))
                    )}
                    <div ref={endRef} />
                  </div>
                  <div className="flex items-center gap-2 border-t p-3">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      maxLength={1000}
                      placeholder="Type a message"
                      className={field}
                    />
                    <button
                      onClick={() => void send()}
                      disabled={sending || !draft.trim()}
                      aria-label="Send message"
                      className="rounded-md bg-primary p-2.5 text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Select a conversation
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
