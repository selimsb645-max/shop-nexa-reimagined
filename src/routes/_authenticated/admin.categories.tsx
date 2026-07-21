import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Save } from "lucide-react";
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  listCategoriesAdmin,
  listSubcategoriesAdmin,
  updateCategory,
  updateSubcategory,
} from "@/services/firebase/adminCategories";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Spinner";
import { mapFirebaseError } from "@/utils/errors";
import type { Category, Subcategory } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/admin/categories")({
  component: CategoriesAdmin,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function CategoriesAdmin() {
  const { user } = useAuth();
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [subMap, setSubMap] = useState<Record<string, Subcategory[]>>({});
  const [newCat, setNewCat] = useState({ name: "", slug: "", image: "", order: 0 });
  const [newSub, setNewSub] = useState({ name: "", slug: "", order: 0 });

  const refresh = async () => {
    setLoading(true);
    try {
      setCats(await listCategoriesAdmin());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const loadSubs = async (catId: string) => {
    setSubMap((m) => ({ ...m, [catId]: await listSubcategoriesAdmin(catId) }));
  };

  const onAddCat = async () => {
    if (!user || !newCat.name.trim()) return;
    try {
      const slug = newCat.slug.trim() || slugify(newCat.name);
      const id = await createCategory({
        name: newCat.name.trim(),
        slug,
        image: newCat.image.trim() || null,
        order: Number(newCat.order) || 0,
      });
      await logActivity({ uid: user.uid, email: user.email }, "category.create", id, newCat.name);
      setNewCat({ name: "", slug: "", image: "", order: 0 });
      toast.success("Category created");
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onUpdateCat = async (c: Category, patch: Partial<Category>) => {
    if (!user) return;
    try {
      await updateCategory(c.id, patch);
      await logActivity({ uid: user.uid, email: user.email }, "category.update", c.id);
      toast.success("Category updated");
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onDeleteCat = async (c: Category) => {
    if (!user) return;
    if (!confirm(`Delete category "${c.name}"? Subcategories will remain unless removed separately.`))
      return;
    try {
      await deleteCategory(c.id);
      await logActivity({ uid: user.uid, email: user.email }, "category.delete", c.id, c.name);
      toast.success("Category deleted");
      await refresh();
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onAddSub = async (catId: string) => {
    if (!user || !newSub.name.trim()) return;
    try {
      const slug = newSub.slug.trim() || slugify(newSub.name);
      await createSubcategory(catId, {
        name: newSub.name.trim(),
        slug,
        order: Number(newSub.order) || 0,
      });
      await logActivity(
        { uid: user.uid, email: user.email },
        "category.create",
        `${catId}/${slug}`,
        `sub: ${newSub.name}`,
      );
      setNewSub({ name: "", slug: "", order: 0 });
      toast.success("Subcategory added");
      await loadSubs(catId);
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onUpdateSub = async (catId: string, s: Subcategory, patch: Partial<Subcategory>) => {
    if (!user) return;
    try {
      await updateSubcategory(catId, s.id, patch);
      await logActivity(
        { uid: user.uid, email: user.email },
        "category.update",
        `${catId}/${s.id}`,
      );
      toast.success("Subcategory updated");
      await loadSubs(catId);
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  const onDeleteSub = async (catId: string, s: Subcategory) => {
    if (!user) return;
    if (!confirm(`Delete subcategory "${s.name}"?`)) return;
    try {
      await deleteSubcategory(catId, s.id);
      await logActivity(
        { uid: user.uid, email: user.email },
        "category.delete",
        `${catId}/${s.id}`,
        s.name,
      );
      toast.success("Subcategory deleted");
      await loadSubs(catId);
    } catch (err) {
      toast.error(mapFirebaseError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Categories</h1>
        <p className="text-sm text-muted-foreground">Manage categories and subcategories.</p>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">Add category</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <input
            placeholder="Name"
            value={newCat.name}
            onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm md:col-span-2"
          />
          <input
            placeholder="Slug (optional)"
            value={newCat.slug}
            onChange={(e) => setNewCat({ ...newCat, slug: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="Image URL (optional)"
            value={newCat.image}
            onChange={(e) => setNewCat({ ...newCat, image: e.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Order"
              value={newCat.order}
              onChange={(e) => setNewCat({ ...newCat, order: Number(e.target.value) })}
              className="w-20 rounded-md border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={onAddCat}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border bg-background p-6 text-sm text-muted-foreground">
            <Spinner /> Loading…
          </div>
        ) : cats.length === 0 ? (
          <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
            No categories yet.
          </div>
        ) : (
          cats.map((c) => (
            <CategoryRow
              key={c.id}
              c={c}
              open={expanded === c.id}
              subs={subMap[c.id] ?? []}
              onToggle={async () => {
                if (expanded === c.id) setExpanded(null);
                else {
                  setExpanded(c.id);
                  if (!subMap[c.id]) await loadSubs(c.id);
                }
              }}
              onUpdate={(patch) => onUpdateCat(c, patch)}
              onDelete={() => onDeleteCat(c)}
              onAddSub={() => onAddSub(c.id)}
              newSub={newSub}
              setNewSub={setNewSub}
              onUpdateSub={(s, patch) => onUpdateSub(c.id, s, patch)}
              onDeleteSub={(s) => onDeleteSub(c.id, s)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface RowProps {
  c: Category;
  open: boolean;
  subs: Subcategory[];
  onToggle: () => void;
  onUpdate: (patch: Partial<Category>) => void;
  onDelete: () => void;
  onAddSub: () => void;
  newSub: { name: string; slug: string; order: number };
  setNewSub: (v: { name: string; slug: string; order: number }) => void;
  onUpdateSub: (s: Subcategory, patch: Partial<Subcategory>) => void;
  onDeleteSub: (s: Subcategory) => void;
}

function CategoryRow(p: RowProps) {
  const [name, setName] = useState(p.c.name);
  const [slug, setSlug] = useState(p.c.slug);
  const [image, setImage] = useState(p.c.image ?? "");
  const [order, setOrder] = useState(p.c.order);
  const dirty =
    name !== p.c.name ||
    slug !== p.c.slug ||
    image !== (p.c.image ?? "") ||
    order !== p.c.order;

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-32 rounded-md border bg-background px-2 py-1 text-sm"
        />
        <input
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="Image URL"
          className="flex-1 min-w-[200px] rounded-md border bg-background px-2 py-1 text-sm"
        />
        <input
          type="number"
          value={order}
          onChange={(e) => setOrder(Number(e.target.value))}
          className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
        />
        {dirty && (
          <button
            onClick={() => p.onUpdate({ name, slug, image: image || null, order })}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
          >
            <Save className="h-3 w-3" /> Save
          </button>
        )}
        <button
          onClick={p.onToggle}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          {p.open ? "Hide subs" : "Subs"}
        </button>
        <button
          onClick={p.onDelete}
          className="rounded-md border p-1.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {p.open && (
        <div className="border-t p-3 space-y-2 bg-muted/20">
          {p.subs.map((s) => (
            <SubRow key={s.id} s={s} onUpdate={p.onUpdateSub} onDelete={p.onDeleteSub} />
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              placeholder="New subcategory name"
              value={p.newSub.name}
              onChange={(e) => p.setNewSub({ ...p.newSub, name: e.target.value })}
              className="flex-1 min-w-[180px] rounded-md border bg-background px-2 py-1 text-sm"
            />
            <input
              placeholder="Slug (optional)"
              value={p.newSub.slug}
              onChange={(e) => p.setNewSub({ ...p.newSub, slug: e.target.value })}
              className="w-40 rounded-md border bg-background px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={p.newSub.order}
              onChange={(e) => p.setNewSub({ ...p.newSub, order: Number(e.target.value) })}
              className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
            />
            <button
              onClick={p.onAddSub}
              className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubRow({
  s,
  onUpdate,
  onDelete,
}: {
  s: Subcategory;
  onUpdate: (s: Subcategory, patch: Partial<Subcategory>) => void;
  onDelete: (s: Subcategory) => void;
}) {
  const [name, setName] = useState(s.name);
  const [slug, setSlug] = useState(s.slug);
  const [order, setOrder] = useState(s.order);
  const dirty = name !== s.name || slug !== s.slug || order !== s.order;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 min-w-[160px] rounded-md border bg-background px-2 py-1 text-sm"
      />
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        className="w-32 rounded-md border bg-background px-2 py-1 text-sm"
      />
      <input
        type="number"
        value={order}
        onChange={(e) => setOrder(Number(e.target.value))}
        className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
      />
      {dirty && (
        <button
          onClick={() => onUpdate(s, { name, slug, order })}
          className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
        >
          Save
        </button>
      )}
      <button
        onClick={() => onDelete(s)}
        className="rounded-md border p-1 text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
