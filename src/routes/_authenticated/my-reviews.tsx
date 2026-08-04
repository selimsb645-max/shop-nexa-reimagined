import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star, Loader, ArrowLeft, Star as StarIcon } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { useAuth } from "@/context/AuthContext";
import { listReviews } from "@/services/firebase/reviews";
import { listAllProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import type { Product } from "@/types/commerce";
import type { Review } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/my-reviews")({
  ssr: false,
  component: MyReviewsPage,
  head: () => ({ meta: [{ title: "My Reviews — ShopNexa" }] }),
});

function MyReviewsPage() {
  const { user } = useAuth();
  const { data: products, isLoading } = useQuery({
    queryKey: ["products", "all"],
    queryFn: listAllProducts,
    enabled: firebaseConfigured,
  });

  // Find reviews by current user across all products
  const reviewsQuery = useQuery({
    queryKey: ["myReviews", user?.uid],
    queryFn: async () => {
      const allReviews: { product: Product; review: Review }[] = [];
      for (const product of products ?? []) {
        const reviews = await listReviews(product.id);
        const myReview = reviews.find((r) => r.userId === user!.uid);
        if (myReview) {
          allReviews.push({ product, review: myReview });
        }
      }
      return allReviews;
    },
    enabled: !!user && firebaseConfigured && !!products,
  });

  const myReviews = reviewsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/account" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Star className="h-6 w-6 text-primary" />
            My Reviews
          </h1>
        </div>

        {isLoading || reviewsQuery.isLoading ? (
          <div className="py-20 text-center">
            <Loader className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : myReviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/30 py-20 text-center">
            <Star className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold">No reviews yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reviews you write will appear here
            </p>
            <Link
              to="/shop"
              className="mt-4 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myReviews.map(({ product, review }) => (
              <div key={review.id} className="rounded-2xl border bg-background p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <Link to="/product/$slug" params={{ slug: product.slug }}>
                    <img
                      src={product.images[0] ?? ""}
                      alt={product.title}
                      className="h-16 w-16 shrink-0 rounded-xl object-cover"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/product/$slug"
                      params={{ slug: product.slug }}
                      className="block truncate text-sm font-semibold hover:text-primary"
                    >
                      {product.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <StarIcon
                          key={i}
                          className={`h-4 w-4 ${
                            i < review.rating ? "fill-orange-400 text-orange-400" : "text-muted-foreground/30"
                          }`}
                        />
                      ))}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {review.title && (
                      <p className="mt-1 text-sm font-medium">{review.title}</p>
                    )}
                    {review.comment && (
                      <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}
