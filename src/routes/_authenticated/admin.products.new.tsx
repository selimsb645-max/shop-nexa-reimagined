import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ProductForm, parseCsv } from "@/components/seller/ProductForm";
import { createProductAdmin } from "@/services/firebase/adminProducts";
import { logActivity } from "@/services/firebase/adminLogs";
import { useAuth } from "@/context/AuthContext";
import { mapFirebaseError } from "@/utils/errors";
import { Spinner } from "@/components/common/Spinner";

export const Route = createFileRoute("/_authenticated/admin/products/new")({
  component: NewProductAdmin,
});

function NewProductAdmin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user) return <Spinner />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add product</h1>
        <p className="text-sm text-muted-foreground">
          Products created by admin are pre-approved.
        </p>
      </div>
      <ProductForm
        sellerId={user.uid}
        submitLabel="Create product"
        onSubmit={async (v) => {
          try {
            const compareAt =
              v.compareAtPrice === "" || v.compareAtPrice == null
                ? null
                : Number(v.compareAtPrice);
            const id = await createProductAdmin({
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
            await logActivity({ uid: user.uid, email: user.email }, "product.create", id);
            toast.success("Product created");
            navigate({ to: "/admin/products" });
          } catch (err) {
            toast.error(mapFirebaseError(err));
          }
        }}
      />
    </div>
  );
}
