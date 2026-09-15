import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listUsers, setUserBlocked, setUserRole } from "@/services/firebase/adminUsers";
import type { AdminUserRow } from "@/services/firebase/adminUsers";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { formatDate } from "@/utils/format";
import { mapFirebaseError } from "@/utils/errors";
import type { UserRole } from "@/types/user";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersAdmin,
});

function UsersAdmin() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"" | UserRole>("");

  const refresh = async () => {
    setLoading(true);
    try {
      setRows(await listUsers());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (role && r.role !== role) return false;
      if (term && !`${r.email ?? ""} ${r.displayName ?? ""}`.toLowerCase().includes(term))
        return false;
      return true;
    });
  }, [rows, q, role]);

  const onToggleBlock = async (r: AdminUserRow) => {
    if (!user) return;
    if (r.uid === user.uid) {
      toast.error("You cannot block your own account.");
      return;
    }
    try {
      await setUserBlocked(r.uid, !r.blocked);
      await logActivity(
        { uid: user.uid, email: user.email },
        r.blocked ? "user.unblock" : "user.block",
        r.uid,
        r.email ?? "",
      );
      toast.success(r.blocked ? "User unblocked" : "User blocked");
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onRoleChange = async (r: AdminUserRow, nr: UserRole) => {
    if (!user) return;
    if (r.uid === user.uid && nr !== "admin") {
      toast.error("You cannot demote yourself from admin.");
      return;
    }
    try {
      await setUserRole(r.uid, nr);
      await logActivity(
        { uid: user.uid, email: user.email },
        "user.role_change",
        r.uid,
        `${r.role} -> ${nr}`,
      );
      toast.success(t("admin.roleUpdated"));
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const counts = useMemo(() => {
    return {
      total: rows.length,
      customers: rows.filter((r) => r.role === "customer").length,
      sellers: rows.filter((r) => r.role === "seller").length,
      admins: rows.filter((r) => r.role === "admin").length,
      blocked: rows.filter((r) => r.blocked).length,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.users")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.manageUsersDesc")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total", value: counts.total },
          { label: "Customers", value: counts.customers },
          { label: "Sellers", value: counts.sellers },
          { label: "Admins", value: counts.admins },
          { label: "Blocked", value: counts.blocked },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-background p-3">
            <div className="text-xs uppercase text-muted-foreground">{s.label}</div>
            <div className="text-lg font-semibold">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-wrap gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email…"
            className="flex-1 min-w-[220px] rounded-md border bg-background px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "" | UserRole)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("admin.allRoles")}</option>
            <option value="customer">{t("admin.customer")}</option>
            <option value="seller">{t("admin.seller")}</option>
            <option value="admin">{t("admin.adminRole")}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading users…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          No users found.
        </div>
      ) : (
        <>
          {/* Mobile user cards */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((r) => (
              <div
                key={r.uid}
                className={
                  "rounded-lg border bg-background p-4 space-y-3 " +
                  (r.blocked ? "bg-destructive/5" : "")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {r.photoURL ? (
                      <img
                        src={r.photoURL}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs flex-shrink-0 font-medium">
                        {(r.displayName || r.email || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{r.displayName || "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                    </div>
                  </div>
                  {r.blocked ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive flex-shrink-0">
                      Blocked
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 flex-shrink-0">
                      Active
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-t pt-2 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>Role:</span>
                    <select
                      value={r.role}
                      onChange={(e) => onRoleChange(r, e.target.value as UserRole)}
                      className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"
                    >
                      <option value="customer">{t("admin.customer")}</option>
                      <option value="seller">{t("admin.seller")}</option>
                      <option value="admin">{t("admin.adminRole")}</option>
                    </select>
                  </div>
                  <div>Joined {formatDate(r.createdAt)}</div>
                </div>

                <div className="flex items-center justify-end border-t pt-2">
                  <button
                    onClick={() => onToggleBlock(r)}
                    className={
                      "rounded-md border px-2 py-1 text-xs hover:bg-muted " +
                      (r.blocked ? "text-emerald-600" : "text-destructive")
                    }
                  >
                    {r.blocked ? "Unblock" : "Block"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-background lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">{t("admin.user")}</th>
                  <th className="px-3 py-2">{t("admin.role")}</th>
                  <th className="px-3 py-2">{t("admin.status")}</th>
                  <th className="px-3 py-2">{t("admin.joined")}</th>
                  <th className="px-3 py-2 text-right">{t("admin.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.uid} className={r.blocked ? "bg-destructive/5" : undefined}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        {r.photoURL ? (
                          <img
                            src={r.photoURL}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs">
                            {(r.displayName || r.email || "?").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{r.displayName || "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.role}
                        onChange={(e) => onRoleChange(r, e.target.value as UserRole)}
                        className="rounded-md border bg-background px-2 py-1 text-xs"
                      >
                        <option value="customer">{t("admin.customer")}</option>
                        <option value="seller">{t("admin.seller")}</option>
                        <option value="admin">{t("admin.adminRole")}</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {r.blocked ? (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                          Blocked
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => onToggleBlock(r)}
                        className={
                          "rounded-md border px-2 py-1 text-xs hover:bg-muted " +
                          (r.blocked ? "text-emerald-600" : "text-destructive")
                        }
                      >
                        {r.blocked ? "Unblock" : "Block"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
