import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Heart, Minus, Plus, ShoppingCart, Truck, ShieldCheck, Package, Star } from "lucide-react";
import { TopBar, SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { Stars } from "@/components/product/Stars";
import { ProductCard } from "@/components/product/ProductCard";
import { Spinner } from "@/components/common/Spinner";
import { getProductBySlug, listProducts } from "@/services/firebase/products";
import { listReviews, upsertReview, getMyReview } from "@/services/firebase/reviews";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useAuth } from "@/context/AuthContext";
import { formatDate, formatPrice } from "@/utils/format";

export const Route = createFileRoute("/product/$slug")({
  ssr: false,
  component: ProductPage,
});

const reviewSchema = z.object({
  rating: z.number().min(1, "Choose a rating").max(5),
  title: z.string().trim().min(2, "Add a short title").max(100),
  comment: z.string().trim().min(10, "Please write at least 10 characters").max(1000),
});
type ReviewValues = z.infer<typeof reviewSchema>;

function ProductPage() {
  const { slug } = Route.useParams();
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  const productQuery = useQuery({
    queryKey: ["product", slug],
    queryFn: () => getProductBySlug(slug),
  });

  const product = productQuery.data;
  const outOfStock = !product || product.stock <= 0;

  const relatedQuery = useQuery({
    queryKey: ["related", product?.categorySlug ?? ""],
    queryFn: () => listProducts({ categorySlug: product!.categorySlug, limit: 6 }),
    enabled: !!product?.categorySlug,
  });

  if (productQuery.isLoading) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <SiteHeader />
        <div className="mx-auto max-w-7xl px-4 py-16 text-center">
          <Spinner /> <span className="ml-2 text-sm text-muted-foreground">Loading product…</span>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Product not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The product you're looking for doesn't exist or has been removed.
          </p>
          <Link to="/shop" className="mt-4 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
            Continue shopping
          </Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const wished = has(product.id);
  const discountPct =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : 0;

  const handleAdd = async () => {
    await add(product, qty);
  };
  const buyNow = async () => {
    await add(product, qty);
    if (!user) navigate({ to: "/login", search: { redirect: "/checkout" } });
    else navigate({ to: "/checkout" });
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">Home</Link> {" / "}
          <Link to="/shop" className="hover:text-primary">Shop</Link> {" / "}
          <Link to="/shop" search={{ category: product.categorySlug }} className="hover:text-primary capitalize">
            {product.categorySlug}
          </Link>{" "}
          / <span>{product.title}</span>
        </nav>

        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
              {product.images[activeImage] ? (
                <img src={product.images[activeImage]} alt={product.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No image</div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {product.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`aspect-square overflow-hidden rounded border-2 ${
                      i === activeImage ? "border-primary" : "border-transparent"
                    }`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{product.title}</h1>
            <div className="mt-2 flex items-center gap-2">
              <Stars rating={product.rating} size="md" />
              <span className="text-sm text-muted-foreground">
                {product.rating.toFixed(1)} ({product.reviewCount} reviews)
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-3">
              <div className="text-3xl font-bold text-primary">{formatPrice(product.price)}</div>
              {product.compareAtPrice && product.compareAtPrice > product.price && (
                <>
                  <div className="text-lg text-muted-foreground line-through">
                    {formatPrice(product.compareAtPrice)}
                  </div>
                  <span className="rounded bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground">
                    -{discountPct}%
                  </span>
                </>
              )}
            </div>

            <p className="mt-4 text-sm text-muted-foreground">{product.description}</p>

            <div className="mt-6 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Availability:</span>
                {product.stock > 0 ? (
                  <span className="font-medium text-green-600">
                    In stock ({product.stock} available)
                  </span>
                ) : (
                  <span className="font-medium text-destructive">Out of stock</span>
                )}
              </div>
              {product.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-muted-foreground">Tags:</span>
                  {product.tags.map((t) => (
                    <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">{t}</span>
                  ))}
                </div>
              )}
            </div>

            {!outOfStock && (
              <div className="mt-6 flex items-center gap-3">
                <span className="text-sm font-medium">Quantity:</span>
                <div className="flex items-center rounded-md border">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="px-3 py-2 hover:bg-muted"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-sm font-medium">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
                    className="px-3 py-2 hover:bg-muted"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleAdd}
                disabled={outOfStock}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <ShoppingCart className="h-4 w-4" /> Add to Cart
              </button>
              <button
                onClick={buyNow}
                disabled={outOfStock}
                className="flex-1 rounded-md bg-accent px-6 py-3 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                Buy Now
              </button>
              <button
                onClick={() => void toggle(product)}
                aria-label="Toggle wishlist"
                className="flex h-11 w-11 items-center justify-center rounded-md border hover:bg-muted"
              >
                <Heart className={`h-5 w-5 ${wished ? "fill-destructive text-destructive" : ""}`} />
              </button>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3 border-t pt-6 text-xs">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                <span>Free delivery over $50</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <span>Secure payment</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <span>30-day returns</span>
              </div>
            </div>
          </div>
        </div>

        <ReviewsSection productId={product.id} />

        {relatedQuery.data && relatedQuery.data.length > 1 && (
          <section className="mt-12">
            <h2 className="mb-6 text-xl font-bold">Related Products</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              {relatedQuery.data
                .filter((p) => p.id !== product.id)
                .slice(0, 6)
                .map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
            </div>
          </section>
        )}
      </div>

      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}

function ReviewsSection({ productId }: { productId: string }) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const reviewsQuery = useQuery({
    queryKey: ["reviews", productId],
    queryFn: () => listReviews(productId),
  });
  const myReviewQuery = useQuery({
    queryKey: ["review", productId, user?.uid ?? "guest"],
    queryFn: () => (user ? getMyReview(productId, user.uid) : Promise.resolve(null)),
    enabled: !!user,
  });

  return (
    <section className="mt-12">
      <h2 className="mb-6 text-xl font-bold">Ratings & Reviews</h2>
      {user ? (
        <ReviewForm
          initial={myReviewQuery.data ?? null}
          onSubmit={async (values) => {
            await upsertReview({
              productId,
              userId: user.uid,
              userName: profile?.displayName ?? user.displayName ?? "Customer",
              userPhoto: profile?.photoURL ?? user.photoURL ?? null,
              ...values,
            });
            toast.success("Review submitted");
            qc.invalidateQueries({ queryKey: ["reviews", productId] });
            qc.invalidateQueries({ queryKey: ["review", productId, user.uid] });
            qc.invalidateQueries({ queryKey: ["product"] });
          }}
        />
      ) : (
        <div className="mb-6 rounded-lg border bg-card p-4 text-sm">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>{" "}
          to leave a review.
        </div>
      )}

      {reviewsQuery.isLoading ? (
        <Spinner />
      ) : reviewsQuery.data && reviewsQuery.data.length > 0 ? (
        <div className="space-y-4">
          {reviewsQuery.data.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-3">
                {r.userPhoto ? (
                  <img src={r.userPhoto} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {r.userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-sm font-semibold">{r.userName}</div>
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                  </div>
                </div>
              </div>
              <h4 className="mt-3 text-sm font-semibold">{r.title}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No reviews yet. Be the first to review!</p>
      )}
    </section>
  );
}

function ReviewForm({
  initial,
  onSubmit,
}: {
  initial: { rating: number; title: string; comment: string } | null;
  onSubmit: (v: ReviewValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      rating: initial?.rating ?? 0,
      title: initial?.title ?? "",
      comment: initial?.comment ?? "",
    },
    values: initial
      ? { rating: initial.rating, title: initial.title, comment: initial.comment }
      : undefined,
  });
  const rating = watch("rating");

  const submit = async (v: ReviewValues) => {
    try {
      await onSubmit(v);
      if (!initial) reset({ rating: 0, title: "", comment: "" });
    } catch {
      toast.error("Could not submit review");
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="mb-6 space-y-3 rounded-lg border bg-card p-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Your Rating</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setValue("rating", n, { shouldValidate: true })}
              aria-label={`${n} stars`}
            >
              <Star
                className={`h-6 w-6 ${
                  n <= rating ? "fill-accent text-accent" : "fill-muted text-muted"
                }`}
              />
            </button>
          ))}
        </div>
        {errors.rating && <p className="mt-1 text-xs text-destructive">{errors.rating.message}</p>}
      </div>
      <div>
        <input
          {...register("title")}
          placeholder="Review title"
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>}
      </div>
      <div>
        <textarea
          {...register("comment")}
          rows={3}
          placeholder="Share your thoughts about this product..."
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {errors.comment && <p className="mt-1 text-xs text-destructive">{errors.comment.message}</p>}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {isSubmitting && <Spinner />}
        {initial ? "Update Review" : "Submit Review"}
      </button>
    </form>
  );
}
