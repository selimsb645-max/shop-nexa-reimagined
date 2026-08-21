import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Package, ChevronLeft, Loader, Save, Eye, Bold, Italic,
  List, ListOrdered, Upload, X, CheckCircle2, AlertCircle, DollarSign,
  Tag, ImagePlus,
} from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import { createSellerProduct } from "@/services/firebase/sellerProducts";
import { listCategories, listSubcategories } from "@/services/firebase/categories";
import { uploadProductImage } from "@/services/firebase/storage";
import { firebaseConfigured } from "@/services/firebase/config";
import { toast } from "sonner";
import type { Category, Subcategory } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/seller/products/new")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <AddProductPage sellerId={profile.uid} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Add Product — Shop Nexa Seller" }] }),
});

// ====================================================================
// Draft auto-save key
// ====================================================================
const DRAFT_KEY = "seller_add_product_draft";

interface DraftState {
  title: string;
  shortDescription: string;
  description: string;
  brand: string;
  categoryId: string;
  subcategoryId: string;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  tax: string;
  stock: string;
  sku: string;
  tags: string;
  images: string[];
}

const EMPTY_DRAFT: DraftState = {
  title: "", shortDescription: "", description: "", brand: "",
  categoryId: "", subcategoryId: "", price: "", compareAtPrice: "",
  costPrice: "", tax: "", stock: "", sku: "", tags: "", images: [],
};

