import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ProductForm, parseCsv } from "@/components/seller/ProductForm";
import {
  getProductAdmin,
  updateProductAdmin,
  slugTaken,
} from "@/services/firebase/adminProducts";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { mapFirebaseError } from "@/utils/errors";
import { Spinner } from "@/components/common/Spinner";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/admin/products/$id/edit")({
  component: EditProductAdmin,
});

function EditProductAdmin() {
  const { user } = useAuth();
  const { id } = useParams({ from: "/_authenticated/admin/products/$id/edit" });
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await getProductAdmin(id);
        if (!p) setNotFound(true);
        else setProduct(p);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading || !user) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
        <Spinner /> Loading product…
      </div>
    );
  }
  if (notFound || !product) {
    return (
      <div className="rounded-lg border bg-background p-8 text-sm text-muted-foreground">
        This product doesn't exist.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Edit product</h1>
        <p className="text-sm text-muted-foreground">{product.title}</p>
      </div>
      <ProductForm
        sellerId={product.sellerId || user.uid}
        initial={product}
        submitLabel="Save changes"
        onSubmit={async (v) => {
          try {
            const compareAt =
              v.compareAtPrice === "" || v.compareAtPrice == null
                ? null
                : Number(v.compareAtPrice);
            if (v.slug !== product.slug && (await slugTaken(v.slug, product.id))) {
              throw new Error("A product with this slug already exists.");
            }
            await updateProductAdmin(product.id, {
              title: v.title,
              slug: v.slug,
              description: v.description,
              price: Number(v.price),
              compareAtPrice: compareAt,
              images: v.images,
              categoryId: v.categoryId,
              categorySlug: v.categorySlug,
              subcategoryId: v.subcategoryId ?? null,
              subcategorySlug: v.subcategorySlug ?? null,
              stock: Number(v.stock),
              sku: v.sku ? v.sku : null,
              tags: parseCsv(v.tags),
              colors: parseCsv(v.colors),
              sizes: parseCsv(v.sizes),
              featured: Boolean(v.featured),
              status: v.status,
            });
            await logActivity(
              { uid: user.uid, email: user.email },
              "product.update",
              product.id,
            );
            toast.success("Product updated");
            navigate({ to: "/admin/products" });
          } catch (err) {
            toast.error(mapFirebaseError(err));
          }
        }}
      />
    </div>
  );
}
