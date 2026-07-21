import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listActivityLogs } from "@/services/firebase/adminLogs";
import type { ActivityLog } from "@/types/admin";
import { Spinner } from "@/components/common/Spinner";
import { formatDateTime } from "@/utils/format";

export const Route = createFileRoute("/_authenticated/admin/logs")({
  component: LogsAdmin,
});

function LogsAdmin() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLogs(await listActivityLogs(300));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Logs</h1>
        <p className="text-sm text-muted-foreground">
          Audit trail of all admin actions across the platform.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Spinner /> Loading logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">No activity yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(l.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-xs">{l.actorEmail || l.actorUid.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{l.action}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{l.target}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
