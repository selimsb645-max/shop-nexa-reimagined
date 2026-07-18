import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "@/services/firebase/auth";
import {
  Search, ShoppingCart, Heart, User, ChevronDown, ChevronLeft, ChevronRight,
  Menu, Flame, Shirt, Smartphone, Apple, Sparkles, Sofa, Headphones, Gamepad2, Baby,
  Truck, ShieldCheck, Package, Headset, Award, Mail, MapPin, Phone, Facebook,
  Twitter, Instagram, Youtube, Star, ArrowRight,
} from "lucide-react";
import heroImg from "@/assets/hero.jpg";
import dealGrocery from "@/assets/deal-grocery.jpg";
import dealElectronics from "@/assets/deal-electronics.jpg";
import dealFashion from "@/assets/deal-fashion.jpg";
import pWatch from "@/assets/p-watch.jpg";
import pHeadphones from "@/assets/p-headphones.jpg";
import pBackpack from "@/assets/p-backpack.jpg";
import pShoes from "@/assets/p-shoes.jpg";
import pPerfume from "@/assets/p-perfume.jpg";
import pTablet from "@/assets/p-tablet.jpg";
import blog1 from "@/assets/blog-1.jpg";
import blog2 from "@/assets/blog-2.jpg";
import blog3 from "@/assets/blog-3.jpg";
import blog4 from "@/assets/blog-4.jpg";

export const Route = createFileRoute("/")({
  component: Index,
});

const WHATSAPP = "https://wa.me/8801324997271";
const FACEBOOK = "https://www.facebook.com/profile.php?id=61592089432837";

const categories = [
  { name: "Fashion", icon: Shirt, color: "bg-blue-100 text-blue-600" },
  { name: "Electronics", icon: Smartphone, color: "bg-indigo-100 text-indigo-600" },
  { name: "Grocery", icon: Apple, color: "bg-green-100 text-green-600" },
  { name: "Beauty", icon: Sparkles, color: "bg-pink-100 text-pink-600" },
  { name: "Home & Kitchen", icon: Sofa, color: "bg-orange-100 text-orange-600" },
  { name: "Accessories", icon: Headphones, color: "bg-purple-100 text-purple-600" },
  { name: "Gaming", icon: Gamepad2, color: "bg-red-100 text-red-600" },
  { name: "Baby & Kids", icon: Baby, color: "bg-yellow-100 text-yellow-600" },
];

const products = [
  { name: "Smart Watch Series 8", price: 49.99, rating: 4, reviews: 128, img: pWatch },
  { name: "Wireless Headphones", price: 29.99, rating: 4, reviews: 96, img: pHeadphones },
  { name: "Laptop Backpack", price: 25.99, rating: 4, reviews: 78, img: pBackpack },
  { name: "Running Shoes", price: 39.99, rating: 5, reviews: 112, img: pShoes },
  { name: "Luxury Perfume", price: 19.99, rating: 4, reviews: 64, img: pPerfume },
  { name: "Tablet 10 inch", price: 99.99, rating: 4, reviews: 88, img: pTablet },
];

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

