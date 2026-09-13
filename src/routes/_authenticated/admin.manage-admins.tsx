import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listAdminUsers,
  setAdminRole,
  removeAdminRole,
} from "@/services/firebase/adminPermissions";
import { listUsers } from "@/services/firebase/adminUsers";
import type { AdminUserRow } from "@/services/firebase/adminUsers";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { formatDate } from "@/utils/format";
import { mapFirebaseError } from "@/utils/errors";
import type { AdminRole } from "@/types/user";
import { ROLE_PERMISSIONS } from "@/types/user";
import { useI18n } from "@/i18n";
import { Crown, Shield, ShieldCheck, ShieldAlert, UserCog, Trash2, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/manage-admins")({
  component: ManageAdminsPage,
  head: () => ({ meta: [{ title: "Manage Admins — AVENTA SHOP Admin" }] }),
});

const ADMIN_ROLE_OPTIONS: { value: AdminRole; label: string; description: string }[] = [
  { value: "super_admin", label: "Super Admin", description: "Full access to everything" },
  { value: "admin", label: "Admin", description: "General admin, no finance/super permissions" },
  {
    value: "finance_admin",
    label: "Finance Admin",
    description: "Withdrawals, earnings, commissions, payouts",
  },
  {
    value: "support_admin",
    label: "Support Admin",
    description: "Orders, customer support, refunds",
  },
  {
    value: "content_admin",
    label: "Content Admin",
    description: "Products, categories, coupons, banners",
  },
];

