import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useWishlist } from "@/context/WishlistContext";
import { useState, useMemo, useEffect } from "react";
import {
  Trash2,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Truck,
  ShieldCheck,
  ArrowRight,
  Check,
  X,
  Heart,
  Store,
  ChevronRight,
  ShoppingCart,
  RotateCcw,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Wallet,
  BadgePercent,
  HelpCircle,
} from "lucide-react";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { formatPrice } from "@/utils/format";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getProductById } from "@/services/firebase/products";
import { getSellerProfile } from "@/services/firebase/sellers";
import { firebaseConfigured } from "@/services/firebase/config";
import { validateCoupon, CouponError } from "@/services/firebase/coupons";
import type { Product } from "@/types/commerce";

// ----------------------------------------------------------------------
// Route Definition
// ----------------------------------------------------------------------

export const Route = createFileRoute("/cart")({
  component: CartPage,
});

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export interface CartItemType {
  id: string;
  productId?: string;
  title: string;
  price: number;
  originalPrice?: number;
  image: string;
  seller?: string;
  sellerRating?: number;
  variant?: string;
  color?: string;
  size?: string;
  quantity: number;
  stock?: number;
}

export interface CouponType {
  code: string;
  discountType: "percent" | "fixed";
  value: number;
  minSubtotal?: number;
  description: string;
}

// ----------------------------------------------------------------------
// No sample/mock data — cart starts empty and is populated from Firebase only
// ----------------------------------------------------------------------

// Coupons are fetched from Firestore (no hardcoded values)



// ----------------------------------------------------------------------
// Main Cart Page Component
// ----------------------------------------------------------------------

