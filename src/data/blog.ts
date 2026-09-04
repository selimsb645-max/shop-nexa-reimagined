/** Static blog content for Aventa Shop. Articles are lightweight static entries. */

export interface BlogArticle {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  date: string;
  readMinutes: number;
  body: string[]; // paragraphs
}

export const BLOG_CATEGORIES = [
  "Shopping Guide",
  "Electronics",
  "Fashion",
  "Home & Grocery",
  "Beauty",
  "Deals & Offers",
  "Seller Tips",
  "Aventa Shop News",
];

export const BLOG_ARTICLES: BlogArticle[] = [
  {
    slug: "how-to-shop-online-safely-in-bangladesh",
    title: "How to Shop Online Safely in Bangladesh",
    category: "Shopping Guide",
    excerpt:
      "Simple habits that keep your money and personal information safe while shopping online.",
    date: "2026-08-20",
    readMinutes: 4,
    body: [
      "Online shopping is now part of everyday life, but a few simple habits make it much safer. Always shop from marketplaces you know and trust, and check that the seller of a product is verified before ordering.",
      "Use a strong, unique password for your shopping account, and never share your OTP or verification codes with anyone — including people claiming to be support agents. Real support staff will never ask for your password or OTP.",
      "When paying online, prefer trusted payment methods. If a deal looks too good to be true, compare prices first — extremely low prices on new stores are often a warning sign.",
      "Finally, always keep your order confirmation and tracking ID. If anything goes wrong, the support team can resolve your issue much faster when you share the correct order details.",
    ],
  },
  {
    slug: "get-more-from-coupons-and-rewards",
    title: "Get More From Coupons and Reward Points",
    category: "Deals & Offers",
    excerpt:
      "Coupons, promo codes, wallet balance and reward points — how to stack savings the right way.",
    date: "2026-08-28",
    readMinutes: 3,
    body: [
      "Aventa Shop gives you several ways to save: store coupons, promo codes, wallet balance and reward points. Start by checking the Coupons page in your account before checkout — available vouchers are listed there.",
      "Reward points are earned on eligible orders and can be redeemed during checkout. Points convert at a fixed rate, so use them on larger orders to reduce the total meaningfully.",
      "Wallet balance from refunds or top-ups can be applied at checkout before choosing the rest of your payment method. You can combine wallet balance with other payment options for the remaining amount.",
      "Flash sales are one of the best times to use coupons. Keep an eye on the Flash Sales page so you don't miss limited-time deals on popular products.",
    ],
  },
  {
    slug: "new-seller-guide-first-sale",
    title: "New Seller Guide: Getting Your First Sale",
    category: "Seller Tips",
    excerpt:
      "From registering your store to shipping your first order — a quick-start guide for new sellers.",
    date: "2026-09-01",
    readMinutes: 5,
    body: [
      "Starting on Aventa Shop is simple: register as a seller from the Become a Seller page, submit your business information, and complete verification. Once approved, you can add products from the Seller Dashboard.",
      "Great listings sell. Use clear photos, write honest titles and descriptions, price fairly compared to similar products, and keep your stock counts accurate to avoid cancelled orders.",
      "When your first orders come in, ship quickly and update the order status honestly. Fast, reliable shipping is the biggest driver of good reviews — and good reviews drive more sales.",
      "Finally, watch your Seller Analytics to understand which products perform best, and use Insights to plan promotions. Consistency beats luck: keep listings fresh and respond to customer messages quickly.",
    ],
  },
];
