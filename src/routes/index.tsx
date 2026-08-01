import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles, ArrowRight,
  Shirt, Smartphone, Apple, Sofa, Headphones, Gamepad2, Baby,
  Tag, Truck, ShieldCheck, Package, Headset, Award,
  TrendingUp, Star, Trophy, Wand2, History,
} from "lucide-react";
import { useMemo } from "react";
import dealGrocery from "@/assets/deal-grocery.jpg";
import dealElectronics from "@/assets/deal-electronics.jpg";
import dealFashion from "@/assets/deal-fashion.jpg";
import blog1 from "@/assets/blog-1.jpg";
import blog2 from "@/assets/blog-2.jpg";
import blog3 from "@/assets/blog-3.jpg";
import blog4 from "@/assets/blog-4.jpg";
import { SiteHeader, TopBar } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { PromoCarousel } from "@/components/home/PromoCarousel";
import { FlashSale } from "@/components/home/FlashSale";
import { ProductRow } from "@/components/home/ProductRow";
import { listCategories } from "@/services/firebase/categories";
import { listProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import type { Product } from "@/types/commerce";

export const Route = createFileRoute("/")({
  component: Index,
});

const features = [
  { icon: Truck, title: "Free Delivery", desc: "On orders over $50" },
  { icon: ShieldCheck, title: "Secure Payment", desc: "100% secure payment" },
  { icon: Package, title: "Easy Returns", desc: "30 days return policy" },
  { icon: Headset, title: "24/7 Support", desc: "Dedicated support" },
  { icon: Award, title: "Best Quality", desc: "Top quality products" },
];

const blogs = [
  { title: "10 Smart Shopping Tips to Save More Money", date: "May 15, 2024", img: blog1 },
  { title: "New Arrivals You Don't Want to Miss", date: "May 12, 2024", img: blog2 },
  { title: "Top 5 Must-Have Gadgets in 2024", date: "May 10, 2024", img: blog3 },
  { title: "How We Ensure Fast and Safe Delivery", date: "May 8, 2024", img: blog4 },
];

const CATEGORY_ICONS: Record<string, { icon: typeof Shirt; color: string }> = {
  fashion: { icon: Shirt, color: "bg-blue-100 text-blue-600" },
  electronics: { icon: Smartphone, color: "bg-indigo-100 text-indigo-600" },
  grocery: { icon: Apple, color: "bg-green-100 text-green-600" },
  beauty: { icon: Sparkles, color: "bg-pink-100 text-pink-600" },
  "home-kitchen": { icon: Sofa, color: "bg-orange-100 text-orange-600" },
  accessories: { icon: Headphones, color: "bg-purple-100 text-purple-600" },
  gaming: { icon: Gamepad2, color: "bg-red-100 text-red-600" },
  "baby-kids": { icon: Baby, color: "bg-yellow-100 text-yellow-600" },
};

function Index() {
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
    enabled: firebaseConfigured,
  });
  const featuredQuery = useQuery({
    queryKey: ["products", "featured"],
    queryFn: () => listProducts({ featured: true, limit: 12 }),
    enabled: firebaseConfigured,
  });
  const newestQuery = useQuery({
    queryKey: ["products", "newest"],
    queryFn: () => listProducts({ sort: "newest", limit: 12 }),
    enabled: firebaseConfigured,
  });
  const topRatedQuery = useQuery({
    queryKey: ["products", "rating"],
    queryFn: () => listProducts({ sort: "rating", limit: 12 }),
    enabled: firebaseConfigured,
  });

  const { ids: recentIds } = useRecentlyViewed();
  const pool: Product[] = useMemo(() => {
    const map = new Map<string, Product>();
    [...(featuredQuery.data ?? []), ...(newestQuery.data ?? []), ...(topRatedQuery.data ?? [])]
      .forEach((p) => map.set(p.id, p));
    return Array.from(map.values());
  }, [featuredQuery.data, newestQuery.data, topRatedQuery.data]);

  const recent = useMemo(() => {
    const byId = new Map(pool.map((p) => [p.id, p]));
    return recentIds.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
  }, [recentIds, pool]);

  // Recommended: highest rated among featured that haven't been recently viewed.
  const recommended = useMemo(() => {
    const recentSet = new Set(recentIds);
    return [...pool]
      .filter((p) => !recentSet.has(p.id))
      .sort((a, b) => b.rating * b.reviewCount - a.rating * a.reviewCount)
      .slice(0, 12);
  }, [pool, recentIds]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <SiteHeader />

      <PromoCarousel />

      {/* Categories */}
      <section id="categories" className="mx-auto max-w-7xl px-3 py-5 md:px-4 md:py-6">
        <div className="mb-3 flex items-center justify-between md:mb-4">
          <h2 className="text-lg font-bold md:text-2xl">Shop by Category</h2>
          <Link to="/shop" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View All <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {categoriesQuery.isLoading ? (
          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-4 md:gap-3 lg:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-[104px] rounded-2xl md:h-28" />
            ))}
          </div>
        ) : categoriesQuery.data && categoriesQuery.data.length > 0 ? (
          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-4 md:gap-3 lg:grid-cols-8">
            {categoriesQuery.data.map((c, idx) => {
              const cfg = CATEGORY_ICONS[c.slug] ?? { icon: Tag, color: "bg-primary/10 text-primary" };
              const Icon = cfg.icon;
              return (
                <Link
                  key={c.id}
                  to="/shop"
                  search={{ category: c.slug }}
                  style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                  className="group flex animate-fade-up flex-col items-center justify-center rounded-2xl border bg-card p-2.5 transition duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-md active:scale-95 md:p-3"
                >
                  <div className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full ${cfg.color} transition group-hover:scale-110 md:h-14 md:w-14`}>
                    <Icon className="h-6 w-6 md:h-7 md:w-7" />
                  </div>
                  <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight md:text-sm">{c.name}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Categories will appear here once added by the admin.
          </div>
        )}
      </section>


      <FlashSale products={featuredQuery.data} loading={featuredQuery.isLoading} />

      <ProductRow
        title="Trending Products"
        icon={TrendingUp}
        accent="bg-destructive/10 text-destructive"
        products={topRatedQuery.data}
        loading={topRatedQuery.isLoading}
        emptyHint="Trending products will appear here once the store is stocked."
      />

      <ProductRow
        title="New Arrivals"
        icon={Sparkles}
        accent="bg-accent/15 text-accent"
        products={newestQuery.data}
        loading={newestQuery.isLoading}
      />

      <ProductRow
        title="Best Sellers"
        icon={Trophy}
        accent="bg-primary/10 text-primary"
        products={featuredQuery.data}
        loading={featuredQuery.isLoading}
      />

      <ProductRow
        title="Recommended For You"
        icon={Wand2}
        accent="bg-green-100 text-green-600"
        products={recommended}
        loading={featuredQuery.isLoading || topRatedQuery.isLoading}
      />

      {recent.length > 0 && (
        <ProductRow
          title="Recently Viewed"
          icon={History}
          accent="bg-muted text-foreground"
          products={recent}
          loading={false}
        />
      )}

      {/* Deal banners */}
      <section className="mx-auto max-w-7xl px-3 py-5 md:px-4 md:py-6">
        <div className="grid gap-3 md:grid-cols-3 md:gap-4">
          <div className="relative min-h-[136px] overflow-hidden rounded-2xl bg-green-50 p-5 md:p-6">
            <div className="relative z-10 max-w-[55%]">
              <div className="text-xs font-medium text-green-700 md:text-sm">Super Value Deals</div>
              <div className="mt-1 text-xl font-bold text-green-800 md:text-2xl">Up to 50% Off</div>
              <div className="mt-1 text-xs text-green-700 md:text-sm">On Grocery Items</div>
              <Link to="/shop" search={{ category: "grocery" }} className="ripple mt-3 inline-flex min-h-10 items-center rounded-xl bg-green-600 px-4 text-xs font-semibold text-white hover:bg-green-700 md:mt-4">Shop Now</Link>
            </div>
            <img src={dealGrocery} alt="Grocery deals" loading="lazy" decoding="async" className="absolute right-0 top-0 h-full w-1/2 object-cover" />
          </div>
          <div className="relative min-h-[136px] overflow-hidden rounded-2xl bg-blue-50 p-5 md:p-6">
            <div className="relative z-10 max-w-[55%]">
              <div className="text-xs font-medium text-primary md:text-sm">Electronics Sale</div>
              <div className="mt-1 text-xl font-bold md:text-2xl">Up to 60% Off</div>
              <div className="mt-1 text-xs text-muted-foreground md:text-sm">On Selected Items</div>
              <Link to="/shop" search={{ category: "electronics" }} className="ripple mt-3 inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 md:mt-4">Shop Now</Link>
            </div>
            <img src={dealElectronics} alt="Electronics deals" loading="lazy" decoding="async" className="absolute right-0 top-0 h-full w-1/2 object-cover" />
          </div>
          <div className="relative min-h-[136px] overflow-hidden rounded-2xl bg-orange-50 p-5 md:p-6">
            <div className="relative z-10 max-w-[55%]">
              <div className="text-xs font-medium text-orange-700 md:text-sm">Fashion Sale</div>
              <div className="mt-1 text-xl font-bold text-orange-900 md:text-2xl">Up to 70% Off</div>
              <div className="mt-1 text-xs text-orange-800 md:text-sm">On Top Brands</div>
              <Link to="/shop" search={{ category: "fashion" }} className="ripple mt-3 inline-flex min-h-10 items-center rounded-xl bg-accent px-4 text-xs font-semibold text-accent-foreground hover:opacity-90 md:mt-4">Shop Now</Link>
            </div>
            <img src={dealFashion} alt="Fashion deals" loading="lazy" decoding="async" className="absolute right-0 top-0 h-full w-1/2 object-cover" />
          </div>
        </div>
      </section>


      {/* Why choose */}
      <section className="mx-auto max-w-7xl px-3 py-6 md:px-4 md:py-8">
        <h2 className="mb-4 text-center text-lg font-bold md:mb-6 md:text-2xl">Why Choose ShopNexa?</h2>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5 md:gap-4">
          {features.map((f) => (
            <div key={f.title} className="flex items-center gap-2.5 rounded-2xl border bg-card p-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold md:text-sm">{f.title}</div>
                <div className="truncate text-[11px] text-muted-foreground md:text-xs">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Blog */}
      <section className="mx-auto max-w-7xl px-3 py-5 md:px-4 md:py-6">
        <div className="mb-3 flex items-center justify-between md:mb-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-bold md:text-2xl">Latest From Blog</h2>
          </div>
          <a href="#" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View All <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
          {blogs.map((b) => (
            <a key={b.title} href="#" className="group overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]">
              <div className="aspect-[4/3] overflow-hidden bg-muted">
                <img src={b.img} alt={b.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              </div>
              <div className="p-3 md:p-4">
                <div className="text-[11px] text-muted-foreground">{b.date}</div>
                <h3 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-tight group-hover:text-primary md:text-sm">{b.title}</h3>
              </div>
            </a>
          ))}
        </div>
      </section>


      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}