export default function CartPage() {
  const navigate = useNavigate();

  // Context Hooks with Defensive Safe Fallbacks
  const cartContext = useCart();
  const _authContext = useAuth();
  const wishlistContext = useWishlist();

  // Extract Context Items if exists, else use state initializers
  const rawContextItems = cartContext?.items ?? [];

  // Local State for Cart Items (so cart remains fully interactive)
  const [items, setItems] = useState<CartItemType[]>(() => {
    if (Array.isArray(rawContextItems) && rawContextItems.length > 0) {
      return rawContextItems.map((item, index: number) => ({
        id: String(item.productId || `item-${index}`),
        productId: String(item.productId || `prod-${index}`),
        title: item.title || "AVENTA SHOP Product",
        price: Number(item.price || 0),
        originalPrice: undefined,
        image:
          item.image ||
          "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMDAgMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzljYTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlNob3AgTmV4YTwvdGV4dD48L3N2Zz4=",
        seller: "",
        sellerRating: 4.8,
        variant: "Standard",
        color: undefined,
        size: undefined,
        quantity: Number(item.quantity || 1),
        stock: item.stock || 20,
      }));
    }
    return [];
  });

  // Fetch product details for each cart item to get sellerId, compareAtPrice, etc.
  const productIds = items.map((i) => i.productId || i.id).filter(Boolean);
  const { data: productDetails = {} } = useQuery({
    queryKey: ["cart-products", productIds],
    queryFn: async () => {
      if (!firebaseConfigured || productIds.length === 0) return {};
      const results: Record<string, Product> = {};
      await Promise.all(
        productIds.map(async (pid) => {
          try {
            const product = await getProductById(pid);
            if (product) results[pid] = product;
          } catch (e) {
            console.warn("Failed to fetch product:", pid, e);
          }
        })
      );
      return results;
    },
    enabled: productIds.length > 0,
    staleTime: 60_000,
  });

  // Fetch seller profiles for each unique sellerId
  const sellerIds = Object.values(productDetails)
    .map((p: Product) => p.sellerId)
    .filter(Boolean) as string[];
  const uniqueSellerIds = [...new Set(sellerIds)];
  const { data: sellerProfiles = {} } = useQuery({
    queryKey: ["cart-sellers", uniqueSellerIds],
    queryFn: async () => {
      if (!firebaseConfigured || uniqueSellerIds.length === 0) return {};
      const results: Record<string, { shopName: string; verified: boolean }> = {};
      await Promise.all(
        uniqueSellerIds.map(async (sid) => {
          try {
            const profile = await getSellerProfile(sid);
            if (profile) {
              results[sid] = {
                shopName: profile.shopName || "AVENTA SHOP",
                verified: profile.status === "approved",
              };
            }
          } catch (e) {
            console.warn("Failed to fetch seller:", sid, e);
          }
        })
      );
      return results;
    },
    enabled: uniqueSellerIds.length > 0,
    staleTime: 120_000,
  });

  // Enrich items with real seller names and product data from Firebase
  const enrichedItems = useMemo(() => {
    return items.map((item) => {
      const pid = item.productId || item.id;
      const product = productDetails[pid];
      const sellerId = product?.sellerId;
      const sellerInfo = sellerId ? sellerProfiles[sellerId] : null;
      return {
        ...item,
        seller: sellerInfo?.shopName || (sellerId ? "AVENTA SHOP" : "AVENTA SHOP"),
        sellerRating: product?.rating,
        originalPrice: item.originalPrice || (product?.compareAtPrice ? Number(product.compareAtPrice) : undefined),
        stock: item.stock || product?.stock || 0,
        image: item.image || (product?.images?.[0] ?? ""),
        title: item.title || product?.title || "Product",
      };
    });
  }, [items, productDetails, sellerProfiles]);

  // Rebuild sellerGroups from enriched items
  const enrichedSellerGroups = useMemo(() => {
    const groups: { [key: string]: CartItemType[] } = {};
    enrichedItems.forEach((item) => {
      const sellerName = item.seller || "AVENTA SHOP";
      if (!groups[sellerName]) groups[sellerName] = [];
      groups[sellerName].push(item);
    });
    return groups;
  }, [enrichedItems]);

  // Check if seller is verified from Firebase
  const isSellerVerified = (sellerName: string): boolean => {
    const found = Object.values(sellerProfiles).find((s: { shopName: string; verified: boolean }) => s.shopName === sellerName);
    return found?.verified ?? false;
  };

  // Selected Item IDs for Checkout Calculation
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    items.map((item) => item.id)
  );

  // Sync selectedIds if items list changes length
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = items.map((i) => i.id);
      const filteredPrev = prev.filter((id) => validIds.includes(id));
      if (filteredPrev.length === 0 && items.length > 0) {
        return items.map((i) => i.id);
      }
      return filteredPrev;
    });
  }, [items]);

  // Coupon Code State
  const [couponInput, setCouponCodeInput] = useState<string>("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponType | null>(null);
  const [couponError, setCouponError] = useState<string>("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState<boolean>(false);

  // Free Delivery Threshold
  const FREE_SHIPPING_THRESHOLD = 50.0;
  const STANDARD_SHIPPING_FEE = 5.0;

  // Group items by Seller / Store
  const _sellerGroups = useMemo(() => {
    const groups: { [key: string]: CartItemType[] } = {};
    items.forEach((item) => {
      const sellerName = item.seller || "AVENTA SHOP";
      if (!groups[sellerName]) {
        groups[sellerName] = [];
      }
      groups[sellerName].push(item);
    });
    return groups;
  }, [items]);

  // Filter Selected Items
  const selectedItems = useMemo(() => {
    return items.filter((item) => selectedIds.includes(item.id));
  }, [items, selectedIds]);

  // Total Checked Items Count
  const selectedTotalCount = useMemo(() => {
    return selectedItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [selectedItems]);

  // Selected Items Subtotal
  const itemsSubtotal = useMemo(() => {
    return selectedItems.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );
  }, [selectedItems]);

  // Total Original Value (for calculating savings)
  const totalOriginalValue = useMemo(() => {
    return selectedItems.reduce((acc, item) => {
      const orig = item.originalPrice || item.price;
      return acc + orig * item.quantity;
    }, 0);
  }, [selectedItems]);

  const totalDiscountSavings = useMemo(() => {
    return Math.max(0, totalOriginalValue - itemsSubtotal);
  }, [totalOriginalValue, itemsSubtotal]);

  // Shipping Fee Calculation
  const isFreeShipping = itemsSubtotal >= FREE_SHIPPING_THRESHOLD;
  const shippingFee =
    selectedItems.length === 0 || isFreeShipping ? 0 : STANDARD_SHIPPING_FEE;

  // Coupon Discount Calculation
  const couponDiscountAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.discountType === "percent") {
      return (itemsSubtotal * appliedCoupon.value) / 100;
    }
    return Math.min(itemsSubtotal, appliedCoupon.value);
  }, [appliedCoupon, itemsSubtotal]);

  // Final Order Total
  const finalTotal = useMemo(() => {
    return Math.max(0, itemsSubtotal + shippingFee - couponDiscountAmount);
  }, [itemsSubtotal, shippingFee, couponDiscountAmount]);

  // Free Shipping Progress
  const freeShippingProgress = useMemo(() => {
    if (itemsSubtotal >= FREE_SHIPPING_THRESHOLD) return 100;
    return Math.min(100, Math.round((itemsSubtotal / FREE_SHIPPING_THRESHOLD) * 100));
  }, [itemsSubtotal]);

  const amountNeededForFreeShipping = useMemo(() => {
    return Math.max(0, FREE_SHIPPING_THRESHOLD - itemsSubtotal);
  }, [itemsSubtotal]);

  // Check if All Items in Cart are Selected
  const isAllSelected =
    items.length > 0 && selectedIds.length === items.length;

  // Select / Deselect All Toggle
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
      toast.info("Unselected all items");
    } else {
      setSelectedIds(items.map((item) => item.id));
      toast.success("Selected all cart items");
    }
  };

  // Select / Deselect Individual Item
  const handleToggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Select / Deselect Seller Group
  const handleToggleSelectSellerGroup = (sellerItems: CartItemType[]) => {
    const sellerItemIds = sellerItems.map((i) => i.id);
    const allSellerSelected = sellerItemIds.every((id) =>
      selectedIds.includes(id)
    );

    if (allSellerSelected) {
      setSelectedIds((prev) => prev.filter((id) => !sellerItemIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...sellerItemIds])));
    }
  };

  // Quantity Handlers
  const handleUpdateQuantity = (id: string, newQty: number) => {
    if (newQty < 1) return;

    // Call context handler if available
    if (typeof cartContext?.updateQty === "function") {
      cartContext.updateQty(id, newQty);
    }

    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity: newQty } : item))
    );
  };

  // Single Item Remove
  const handleRemoveItem = (id: string, title?: string) => {
    if (typeof cartContext?.remove === "function") {
      cartContext.remove(id);
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));

    toast.success("Item removed from shopping cart", {
      description: title ? `"${title.slice(0, 30)}..."` : undefined,
    });
  };

  // Bulk Remove Selected
  const handleRemoveSelected = () => {
    if (selectedIds.length === 0) {
      toast.error("No items selected to remove");
      return;
    }

    selectedIds.forEach((id) => {
      if (typeof cartContext?.remove === "function") {
        cartContext.remove(id);
      }
    });

    setItems((prev) => prev.filter((item) => !selectedIds.includes(item.id)));
    setSelectedIds([]);

    toast.success("Selected items removed from cart");
  };

  // Move Item to Wishlist
  const handleMoveToWishlist = (item: CartItemType) => {
    if (typeof wishlistContext?.toggle === "function") {
      wishlistContext.toggle({
        id: item.productId || item.id,
        title: item.title,
        price: item.price,
        images: [item.image],
      } as any);
    }

    handleRemoveItem(item.id);
    toast.success("Moved to Wishlist", {
      description: item.title,
    });
  };

  // Bulk Move Selected to Wishlist
  const handleMoveSelectedToWishlist = () => {
    if (selectedIds.length === 0) {
      toast.error("No items selected");
      return;
    }

    const itemsToMove = items.filter((item) => selectedIds.includes(item.id));
    itemsToMove.forEach((item) => {
      if (typeof wishlistContext?.toggle === "function") {
        wishlistContext.toggle({
          id: item.productId || item.id,
          title: item.title,
          price: item.price,
          images: [item.image],
        } as any);
      }
    });

    handleRemoveSelected();
    toast.success(`${itemsToMove.length} items moved to Wishlist`);
  };

  // Clear All Items
  const handleClearAll = () => {
    if (typeof cartContext?.clear === "function") {
      cartContext.clear();
    }

    setItems([]);
    setSelectedIds([]);
    toast.info("Shopping cart cleared");
  };

  // Coupon Application Handler — validates against Firestore (server-authoritative)
  const handleApplyCoupon = async (codeToApply?: string) => {
    const code = (codeToApply || couponInput).trim().toUpperCase();
    setCouponError("");

    if (!code) {
      setCouponError("Please enter a voucher code");
      return;
    }

    setIsApplyingCoupon(true);
    try {
      const result = await validateCoupon(code, itemsSubtotal);
      setAppliedCoupon({
        code: result.coupon.code,
        discountType: result.coupon.type,
        value: result.coupon.value,
        minSubtotal: result.coupon.minSubtotal,
        description: result.coupon.type === "percent"
          ? `${result.coupon.value}% OFF`
          : `${formatPrice(result.coupon.value)} OFF`,
      });
      setCouponCodeInput("");
      toast.success(`Voucher code "${result.coupon.code}" applied!`);
    } catch (err) {
      if (err instanceof CouponError) {
        setCouponError(err.message);
        toast.error(err.message);
      } else {
        setCouponError("Failed to validate coupon");
        toast.error("Failed to validate coupon");
      }
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    toast.info("Voucher code removed");
  };

  // Checkout Handler
  const handleProceedToCheckout = () => {
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    if (selectedItems.length === 0) {
      toast.error("Please select at least one item to proceed to checkout");
      return;
    }

    toast.success("Redirecting to checkout...", {
      description: `${selectedTotalCount} items selected (${formatPrice(
        finalTotal
      )})`,
    });

    navigate({ to: "/checkout" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans antialiased selection:bg-orange-100 selection:text-orange-900">
      {/* Top Header Navigation Bar */}
      <SiteHeader />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-8">
        <div className="mb-3">
          <BackButton fallbackTo="/" label="Back" className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 active:scale-95" />
        </div>
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="mb-4 text-xs sm:text-sm text-slate-500 flex items-center gap-1.5">
          <Link to="/" className="hover:text-[#f57224] transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <Link to="/shop" className="hover:text-[#f57224] transition-colors">
            Shop
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-800">Shopping Cart</span>
        </nav>

        {/* Page Banner Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-4 sm:p-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-50 text-[#f57224] flex items-center justify-center border border-orange-100 shadow-inner">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">
                Shopping Cart
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {items.length > 0 ? (
                  <>
                    You have <span className="font-semibold text-slate-800">{items.length}</span> {items.length === 1 ? "item" : "items"} in your cart
                  </>
                ) : (
                  "Your cart is currently empty"
                )}
              </p>
            </div>
          </div>

          {/* Quick Support / Guarantee Alert Tag */}
          <div className="hidden lg:flex items-center gap-4 text-xs text-slate-600 bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-100">
            <div className="flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-emerald-600" />
              <span>Fast Delivery</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>100% Authentic</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-[#f57224]" />
              <span>7-Day Returns</span>
            </div>
          </div>
        </div>

        {/* Content Section: 2 Columns Layout (Desktop) or Stacked (Mobile) */}
        {items.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: Cart Header, Stores & Item Cards (8 cols) */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              {/* Select All & Bulk Actions Bar */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 select-none">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm font-semibold text-[#0f172a]">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 text-[#f57224] rounded border-slate-300 focus:ring-[#f57224] focus:ring-offset-0 cursor-pointer accent-[#f57224]"
                    />
                    <span>
                      Select All ({items.length} {items.length === 1 ? "item" : "items"})
                    </span>
                  </label>

                  {selectedIds.length > 0 && (
                    <span className="text-xs bg-orange-50 text-[#f57224] font-medium px-2 py-0.5 rounded-full border border-orange-200">
                      {selectedIds.length} selected
                    </span>
                  )}
                </div>

                {/* Bulk Action Options */}
                <div className="flex items-center gap-3 text-xs sm:text-sm">
                  {selectedIds.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={handleMoveSelectedToWishlist}
                        className="flex items-center gap-1.5 text-slate-600 hover:text-rose-600 font-medium transition-colors"
                      >
                        <Heart className="w-4 h-4" />
                        <span className="hidden sm:inline">Move to Wishlist</span>
                      </button>

                      <span className="text-slate-300">|</span>

                      <button
                        type="button"
                        onClick={handleRemoveSelected}
                        className="flex items-center gap-1.5 text-slate-600 hover:text-rose-600 font-medium transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Selected</span>
                      </button>

                      <span className="text-slate-300">|</span>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-slate-500 hover:text-slate-800 font-medium transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Items Grouped By Store / Seller */}
              {Object.entries(enrichedSellerGroups).map(([sellerName, sellerItems]) => {
                const sellerItemIds = sellerItems.map((i) => i.id);
                const isSellerAllSelected = sellerItemIds.every((id) =>
                  selectedIds.includes(id)
                );

                return (
                  <div
                    key={sellerName}
                    className="bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden"
                  >
                    {/* Store / Seller Header */}
                    <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200/60 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSellerAllSelected}
                          onChange={() =>
                            handleToggleSelectSellerGroup(sellerItems)
                          }
                          className="w-4 h-4 text-[#f57224] rounded border-slate-300 focus:ring-[#f57224] cursor-pointer accent-[#f57224]"
                        />
                        <Store className="w-4 h-4 text-[#0f172a]" />
                        <span className="text-sm font-bold text-[#0f172a] hover:text-[#f57224] transition-colors cursor-pointer">
                          {sellerName}
                        </span>
                        {isSellerVerified(sellerName) && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded border border-amber-200">Verified Seller</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
                        <Truck className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Fulfilled by AVENTA SHOP</span>
                      </div>
                    </div>

                    {/* Store Item List */}
                    <div className="divide-y divide-slate-100">
                      {sellerItems.map((item) => {
                        const isItemSelected = selectedIds.includes(item.id);
                        const discountPct = item.originalPrice && item.originalPrice > item.price
                          ? Math.round(
                              ((item.originalPrice - item.price) /
                                item.originalPrice) *
                                100
                            )
                          : 0;

                        return (
                          <div
                            key={item.id}
                            className={`p-3 sm:p-4 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 ${
                              isItemSelected ? "bg-white" : "bg-slate-50/40 opacity-75"
                            }`}
                          >
                            {/* Left Box: Checkbox + Product Image + Details */}
                            <div className="flex items-start gap-3 w-full sm:w-auto flex-1">
                              <input
                                type="checkbox"
                                checked={isItemSelected}
                                onChange={() => handleToggleSelectItem(item.id)}
                                className="w-4 h-4 text-[#f57224] rounded border-slate-300 focus:ring-[#f57224] cursor-pointer accent-[#f57224] mt-1 sm:mt-6"
                              />

                              {/* Product Thumbnail */}
                              <Link
                                to="/product/$productId"
                                params={{
                                  productId: item.productId || item.id,
                                }}
                                className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0 group"
                              >
                                <img
                                  src={item.image}
                                  alt={item.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  onError={(e) => {
                                    (e.target as HTMLElement).setAttribute(
                                      "src",
                                      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNTAgMTUwIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzljYTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=="
                                    );
                                  }}
                                />
                                {discountPct > 0 && (
                                  <span className="absolute top-1 left-1 bg-[#f57224] text-white text-[10px] font-bold px-1 py-0.2 rounded">
                                    -{discountPct}%
                                  </span>
                                )}
                              </Link>

                              {/* Product Info */}
                              <div className="flex-1 min-w-0">
                                <Link
                                  to="/product/$productId"
                                  params={{
                                    productId: item.productId || item.id,
                                  }}
                                  className="text-xs sm:text-sm font-semibold text-slate-800 hover:text-[#f57224] line-clamp-2 leading-snug transition-colors"
                                >
                                  {item.title}
                                </Link>

                                {/* Variants Info */}
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  {item.variant && (
                                    <span className="text-[11px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded border border-slate-200">
                                      {item.variant}
                                    </span>
                                  )}
                                  {item.color && (
                                    <span className="text-[11px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded border border-slate-200">
                                      Color: {item.color}
                                    </span>
                                  )}
                                  {item.size && (
                                    <span className="text-[11px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded border border-slate-200">
                                      Size: {item.size}
                                    </span>
                                  )}
                                </div>

                                {/* Unit Price Display */}
                                <div className="flex items-baseline gap-2 mt-2">
                                  <span className="text-base font-bold text-[#0f172a]">
                                    {formatPrice(item.price)}
                                  </span>
                                  {item.originalPrice &&
                                    item.originalPrice > item.price && (
                                      <span className="text-xs text-slate-400 line-through">
                                        {formatPrice(item.originalPrice)}
                                      </span>
                                    )}
                                </div>
                              </div>
                            </div>

                            {/* Right Box: Quantity Controls, Subtotal & Remove Button */}
                            <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                              {/* Quantity Selector */}
                              <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-sm">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateQuantity(
                                      item.id,
                                      item.quantity - 1
                                    )
                                  }
                                  disabled={item.quantity <= 1}
                                  className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>

                                <span className="w-9 text-center text-xs sm:text-sm font-semibold text-[#0f172a]">
                                  {item.quantity}
                                </span>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateQuantity(
                                      item.id,
                                      item.quantity + 1
                                    )
                                  }
                                  className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Item Subtotal & Actions */}
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-[#f57224]">
                                  {formatPrice(item.price * item.quantity)}
                                </span>

                                <div className="flex items-center gap-1.5 ml-2">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveToWishlist(item)}
                                    title="Move to Wishlist"
                                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-colors"
                                  >
                                    <Heart className="w-4 h-4" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveItem(item.id, item.title)
                                    }
                                    title="Remove Item"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-full hover:bg-slate-100 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Bottom Action / Return to Shop Link */}
              <div className="flex items-center justify-between pt-2">
                <Link
                  to="/shop"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f172a] hover:text-[#f57224] transition-colors bg-white px-4 py-2.5 rounded-lg border border-slate-200/80 shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Continue Shopping</span>
                </Link>

                <p className="text-xs text-slate-500 hidden sm:block">
                  Need help? Contact AVENTA SHOP 24/7 Support
                </p>
              </div>
            </div>

            {/* RIGHT COLUMN: Sidebar (Summary, Free Shipping Progress, Coupons, Trust Badges) (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-5 sticky top-20">
              {/* Free Delivery Progress Bar */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/80">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Truck className={`w-4 h-4 ${isFreeShipping ? "text-emerald-600" : "text-[#f57224]"}`} />
                    <span className="text-xs sm:text-sm font-bold text-[#0f172a]">
                      {isFreeShipping ? "Free Delivery Unlocked!" : "Free Delivery Progress"}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">
                    {freeShippingProgress}%
                  </span>
                </div>

                {/* Progress Track */}
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-2.5">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      isFreeShipping
                        ? "bg-emerald-500"
                        : "bg-gradient-to-r from-amber-400 to-[#f57224]"
                    }`}
                    style={{ width: `${freeShippingProgress}%` }}
                  />
                </div>

                {/* Status Subtext */}
                {isFreeShipping ? (
                  <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Your order qualifies for <strong>FREE Standard Delivery</strong>!</span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-600">
                    Add <strong className="text-[#f57224]">{formatPrice(amountNeededForFreeShipping)}</strong> more of items to get <strong className="text-[#0f172a]">FREE Delivery</strong>!
                  </p>
                )}
              </div>

              {/* Voucher Code Card */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/80">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4 text-[#f57224]" />
                  <h3 className="text-sm font-bold text-[#0f172a]">
                    Voucher / Promo Code
                  </h3>
                </div>

                {/* Applied Coupon Display */}
                {appliedCoupon ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-emerald-900 truncate">
                          {appliedCoupon.code} Applied
                        </p>
                        <p className="text-[11px] text-emerald-700 truncate">
                          {appliedCoupon.description}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-full hover:bg-emerald-100 transition-colors flex-shrink-0"
                      title="Remove Voucher"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Enter voucher code"
                        value={couponInput}
                        onChange={(e) => {
                          setCouponCodeInput(e.target.value);
                          setCouponError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleApplyCoupon();
                          }
                        }}
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f57224] uppercase"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyCoupon()}
                        disabled={isApplyingCoupon}
                        className="bg-[#f57224] hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                      >
                        {isApplyingCoupon ? "..." : "Apply"}
                      </button>
                    </div>

                    {couponError && (
                      <p className="text-xs text-rose-600 font-medium">
                        {couponError}
                      </p>
                    )}

                    {/* Quick Voucher Chips */}
                    <div className="pt-2">
                      <p className="text-[11px] text-slate-500 font-medium mb-1.5">
                        Available Store Vouchers:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[].slice(0, 6).map((c: CouponType) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => handleApplyCoupon(c.code)}
                            className="text-[11px] bg-orange-50 hover:bg-orange-100 text-[#f57224] font-semibold px-2 py-1 rounded border border-orange-200 transition-colors flex items-center gap-1"
                          >
                            <BadgePercent className="w-3 h-3" />
                            <span>{c.code}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Order Summary Card */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200/80">
                <h2 className="text-base font-bold text-[#0f172a] border-b border-slate-100 pb-3 mb-4">
                  Order Summary
                </h2>

                <div className="space-y-3 text-sm">
                  {/* Items Subtotal */}
                  <div className="flex items-center justify-between text-slate-600">
                    <span>
                      Subtotal ({selectedTotalCount} {selectedTotalCount === 1 ? "item" : "items"})
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatPrice(itemsSubtotal)}
                    </span>
                  </div>

                  {/* Shipping Fee */}
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1">
                      <span>Shipping Fee</span>
                      <HelpCircle
                        className="w-3.5 h-3.5 text-slate-400 cursor-pointer"
                        aria-label="Standard delivery fee across Bangladesh"
                      />
                    </span>
                    <span className="font-semibold">
                      {shippingFee === 0 ? (
                        <span className="text-emerald-600 font-bold uppercase text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          FREE
                        </span>
                      ) : (
                        formatPrice(shippingFee)
                      )}
                    </span>
                  </div>

                  {/* Voucher Discount */}
                  {appliedCoupon && (
                    <div className="flex items-center justify-between text-emerald-700">
                      <span>Voucher Discount</span>
                      <span className="font-bold">
                        -{formatPrice(couponDiscountAmount)}
                      </span>
                    </div>
                  )}

                  {/* Savings Highlight Badge */}
                  {totalDiscountSavings > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium p-2.5 rounded-lg flex items-center justify-between">
                      <span>Total Savings on Products:</span>
                      <span className="font-bold">
                        {formatPrice(totalDiscountSavings)}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-slate-200 pt-3 mt-3">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-base font-bold text-[#0f172a]">
                          Total
                        </span>
                        <p className="text-[11px] text-slate-400">
                          Inclusive of VAT & all taxes
                        </p>
                      </div>
                      <span className="text-2xl font-black text-[#f57224] tracking-tight">
                        {formatPrice(finalTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Proceed to Checkout CTA Button */}
                <button
                  type="button"
                  onClick={handleProceedToCheckout}
                  disabled={selectedItems.length === 0}
                  className="w-full mt-6 bg-[#0f172a] hover:bg-slate-800 active:bg-slate-900 text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <span>Proceed to Checkout ({selectedTotalCount})</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Payment Methods Preview */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/80">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                  Accepted Payment Methods
                </p>
                <div className="grid grid-cols-4 gap-2 text-center select-none">
                  {/* COD */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex flex-col items-center justify-center">
                    <Wallet className="w-5 h-5 text-emerald-600 mb-1" />
                    <span className="text-[10px] font-bold text-slate-700">COD</span>
                  </div>

                  {/* bKash */}
                  <div className="bg-pink-50 border border-pink-200 rounded-lg p-2 flex flex-col items-center justify-center">
                    <span className="text-xs font-black text-pink-600 mb-0.5">bKash</span>
                    <span className="text-[9px] font-semibold text-pink-700">Bkash</span>
                  </div>

                  {/* Nagad */}
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 flex flex-col items-center justify-center">
                    <span className="text-xs font-black text-[#f57224] mb-0.5">Nagad</span>
                    <span className="text-[9px] font-semibold text-orange-700">Nagad</span>
                  </div>

                  {/* Cards */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex flex-col items-center justify-center">
                    <CreditCard className="w-5 h-5 text-indigo-600 mb-1" />
                    <span className="text-[10px] font-bold text-slate-700">Cards</span>
                  </div>
                </div>
              </div>

              {/* Security & Trust Badges */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/80 space-y-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-[#0f172a]">
                      100% Secure Checkout
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      256-bit encrypted transactions for ultimate protection
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-2.5 flex items-start gap-3">
                  <RotateCcw className="w-5 h-5 text-[#f57224] flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-[#0f172a]">
                      7-Day Easy Returns
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Hassle-free replacement or full refund guarantee
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-2.5 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-[#0f172a]">
                      Verified Seller Products
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Authentic products directly from brand partners
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* EMPTY CART STATE */
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 max-w-lg w-full text-center">
              {/* Cart Empty Illustration */}
              <div className="relative mx-auto w-24 h-24 rounded-full bg-orange-50 border-2 border-orange-100 flex items-center justify-center mb-6 text-[#f57224]">
                <ShoppingCart className="w-12 h-12 stroke-[1.5]" />
                <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                  0
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-[#0f172a] mb-2">
                Your Shopping Cart is Empty
              </h2>
              <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto leading-relaxed">
                Looks like you haven't added anything to your cart yet. Explore our top daily deals, flash sales, and trending electronics!
              </p>

              <Link
                to="/shop"
                className="inline-flex items-center justify-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg text-sm"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Continue Shopping</span>
              </Link>
            </div>
            {/* Browse Products CTA */}
            <div className="mt-8 flex flex-col items-center gap-3">
              <p className="text-xs text-slate-400">Discover great deals and trending products</p>
              <Link
                to="/shop"
                className="inline-flex items-center justify-center gap-2 text-sm font-bold text-[#f57224] hover:text-[#e0621f] transition-colors"
              >
                <span>Browse All Products</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Fixed Bottom Checkout Bar */}
      {items.length > 0 && selectedItems.length > 0 && (
        <div className="lg:hidden fixed bottom-[64px] left-0 right-0 bg-white border-t border-slate-200 p-3 px-4 shadow-lg z-40 flex items-center justify-between gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px))" }}>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-medium">
              Total ({selectedTotalCount} items)
            </span>
            <span className="text-lg font-black text-[#f57224]">
              {formatPrice(finalTotal)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleProceedToCheckout}
            className="bg-[#0f172a] hover:bg-slate-800 text-white font-bold text-xs sm:text-sm py-2.5 px-5 rounded-lg flex items-center gap-2 shadow"
          >
            <span>Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Site Footer */}
      <SiteFooter />

      {/* Floating WhatsApp Fab & Mobile Bottom Navigation */}
<MobileBottomNav />
    </div>
  );
}
