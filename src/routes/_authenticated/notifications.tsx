import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2, Loader } from "lucide-react";
import { toast } from "sonner";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
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
  order: "bg-blue-100 text-blue-700",
  promo: "bg-orange-100 text-orange-700",
  wallet: "bg-green-100 text-green-700",
  reward: "bg-yellow-100 text-yellow-700",
  support: "bg-indigo-100 text-indigo-700",
  system: "bg-slate-100 text-slate-600",
};

function NotificationsPage() {
  const { t } = useI18n();
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
    <ServicePageLayout title={t("notifications.title")} subtitle={unread > 0 ? `${unread} unread` : "You're all caught up"}>
      {unread > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => void readAll()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95"
          >
            <CheckCheck className="h-4 w-4 text-[#f57224]" /> Mark all read
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 text-center">
          <Loader className="mx-auto h-8 w-8 animate-spin text-slate-300" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-orange-50 text-[#f57224]">
            <Bell className="h-7 w-7" />
          </span>
          <h3 className="mt-4 text-base font-bold text-slate-800">{t("notifications.empty")} yet</h3>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            Order updates, cashback and offers will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((n) => (
            <div
              key={n.id}
              className={`rounded-2xl border p-4 shadow-sm transition ${
                n.read
                  ? "border-gray-100 bg-white"
                  : "border-orange-200 bg-orange-50/40"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${TYPE_STYLE[n.type] ?? TYPE_STYLE.system}`}
                  >
                    {n.type}
                  </span>
                  <div>
                    <div className="font-bold text-slate-800">{n.title}</div>
                    <p className="mt-0.5 text-sm text-slate-500">{n.message}</p>
                    <div className="mt-1 text-xs text-slate-400">{formatDateTime(n.createdAt)}</div>
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
                      className="text-xs font-bold text-[#f57224] hover:underline"
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
                    className="rounded-lg border border-slate-200 p-2 text-red-500 transition hover:bg-red-50 active:scale-95"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {n.link && (
                <Link to={n.link} className="mt-3 inline-block text-xs font-bold text-[#f57224] hover:underline">
                  View details
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </ServicePageLayout>
  );
}
