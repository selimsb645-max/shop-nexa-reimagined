import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, Loader, Inbox } from "lucide-react";
import {
  collection,
  query,
  orderBy,
  limit as fbLimit,
  getDocs,
  updateDoc,
  doc,
  writeBatch,
  where,
} from "firebase/firestore";
import { getDb } from "@/services/firebase/config";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  ssr: false,
  component: AdminNotifications,
  head: () => ({ meta: [{ title: "Notifications — AVENTA SHOP Admin" }] }),
});

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: number;
}

const FILTER_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "stock_low", label: "Stock" },
  { key: "system", label: "System" },
];

function AdminNotifications() {
  const [notifs, setNotifs] = useState<AdminNotification[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const db = getDb();
        const snap = await getDocs(
          query(
            collection(db, "settings", "site", "notifications"),
            orderBy("createdAt", "desc"),
            fbLimit(100),
          ),
        );
        if (!cancelled) {
          setNotifs(
            snap.docs.map((d) => {
              const data = d.data() as Record<string, unknown>;
              return {
                id: d.id,
                type: String(data.type ?? "system"),
                title: String(data.title ?? ""),
                message: String(data.message ?? ""),
                link: (data.link as string | null) ?? null,
                read: Boolean(data.read),
                createdAt:
                  typeof data.createdAt === "number"
                    ? data.createdAt
                    : data.createdAt &&
                        typeof data.createdAt === "object" &&
                        "toMillis" in data.createdAt
                      ? (data.createdAt as { toMillis: () => number }).toMillis()
                      : Date.now(),
              };
            }),
          );
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = filter === "all" ? notifs : notifs.filter((n) => n.type === filter);
  const unreadCount = notifs.filter((n) => !n.read).length;

  const handleMarkRead = async (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      const db = getDb();
      await updateDoc(doc(db, "settings", "site", "notifications", id), { read: true });
    } catch {
      /* ignore */
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      const db = getDb();
      const snap = await getDocs(
        query(collection(db, "settings", "site", "notifications"), where("read", "==", false)),
      );
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
        await batch.commit();
      }
    } catch {
      /* ignore */
    }
    setMarkingAll(false);
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  };

  const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
    stock_low: { icon: "⚠️", label: "Stock", color: "#d97706" },
    system: { icon: "🔔", label: "System", color: "#6366f1" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-8 h-8 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a] flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#f57224]" />
            Notifications
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Platform-wide alerts and stock notifications
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            disabled={markingAll}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium py-2 px-3.5 rounded-lg text-xs transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            {markingAll ? "Marking..." : "Mark All Read"}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              filter === tab.key
                ? "bg-[#0f172a] text-white"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {filtered.map((n) => {
            const config = typeConfig[n.type] || typeConfig.system;
            return (
              <button
                key={n.id}
                onClick={() => !n.read && handleMarkRead(n.id)}
                className={`w-full flex items-start gap-3 p-3.5 text-left hover:bg-slate-50 transition-colors ${
                  !n.read ? "bg-orange-50/30" : ""
                }`}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                  style={{ background: `${config.color}15` }}
                >
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-bold text-[#0f172a]">{n.title}</p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-[#f57224]" />}
                  </div>
                  <p className="text-sm text-slate-500 line-clamp-2">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: `${config.color}15`, color: config.color }}
                    >
                      {config.label}
                    </span>
                    {n.link && (
                      <Link to={n.link} className="text-[11px] text-[#f57224] hover:underline">
                        View →
                      </Link>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Inbox className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p className="text-sm font-medium text-slate-400">No notifications yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Stock alerts, system notifications, and platform activity will appear here
          </p>
        </div>
      )}
    </div>
  );
}
