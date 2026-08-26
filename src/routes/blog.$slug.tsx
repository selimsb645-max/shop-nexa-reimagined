/**
 * Blog Post Detail Page — /blog/$slug
 * Renders individual blog posts with full SEO meta, JSON-LD, and dynamic SSR.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Calendar, Clock, ArrowLeft, Share2, Tag, TrendingUp, ShoppingBag } from "lucide-react";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { buildMetaTags, blogArticleJsonLd, jsonLdScript, getSiteUrl } from "@/lib/seo";
import { useEffect } from "react";

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  date: string;
  readTime: string;
  image?: string;
}

// Static blog posts — these would normally come from Firestore or a CMS
const BLOG_POSTS: BlogPost[] = [
  {
    slug: "best-deals-flash-sales",
    title: "How to Find the Best Deals During AVENTA SHOP Flash Sales",
    excerpt:
      "Flash sales on AVENTA SHOP offer massive discounts on electronics, fashion, and home essentials. Learn how to set alerts, use coupons, and checkout faster to grab deals before they sell out.",
    content: `Flash sales on AVENTA SHOP are one of the best ways to get incredible deals on electronics, fashion, and home essentials. Here's our complete guide to maximizing your savings.

## Set Up Deal Alerts

Enable push notifications in your AVENTA SHOP settings to get instant alerts when flash sales go live. You can also follow specific categories to get notified about deals in your favorite product categories.

## Use Coupons Wisely

AVENTA SHOP regularly offers coupon codes during flash sales. Check the promotions page before checkout and apply any available coupons for additional discounts on top of sale prices.

## Checkout Faster

Save your delivery address and payment method in advance. Flash sale items sell out quickly, so every second counts. Use bKash or Nagad for instant payment processing.

## Compare Before You Buy

Use the AVENTA SHOP compare feature to compare similar products side-by-side. This ensures you're getting the best deal for the features you need.

## Tips for Success

1. Create a wishlist of items you want before the sale starts
2. Log in 10 minutes before the sale begins
3. Add items to cart immediately when the sale goes live
4. Checkout as fast as possible — don't hesitate

Happy shopping!`,
    category: "Deals & Offers",
    date: "August 20, 2026",
    readTime: "5 min read",
  },
  {
    slug: "buying-electronics-online-bangladesh",
    title: "Complete Guide to Buying Electronics Online in Bangladesh",
    excerpt:
      "From smartphones to laptops to home appliances — everything you need to know about buying electronics online safely. We cover warranty, authenticity checks, price comparison, and return policies.",
    content: `Buying electronics online in Bangladesh has never been easier, but it's important to know what to look for. Here's our comprehensive guide.

## Check Seller Ratings

On AVENTA SHOP, every seller has a rating and review count visible on their store page. Always check seller ratings before purchasing electronics. Look for sellers with 4+ star ratings and substantial review counts.

## Warranty and Authenticity

AVENTA SHOP verified sellers offer genuine products with manufacturer warranties. Check the product description for warranty information. If it's not listed, ask the seller through the messaging feature.

## Price Comparison

Use the compare feature to compare prices across different sellers for the same product. You can also check price history to see if the current price is actually a good deal.

## Return Policy

AVENTA SHOP offers a 7-day return policy for most electronics. Make sure to check the specific return policy on each product page, as some items may have different terms.

## Payment Methods

AVENTA SHOP supports bKash, Nagad, Rocket, and card payments. For electronics purchases, we recommend using a payment method that offers buyer protection.

## Tips for Safe Electronics Shopping

1. Always buy from verified sellers
2. Check warranty terms before purchasing
3. Read customer reviews carefully
4. Compare prices across multiple sellers
5. Use secure payment methods

Shop with confidence on AVENTA SHOP!`,
    category: "Shopping Guides",
    date: "August 15, 2026",
    readTime: "8 min read",
  },
  {
    slug: "bkash-vs-nagad-vs-rocket",
    title: "bKash vs Nagad vs Rocket: Which Payment Method is Best for Online Shopping?",
    excerpt:
      "A detailed comparison of Bangladesh's top mobile banking platforms for online shopping. Speed, fees, cashback offers, and security — we break it all down so you can choose the right one.",
    content: `Bangladesh has three major mobile banking platforms: bKash, Nagad, and Rocket. Here's how they compare for online shopping on AVENTA SHOP.

## Speed

All three platforms offer instant payment processing on AVENTA SHOP. However, bKash has the widest merchant network, making it the most reliable option.

## Fees

bKash charges a small fee for payments to merchants, typically 1-1.5%. Nagad offers lower fees and frequent cashback promotions. Rocket's fees are similar to bKash but with fewer promotional offers.

## Cashback and Offers

Nagad is known for its generous cashback offers, especially during holidays and special events. bKash partners with AVENTA SHOP for exclusive deals. Rocket offers periodic promotions.

## Security

All three platforms use PIN-based authentication and transaction alerts. bKash additionally offers biometric authentication on supported devices.

## Our Recommendation

For everyday shopping on AVENTA SHOP, we recommend bKash for reliability and Nagad for cashback savings. Use whichever platform you're most comfortable with — all are secure and supported.

## Quick Comparison

1. bKash: Most reliable, widest acceptance
2. Nagad: Best cashback offers, lowest fees
3. Rocket: Solid security, periodic promotions

Choose the one that fits your needs!`,
    category: "Shopping Guides",
    date: "August 10, 2026",
    readTime: "6 min read",
  },
  {
    slug: "top-10-fashion-trends-2026",
    title: "Top 10 Fashion Trends in Bangladesh for 2026",
    excerpt:
      "Discover the latest fashion trends sweeping across Bangladesh this year. From fusion wear to sustainable fabrics, here's what everyone is buying on AVENTA SHOP right now.",
    content: `Fashion in Bangladesh is evolving rapidly. Here are the top 10 trends we're seeing on AVENTA SHOP in 2026.

## 1. Fusion Wear

The blend of traditional and modern styles continues to dominate. Think kurtis with denim jackets, or sarees with sneakers.

## 2. Sustainable Fabrics

Eco-friendly cotton and jute blends are trending. Shoppers are increasingly conscious about sustainability.

## 3. Minimalist Accessories

Simple, elegant accessories are in. Think small hoop earrings, delicate necklaces, and clean watches.

## 4. Oversized Shirts

Oversized button-down shirts are popular among both men and women. Comfort meets style.

## 5. Pastel Colors

Soft pastels — lavender, mint, peach — are everywhere this year.

## 6. Sustainable Footwear

Eco-friendly sneakers and sandals made from recycled materials are gaining popularity.

## 7. Traditional Revival

Handloom fabrics and traditional weaves are making a strong comeback.

## 8. Athleisure

Comfortable activewear that works both for exercise and casual outings.

## 9. Statement Bags

Bold, colorful bags that make a statement are trending.

## 10. Layered Jewelry

Multiple thin necklaces or stacked rings create an effortless, stylish look.

Shop these trends on AVENTA SHOP today!`,
    category: "Product Reviews",
    date: "August 5, 2026",
    readTime: "7 min read",
  },
];

export const Route = createFileRoute("/blog/$slug")({
  ssr: true,
  component: BlogPostPage,
  head: ({ params }) => {
    const post = BLOG_POSTS.find((p) => p.slug === params.slug);
    const title = post?.title ?? "Blog Post — AVENTA SHOP";
    const description = post?.excerpt ?? "Read the latest shopping guides, deals, and tips on the AVENTA SHOP blog.";

    return {
      meta: buildMetaTags({
        title,
        description,
        path: `/blog/${params.slug}`,
        type: "article",
        publishedTime: post?.date,
        image: post?.image || "/brand/aventa-shop-logo.png",
      }),
    };
  },
});

function BlogPostPage() {
  const { slug } = Route.useParams();
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  useEffect(() => {
    if (!post) return;

    // Inject JSON-LD for the article
    const scriptId = "blog-post-jsonld";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = jsonLdScript(
      blogArticleJsonLd({
        title: post.title,
        description: post.excerpt,
        slug: post.slug,
        publishedTime: new Date(post.date).toISOString(),
      }),
    );
  }, [post]);

  if (!post) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <SiteHeader />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800">Blog Post Not Found</h1>
            <p className="mt-2 text-gray-500">The article you're looking for doesn't exist.</p>
            <Link to="/blog" className="mt-4 inline-flex items-center gap-2 text-[#f57224] font-medium">
              <ArrowLeft className="h-4 w-4" /> Back to Blog
            </Link>
          </div>
        </div>
        <SiteFooter />
        <MobileBottomNav />
      </div>
    );
  }

  // Render simple markdown-like content
  const renderContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("## ")) {
        return <h2 key={i} className="mt-6 mb-3 text-xl font-bold text-gray-800">{line.replace("## ", "")}</h2>;
      }
      if (line.match(/^\d+\.\s/)) {
        return <p key={i} className="mb-2 text-gray-600 leading-relaxed">{line}</p>;
      }
      if (line.trim() === "") return null;
      return <p key={i} className="mb-3 text-gray-600 leading-relaxed">{line}</p>;
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
          <BackButton to="/blog" label="Back to Blog" />

          <div className="mt-6 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600">
              <Tag className="h-3 w-3" /> {post.category}
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-bold leading-tight text-gray-900 md:text-3xl">
            {post.title}
          </h1>

          <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" /> {post.date}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {post.readTime}
            </span>
          </div>

          <p className="mt-6 text-lg leading-relaxed text-gray-700">{post.excerpt}</p>

          <article className="mt-8">
            {renderContent(post.content)}
          </article>

          <div className="mt-10 border-t border-gray-100 pt-6">
            <Link to="/blog" className="inline-flex items-center gap-2 text-[#f57224] font-medium">
              <ArrowLeft className="h-4 w-4" /> Back to Blog
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
