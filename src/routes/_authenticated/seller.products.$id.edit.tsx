import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SellerGate } from "@/components/seller/SellerGate";
import { ProductForm, parseCsv } from "@/components/seller/ProductForm";
import { Spinner } from "@/components/common/Spinner";
import { getSellerProduct, updateSellerProduct } from "@/services/firebase/sellerProducts";
import { mapFirebaseError } from "@/utils/errors";
import type { Product } from "@/types/commerce";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/seller/products/$id/edit")({
  component: () => <SellerGate>{(profile) => <EditProduct sellerId={profile.uid} />}</SellerGate>,
});

function EditProduct({ sellerId }: { sellerId: string }) {
  const { t } = useI18n();
  const { id } = useParams({ from: "/_authenticated/seller/products/$id/edit" });
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getSellerProduct(sellerId, id);
        if (cancelled) return;
        if (!p) setNotFound(true);
        else setProduct(p);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId, id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
        <Spinner /> Loading product...
      </div>
    );
  }
  if (notFound || !product) {
    return (
      <div className="rounded-lg border bg-background p-8 text-sm text-muted-foreground">
        This product doesn't exist or you don't have access to it.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("seller.editProduct")}</h1>
        <p className="text-sm text-muted-foreground">{product.title}</p>
      </div>
      <ProductForm
        sellerId={sellerId}
        initial={product}
        submitLabel="Save changes"
        onSubmit={async (v) => {
          try {
            const compareAt =
              v.compareAtPrice === "" || v.compareAtPrice == null ? null : Number(v.compareAtPrice);
            await updateSellerProduct(sellerId, product.id, {
              title: v.title,
              slug: v.slug,
              shortDescription: v.shortDescription ?? "",
              description: v.description,
              brand: v.brand ? v.brand : null,
              price: Number(v.price),
              compareAtPrice: compareAt,
              costPrice: v.costPrice ? Number(v.costPrice) : null,
              tax: v.tax ? Number(v.tax) : 0,
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
            toast.success(t("seller.productUpdated"));
            navigate({ to: "/seller/products" });
          } catch (err) {
            toast.error(mapFirebaseError(err));
          }
        }}
      />
    </div>
  );
}
