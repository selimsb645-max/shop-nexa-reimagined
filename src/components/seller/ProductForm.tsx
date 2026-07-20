import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ImageUp, Loader2, X } from "lucide-react";
import { productSchema, type ProductFormValues } from "@/utils/validation";
import { listCategories, listSubcategories } from "@/services/firebase/categories";
import type { Category, Product, Subcategory } from "@/types/commerce";
import { uploadProductImage } from "@/services/firebase/storage";
import { Spinner } from "@/components/common/Spinner";

interface Props {
  sellerId: string;
  initial?: Product | null;
  onSubmit: (values: ProductFormValues & { images: string[] }) => Promise<void>;
  submitLabel: string;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function ProductForm({ sellerId, initial, onSubmit, submitLabel }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const defaultValues: ProductFormValues = useMemo(
    () => ({
      title: initial?.title ?? "",
      slug: initial?.slug ?? "",
      description: initial?.description ?? "",
      price: initial?.price ?? 0,
      compareAtPrice: initial?.compareAtPrice ?? "",
      categoryId: initial?.categoryId ?? "",
      categorySlug: initial?.categorySlug ?? "",
      subcategoryId: initial?.subcategoryId ?? "",
      subcategorySlug: initial?.subcategorySlug ?? "",
      stock: initial?.stock ?? 0,
      sku: initial?.sku ?? "",
      tags: initial?.tags?.join(", ") ?? "",
      colors: initial?.colors?.join(", ") ?? "",
      sizes: initial?.sizes?.join(", ") ?? "",
      featured: initial?.featured ?? false,
      status: initial?.status ?? "draft",
    }),
    [initial],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues,
  });

  useEffect(() => {
    void listCategories().then(setCategories);
  }, []);

  const categoryId = watch("categoryId");
  useEffect(() => {
    if (!categoryId) {
      setSubcategories([]);
      return;
    }
    void listSubcategories(categoryId).then(setSubcategories);
  }, [categoryId]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const productKey = initial?.id ?? "new";
      const uploaded: string[] = [];
      for (const f of files) {
        const { url } = await uploadProductImage(sellerId, productKey, f);
        uploaded.push(url);
      }
      setImages((prev) => [...prev, ...uploaded]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (values: ProductFormValues) => {
    if (!images.length) {
      toast.error("Add at least one product image");
      return;
    }
    const cat = categories.find((c) => c.id === values.categoryId);
    if (!cat) {
      toast.error("Please choose a valid category");
      return;
    }
    const sub = subcategories.find((s) => s.id === values.subcategoryId);
    await onSubmit({
      ...values,
      categorySlug: cat.slug,
      subcategoryId: sub?.id ?? null,
      subcategorySlug: sub?.slug ?? null,
      images,
    });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6" noValidate>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4 rounded-lg border bg-background p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Basic info</h2>
          <Field label="Title" error={errors.title?.message}>
            <input
              {...register("title", {
                onChange: (e) => {
                  if (!initial) setValue("slug", slugify(e.target.value));
                },
              })}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Slug (URL)" error={errors.slug?.message} hint="Used in product URL">
            <input
              {...register("slug")}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Description" error={errors.description?.message}>
            <textarea
              rows={5}
              {...register("description")}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" error={errors.categoryId?.message}>
              <select
                {...register("categoryId")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subcategory" error={errors.subcategoryId?.message}>
              <select
                {...register("subcategoryId")}
                disabled={!subcategories.length}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">None</option>
                {subcategories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border bg-background p-5">
            <h2 className="text-sm font-semibold text-muted-foreground">Status</h2>
            <select
              {...register("status")}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("featured")} /> Featured product
            </label>
          </div>
          <div className="space-y-3 rounded-lg border bg-background p-5">
            <h2 className="text-sm font-semibold text-muted-foreground">Pricing</h2>
            <Field label="Price" error={errors.price?.message}>
              <input
                type="number"
                step="0.01"
                {...register("price")}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Compare-at price" hint="Optional, shows a strikethrough">
              <input
                type="number"
                step="0.01"
                {...register("compareAtPrice")}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-background p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Images</h2>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
            Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onFile}
          />
        </div>
        {images.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No images uploaded yet. Add at least one image.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((url, i) => (
              <div key={url} className="group relative aspect-square overflow-hidden rounded-md border">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute right-1 top-1 hidden h-7 w-7 items-center justify-center rounded-md bg-background/90 text-destructive shadow group-hover:flex"
                >
                  <X className="h-4 w-4" />
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Main
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border bg-background p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Inventory</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stock quantity" error={errors.stock?.message}>
              <input
                type="number"
                min={0}
                {...register("stock")}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="SKU" error={errors.sku?.message}>
              <input
                {...register("sku")}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border bg-background p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Variants & tags</h2>
          <Field label="Colors" hint="Comma-separated (e.g. Red, Blue)">
            <input
              {...register("colors")}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Sizes" hint="Comma-separated (e.g. S, M, L)">
            <input
              {...register("sizes")}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Tags" hint="Comma-separated">
            <input
              {...register("tags")}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            const v = getValues();
            void submit({ ...v, status: "draft" });
          }}
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
        >
          Save as draft
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting && <Spinner />} {submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function parseCsv(v: string | undefined | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
