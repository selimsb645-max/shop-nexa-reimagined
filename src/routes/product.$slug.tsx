import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Star,
  ShoppingCart,
  Zap,
  Truck,
  ShieldCheck,
  RotateCcw,
  ChevronRight,
  Minus,
  Plus,
  Heart,
  Share2,
  Check,
  MessageCircle,
  Store,
  ChevronLeft,
  Copy,
  Facebook,
  ThumbsUp,
  AlertCircle,
  Package,
  Award,
  Sparkles,
  Clock,
  CheckCircle,
  Send,
  Eye,
  Sliders,
} from "lucide-react";

import { SiteHeader, TopBar } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ProductCard } from "@/components/product/ProductCard";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { getProductBySlug, listProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { toast } from "sonner";
import { formatPrice } from "@/utils/format";
import type { Product, Review } from "@/types/commerce";

// ----------------------------------------------------------------------
// Route Definition
// ----------------------------------------------------------------------

// Extended product type for optional marketplace fields
type ProductWithExtras = Product & {
  brand?: string;
  features?: string[];
  freeShipping?: boolean;
  shortDescription?: string;
  soldCount?: number;
  seller?: { name: string; rating: number; responseTime: string; storeSlug?: string };
  discount?: number;
  inStock?: boolean;
};

export const Route = createFileRoute("/product/$slug")({
  component: ProductDetailPage,
});

// ----------------------------------------------------------------------
// Fallback / Mock Data Generator
// ----------------------------------------------------------------------

const MOCK_PRODUCTS: Record<string, Partial<Product>> = {
  "apex-pro-keyboard": {
    id: "prod-apex-pro",
    title: "Apex Pro TKL Wireless Mechanical Gaming Keyboard",
    slug: "apex-pro-keyboard",
    price: 189.99,
    originalPrice: 249.99,
    discount: 24,
    rating: 4.9,
    reviewCount: 142,
    soldCount: 1250,
    category: "Electronics",
    brand: "Nexa Tech",
    inStock: true,
    stock: 18,
    freeShipping: true,
    description:
      "The Apex Pro TKL is the biggest leap in mechanical keyboards since the invention of the mechanical switch over 50 years ago. Each key can be adjusted to meet your exact sensitivity level, whether it's for gaming, work, or anything else.",
    shortDescription:
      "First-of-its-kind adjustable mechanical switches for customizable per-key sensitivity. OLED smart display delivers info straight from games and apps.",
    features: [
      "OmniPoint 2.0 Adjustable HyperMagnetic Switches",
      "OLED Smart Display delivers direct info from games and apps",
      "Aircraft grade aluminum alloy top plate built for a lifetime of durability",
      "Detachable USB-C braided cable & 2.4GHz wireless / Bluetooth 5.0",
      "RGB Per-Key Backlighting with 16.8 million custom colors",
    ],
    images: [
      "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1541140590088-2616a2ef8684?auto=format&fit=crop&w=1000&q=80",
    ],
    colors: ["Deep Navy", "Matte Black", "Lunar White"],
    sizes: ["TKL (Tenkeyless)", "Full Size (100%)", "60% Compact"],
    specifications: [
      { name: "Brand", value: "Shop Nexa Official" },
      { name: "Switch Type", value: "OmniPoint 2.0 Adjustable Magnetic" },
      { name: "Connectivity", value: "Tri-Mode (2.4GHz Wireless, Bluetooth 5.0, USB-C)" },
      { name: "Battery Life", value: "Up to 40 hours (RGB On) / 100 hours (RGB Off)" },
      { name: "Keycap Material", value: "Double-shot PBT Keycaps" },
      { name: "Dimensions", value: "355 x 128 x 42 mm" },
      { name: "Weight", value: "960g" },
      { name: "Warranty", value: "2 Year Shop Nexa Official Warranty" },
    ],
    seller: {
      name: "Shop Nexa Official Electronics",
      rating: 98,
      responseTime: "< 1 Hour",
      shipOnTime: 99,
    },
  },
};

const DEFAULT_FALLBACK_PRODUCT: Partial<Product> = {
  id: "prod-default-nexa",
  title: "Premium Nexa SoundPro ANC Wireless Headphones",
  slug: "nexa-soundpro-anc",
  price: 129.99,
  originalPrice: 179.99,
  discount: 28,
  rating: 4.8,
  reviewCount: 96,
  soldCount: 840,
  category: "Electronics",
  brand: "Nexa Audio",
  inStock: true,
  stock: 25,
  freeShipping: true,
  description:
    "Experience pure bliss with the Nexa SoundPro ANC Wireless Headphones. Featuring active noise cancellation, studio-grade 40mm drivers, and up to 50 hours of continuous battery playback.",
  shortDescription:
    "Hybrid Active Noise Cancellation, Ultra-soft protein leather earcups, Hi-Res Audio certification, and instant fast charging.",
  features: [
    "Hybrid Active Noise Cancellation up to 35dB",
    "Custom 40mm Dynamic Drivers for deep bass & crystal treble",
    "50-Hour Playtime with Fast USB-C Charging (5 mins = 4 hours)",
    "Dual Device Multipoint Bluetooth 5.3 Connection",
    "Crystal-clear hands-free calls with AI Environmental Noise Cancellation",
  ],
  images: [
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=80",
    "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=1000&q=80",
    "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=1000&q=80",
    "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=1000&q=80",
  ],
  colors: ["Navy Blue", "Midnight Black", "Silver Gray"],
  sizes: ["Standard Fit"],
  specifications: [
    { name: "Brand", value: "Shop Nexa Audio" },
    { name: "Noise Cancellation", value: "Hybrid Active Noise Cancellation (ANC)" },
    { name: "Bluetooth Version", value: "v5.3" },
    { name: "Battery Life", value: "50 Hours ANC Off / 35 Hours ANC On" },
    { name: "Charging Port", value: "USB Type-C" },
    { name: "Warranty", value: "1 Year Replacement Warranty" },
  ],
  seller: {
    name: "Nexa Flagship Store",
    rating: 97,
    responseTime: "< 30 Mins",
    shipOnTime: 98,
  },
};

const MOCK_REVIEWS: Review[] = [
  {
    id: "rev-1",
    userName: "Tanvir Rahman",
    rating: 5,
    comment:
      "Absolutely top-notch quality! Fast delivery within 2 days to Dhaka. Packaging was super secure. The build quality exceeds expectations for the price tag.",
    date: "2026-07-28",
    title: "Mindblowing quality & packaging!",
    verified: true,
    helpfulCount: 24,
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "rev-2",
    userName: "Sultana Parveen",
    rating: 5,
    comment:
      "Bought this during the Nexa Grand Sale. Outstanding battery life and extremely comfortable for daily work use. Highly recommended seller!",
    date: "2026-07-19",
    title: "Best purchase of this year",
    verified: true,
    helpfulCount: 18,
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "rev-3",
    userName: "Ashraful Islam",
    rating: 4,
    comment:
      "Good product overall. The delivery was fast and Cash on Delivery worked seamlessly. Only downside was the box had a minor crease, but inside item was 100% intact.",
    date: "2026-06-15",
    title: "Solid performance & smooth COD delivery",
    verified: true,
    helpfulCount: 9,
    avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=120&q=80",
  },
];

const MOCK_RECOMMENDED_PRODUCTS: Partial<Product>[] = [
  {
    id: "rec-1",
    title: "Nexa Ergonomic Wireless Vertical Mouse",
    slug: "nexa-vertical-mouse",
    price: 34.99,
    originalPrice: 49.99,
    discount: 30,
    rating: 4.7,
    reviewCount: 54,
    soldCount: 420,
    category: "Electronics",
    images: ["https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=600&q=80"],
  },
  {
    id: "rec-2",
    title: "Nexa Smart Ultra Watch Series 8 LTE",
    slug: "nexa-smartwatch-8",
    price: 89.99,
    originalPrice: 129.99,
    discount: 31,
    rating: 4.8,
    reviewCount: 110,
    soldCount: 950,
    category: "Electronics",
    images: ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80"],
  },
  {
    id: "rec-3",
    title: "Nexa Desk Mat XL Water-Resistant Felt",
    slug: "nexa-desk-mat-xl",
    price: 19.99,
    originalPrice: 29.99,
    discount: 33,
    rating: 4.9,
    reviewCount: 78,
    soldCount: 1560,
    category: "Electronics",
    images: ["https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=600&q=80"],
  },
  {
    id: "rec-4",
    title: "Nexa Fast Charge 65W GaN Charger 3-Port",
    slug: "nexa-65w-gan-charger",
    price: 27.99,
    originalPrice: 39.99,
    discount: 30,
    rating: 4.9,
    reviewCount: 230,
    soldCount: 3100,
    category: "Electronics",
    images: ["https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80"],
  },
];

// ----------------------------------------------------------------------
// Main Product Detail Page Component
// ----------------------------------------------------------------------

export function ProductDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { slug } = Route.useParams();

  // Auth & Context Hooks
  const authContext = (useAuth() as any) || {};
  const user = authContext?.user ?? null;

  const cartContext = (useCart() as any) || {};
  const wishlistContext = (useWishlist() as any) || {};

  // Fetch Main Product
  const {
    data: rawProduct,
    isLoading: productLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["product-detail", slug],
    queryFn: async () => {
      if (firebaseConfigured) {
        try {
          const res = await getProductBySlug(slug);
          if (res) return res;
        } catch (err) {
          console.warn("getProductBySlug error or missing:", err);
        }
      }
      // Fallback lookup or generic product
      const foundMock = MOCK_PRODUCTS[slug];
      if (foundMock) {
        return foundMock as Product;
      }
      // Try fetching list from firebase or use default fallback
      try {
        const all = await listProducts();
        const matched = all.find((p: any) => p.slug === slug || p.id === slug);
        if (matched) return matched;
      } catch (_) {}

      // Return synthetic product filled with slug name
      const formattedTitle = slug
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        ...DEFAULT_FALLBACK_PRODUCT,
        id: `prod-${slug}`,
        slug,
        title: formattedTitle || DEFAULT_FALLBACK_PRODUCT.title,
      } as Product;
    },
    staleTime: 1000 * 60 * 5,
  });

  const product = rawProduct as Partial<Product> | null;

  // Fetch Related Products
  const { data: relatedProducts = [] } = useQuery({
    queryKey: ["related-products", product?.category || "all"],
    queryFn: async () => {
      if (firebaseConfigured) {
        try {
          const list = await listProducts({ category: product?.category });
          if (list && list.length > 0) return list;
        } catch (_) {}
      }
      return MOCK_RECOMMENDED_PRODUCTS as Product[];
    },
    enabled: !!product,
  });

  // Local State
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<"description" | "specifications" | "reviews">("description");

  // Image Zoom State
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [zoomPos, setZoomPos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });

  // Share & Review State
  const [copied, setCopied] = useState<boolean>(false);
  const [userReviews, setUserReviews] = useState<Review[]>(MOCK_REVIEWS);
  const [newRating, setNewRating] = useState<number>(5);
  const [newComment, setNewComment] = useState<string>("");
  const [newTitle, setNewTitle] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  // Initialize selected variants when product loads
  useEffect(() => {
    if (product) {
      if (product.colors && product.colors.length > 0) {
        setSelectedColor(product.colors[0]);
      }
      if (product.sizes && product.sizes.length > 0) {
        setSelectedSize(product.sizes[0]);
      }
      setSelectedImageIndex(0);
      setQuantity(1);
    }
  }, [product?.id]);

  // Image List extraction
  const images = useMemo(() => {
    if (!product) return [];
    if (Array.isArray(product.images) && product.images.length > 0) {
      return product.images.map((img: any) =>
        typeof img === "string" ? img : img.url || img.src || ""
      );
    }
    if ((product as any).imageUrl) return [(product as any).imageUrl];
    if ((product as any).thumbnail) return [(product as any).thumbnail];
    return ["https://via.placeholder.com/600x600?text=Shop+Nexa+Product"];
  }, [product]);

  // Wishlist Check & Handler
  const isWishlisted = useMemo(() => {
    if (!product?.id) return false;
    if (typeof wishlistContext.isInWishlist === "function") {
      return wishlistContext.isInWishlist(product.id);
    }
    if (Array.isArray(wishlistContext.items)) {
      return wishlistContext.items.some(
        (i: any) => i.id === product.id || i.productId === product.id
      );
    }
    return false;
  }, [wishlistContext, product?.id]);

  const handleToggleWishlist = () => {
    if (!product) return;
    if (typeof wishlistContext.toggleWishlist === "function") {
      wishlistContext.toggleWishlist(product);
    } else if (typeof wishlistContext.toggleItem === "function") {
      wishlistContext.toggleItem(product);
    } else if (typeof wishlistContext.addToWishlist === "function") {
      wishlistContext.addToWishlist(product);
    }
    toast.success(
      isWishlisted
        ? "Removed from wishlist"
        : "Added to your Shop Nexa wishlist!"
    );
  };

  // Add To Cart Handler
  const handleAddToCart = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!product) return;

      const itemToAdd = {
        ...product,
        selectedColor,
        selectedSize,
        quantity,
      };

      if (typeof cartContext.addToCart === "function") {
        cartContext.addToCart(product, quantity, { color: selectedColor, size: selectedSize });
      } else if (typeof cartContext.addItem === "function") {
        cartContext.addItem(itemToAdd);
      } else if (typeof cartContext.addItemToCart === "function") {
        cartContext.addItemToCart(itemToAdd);
      }

      toast.success(
        `Added ${quantity}x ${product.title || "item"} to cart!`,
        {
          description: selectedColor || selectedSize ? `Variant: ${selectedColor} ${selectedSize}` : undefined,
          action: {
            label: "View Cart",
            onClick: () => navigate({ to: "/cart" as any }),
          },
        }
      );
    },
    [cartContext, product, quantity, selectedColor, selectedSize, navigate]
  );

  // Buy Now Handler
  const handleBuyNow = useCallback(() => {
    if (!product) return;
    handleAddToCart();
    navigate({ to: "/checkout" as any });
  }, [handleAddToCart, navigate, product]);

  // Hover Zoom Handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomPos({ x, y });
  };

  // Copy Link Handler
  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("Product link copied to clipboard!");
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // Share Handlers
  const handleShareFacebook = () => {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank");
  };

  const handleShareWhatsApp = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`Check out ${product?.title} on Shop Nexa! `);
    window.open(`https://api.whatsapp.com/send?text=${text}${url}`, "_blank");
  };

  // Submit Review Handler
  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) {
      toast.error("Please enter a review message.");
      return;
    }
    setIsSubmittingReview(true);
    setTimeout(() => {
      const newRev: Review = {
        id: `rev-${Date.now()}`,
        userName: user?.displayName || user?.email?.split("@")[0] || "Verified Nexa Buyer",
        rating: newRating,
        comment: newComment,
        date: new Date().toISOString().split("T")[0],
        title: newTitle || "Verified Purchase Review",
        verified: true,
        helpfulCount: 0,
        avatar: user?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80",
      };
      setUserReviews([newRev, ...userReviews]);
      setNewComment("");
      setNewTitle("");
      setIsSubmittingReview(false);
      toast.success("Thank you! Your review has been submitted successfully.");
    }, 600);
  };

  // Calculations
  const price = product?.price ?? 0;
  const originalPrice = product?.compareAtPrice ?? (product as any)?.compareAtPrice;
  const discountPercent = useMemo(() => {
    if (product?.discount && (product as any).discount > 0) return Math.round((product as any).discount);
    if (originalPrice && originalPrice > price) {
      return Math.round(((originalPrice - price) / originalPrice) * 100);
    }
    return 0;
  }, [product?.discount, originalPrice, price]);

  // Related Products Horizontal Scroll Ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRelated = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === "left" ? -320 : 320;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  // ----------------------------------------------------------------------
  // Render Loading Skeleton
  // ----------------------------------------------------------------------
  if (productLoading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col font-sans">
        <TopBar />
        <SiteHeader />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
          {/* Skeleton Breadcrumb */}
          <div className="h-4 w-48 bg-slate-200 animate-pulse rounded mb-6" />

          {/* Skeleton Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="aspect-square bg-slate-200 animate-pulse rounded-xl w-full" />
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-16 h-16 bg-slate-200 animate-pulse rounded-lg" />
                ))}
              </div>
            </div>
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="h-8 w-3/4 bg-slate-200 animate-pulse rounded" />
              <div className="h-4 w-1/3 bg-slate-200 animate-pulse rounded" />
              <div className="h-12 w-1/2 bg-slate-200 animate-pulse rounded" />
              <div className="h-20 w-full bg-slate-200 animate-pulse rounded" />
              <div className="h-10 w-full bg-slate-200 animate-pulse rounded" />
              <div className="h-12 w-full bg-slate-200 animate-pulse rounded" />
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // Render Error / 404 State
  // ----------------------------------------------------------------------
  if (isError || !product) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col font-sans">
        <TopBar />
        <SiteHeader />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-orange-100 text-[#f97316] rounded-full flex items-center justify-center mb-4 shadow-sm">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-[#1a1f3a] mb-2">Product Not Found</h1>
          <p className="text-slate-500 max-w-md mb-6">
            The product you are looking for might have been removed, renamed, or is temporarily unavailable on Shop Nexa.
          </p>
          <div className="flex gap-4">
            <Link
              to="/shop"
              className="px-6 py-2.5 bg-[#1a1f3a] text-white rounded-xl font-medium hover:bg-[#2a3154] transition"
            >
              Back to Shop
            </Link>
            <button
              onClick={() => refetch()}
              className="px-6 py-2.5 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Try Again
            </button>
          </div>
        </main>
        <SiteFooter />
        <WhatsAppFab />
        <MobileBottomNav />
      </div>
    );
  }

  // Seller Details Safe Defaults
  const sellerInfo = (product as any).seller || {
    name: (product as any).brand || "Shop Nexa Verified Seller",
    rating: 96,
    responseTime: "< 1 Hour",
    shipOnTime: 99,
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col font-sans text-slate-800">
      <TopBar />
      <SiteHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12">
        {/* BREADCRUMB */}
        <nav className="flex items-center text-xs md:text-sm text-slate-500 mb-4 overflow-x-auto whitespace-nowrap">
          <Link to="/" className="hover:text-[#f97316] transition">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-slate-400 shrink-0" />
          <Link to="/shop" className="hover:text-[#f97316] transition">
            Shop
          </Link>
          <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-slate-400 shrink-0" />
          {product.category && (
            <>
              <Link
                to="/shop"
                search={{ category: product.category }}
                className="hover:text-[#f97316] transition capitalize"
              >
                {product.category}
              </Link>
              <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-slate-400 shrink-0" />
            </>
          )}
          <span className="text-[#1a1f3a] font-medium truncate max-w-[200px] md:max-w-xs">
            {product.title}
          </span>
        </nav>

        {/* TWO COLUMN PRODUCT OVERVIEW CARD */}
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-200/80 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            
            {/* LEFT COLUMN: Image Gallery + Zoom + Share */}
            <div className="lg:col-span-5 flex flex-col">
              {/* Main Image Viewport with Hover Zoom */}
              <div
                className="relative w-full aspect-square bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 group cursor-zoom-in"
                onMouseEnter={() => setIsZoomed(true)}
                onMouseLeave={() => setIsZoomed(false)}
                onMouseMove={handleMouseMove}
              >
                <img
                  src={images[selectedImageIndex] || images[0]}
                  alt={product.title || "Product image"}
                  className={`w-full h-full object-cover object-center transition-transform duration-200 ${
                    isZoomed ? "scale-150 cursor-crosshair" : "scale-100"
                  }`}
                  style={
                    isZoomed
                      ? {
                          transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                        }
                      : undefined
                  }
                />

                {/* Floating Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
                  {discountPercent > 0 && (
                    <span className="bg-[#f97316] text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-md uppercase tracking-wide">
                      -{discountPercent}% OFF
                    </span>
                  )}
                  {(product as any).freeShipping && (
                    <span className="bg-[#1a1f3a] text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-md shadow-md flex items-center gap-1">
                      <Truck className="w-3 h-3 text-[#f97316]" /> Free Delivery
                    </span>
                  )}
                </div>

                {/* Wishlist Button Overlay */}
                <button
                  onClick={handleToggleWishlist}
                  className="absolute top-3 right-3 z-10 w-10 h-10 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center text-slate-600 shadow-md hover:bg-white hover:text-red-500 transition"
                  title="Save to Wishlist"
                >
                  <Heart
                    className={`w-5 h-5 transition-colors ${
                      isWishlisted ? "fill-red-500 text-red-500" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Thumbnail Strip */}
              {images.length > 1 && (
                <div className="flex gap-2.5 mt-4 overflow-x-auto pb-1 scrollbar-none">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`relative w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden border-2 transition shrink-0 bg-slate-50 ${
                        selectedImageIndex === idx
                          ? "border-[#f97316] ring-2 ring-orange-100 scale-105"
                          : "border-slate-200 hover:border-slate-300 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={img}
                        alt={`Thumbnail ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Social Share Bar */}
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Share2 className="w-4 h-4 text-[#f97316]" /> Share Product:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleShareFacebook}
                    className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition flex items-center gap-1 font-medium"
                    title="Share on Facebook"
                  >
                    <Facebook className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleShareWhatsApp}
                    className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition flex items-center gap-1 font-medium"
                    title="Share on WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleCopyLink}
                    className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center gap-1 font-medium"
                    title="Copy Link"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Details + Pricing + Buy Controls + Seller Info */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                {/* Brand / Store Tag */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#f97316] bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-100">
                    {(product as any).brand || "Shop Nexa Exclusive"}
                  </span>
                  {(product as any).inStock !== false && (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      In Stock
                    </span>
                  )}
                </div>

                {/* Product Title */}
                <h1 className="text-xl md:text-2xl lg:text-3xl font-extrabold text-[#1a1f3a] leading-tight mb-3">
                  {product.title}
                </h1>

                {/* Rating + Reviews + Sold Count */}
                <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm mb-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span className="font-bold text-slate-800">
                      {product.rating ?? 4.8}
                    </span>
                    <span className="text-slate-400">/5</span>
                  </div>

                  <a
                    href="#reviews"
                    onClick={() => setActiveTab("reviews")}
                    className="text-slate-600 hover:text-[#f97316] underline decoration-slate-300 transition"
                  >
                    {product.reviewCount ?? 128} Ratings & Reviews
                  </a>

                  <span className="text-slate-300">•</span>

                  <span className="text-slate-500 font-medium flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#f97316]" />
                    {(product as any).soldCount ?? 850}+ Sold
                  </span>
                </div>

                {/* PRICE SECTION */}
                <div className="bg-slate-50/80 rounded-2xl p-4 md:p-5 border border-slate-100 mb-6">
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl md:text-4xl font-extrabold text-[#1a1f3a]">
                      {formatPrice(price)}
                    </span>
                    {originalPrice && originalPrice > price && (
                      <span className="text-base md:text-lg text-slate-400 line-through">
                        {formatPrice(originalPrice)}
                      </span>
                    )}
                    {discountPercent > 0 && (
                      <span className="text-xs md:text-sm font-bold bg-[#f97316] text-white px-2.5 py-0.5 rounded-md shadow-sm">
                        -{discountPercent}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-[#f97316] fill-[#f97316]" />
                    Lowest price in 30 days. Inclusive of all taxes.
                  </p>
                </div>

                {/* SHORT DESCRIPTION / BULLET POINTS */}
                {(product as any).shortDescription && (
                  <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                    {(product as any).shortDescription}
                  </p>
                )}

                {(product as any).features && (product as any).features.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Key Highlights
                    </h4>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs md:text-sm text-slate-700">
                      {(product as any).features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* COLOR VARIANT SELECTOR */}
                {product.colors && product.colors.length > 0 && (
                  <div className="mb-5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Color / Finish: <span className="text-[#f97316]">{selectedColor}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {product.colors.map((color) => (
                        <button
                          key={color}
                          onClick={() => setSelectedColor(color)}
                          className={`px-3.5 py-1.5 text-xs font-medium rounded-xl border transition ${
                            selectedColor === color
                              ? "border-[#f97316] bg-orange-50 text-[#f97316] ring-2 ring-orange-100 font-bold"
                              : "border-slate-200 text-slate-700 hover:border-slate-300 bg-white"
                          }`}
                        >
                          {color}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* SIZE VARIANT SELECTOR */}
                {product.sizes && product.sizes.length > 0 && (
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Option / Size: <span className="text-[#f97316]">{selectedSize}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {product.sizes.map((size) => (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          className={`px-3.5 py-1.5 text-xs font-medium rounded-xl border transition ${
                            selectedSize === size
                              ? "border-[#f97316] bg-orange-50 text-[#f97316] ring-2 ring-orange-100 font-bold"
                              : "border-slate-200 text-slate-700 hover:border-slate-300 bg-white"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* QUANTITY SELECTOR */}
                <div className="mb-6 flex items-center gap-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Quantity:
                  </span>
                  <div className="flex items-center border border-slate-300 rounded-xl bg-white overflow-hidden shadow-sm">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-12 text-center text-sm font-bold text-slate-800">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(product.stock || 99, q + 1))}
                      disabled={quantity >= (product.stock || 99)}
                      className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {product.stock && (
                    <span className="text-xs text-slate-400">
                      ({product.stock} available)
                    </span>
                  )}
                </div>

                {/* ACTION BUTTONS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  {/* ADD TO CART - NAVY BG */}
                  <button
                    onClick={handleAddToCart}
                    className="w-full py-3.5 px-6 rounded-xl bg-[#1a1f3a] text-white font-bold text-sm hover:bg-[#2a3154] active:scale-[0.99] transition shadow-md flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Add to Cart
                  </button>

                  {/* BUY NOW - ORANGE BG */}
                  <button
                    onClick={handleBuyNow}
                    className="w-full py-3.5 px-6 rounded-xl bg-[#f97316] text-white font-bold text-sm hover:bg-[#ea580c] active:scale-[0.99] transition shadow-md flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4 fill-white" />
                    Buy Now
                  </button>
                </div>
              </div>

              {/* DELIVERY & SERVICE INFORMATION */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <div className="flex items-start gap-2.5">
                  <Truck className="w-5 h-5 text-[#f97316] shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">
                      Fast Delivery
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      2 - 4 Days • Cash on Delivery
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <RotateCcw className="w-5 h-5 text-[#f97316] shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">
                      7 Days Return
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Easy change of mind returns
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#f97316] shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold text-slate-800">
                      100% Authentic
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Warranty & Verified Genuine
                    </p>
                  </div>
                </div>
              </div>

              {/* SELLER INFO CARD */}
              <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1a1f3a] text-white font-extrabold flex items-center justify-center text-sm shadow-sm">
                    {sellerInfo.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1a1f3a] flex items-center gap-1.5">
                      {sellerInfo.name}
                      <CheckCircle className="w-4 h-4 text-blue-500 fill-blue-100" />
                    </h4>
                    <p className="text-xs text-slate-500">
                      {sellerInfo.rating}% Positive Rating • Response: {sellerInfo.responseTime}
                    </p>
                  </div>
                </div>

                <Link
                  to="/shop"
                  className="px-4 py-2 border border-slate-200 text-xs font-semibold text-[#1a1f3a] rounded-xl hover:bg-slate-50 transition flex items-center gap-1.5"
                >
                  <Store className="w-3.5 h-3.5 text-[#f97316]" />
                  Visit Store
                </Link>
              </div>

            </div>
          </div>
        </div>

        {/* FULL WIDTH DETAILS TABBED SECTION */}
        <div id="reviews" className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-200/80 mb-10">
          {/* TAB HEADERS */}
          <div className="flex border-b border-slate-200 mb-6 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab("description")}
              className={`py-3 px-6 text-sm font-bold transition border-b-2 shrink-0 ${
                activeTab === "description"
                  ? "border-[#f97316] text-[#f97316]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Description
            </button>
            <button
              onClick={() => setActiveTab("specifications")}
              className={`py-3 px-6 text-sm font-bold transition border-b-2 shrink-0 ${
                activeTab === "specifications"
                  ? "border-[#f97316] text-[#f97316]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Specifications
            </button>
            <button
              onClick={() => setActiveTab("reviews")}
              className={`py-3 px-6 text-sm font-bold transition border-b-2 shrink-0 flex items-center gap-1.5 ${
                activeTab === "reviews"
                  ? "border-[#f97316] text-[#f97316]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Customer Reviews ({userReviews.length})
            </button>
          </div>

          {/* TAB CONTENT: DESCRIPTION */}
          {activeTab === "description" && (
            <div className="prose max-w-none text-slate-700 text-sm md:text-base leading-relaxed space-y-4">
              <p>{product.description}</p>

              {(product as any).features && (product as any).features.length > 0 && (
                <div className="mt-6 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <h3 className="text-base font-bold text-[#1a1f3a] mb-3">
                    Product Highlights & Benefits
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(product as any).features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-orange-100 text-[#f97316] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          ✓
                        </span>
                        <span className="text-sm text-slate-700">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: SPECIFICATIONS */}
          {activeTab === "specifications" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <tbody>
                  {(product.specifications || [
                    { name: "Brand", value: (product as any).brand || "Shop Nexa" },
                    { name: "SKU", value: product.id },
                    { name: "Category", value: product.category || "General" },
                    { name: "In Stock", value: (product as any).inStock ? "Yes" : "No" },
                    { name: "Warranty", value: "1 Year Official Warranty" },
                  ]).map((spec, idx) => (
                    <tr
                      key={idx}
                      className={idx % 2 === 0 ? "bg-slate-50" : "bg-white"}
                    >
                      <td className="py-3 px-4 font-semibold text-slate-600 w-1/3 border-b border-slate-100">
                        {spec.name}
                      </td>
                      <td className="py-3 px-4 text-slate-800 border-b border-slate-100">
                        {spec.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB CONTENT: REVIEWS */}
          {activeTab === "reviews" && (
            <div className="space-y-8">
              {/* Ratings Summary Header */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100 items-center">
                <div className="md:col-span-4 text-center md:text-left flex flex-col items-center md:items-start justify-center border-b md:border-b-0 md:border-r border-slate-200 pb-4 md:pb-0 md:pr-6">
                  <div className="text-5xl font-extrabold text-[#1a1f3a] mb-1">
                    {product.rating ?? 4.8}
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-5 h-5 ${
                          s <= Math.round(product.rating ?? 5)
                            ? "text-amber-400 fill-amber-400"
                            : "text-slate-300"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    Based on {userReviews.length} verified ratings
                  </p>
                </div>

                {/* Rating Breakdown Bars */}
                <div className="md:col-span-8 space-y-2">
                  {[
                    { stars: 5, pct: 85 },
                    { stars: 4, pct: 10 },
                    { stars: 3, pct: 3 },
                    { stars: 2, pct: 1 },
                    { stars: 1, pct: 1 },
                  ].map((row) => (
                    <div key={row.stars} className="flex items-center gap-3 text-xs">
                      <span className="w-12 font-medium text-slate-600 flex items-center gap-1">
                        {row.stars} <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      </span>
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#f97316] rounded-full"
                          style={{ width: `${row.pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-slate-400 font-medium">
                        {row.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* WRITE A REVIEW FORM */}
              <form
                onSubmit={handleSubmitReview}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
              >
                <h4 className="text-base font-bold text-[#1a1f3a] flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-[#f97316]" /> Write a Customer Review
                </h4>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-600">Your Rating:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setNewRating(star)}
                        className="p-1 hover:scale-110 transition"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            star <= newRating
                              ? "text-amber-400 fill-amber-400"
                              : "text-slate-300"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Review Title (e.g. Excellent Build Quality!)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-2.5 text-xs md:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f97316]"
                />

                <textarea
                  rows={3}
                  placeholder="Share details about your experience with this product..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="w-full px-4 py-2.5 text-xs md:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f97316]"
                />

                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-6 py-2.5 bg-[#1a1f3a] text-white text-xs font-bold rounded-xl hover:bg-[#2a3154] transition disabled:opacity-50 flex items-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSubmittingReview ? "Submitting..." : "Submit Review"}
                </button>
              </form>

              {/* REVIEWS LIST */}
              <div className="space-y-4">
                {userReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 md:p-5 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={rev.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80"}
                          alt={rev.userName}
                          className="w-9 h-9 rounded-full object-cover border border-slate-200"
                        />
                        <div>
                          <h5 className="text-xs md:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            {rev.userName}
                            {rev.verified && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded font-semibold">
                                Verified Purchase
                              </span>
                            )}
                          </h5>
                          <span className="text-[11px] text-slate-400">
                            {rev.date}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              s <= rev.rating
                                ? "text-amber-400 fill-amber-400"
                                : "text-slate-200"
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {rev.title && (
                      <h6 className="text-xs md:text-sm font-bold text-slate-800">
                        {rev.title}
                      </h6>
                    )}

                    <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
                      {rev.comment}
                    </p>

                    <div className="pt-2 flex items-center gap-4 text-xs text-slate-400">
                      <button className="flex items-center gap-1 hover:text-[#f97316] transition">
                        <ThumbsUp className="w-3.5 h-3.5" /> Helpful ({rev.helpfulCount || 0})
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RELATED PRODUCTS HORIZONTAL SCROLL */}
        {relatedProducts.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg md:text-xl font-extrabold text-[#1a1f3a] flex items-center gap-2">
                <Package className="w-5 h-5 text-[#f97316]" /> Related Products
              </h3>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => scrollRelated("left")}
                  className="w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 transition shadow-sm"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => scrollRelated("right")}
                  className="w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 transition shadow-sm"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div
              ref={scrollContainerRef}
              className="flex gap-4 overflow-x-auto pb-4 scrollbar-none scroll-smooth"
            >
              {relatedProducts.map((p) => (
                <div key={p.id} className="w-56 shrink-0">
                  <ProductCard product={p as Product} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* YOU MAY ALSO LIKE GRID */}
        <div className="mb-12">
          <h3 className="text-lg md:text-xl font-extrabold text-[#1a1f3a] mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#f97316]" /> You May Also Like
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
            {(relatedProducts.length > 0 ? relatedProducts : MOCK_RECOMMENDED_PRODUCTS).map(
              (p) => (
                <ProductCard key={p.id} product={p as Product} />
              )
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
      <WhatsAppFab />
      <MobileBottomNav />
    </div>
  );
}

export default ProductDetailPage;
