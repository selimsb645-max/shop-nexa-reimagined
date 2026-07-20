import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { SellerGate } from "@/components/seller/SellerGate";
import { Spinner } from "@/components/common/Spinner";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/firebase/sellers";
import { formatDateTime } from "@/utils/format";
import type { SellerNotification } from "@/types/seller";

export const Route = createFileRoute("/_authenticated/seller/notifications")({
  component: () => (
    <SellerGate>{(profile) => <NotificationsPage sellerId={profile.uid} />}</SellerGate>
  ),
});

function NotificationsPage({ sellerId }: { sellerId: string }) {
  const [items, setItems] = useState<SellerNotification[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listNotifications(sellerId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  const onMarkAll = async () => {
    try {
      await markAllNotificationsRead(sellerId);
      toast.success("All notifications marked as read");
      await load();
    } catch {
      toast.error("Could not mark notifications");
    }
  };

  const onMarkOne = async (id: string) => {
    try {
      await markNotificationRead(sellerId, id);
      setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? null);
    } catch {
      // no-op
    }
  };

  const unread = items?.filter((n) => !n.read).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "You're all caught up"}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={onMarkAll}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading notifications...
        </div>
      ) : !items || items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Bell className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No notifications yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            You'll see order and system alerts here.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border bg-background">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read && onMarkOne(n.id)}
              className={`flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40 ${
                n.read ? "" : "bg-primary/5"
              }`}
            >
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(n.createdAt)}
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">{n.message}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