function Logo() {
  return (
    <a href="/" className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShoppingCart className="h-5 w-5" />
      </div>
      <span className="text-xl font-bold">
        <span className="text-primary">Shop</span>
        <span className="text-accent">Nexa</span>
      </span>
    </a>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < rating ? "fill-accent text-accent" : "fill-muted text-muted"}`}
        />
      ))}
    </div>
  );
}

function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="bg-primary text-primary-foreground text-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span>Free Delivery on orders over $50</span>
          </div>
          <div className="hidden md:block">Welcome to ShopNexa!</div>
          <div className="hidden items-center gap-4 md:flex">
            <a href="#" className="hover:underline">Track Order</a>
            <a href={WHATSAPP} target="_blank" rel="noreferrer" className="hover:underline">Help & Support</a>
            <div className="flex items-center gap-1">English <ChevronDown className="h-3 w-3" /></div>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4">
          <Logo />
          <div className="ml-4 hidden flex-1 md:flex">
            <div className="flex w-full items-stretch rounded-md border">
              <button className="flex items-center gap-2 border-r px-4 text-sm text-muted-foreground hover:bg-muted">
                All Categories <ChevronDown className="h-4 w-4" />
              </button>
              <input
                type="text"
                placeholder="Search for products, brands and more..."
                className="flex-1 px-4 py-2.5 text-sm outline-none"
              />
              <button className="flex items-center gap-2 bg-accent px-6 text-sm font-medium text-accent-foreground hover:opacity-90">
                <Search className="h-4 w-4" /> Search
              </button>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-5">
            <AccountMenu />
            <Link to="/account" className="hidden items-center gap-1.5 text-sm md:flex">
              <Heart className="h-5 w-5" /> Wishlist
            </Link>
            <a href="#" className="relative flex items-center gap-1.5 text-sm">
              <ShoppingCart className="h-5 w-5" /> Cart
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">0</span>
            </a>
          </div>
        </div>

        {/* Nav */}
        <nav className="border-t">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 text-sm">
            <button className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">
              <Menu className="h-4 w-4" /> All Categories
            </button>
            <a href="#" className="border-b-2 border-primary py-2 font-medium text-primary">Home</a>
            <a href="#" className="py-2 hover:text-primary">Shop</a>
            <a href="#" className="py-2 hover:text-primary">Deals</a>
            <a href="#" className="py-2 hover:text-primary">Blog</a>
            <a href="#" className="py-2 hover:text-primary">About Us</a>
            <a href="#" className="py-2 hover:text-primary">Contact Us</a>
            <div className="ml-auto flex items-center gap-2 text-destructive">
              <Flame className="h-4 w-4" />
              <span className="font-medium">Hot Deals</span>
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        </nav>
      </header>

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
                <a href="#products" className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                  Shop Now
                </a>
                <a href="#categories" className="rounded-md border border-primary bg-background px-6 py-3 text-sm font-medium text-primary hover:bg-primary/5">
                  Browse Categories
                </a>
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
          <button className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow hover:bg-background">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow hover:bg-background">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Shop by Category</h2>
          <a href="#" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View All Categories <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          {categories.map((c) => (
            <a key={c.name} href="#" className="group flex flex-col items-center rounded-lg border bg-card p-4 transition hover:border-primary hover:shadow-md">
              <div className={`mb-3 flex h-16 w-16 items-center justify-center rounded-full ${c.color}`}>
                <c.icon className="h-8 w-8" />
              </div>
              <span className="text-center text-sm font-medium">{c.name}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section id="products" className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Featured Products</h2>
          <a href="#" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View All Products <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {products.map((p) => (
            <div key={p.name} className="group overflow-hidden rounded-lg border bg-card transition hover:shadow-md">
              <div className="aspect-square overflow-hidden bg-muted">
                <img src={p.img} alt={p.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              </div>
              <div className="p-3">
                <h3 className="text-sm font-medium">{p.name}</h3>
                <div className="mt-1 text-lg font-bold text-primary">${p.price}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <Stars rating={p.rating} />
                  <span className="text-xs text-muted-foreground">({p.reviews})</span>
                </div>
                <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
                  <ShoppingCart className="h-3.5 w-3.5" /> Add to Cart
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Deal banners */}
      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="relative overflow-hidden rounded-lg bg-green-50 p-6">
            <div className="relative z-10 max-w-[55%]">
              <div className="text-sm font-medium text-green-700">Super Value Deals</div>
              <div className="mt-1 text-2xl font-bold text-green-800">Up to 50% Off</div>
              <div className="mt-1 text-sm text-green-700">On Grocery Items</div>
              <button className="mt-4 rounded-md bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700">Shop Now</button>
            </div>
            <img src={dealGrocery} alt="Grocery deals" loading="lazy" className="absolute right-0 top-0 h-full w-1/2 object-cover" />
          </div>
          <div className="relative overflow-hidden rounded-lg bg-blue-50 p-6">
            <div className="relative z-10 max-w-[55%]">
              <div className="text-sm font-medium text-primary">Electronics Sale</div>
              <div className="mt-1 text-2xl font-bold">Up to 60% Off</div>
              <div className="mt-1 text-sm text-muted-foreground">On Selected Items</div>
              <button className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">Shop Now</button>
            </div>
            <img src={dealElectronics} alt="Electronics deals" loading="lazy" className="absolute right-0 top-0 h-full w-1/2 object-cover" />
          </div>
          <div className="relative overflow-hidden rounded-lg bg-orange-50 p-6">
            <div className="relative z-10 max-w-[55%]">
              <div className="text-sm font-medium text-orange-700">Fashion Sale</div>
              <div className="mt-1 text-2xl font-bold text-orange-900">Up to 70% Off</div>
              <div className="mt-1 text-sm text-orange-800">On Top Brands</div>
              <button className="mt-4 rounded-md bg-accent px-4 py-2 text-xs font-medium text-accent-foreground hover:opacity-90">Shop Now</button>
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

      {/* Blog + Newsletter */}
      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <h2 className="mb-6 text-2xl font-bold">Latest From Our Blog</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {blogs.map((b) => (
                <a key={b.title} href="#" className="group overflow-hidden rounded-lg border bg-card transition hover:shadow-md">
                  <div className="aspect-[4/3] overflow-hidden">
                    <img src={b.img} alt={b.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold leading-snug group-hover:text-primary">{b.title}</h3>
                    <div className="mt-2 text-xs text-muted-foreground">{b.date}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
          <aside className="rounded-lg bg-primary p-6 text-primary-foreground">
            <h3 className="text-xl font-bold">Subscribe to Our Newsletter</h3>
            <p className="mt-2 text-sm text-primary-foreground/80">
              Get updates on new arrivals, offers and exclusive discounts.
            </p>
            <form className="mt-5" onSubmit={(e) => e.preventDefault()}>
              <div className="flex overflow-hidden rounded-md bg-background">
                <input
                  type="email"
                  required
                  placeholder="Enter your email"
                  className="flex-1 px-3 py-2.5 text-sm text-foreground outline-none"
                />
                <button className="bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90">
                  Subscribe
                </button>
              </div>
            </form>
            <div className="mt-4 flex items-center gap-2 text-xs text-primary-foreground/80">
              <ShieldCheck className="h-4 w-4" /> We respect your privacy.
            </div>
          </aside>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-8 bg-slate-950 text-slate-300">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <span className="text-xl font-bold">
                  <span className="text-primary">Shop</span>
                  <span className="text-accent">Nexa</span>
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-400">
                ShopNexa is your one-stop destination for all your needs. Quality products, best prices and great service.
              </p>
              <div className="mt-5 flex gap-3">
                <a href={FACEBOOK} target="_blank" rel="noreferrer" aria-label="Facebook" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 hover:bg-primary">
                  <Facebook className="h-4 w-4" />
                </a>
                <a href="#" aria-label="Twitter" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 hover:bg-primary">
                  <Twitter className="h-4 w-4" />
                </a>
                <a href="#" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 hover:bg-primary">
                  <Instagram className="h-4 w-4" />
                </a>
                <a href="#" aria-label="YouTube" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 hover:bg-primary">
                  <Youtube className="h-4 w-4" />
                </a>
              </div>
            </div>
            <div>
              <h4 className="mb-4 font-semibold text-white">Shop</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">All Products</a></li>
                <li><a href="#" className="hover:text-white">Featured Products</a></li>
                <li><a href="#" className="hover:text-white">Best Sellers</a></li>
                <li><a href="#" className="hover:text-white">Deals</a></li>
                <li><a href="#" className="hover:text-white">New Arrivals</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-semibold text-white">Customer Service</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Contact Us</a></li>
                <li><a href="#" className="hover:text-white">Track Order</a></li>
                <li><a href="#" className="hover:text-white">Returns & Refunds</a></li>
                <li><a href="#" className="hover:text-white">Shipping Policy</a></li>
                <li><a href="#" className="hover:text-white">FAQs</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-semibold text-white">Information</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">About Us</a></li>
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white">Terms & Conditions</a></li>
                <li><a href="#" className="hover:text-white">Refund Policy</a></li>
                <li><a href="#" className="hover:text-white">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-semibold text-white">Contact Us</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  <a href={WHATSAPP} target="_blank" rel="noreferrer" className="hover:text-white">+880 1324 997271 (WhatsApp)</a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <a href="mailto:support@shopnexa.com" className="hover:text-white">support@shopnexa.com</a>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                  <span>123 Market Street,<br />Dhaka, Bangladesh</span>
                </li>
                <li className="flex items-center gap-2">
                  <Facebook className="h-4 w-4 text-primary" />
                  <a href={FACEBOOK} target="_blank" rel="noreferrer" className="hover:text-white">Facebook Page</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400 sm:flex-row">
            <div>© 2026 ShopNexa. All Rights Reserved.</div>
            <div className="flex items-center gap-2">
              <span>We Accept:</span>
              <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-white">VISA</span>
              <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-white">MC</span>
              <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-white">PayPal</span>
              <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-white">Apple Pay</span>
            </div>
          </div>
        </div>
      </footer>

      {/* WhatsApp float */}
      <a
        href={WHATSAPP}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.695.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </a>
    </div>
  );
}
