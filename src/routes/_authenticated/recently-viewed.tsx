import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { Spinner } from "@/components/common/Spinner";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { getProductById } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { formatPrice } from "@/utils/format";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/recently-viewed")({
  ssr: false,
  component: RecentlyViewedPage,
  head: () => ({
    meta: [
      { title: "Recently Viewed — Shop Nexa" },
      { name: "description", content: "Products you recently viewed on Shop Nexa." },
      { property: "og:title", content: "Recently Viewed — Shop Nexa" },
      { property: "og:description", content: "Products you recently viewed on Shop Nexa." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function RecentlyViewedPage() {
  const { ids } = useRecentlyViewed();

  const { data: products, isLoading } = useQuery({
    queryKey: ["recently-viewed", ids],
    queryFn: async () => {
      const results = await Promise.all(ids.map((id) => getProductById(id).catch(() => null)));
      return results.filter((p): p is Product => Boolean(p));
    },
    enabled: firebaseConfigured && ids.length > 0,
  });

  return (
    <ServicePageLayout title="Recently Viewed" subtitle="Products you've explored">
      <div className="space-y-4">
        {ids.length === 0 ? (
          <EmptyState />
        ) : isLoading ? (
          <div className="py-20 text-center"><Spinner /></div>
        ) : !products || products.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <Link
                key={p.id}
                to="/product/$slug"
                params={{ slug: p.slug }}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md active:scale-[0.99]"
              >
                <img src={p.images?.[0]} alt={p.title} className="aspect-square w-full object-cover" />
                <div className="p-3">
                  <h2 className="line-clamp-2 text-xs font-semibold text-gray-800">{p.title}</h2>
                  <div className="mt-1 text-sm font-bold text-orange-500">{formatPrice(p.price)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>


    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-orange-50 text-orange-500">
        <Eye className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-base font-bold text-gray-800">Nothing viewed yet</h2>
      <p className="mt-1 max-w-xs text-xs text-gray-500">Products you open will show up here for quick access.</p>
      <Link to="/shop" className="mt-4 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600 active:scale-95">
        Browse Products
      </Link>
    </ServicePageLayout>
  );
}