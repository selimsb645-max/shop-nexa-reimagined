import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/firebase/notifications";
import { formatDateTime } from "@/utils/format";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

const TYPE_STYLE: Record<string, string> = {
  order: "bg-blue-100 text-blue-800",
  promo: "bg-accent/15 text-accent",
  wallet: "bg-green-100 text-green-800",
  reward: "bg-yellow-100 text-yellow-800",
  support: "bg-indigo-100 text-indigo-800",
  system: "bg-muted text-muted-foreground",
};

function NotificationsPage() {
  const { user } = useAuth();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["notifications", user?.uid],
    queryFn: () => listNotifications(user!.uid),
    enabled: !!user,
  });

  const unread = (data ?? []).filter((n) => !n.read).length;

  const readAll = async () => {
    if (!user) return;
    await markAllNotificationsRead(user.uid);
    toast.success("All notifications marked as read");
    await refetch();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-6">
      <PageHeader title="Notifications" subtitle="Your notification center" />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unread > 0 ? `${unread} unread update${unread === 1 ? "" : "s"}` : "You are all caught up"}
            </p>
          </div>
          {unread > 0 && (
            <button
              onClick={() => void readAll()}
              className="flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted"
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 text-center">
            <Spinner />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border bg-background p-16 text-center">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No notifications yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Order updates, cashback and offers will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border p-4 ${n.read ? "bg-background" : "border-primary/40 bg-primary/5"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${TYPE_STYLE[n.type] ?? TYPE_STYLE.system}`}
                    >
                      {n.type}
                    </span>
                    <div>
                      <div className="font-semibold">{n.title}</div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(n.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!n.read && (
                      <button
                        onClick={async () => {
                          if (!user) return;
                          await markNotificationRead(user.uid, n.id);
                          await refetch();
                        }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Mark read
                      </button>
                    )}
                    <button
                      aria-label="Delete notification"
                      onClick={async () => {
                        if (!user) return;
                        await deleteNotification(user.uid, n.id);
                        await refetch();
                      }}
                      className="rounded-md border p-2 text-destructive hover:bg-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {n.link && (
                  <Link to={n.link} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
                    View details
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
