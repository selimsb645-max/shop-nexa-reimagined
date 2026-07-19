import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Sparkles,
  Truck, ShieldCheck, Package, Headset, Award, ArrowRight,
  Shirt, Smartphone, Apple, Sofa, Headphones, Gamepad2, Baby,
  Tag,
} from "lucide-react";
import heroImg from "@/assets/hero.jpg";
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
import { ProductCard, ProductCardSkeleton } from "@/components/product/ProductCard";
import { listCategories } from "@/services/firebase/categories";
import { listProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";

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

// Icon lookup used to render categories from Firestore consistently.
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

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="relative overflow-hidden rounded-xl bg-blue-50">
          <div className="grid items-center gap-6 md:grid-cols-2">
            <div className="p-8 md:p-12">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-accent">
                <Sparkles className="h-4 w-4" /> Best Quality, Best Price
              </div>
              <h1 className="text-4xl font-bold leading-tight md:text-5xl">
                Shop Smarter.
                <br />
                <span className="text-primary">Live Better.</span>
              </h1>
              <p className="mt-4 text-muted-foreground">
                Everything you need in one place.
                <br />
                Top quality products at unbeatable prices.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/shop" className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                  Shop Now
                </Link>
                <Link to="/shop" className="rounded-md border border-primary bg-background px-6 py-3 text-sm font-medium text-primary hover:bg-primary/5">
                  Browse Categories
                </Link>
              </div>
            </div>
            <div className="relative">
              <img src={heroImg} alt="ShopNexa featured products" width={1200} height={800} className="h-full w-full object-cover" />
              <div className="absolute right-6 top-6 flex h-24 w-24 flex-col items-center justify-center rounded-full bg-primary text-center text-primary-foreground shadow-lg md:h-28 md:w-28">
                <span className="text-xs font-medium">BIG</span>
                <span className="text-lg font-bold leading-none">SALE</span>
                <span className="mt-1 text-[9px]">UP TO 70% OFF</span>
              </div>
            </div>
          </div>
          <button className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow hover:bg-background" aria-label="Previous slide">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow hover:bg-background" aria-label="Next slide">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Shop by Category</h2>
          <Link to="/shop" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View All Categories <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {categoriesQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : categoriesQuery.data && categoriesQuery.data.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {categoriesQuery.data.map((c) => {
              const cfg = CATEGORY_ICONS[c.slug] ?? { icon: Tag, color: "bg-primary/10 text-primary" };
              const Icon = cfg.icon;
              return (
                <Link
                  key={c.id}
                  to="/shop"
                  search={{ category: c.slug }}
                  className="group flex flex-col items-center rounded-lg border bg-card p-4 transition hover:border-primary hover:shadow-md"
                >
                  <div className={`mb-3 flex h-16 w-16 items-center justify-center rounded-full ${cfg.color}`}>
                    <Icon className="h-8 w-8" />
                  </div>
                  <span className="text-center text-sm font-medium">{c.name}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Categories will appear here once added by the admin.
          </div>
        )}
      </section>

      {/* Featured Products */}
      <section id="products" className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Featured Products</h2>
          <Link to="/shop" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View All Products <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {featuredQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : featuredQuery.data && featuredQuery.data.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {featuredQuery.data.slice(0, 12).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-10 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Featured products will appear here once the store is stocked.
            </p>
            <Link to="/shop" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
              Browse all products →
            </Link>
          </div>
        )}
      </section>

      {/* Deal banners */}
      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="relative overflow-hidden rounded-lg bg-green-50 p-6">
            <div className="relative z-10 max-w-[55%]">
              <div className="text-sm font-medium text-green-700">Super Value Deals</div>
              <div className="mt-1 text-2xl font-bold text-green-800">Up to 50% Off</div>
              <div className="mt-1 text-sm text-green-700">On Grocery Items</div>
              <Link to="/shop" search={{ category: "grocery" }} className="mt-4 inline-block rounded-md bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700">Shop Now</Link>
            </div>
            <img src={dealGrocery} alt="Grocery deals" loading="lazy" className="absolute right-0 top-0 h-full w-1/2 object-cover" />
          </div>
          <div className="relative overflow-hidden rounded-lg bg-blue-50 p-6">
            <div className="relative z-10 max-w-[55%]">
              <div className="text-sm font-medium text-primary">Electronics Sale</div>
              <div className="mt-1 text-2xl font-bold">Up to 60% Off</div>
              <div className="mt-1 text-sm text-muted-foreground">On Selected Items</div>
              <Link to="/shop" search={{ category: "electronics" }} className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">Shop Now</Link>
            </div>
            <img src={dealElectronics} alt="Electronics deals" loading="lazy" className="absolute right-0 top-0 h-full w-1/2 object-cover" />
          </div>
          <div className="relative overflow-hidden rounded-lg bg-orange-50 p-6">
            <div className="relative z-10 max-w-[55%]">
              <div className="text-sm font-medium text-orange-700">Fashion Sale</div>
              <div className="mt-1 text-2xl font-bold text-orange-900">Up to 70% Off</div>
              <div className="mt-1 text-sm text-orange-800">On Top Brands</div>
              <Link to="/shop" search={{ category: "fashion" }} className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-xs font-medium text-accent-foreground hover:opacity-90">Shop Now</Link>
            </div>
            <img src={dealFashion} alt="Fashion deals" loading="lazy" className="absolute right-0 top-0 h-full w-1/2 object-cover" />
          </div>
        </div>
      </section>

      {/* Why choose */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <h2 className="mb-8 text-center text-2xl font-bold">Why Choose ShopNexa?</h2>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
          {features.map((f) => (
            <div key={f.title} className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <f.icon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-semibold">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Blog */}
      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Latest From Blog</h2>
          <a href="#" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View All Posts <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {blogs.map((b) => (
            <a key={b.title} href="#" className="group overflow-hidden rounded-lg border bg-card transition hover:shadow-md">
              <div className="aspect-[4/3] overflow-hidden bg-muted">
                <img src={b.img} alt={b.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              </div>
              <div className="p-4">
                <div className="text-xs text-muted-foreground">{b.date}</div>
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold group-hover:text-primary">{b.title}</h3>
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
