import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Calendar, Clock, ArrowRight, TrendingUp, ShoppingBag, Tag } from "lucide-react";
import { buildMetaTags, blogArticleJsonLd, jsonLdScript, getSiteUrl } from "@/lib/seo";

export const Route = createFileRoute("/blog")({
  ssr: true,
  component: BlogPage,
  head: () => ({
    meta: buildMetaTags({
      title: "AVENTA SHOP Blog — Shopping Guides, Deals & Tips",
      description: "Read the AVENTA SHOP Blog for shopping guides, product reviews, deal alerts, and smart buying tips for online shoppers in Bangladesh. Stay informed and save more.",
      path: "/blog",
      type: "website",
      image: "/brand/aventa-shop-logo.png",
    }),
  }),
});

const CATEGORIES = [
  { icon: <ShoppingBag className="h-5 w-5" />, label: "Shopping Guides" },
  { icon: <Tag className="h-5 w-5" />, label: "Deals & Offers" },
  { icon: <TrendingUp className="h-5 w-5" />, label: "Product Reviews" },
];

const POSTS = [
  {
    slug: "best-deals-flash-sales",
    title: "How to Find the Best Deals During AVENTA SHOP Flash Sales",
    excerpt:
      "Flash sales on AVENTA SHOP offer massive discounts on electronics, fashion, and home essentials. Learn how to set alerts, use coupons, and checkout faster to grab deals before they sell out.",
    category: "Deals & Offers",
    date: "August 20, 2026",
    readTime: "5 min read",
  },
  {
    slug: "buying-electronics-online-bangladesh",
    title: "Complete Guide to Buying Electronics Online in Bangladesh",
    excerpt:
      "From smartphones to laptops to home appliances — everything you need to know about buying electronics online safely. We cover warranty, authenticity checks, price comparison, and return policies.",
    category: "Shopping Guides",
    date: "August 15, 2026",
    readTime: "8 min read",
  },
  {
    slug: "bkash-vs-nagad-vs-rocket",
    title: "bKash vs Nagad vs Rocket: Which Payment Method is Best for Online Shopping?",
    excerpt:
      "A detailed comparison of Bangladesh's top mobile banking platforms for online shopping. Speed, fees, cashback offers, and security — we break it all down so you can choose the right one.",
    category: "Shopping Guides",
    date: "August 10, 2026",
    readTime: "6 min read",
  },
  {
    slug: "top-10-fashion-trends-2026",
    title: "Top 10 Fashion Trends in Bangladesh for 2026",
    excerpt:
      "Discover the latest fashion trends sweeping across Bangladesh this year. From fusion wear to sustainable fabrics, here's what everyone is buying on AVENTA SHOP right now.",
    category: "Product Reviews",
    date: "August 5, 2026",
    readTime: "7 min read",
  },
  {
    slug: "save-money-coupons-vouchers",
    title: "How to Save Money with AVENTA SHOP Coupons and Vouchers",
    excerpt:
      "AVENTA SHOP offers multiple coupon types — sitewide discounts, category vouchers, and seller-specific deals. Learn how to stack coupons, find hidden vouchers, and maximize your savings on every purchase.",
    category: "Deals & Offers",
    date: "July 30, 2026",
    readTime: "5 min read",
  },
  {
    slug: "cash-on-delivery-tips",
    title: "Understanding Cash on Delivery: Tips for Safe and Smart Shopping",
    excerpt:
      "COD is the most popular payment method in Bangladesh. Learn the best practices for COD orders — inspecting packages, checking products before paying, and what to do if something goes wrong.",
    category: "Shopping Guides",
    date: "July 25, 2026",
    readTime: "4 min read",
  },
];

function BlogPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>

        {/* Hero */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 p-8 text-white">
          <h1 className="text-2xl font-bold">AVENTA SHOP Blog</h1>
          <p className="mt-2 text-orange-50">
            Shopping guides, deal alerts, product reviews, and smart buying tips for online
            shoppers in Bangladesh. Stay informed and shop smarter.
          </p>
        </div>

        {/* Categories */}
        <div className="mb-8 flex flex-wrap gap-3">
          {CATEGORIES.map((cat, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm"
            >
              <span className="text-primary">{cat.icon}</span>
              {cat.label}
            </div>
          ))}
        </div>

        {/* Featured Post */}
        <div className="mb-8 overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="bg-gradient-to-br from-orange-100 to-orange-50 p-8">
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
              Featured
            </span>
            <h2 className="mt-3 text-xl font-bold text-foreground">{POSTS[0].title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{POSTS[0].excerpt}</p>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> {POSTS[0].date}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {POSTS[0].readTime}
              </span>
            </div>
            <Link
              to="/blog/$slug"
              params={{ slug: POSTS[0].slug }}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Read more <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* All Posts */}
        <h2 className="mb-4 text-xl font-bold text-foreground">Latest Articles</h2>
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {POSTS.slice(1).map((post, i) => (
            <Link
              key={i}
              to="/blog/$slug"
              params={{ slug: post.slug }}
              className="flex flex-col rounded-2xl border bg-background p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {post.category}
                </span>
              </div>
              <h3 className="text-base font-semibold text-foreground">{post.title}</h3>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{post.excerpt}</p>
              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> {post.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {post.readTime}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>

        {/* Newsletter CTA */}
        <div className="rounded-2xl bg-primary/5 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">Never miss a deal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Get the best deals and shopping tips delivered to your inbox.
          </p>
          <Link
            to="/register"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Sign up for updates
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
