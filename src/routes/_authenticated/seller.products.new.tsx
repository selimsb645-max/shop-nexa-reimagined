import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { SellerGate } from "@/components/seller/SellerGate";
import { ProductForm, parseCsv } from "@/components/seller/ProductForm";
import { createSellerProduct } from "@/services/firebase/sellerProducts";
import { mapFirebaseError } from "@/utils/errors";

export const Route = createFileRoute("/_authenticated/seller/products/new")({
  component: () => (
    <SellerGate>{(profile) => <NewProduct sellerId={profile.uid} />}</SellerGate>
  ),
});

function NewProduct({ sellerId }: { sellerId: string }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add product</h1>
        <p className="text-sm text-muted-foreground">Create a new listing for your shop.</p>
      </div>
      <ProductForm
        sellerId={sellerId}
        submitLabel="Create product"
        onSubmit={async (v) => {
          try {
            const compareAt =
              v.compareAtPrice === "" || v.compareAtPrice == null
                ? null
                : Number(v.compareAtPrice);
            await createSellerProduct(sellerId, {
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
            toast.success("Product created");
            navigate({ to: "/seller/products" });
          } catch (err) {
            toast.error(mapFirebaseError(err));
          }
        }}
      />
    </div>
  );
}