// ====================================================================
// Main Page
// ====================================================================
function AddProductPage({ sellerId }: { sellerId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const richTextRef = useRef<HTMLDivElement>(null);

  // Form state
  const [form, setForm] = useState<DraftState>(EMPTY_DRAFT);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as DraftState;
        setForm(parsed);
        setImages(parsed.images || []);
        if (parsed.description && richTextRef.current) {
          richTextRef.current.innerHTML = parsed.description;
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Load categories
  useEffect(() => {
    if (!firebaseConfigured) return;
    listCategories().then(setCategories).catch(() => {});
  }, []);

  // Load subcategories when category changes
  useEffect(() => {
    if (!form.categoryId) { setSubcategories([]); return; }
    listSubcategories(form.categoryId).then(setSubcategories).catch(() => {});
  }, [form.categoryId]);

  // Auto-save draft to localStorage (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasData = form.title || form.shortDescription || form.description || form.price || images.length > 0;
      if (!hasData) return;
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, images }));
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      } catch { /* ignore */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [form, images]);

  // Rich text editor handlers
  const execCmd = (cmd: string, _value?: string) => {
    document.execCommand(cmd, false);
    if (richTextRef.current) {
      setForm(f => ({ ...f, description: richTextRef.current!.innerHTML }));
    }
    richTextRef.current?.focus();
  };

  const handleRichTextChange = () => {
    if (richTextRef.current) {
      setForm(f => ({ ...f, description: richTextRef.current!.innerHTML }));
    }
  };

  // Image upload
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const f of files) {
        const { url } = await uploadProductImage(sellerId, "new", f);
        uploaded.push(url);
      }
      setImages(prev => [...prev, ...uploaded]);
      setForm(f => ({ ...f, images: [...(f.images || []), ...uploaded] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
    setForm(f => ({ ...f, images: (f.images || []).filter((_, i) => i !== idx) }));
  };

  // Validation
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Product name is required";
    else if (form.title.trim().length < 2) e.title = "Name too short";
    if (!form.shortDescription.trim()) e.shortDescription = "Short description is required";
    else if (form.shortDescription.trim().length > 200) e.shortDescription = "Max 200 characters";
    if (!form.description.trim() || form.description === "<br>" || form.description === "<div><br></div>") {
      e.description = "Full description is required";
    }
    if (!form.categoryId) e.categoryId = "Category is required";
    if (!form.price || Number(form.price) <= 0) e.price = "Price must be greater than 0";
    if (form.compareAtPrice && Number(form.compareAtPrice) <= Number(form.price)) {
      e.compareAtPrice = "Sale price should be higher than regular price";
    }
    if (!form.stock || Number(form.stock) < 0) e.stock = "Stock is required";
    if (images.length === 0) e.images = "At least one product image is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Submit
  const handleSubmit = async (status: "draft" | "published") => {
    if (!validate()) {
      toast.error(t("seller.fixErrors"));
      return;
    }
    setSaving(true);
    try {
      const cat = categories.find(c => c.id === form.categoryId);
      if (!cat) { toast.error(t("seller.invalidCategory")); setSaving(false); return; }
      const sub = subcategories.find(s => s.id === form.subcategoryId);
      const slug = slugify(form.title);

      await createSellerProduct(sellerId, {
        title: form.title.trim(),
        slug,
        shortDescription: form.shortDescription.trim(),
        description: form.description,
        brand: form.brand.trim() || null,
        price: Number(form.price),
        compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
        costPrice: form.costPrice ? Number(form.costPrice) : null,
        tax: form.tax ? Number(form.tax) : 0,
        images,
        categoryId: form.categoryId,
        categorySlug: cat.slug,
        subcategoryId: sub?.id ?? null,
        subcategorySlug: sub?.slug ?? null,
        stock: Number(form.stock),
        sku: form.sku.trim() || null,
        tags: parseCsv(form.tags),
        colors: [],
        sizes: [],
        featured: false,
        status,
      });

      localStorage.removeItem(DRAFT_KEY);
      toast.success(status === "published" ? "Product published!" : "Draft saved!");
      navigate({ to: "/seller/products" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save product");
    }
    setSaving(false);
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setForm(EMPTY_DRAFT);
    setImages([]);
    if (richTextRef.current) richTextRef.current.innerHTML = "";
    toast.success(t("seller.draftCleared"));
  };

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate({ to: "/seller/products" })}
            className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#0f172a]">{t("seller.addNewProduct")}</h1>
            <p className="text-xs text-slate-500">
              {draftSaved ? "✓ Draft auto-saved" : "Fill in the product details below"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {form.title && (
            <button onClick={clearDraft}
              className="text-xs text-slate-400 hover:text-rose-500 font-medium px-3 py-2 transition-colors">
              Clear Draft
            </button>
          )}
          <button onClick={() => handleSubmit("draft")} disabled={saving}
            className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </button>
          <button onClick={() => handleSubmit("published")} disabled={saving}
            className="bg-[#f57224] hover:bg-orange-600 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Publish
          </button>
        </div>
      </div>

      {/* Main Layout: 2 columns on desktop */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: Main content (2/3) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Section 1: Basic Information */}
          <Section title="Basic Information" icon={<Package className="w-4 h-4 text-[#f57224]" />}>
            <div className="space-y-4">
              <FormField label="Product Name" required error={errors.title}>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Wireless Bluetooth Headphones"
                  className="input-field"
                />
              </FormField>

              <FormField label="Short Description" required error={errors.shortDescription}
                hint={`${form.shortDescription.length}/200`}>
                <input
                  type="text"
                  value={form.shortDescription}
                  onChange={e => setForm(f => ({ ...f, shortDescription: e.target.value.slice(0, 200) }))}
                  placeholder="Brief one-line description shown on product cards"
                  className="input-field"
                />
              </FormField>

              <FormField label="Full Description" required error={errors.description}>
                {/* Rich Text Toolbar */}
                <div className="flex items-center gap-1 mb-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
                  <RteButton onClick={() => execCmd("bold")} icon={<Bold className="w-4 h-4" />} />
                  <RteButton onClick={() => execCmd("italic")} icon={<Italic className="w-4 h-4" />} />
                  <div className="w-px h-5 bg-slate-200 mx-1" />
                  <RteButton onClick={() => execCmd("insertUnorderedList")} icon={<List className="w-4 h-4" />} />
                  <RteButton onClick={() => execCmd("insertOrderedList")} icon={<ListOrdered className="w-4 h-4" />} />
                  <div className="w-px h-5 bg-slate-200 mx-1" />
                  <RteButton onClick={() => execCmd("formatBlock", "<h3>")} label="H3" />
                  <RteButton onClick={() => execCmd("formatBlock", "<p>")} label="P" />
                </div>
                <div
                  ref={richTextRef}
                  contentEditable
                  onInput={handleRichTextChange}
                  onBlur={handleRichTextChange}
                  className="input-field min-h-[120px] max-h-[300px] overflow-y-auto prose-sm"
                  style={{ lineHeight: "1.6" }}
                  data-placeholder="Write a detailed product description..."
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField label="Brand">
                  <input
                    type="text"
                    value={form.brand}
                    onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="e.g. Sony"
                    className="input-field"
                  />
                </FormField>

                <FormField label="Category" required error={errors.categoryId}>
                  <select
                    value={form.categoryId}
                    onChange={e => setForm(f => ({ ...f, categoryId: e.target.value, subcategoryId: "" }))}
                    className="input-field"
                  >
                    <option value="">{t("seller.selectCategory")}</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Sub Category">
                  <select
                    value={form.subcategoryId}
                    onChange={e => setForm(f => ({ ...f, subcategoryId: e.target.value }))}
                    className="input-field"
                    disabled={!form.categoryId}
                  >
                    <option value="">{t("seller.none")}</option>
                    {subcategories.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </FormField>
              </div>
            </div>
          </Section>

          {/* Section 2: Pricing */}
          <Section title="Pricing" icon={<DollarSign className="w-4 h-4 text-[#f57224]" />}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Regular Price" required error={errors.price}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">৳</span>
                    <input
                      type="number"
                      value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                      placeholder="0.00"
                      className="input-field pl-8"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </FormField>

                <FormField label="Sale Price" error={errors.compareAtPrice}
                  hint="Optional — shown as discounted">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">৳</span>
                    <input
                      type="number"
                      value={form.compareAtPrice}
                      onChange={e => setForm(f => ({ ...f, compareAtPrice: e.target.value }))}
                      placeholder="0.00"
                      className="input-field pl-8"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Cost Price" hint="Visible only to you & admin">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">৳</span>
                    <input
                      type="number"
                      value={form.costPrice}
                      onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))}
                      placeholder="0.00"
                      className="input-field pl-8"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </FormField>

                <FormField label="Tax (%)" hint="0-100">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                    <input
                      type="number"
                      value={form.tax}
                      onChange={e => setForm(f => ({ ...f, tax: e.target.value }))}
                      placeholder="0"
                      className="input-field pl-8"
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </div>
                </FormField>
              </div>

              {/* Price Summary */}
              {form.price && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-xs font-bold text-slate-600 mb-2">{t("seller.priceSummary")}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t("seller.regularPrice")}</span>
                      <span className="font-semibold text-slate-700">৳{Number(form.price || 0).toFixed(2)}</span>
                    </div>
                    {form.compareAtPrice && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Sale Price:</span>
                        <span className="font-semibold text-slate-700">৳{Number(form.compareAtPrice).toFixed(2)}</span>
                      </div>
                    )}
                    {form.compareAtPrice && Number(form.compareAtPrice) > Number(form.price) && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Discount:</span>
                        <span className="font-semibold text-[#f57224]">
                          ৳{(Number(form.compareAtPrice) - Number(form.price)).toFixed(2)}
                          {" ("}{((1 - Number(form.price) / Number(form.compareAtPrice)) * 100).toFixed(0)}% off{")"}
                        </span>
                      </div>
                    )}
                    {form.tax && Number(form.tax) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tax ({form.tax}%):</span>
                        <span className="font-semibold text-slate-700">
                          ৳{(Number(form.price || 0) * Number(form.tax) / 100).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Section 3: Inventory */}
          <Section title="Inventory & SKU" icon={<Tag className="w-4 h-4 text-[#f57224]" />}>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Stock Quantity" required error={errors.stock}>
                <input
                  type="number"
                  value={form.stock}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                  placeholder="0"
                  className="input-field"
                  min="0"
                />
              </FormField>
              <FormField label="SKU" hint="Optional product code">
                <input
                  type="text"
                  value={form.sku}
                  onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  placeholder="e.g. WBH-001"
                  className="input-field"
                />
              </FormField>
            </div>
            <FormField label="Tags" hint="Comma separated">
              <input
                type="text"
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="electronics, audio, wireless"
                className="input-field"
              />
            </FormField>
          </Section>
        </div>

        {/* Right: Images + Preview (1/3) */}
        <div className="space-y-5">
          {/* Image Upload */}
          <Section title="Product Images" icon={<ImagePlus className="w-4 h-4 text-[#f57224]" />}>
            {errors.images && <p className="text-xs text-rose-500 mb-2">{errors.images}</p>}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-slate-200 hover:border-[#f57224] rounded-xl py-8 flex flex-col items-center gap-2 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader className="w-6 h-6 animate-spin text-slate-300" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-slate-300" />
                  <span className="text-sm text-slate-500 font-medium">Click to upload</span>
                  <span className="text-xs text-slate-400">PNG, JPG up to 5MB</span>
                </>
              )}
            </button>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {images.map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-0 left-0 right-0 bg-[#0f172a] text-white text-[9px] font-bold py-0.5 text-center">
                        Cover
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Live Preview */}
          <Section title="Preview" icon={<Eye className="w-4 h-4 text-[#f57224]" />}>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {images[0] ? (
                <img src={images[0]} alt="" className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-slate-100 flex items-center justify-center">
                  <Package className="w-10 h-10 text-slate-200" />
                </div>
              )}
              <div className="p-3">
                <p className="text-sm font-bold text-[#0f172a] line-clamp-2">
                  {form.title || "Product Name"}
                </p>
                <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                  {form.shortDescription || "Short description"}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-base font-bold text-[#f57224]">
                    ৳{Number(form.price || 0).toFixed(0)}
                  </span>
                  {form.compareAtPrice && Number(form.compareAtPrice) > Number(form.price) && (
                    <span className="text-xs text-slate-400 line-through">
                      ৳{Number(form.compareAtPrice).toFixed(0)}
                    </span>
                  )}
                </div>
                {form.brand && (
                  <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">
                    {form.brand}
                  </span>
                )}
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// Shared Components
// ====================================================================
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">{icon}</div>
        <h3 className="text-sm font-bold text-[#0f172a]">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FormField({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-slate-700">
          {label}{required && <span className="text-[#f57224] ml-0.5">*</span>}
        </label>
        {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />{error}
      </p>}
    </div>
  );
}

function RteButton({ onClick, icon, label }: {
  onClick: () => void; icon?: React.ReactNode; label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-1.5 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors text-xs font-bold flex items-center"
    >
      {icon || label}
    </button>
  );
}

// ====================================================================
// Helpers
// ====================================================================
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

function parseCsv(s: string): string[] {
  return s.split(",").map(t => t.trim()).filter(Boolean);
}