function ManageAdminsPage() {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const [admins, setAdmins] = useState<
    Array<{ uid: string; email: string | null; displayName: string | null; adminRole: AdminRole }>
  >([]);
  const [allUsers, setAllUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPromoteModal, setShowPromoteModal] = useState(false);

  const isSuperAdmin = profile?.role === "admin" && profile?.adminRole === "super_admin";

  const refresh = async () => {
    setLoading(true);
    try {
      const [adminList, userList] = await Promise.all([listAdminUsers(), listUsers()]);
      setAdmins(adminList);
      setAllUsers(userList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Users that are NOT admins (candidates for promotion)
  const nonAdminUsers = useMemo(() => {
    const adminUids = new Set(admins.map((a) => a.uid));
    const term = searchQuery.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (adminUids.has(u.uid)) return false;
      if (u.blocked) return false;
      if (term && !`${u.email ?? ""} ${u.displayName ?? ""}`.toLowerCase().includes(term))
        return false;
      return true;
    });
  }, [allUsers, admins, searchQuery]);

  const handleChangeRole = async (uid: string, newRole: AdminRole, email: string | null) => {
    if (!user) return;
    if (uid === user.uid) {
      toast.error("You cannot change your own role.");
      return;
    }
    setProcessing(uid);
    try {
      await setAdminRole(uid, newRole);
      await logActivity(
        { uid: user.uid, email: user.email },
        "admin.update_role",
        uid,
        `Role set to ${newRole} (${email ?? ""})`,
      );
      toast.success(`Admin role updated to ${newRole}`);
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setProcessing(null);
    }
  };

  const handleRemoveAdmin = async (uid: string, email: string | null) => {
    if (!user) return;
    if (uid === user.uid) {
      toast.error("You cannot remove your own admin role.");
      return;
    }
    if (
      !confirm(
        `Remove admin role from ${email ?? "this user"}? They will become a regular customer.`,
      )
    ) {
      return;
    }
    setProcessing(uid);
    try {
      await removeAdminRole(uid);
      await logActivity(
        { uid: user.uid, email: user.email },
        "admin.revoke",
        uid,
        `Admin role revoked (${email ?? ""})`,
      );
      toast.success("Admin role removed");
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setProcessing(null);
    }
  };

  const handlePromote = async (uid: string, email: string | null) => {
    if (!user) return;
    setProcessing(uid);
    try {
      await setAdminRole(uid, "admin");
      await logActivity(
        { uid: user.uid, email: user.email },
        "admin.create",
        uid,
        `Promoted to admin (${email ?? ""})`,
      );
      toast.success("User promoted to Admin");
      setShowPromoteModal(false);
      setSearchQuery("");
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setProcessing(null);
    }
  };

  // ── Access check (super_admin only) ─────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Crown className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Super Admin access required</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Only the Super Admin can manage other administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manage Admins</h1>
          <p className="text-sm text-muted-foreground">
            Add, remove, and manage administrator roles.
          </p>
        </div>
        <button
          onClick={() => setShowPromoteModal((v) => !v)}
          className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <UserCog className="h-4 w-4" />
          Promote User
        </button>
      </div>

      {/* ── Admin list ──────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border bg-background">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Spinner /> Loading admins…
          </div>
        ) : admins.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">No admin users found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Admin</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Permissions</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {admins.map((a) => {
                const isSelf = a.uid === user?.uid;
                const perms = ROLE_PERMISSIONS[a.adminRole] ?? [];
                return (
                  <tr key={a.uid} className={isSelf ? "bg-amber-50/50" : undefined}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs">
                          {(a.displayName || a.email || "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium">
                            {a.displayName || "—"}
                            {isSelf && (
                              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{a.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {isSelf ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                          <Crown className="h-3 w-3" />
                          {a.adminRole}
                        </span>
                      ) : (
                        <select
                          value={a.adminRole}
                          onChange={(e) =>
                            handleChangeRole(a.uid, e.target.value as AdminRole, a.email)
                          }
                          disabled={processing === a.uid}
                          className="rounded-md border bg-background px-2 py-1 text-xs"
                        >
                          {ADMIN_ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs text-muted-foreground">
                        {perms.length} permissions
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">Cannot remove self</span>
                      ) : (
                        <button
                          onClick={() => handleRemoveAdmin(a.uid, a.email)}
                          disabled={processing === a.uid}
                          className="flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Role legend ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-background p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4" />
          Admin Roles & Permissions
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_ROLE_OPTIONS.map((opt) => {
            const perms = ROLE_PERMISSIONS[opt.value] ?? [];
            return (
              <div key={opt.value} className="rounded-md border bg-muted/20 p-3">
                <div className="flex items-center gap-2">
                  {opt.value === "super_admin" ? (
                    <Crown className="h-4 w-4 text-amber-500" />
                  ) : opt.value === "admin" ? (
                    <ShieldCheck className="h-4 w-4 text-blue-500" />
                  ) : opt.value === "finance_admin" ? (
                    <Shield className="h-4 w-4 text-green-500" />
                  ) : opt.value === "support_admin" ? (
                    <ShieldAlert className="h-4 w-4 text-orange-500" />
                  ) : (
                    <UserCog className="h-4 w-4 text-purple-500" />
                  )}
                  <span className="text-sm font-medium">{opt.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{opt.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {perms.slice(0, 5).map((p) => (
                    <span
                      key={p}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {p}
                    </span>
                  ))}
                  {perms.length > 5 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{perms.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Promote user modal ──────────────────────────────────────────── */}
      {showPromoteModal && (
        <div className="space-y-4 rounded-lg border bg-background p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Search className="h-4 w-4" />
              Promote a User to Admin
            </h3>
            <button
              onClick={() => {
                setShowPromoteModal(false);
                setSearchQuery("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading users…
            </div>
          ) : nonAdminUsers.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {searchQuery ? "No matching users found." : "No non-admin users available."}
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Current Role</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {nonAdminUsers.slice(0, 50).map((u) => (
                    <tr key={u.uid}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {u.photoURL ? (
                            <img
                              src={u.photoURL}
                              alt=""
                              className="h-7 w-7 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs">
                              {(u.displayName || u.email || "?").slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{u.displayName || "—"}</div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                          {u.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handlePromote(u.uid, u.email)}
                          disabled={processing === u.uid}
                          className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {processing === u.uid ? "Promoting…" : "Promote to Admin"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Promoted users get the "Admin" role by default. You can change their specific role from
            the admin list above after promotion.
          </p>
        </div>
      )}
    </div>
  );
}
