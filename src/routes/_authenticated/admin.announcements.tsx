import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Megaphone,
  Plus,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  X,
  Loader2,
  Calendar,
  AlertCircle,
} from "lucide-react";
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  subscribeAnnouncements,
  validateAnnouncement,
  isAnnouncementActive,
  type AnnouncementInput,
} from "@/services/firebase/adminAnnouncements";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { mapFirebaseError } from "@/utils/errors";
import type { Announcement, AnnouncementType, AnnouncementPriority } from "@/types/admin";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/announcements")({
  component: AnnouncementsAdmin,
});

const GRADIENTS = [
  "from-orange-500 to-red-500",
  "from-blue-500 to-indigo-600",
  "from-purple-500 to-pink-600",
  "from-green-500 to-teal-600",
  "from-gray-600 to-gray-800",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-blue-600",
  "from-rose-500 to-red-600",
];

const ICONS = ["Zap", "Store", "Sparkles", "Gift", "AlertCircle", "Megaphone", "Star", "Heart"];

const TYPES: AnnouncementType[] = ["promo", "info", "system", "event"];
const PRIORITIES: AnnouncementPriority[] = ["low", "normal", "high", "urgent"];

const emptyForm: AnnouncementInput = {
  title: "",
  message: "",
  type: "info",
  priority: "normal",
  gradient: "from-blue-500 to-indigo-600",
  icon: "Megaphone",
  ctaLabel: null,
  ctaLink: null,
  published: false,
  startTime: 0,
  endTime: 0,
  order: 0,
};

function AnnouncementsAdmin() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnouncementInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Use real-time listener
    const unsub = subscribeAnnouncements((items) => {
      setAnnouncements(items);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
  };

  const onEdit = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title,
      message: a.message,
      type: a.type,
      priority: a.priority,
      gradient: a.gradient,
      icon: a.icon,
      ctaLabel: a.ctaLabel,
      ctaLink: a.ctaLink,
      published: a.published,
      startTime: a.startTime,
      endTime: a.endTime,
      order: a.order,
    });
    setShowForm(true);
  };

  const onSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const validation = validateAnnouncement(form);
      if (!validation.valid) {
        toast.error(validation.error);
        setSaving(false);
        return;
      }

      if (editing) {
        await updateAnnouncement(editing.id, form);
        await logActivity(
          { uid: user.uid, email: user.email },
          "announcement.update",
          editing.id,
          form.title,
        );
        toast.success("Announcement updated");
      } else {
        const id = await createAnnouncement(form, user.uid);
        await logActivity(
          { uid: user.uid, email: user.email },
          "announcement.create",
          id,
          form.title,
        );
        toast.success("Announcement created");
      }
      resetForm();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    } finally {
      setSaving(false);
    }
  };

  const onTogglePublish = async (a: Announcement) => {
    if (!user) return;
    try {
      await updateAnnouncement(a.id, { published: !a.published });
      await logActivity(
        { uid: user.uid, email: user.email },
        "announcement.update",
        a.id,
        `${a.published ? "Unpublished" : "Published"}: ${a.title}`,
      );
      toast.success(a.published ? "Unpublished" : "Published");
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onDelete = async (a: Announcement) => {
    if (!user) return;
    if (!confirm(`Delete announcement "${a.title}"?`)) return;
    try {
      await deleteAnnouncement(a.id);
      await logActivity({ uid: user.uid, email: user.email }, "announcement.delete", a.id, a.title);
      toast.success("Announcement deleted");
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const formatSchedule = (a: Announcement) => {
    if (a.startTime === 0 && a.endTime === 0) return "Always active";
    const parts: string[] = [];
    if (a.startTime > 0) parts.push(`From: ${new Date(a.startTime).toLocaleDateString()}`);
    if (a.endTime > 0) parts.push(`Until: ${new Date(a.endTime).toLocaleDateString()}`);
    return parts.join(" • ");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6" /> Announcements
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage dynamic announcements for customers.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setForm(emptyForm);
              setEditing(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Announcement
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {editing ? "Edit Announcement" : "New Announcement"}
            </h2>
            <button onClick={resetForm} className="rounded-md p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              maxLength={200}
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AnnouncementType })}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: e.target.value as AnnouncementPriority })
              }
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Display order (lower = first)"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <textarea
            placeholder="Message content"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={3}
            maxLength={500}
          />

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Gradient style
              </label>
              <select
                value={form.gradient}
                onChange={(e) => setForm({ ...form, gradient: e.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {GRADIENTS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Icon</label>
              <select
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {ICONS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              placeholder="CTA label (e.g. Shop Now)"
              value={form.ctaLabel ?? ""}
              onChange={(e) => setForm({ ...form, ctaLabel: e.target.value || null })}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="CTA link (e.g. /shop)"
              value={form.ctaLink ?? ""}
              onChange={(e) => setForm({ ...form, ctaLink: e.target.value || null })}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Start time (leave empty = immediate)
              </label>
              <input
                type="datetime-local"
                value={form.startTime ? new Date(form.startTime).toISOString().slice(0, 16) : ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    startTime: e.target.value ? new Date(e.target.value).getTime() : 0,
                  })
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                End time (leave empty = never expires)
              </label>
              <input
                type="datetime-local"
                value={form.endTime ? new Date(form.endTime).toISOString().slice(0, 16) : ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    endTime: e.target.value ? new Date(e.target.value).getTime() : 0,
                  })
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm({ ...form, published: e.target.checked })}
              />
              Published
            </label>
            <button
              onClick={onSave}
              disabled={saving}
              className="ml-auto flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? "Save Changes" : "Create Announcement"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading announcements…
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          No announcements yet. Click "New Announcement" to create one.
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const active = isAnnouncementActive(a);
            return (
              <div
                key={a.id}
                className={`rounded-lg border bg-background p-4 ${active ? "border-emerald-500/30" : ""}`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-r ${a.gradient} text-white`}
                  >
                    <Megaphone className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{a.title}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          a.published
                            ? active
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-amber-500/10 text-amber-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {a.published ? (active ? "Active" : "Scheduled/Expired") : "Draft"}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                        {a.type}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                        {a.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{a.message}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {formatSchedule(a)}
                      </span>
                      <span>Order: {a.order}</span>
                      {a.ctaLabel && (
                        <span>
                          CTA: {a.ctaLabel} → {a.ctaLink}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => onTogglePublish(a)}
                        className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        {a.published ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        {a.published ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        onClick={() => onEdit(a)}
                        className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => onDelete(a)}
                        className="ml-auto rounded-md border p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
