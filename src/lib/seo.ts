/**
 * SEO utilities — meta tags, Open Graph, Twitter Card, JSON-LD structured data.
 *
 * Used by route `head()` functions for dynamic per-page SEO.
 */

/** Get the site URL from environment or default */
export function getSiteUrl(): string {
  if (typeof Deno !== "undefined") {
    return Deno.env.get("SITE_URL") || Deno.env.get("VITE_SITE_URL") || "https://aventa-shop.com";
  }
  return "https://aventa-shop.com";
}

/** Default OG image */
export const DEFAULT_OG_IMAGE = "/brand/aventa-shop-logo.png";

interface MetaOptions {
  title: string;
  description: string;
  /** Canonical path, e.g. "/product/iphone-15-pro" */
  path?: string;
  /** OG image URL (absolute or relative) */
  image?: string;
  /** OG type — website, article, product */
  type?: "website" | "article" | "product";
  /** For articles — published time ISO */
  publishedTime?: string;
  /** For products — price, currency, availability */
  productData?: {
    price?: number;
    currency?: string;
    availability?: "InStock" | "OutOfStock" | "PreOrder";
  };
  /** Twitter creator */
  twitterCreator?: string;
}

/** Build meta tags array for TanStack Router head() function */
export function buildMetaTags(opts: MetaOptions): Array<Record<string, string>> {
  const siteUrl = getSiteUrl();
  const canonical = opts.path ? `${siteUrl}${opts.path}` : siteUrl;
  const ogImage = opts.image
    ? opts.image.startsWith("http")
      ? opts.image
      : `${siteUrl}${opts.image}`
    : `${siteUrl}${DEFAULT_OG_IMAGE}`;
  const ogType = opts.type || "website";

  const meta: Array<Record<string, string>> = [
    { title: opts.title },
    { name: "description", content: opts.description },
    // Open Graph
    { property: "og:title", content: opts.title },
    { property: "og:description", content: opts.description },
    { property: "og:type", content: ogType },
    { property: "og:url", content: canonical },
    { property: "og:image", content: ogImage },
    { property: "og:site_name", content: "AVENTA SHOP" },
    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: opts.title },
    { name: "twitter:description", content: opts.description },
    { name: "twitter:image", content: ogImage },
    { name: "twitter:site", content: "@AventaShop" },
  ];

  if (opts.twitterCreator) {
    meta.push({ name: "twitter:creator", content: opts.twitterCreator });
  }

  // Article-specific
  if (ogType === "article" && opts.publishedTime) {
    meta.push({ property: "article:published_time", content: opts.publishedTime });
  }

  return meta;
}

/** Build JSON-LD structured data for the Organization */
export function organizationJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "AVENTA SHOP",
    url: siteUrl,
    logo: `${siteUrl}${DEFAULT_OG_IMAGE}`,
    description:
      "AVENTA SHOP is your one-stop online shop for electronics, fashion, grocery, beauty and more.",
    sameAs: [
      "https://www.facebook.com/aventashop",
      "https://www.instagram.com/aventashop",
      "https://twitter.com/AventaShop",
    ],
  };
}

/** Build JSON-LD for WebSite (enables sitelinks search box) */
export function websiteJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AVENTA SHOP",
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/shop?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/** Build JSON-LD for a Product */
export function productJsonLd(product: {
  name: string;
  description: string;
  slug: string;
  price?: number;
  currency?: string;
  image?: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
  brand?: string;
  rating?: number;
  reviewCount?: number;
}) {
  const siteUrl = getSiteUrl();
  const img = product.image
    ? product.image.startsWith("http")
      ? product.image
      : `${siteUrl}${product.image}`
    : `${siteUrl}${DEFAULT_OG_IMAGE}`;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    url: `${siteUrl}/product/${product.slug}`,
    image: img,
    brand: { "@type": "Brand", name: product.brand || "AVENTA SHOP" },
  };

  if (product.price) {
    schema.offers = {
      "@type": "Offer",
      price: String(product.price),
      priceCurrency: product.currency || "BDT",
      availability: `https://schema.org/${product.availability || "InStock"}`,
      url: `${siteUrl}/product/${product.slug}`,
    };
  }

  if (product.rating && product.reviewCount) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(product.rating),
      reviewCount: String(product.reviewCount),
    };
  }

  return schema;
}

/** Build JSON-LD for a BlogArticle */
export function blogArticleJsonLd(article: {
  title: string;
  description: string;
  slug: string;
  publishedTime: string;
  author?: string;
  image?: string;
}) {
  const siteUrl = getSiteUrl();
  const img = article.image
    ? article.image.startsWith("http")
      ? article.image
      : `${siteUrl}${article.image}`
    : `${siteUrl}${DEFAULT_OG_IMAGE}`;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    url: `${siteUrl}/blog/${article.slug}`,
    datePublished: article.publishedTime,
    author: { "@type": "Organization", name: article.author || "AVENTA SHOP" },
    publisher: {
      "@type": "Organization",
      name: "AVENTA SHOP",
      logo: { "@type": "ImageObject", url: `${siteUrl}${DEFAULT_OG_IMAGE}` },
    },
    image: img,
  };
}

/** Build JSON-LD for a Store/Seller */
export function storeJsonLd(store: {
  name: string;
  description: string;
  slug: string;
  rating?: number;
  reviewCount?: number;
}) {
  const siteUrl = getSiteUrl();
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: store.name,
    description: store.description,
    url: `${siteUrl}/store/${store.slug}`,
  };

  if (store.rating && store.reviewCount) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(store.rating),
      reviewCount: String(store.reviewCount),
    };
  }

  return schema;
}

/**
 * Canonical link entry for route `head().links`.
 * NOTE: canonical MUST be a <link rel="canonical"> — in TanStack Router v1.170
 * every `meta` entry renders as <meta {...attrs}>, so a `tagName: "link"` meta
 * object renders as an invalid <meta> tag (and React warns about the unknown
 * `tagName` DOM prop). Put canonical in `links`, never in `meta`.
 */
export function buildCanonicalLink(opts: MetaOptions): Array<Record<string, string>> {
  const siteUrl = getSiteUrl();
  const canonical = opts.path ? `${siteUrl}${opts.path}` : siteUrl;
  return [{ rel: "canonical", href: canonical }];
}

/**
 * Full route `head()` object: meta tags + canonical link.
 * Usage: `head: () => ({ ...seoHead({ title, description, path }) })`
 */
export function seoHead(opts: MetaOptions) {
  return {
    meta: buildMetaTags(opts),
    links: buildCanonicalLink(opts),
  };
}

/** JSON-LD script tag for head */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

/** Build JSON-LD for a product listing / collection page */
export function collectionPageJsonLd(opts: { name: string; description: string; path: string }) {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: opts.name,
    description: opts.description,
    url: `${siteUrl}${opts.path}`,
    isPartOf: { "@type": "WebSite", name: "AVENTA SHOP", url: siteUrl },
  };
}

/** Build BreadcrumbList JSON-LD from ordered crumbs */
export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  };
}
