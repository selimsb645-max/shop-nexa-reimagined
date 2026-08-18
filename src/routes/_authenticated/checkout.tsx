import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  Check,
  Truck,
  Zap,
  Store,
  Tag,
  X,
  Gift,
  Wallet,
  ShieldCheck,
  ChevronRight,
  ShoppingBag,
  ArrowLeft,
  CreditCard,
  Banknote,
  Lock,
  Clock,
  Package,
  Pencil,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/utils/format";
import { firebaseConfigured } from "@/services/firebase/config";
import { getProductById } from "@/services/firebase/products";
import { getSellerProfile } from "@/services/firebase/sellers";
import {
  listAddresses,
  saveAddress,
  setDefaultAddress,
  deleteAddress,
  type AddressInput,
} from "@/services/firebase/addresses";
import { getWalletBalance, getRewardPoints } from "@/services/firebase/wallet";
import { validateCoupon, CouponError } from "@/services/firebase/coupons";
import { computeShipping, createOrder } from "@/services/firebase/orders";
import type { PaymentMethod, Coupon, CartItem } from "@/types/commerce";
import type { Address } from "@/types/customer";

export const Route = createFileRoute("/_authenticated/checkout")({
  ssr: false,
  component: CheckoutPage,
  head: () => ({ meta: [{ title: "Checkout — Shop Nexa" }] }),
});

// ----------------------------------------------------------------------
// Bangladesh Divisions for Address Selector
// ----------------------------------------------------------------------
const BD_DIVISIONS = [
  "Dhaka",
  "Chattogram",
  "Khulna",
  "Rajshahi",
  "Barishal",
  "Sylhet",
  "Rangpur",
  "Mymensingh",
] as const;

// ----------------------------------------------------------------------
// Delivery Methods
// ----------------------------------------------------------------------
interface DeliveryMethod {
  id: string;
  name: string;
  desc: string;
  charge: number;
  etaDays: [number, number];
  icon: typeof Truck;
  badge?: string;
}

const DELIVERY_METHODS: DeliveryMethod[] = [
  {
    id: "standard",
    name: "Standard Delivery",
    desc: "Regular delivery via courier",
    charge: 5.0,
    etaDays: [3, 5],
    icon: Truck,
    badge: "Free over $50",
  },
  {
    id: "express",
    name: "Express Delivery",
    desc: "Fastest delivery option",
    charge: 12.0,
    etaDays: [1, 2],
    icon: Zap,
    badge: "1-2 days",
  },
];

// ----------------------------------------------------------------------
// Reward Points Conversion (from wallet service)
// ----------------------------------------------------------------------
const POINTS_PER_CURRENCY_REDEEM = 100; // 100 points = $1

// ----------------------------------------------------------------------
// Main Checkout Component
// ----------------------------------------------------------------------
function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ---- Cart ----
  const cartContext = useCart() as Record<string, unknown> & Partial<{ items: CartItem[]; clear: () => Promise<void> }>;
  const rawItems =
    cartContext?.items || cartContext?.cartItems || cartContext?.cart || [];
  const cartItems = Array.isArray(rawItems) ? rawItems : [];

  // ---- Fetch product details for seller info ----
  const productIds = cartItems
    .map((i: CartItem) => i.productId || i.id)
    .filter(Boolean);
  const { data: productDetails = {} } = useQuery({
    queryKey: ["checkout-products", productIds],
    queryFn: async () => {
      if (!firebaseConfigured || productIds.length === 0) return {};
      const results: Record<string, Product> = {};
      await Promise.all(
        productIds.map(async (pid: string) => {
          try {
            const p = await getProductById(pid);
            if (p) results[pid] = p;
          } catch (e) {
            console.warn("Failed to fetch product:", pid);
          }
        })
      );
      return results;
    },
    enabled: productIds.length > 0,
    staleTime: 60_000,
  });

  // ---- Fetch seller profiles ----
  const sellerIds = Object.values(productDetails)
    .map((p: Product) => p.sellerId)
    .filter(Boolean) as string[];
  const uniqueSellerIds = [...new Set(sellerIds)];
  const { data: sellerProfiles = {} } = useQuery({
    queryKey: ["checkout-sellers", uniqueSellerIds],
    queryFn: async () => {
      if (!firebaseConfigured || uniqueSellerIds.length === 0) return {};
      const results: Record<string, { shopName: string; verified: boolean }> = {};
      await Promise.all(
        uniqueSellerIds.map(async (sid) => {
          try {
            const profile = await getSellerProfile(sid);
            if (profile) {
              results[sid] = {
                shopName: profile.shopName || "Shop Nexa",
                verified: profile.status === "approved",
              };
            }
          } catch (e) {
            console.warn("Failed to fetch seller:", sid);
          }
        })
      );
      return results;
    },
    enabled: uniqueSellerIds.length > 0,
    staleTime: 120_000,
  });

  // ---- Enrich items with seller info ----
  const enrichedItems = useMemo(() => {
    return cartItems.map((item: CartItem, index: number) => {
      const pid = item.productId || item.id;
      const product = productDetails[pid];
      const sellerId = product?.sellerId;
      const sellerInfo = sellerId ? sellerProfiles[sellerId] : null;
      return {
        id: String(item.id || item.productId || `item-${index}`),
        productId: String(item.productId || item.id || `prod-${index}`),
        title: item.title || item.name || product?.title || "Product",
        price: Number(item.price || 0),
        image:
          item.image ||
          item.imageUrl ||
          item.thumbnail ||
          product?.images?.[0] ||
          "",
        quantity: Number(item.quantity || item.qty || 1),
        stock: item.stock || product?.stock || 0,
        originalPrice: item.originalPrice
          ? Number(item.originalPrice)
          : product?.compareAtPrice
          ? Number(product.compareAtPrice)
          : undefined,
        sellerName: sellerInfo?.shopName || "Shop Nexa",
        sellerVerified: sellerInfo?.verified ?? false,
      };
    });
  }, [cartItems, productDetails, sellerProfiles]);

  // ---- Group by seller ----
  const sellerGroups = useMemo(() => {
    const groups: Record<string, typeof enrichedItems> = {};
    enrichedItems.forEach((item) => {
      if (!groups[item.sellerName]) groups[item.sellerName] = [];
      groups[item.sellerName].push(item);
    });
    return groups;
  }, [enrichedItems]);

  // ---- Addresses ----
  const { data: addresses = [], refetch: refetchAddresses } = useQuery({
    queryKey: ["addresses", user?.uid],
    queryFn: () => listAddresses(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  useEffect(() => {
    if (addresses.length > 0 && !selectedAddressId) {
      const defaultAddr = addresses.find((a) => a.isDefault) || addresses[0];
      setSelectedAddressId(defaultAddr.id);
    }
  }, [addresses, selectedAddressId]);

  // ---- Delivery Method ----
  const [deliveryMethodId, setDeliveryMethodId] = useState("standard");
  const selectedDelivery = DELIVERY_METHODS.find(
    (m) => m.id === deliveryMethodId
  )!;

  // ---- Coupon ----
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    coupon: Coupon;
    discount: number;
  } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);

  // ---- Reward Points ----
  const { data: rewardPoints = 0 } = useQuery({
    queryKey: ["reward-points", user?.uid],
    queryFn: () => getRewardPoints(user!.uid),
    enabled: !!user && firebaseConfigured,
    staleTime: 30_000,
  });
  const [useRewardPoints, setUseRewardPoints] = useState(false);
  const [rewardPointsToUse, setRewardPointsToUse] = useState(0);
  const maxRewardPoints = Math.min(rewardPoints, 5000);
  const rewardDiscount = useRewardPoints
    ? rewardPointsToUse / POINTS_PER_CURRENCY_REDEEM
    : 0;

  // ---- Wallet ----
  const { data: walletBalance = 0 } = useQuery({
    queryKey: ["wallet-balance", user?.uid],
    queryFn: () => getWalletBalance(user!.uid),
    enabled: !!user && firebaseConfigured,
    staleTime: 30_000,
  });
  const [useWallet, setUseWallet] = useState(false);

  // ---- Payment Method ----
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    "cash_on_delivery"
  );

  // ---- Terms ----
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [placing, setPlacing] = useState(false);

  // ---- Calculations ----
  const itemsSubtotal = useMemo(
    () =>
      enrichedItems.reduce(
        (acc: number, i: CartItem) => acc + i.price * i.quantity,
        0
      ),
    [enrichedItems]
  );

  const couponDiscount = appliedCoupon?.discount || 0;
  const afterCoupon = Math.max(0, itemsSubtotal - couponDiscount);
  const rewardDiscountValue = Math.min(rewardDiscount, afterCoupon);
  const afterReward = Math.max(0, afterCoupon - rewardDiscountValue);

  const deliveryCharge = useMemo(() => {
    if (enrichedItems.length === 0) return 0;
    if (deliveryMethodId === "express") return DELIVERY_METHODS[1].charge;
    return computeShipping(afterReward);
  }, [afterReward, deliveryMethodId, enrichedItems.length]);

  const maxWalletUse = Math.max(0, afterReward + deliveryCharge - 0);
  const walletUsed = useWallet ? Math.min(walletBalance, maxWalletUse) : 0;
  const afterWallet = Math.max(0, afterReward + deliveryCharge - walletUsed);

  const grandTotal = afterWallet;

  // ---- Estimated delivery date ----
  const estimatedDelivery = useMemo(() => {
    const [minDays, maxDays] = selectedDelivery.etaDays;
    const now = new Date();
    const min = new Date(now);
    min.setDate(now.getDate() + minDays);
    const max = new Date(now);
    max.setDate(now.getDate() + maxDays);
    return `${min.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} - ${max.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}`;
  }, [selectedDelivery]);

  // ---- Coupon handlers ----
  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponError("Enter a voucher code");
      return;
    }
    setCouponError("");
    setCouponBusy(true);
    try {
      const result = await validateCoupon(code, itemsSubtotal);
      setAppliedCoupon(result);
      setCouponInput("");
      toast.success(`Voucher "${result.coupon.code}" applied!`);
    } catch (err) {
      if (err instanceof CouponError) {
        setCouponError(err.message);
        toast.error(err.message);
      } else {
        setCouponError("Failed to validate coupon");
        toast.error("Failed to validate coupon");
      }
    } finally {
      setCouponBusy(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError("");
    toast.info("Voucher removed");
  };

  // ---- Address handlers ----
  const handleSaveAddress = async (data: AddressInput, id?: string) => {
    if (!user) return;
    try {
      await saveAddress(user.uid, data, id);
      await refetchAddresses();
      setShowAddressForm(false);
      setEditingAddress(null);
      toast.success(id ? "Address updated" : "Address saved");
    } catch (e) {
      console.warn("Failed to save address:", e);
      toast.error("Failed to save address");
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!user) return;
    try {
      await setDefaultAddress(user.uid, id);
      await refetchAddresses();
      setSelectedAddressId(id);
      toast.success("Default address updated");
    } catch (e) {
      console.warn("Failed to set default address:", e);
      toast.error("Failed to update default address");
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!user) return;
    try {
      await deleteAddress(user.uid, id);
      await refetchAddresses();
      if (selectedAddressId === id) setSelectedAddressId("");
      toast.success("Address deleted");
    } catch (e) {
      console.warn("Failed to delete address:", e);
      toast.error("Failed to delete address");
    }
  };

  // ---- Place Order ----
  const handlePlaceOrder = async () => {
    if (!user) {
      toast.error("Please sign in to place your order");
      return;
    }
    if (cartItems.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    if (!selectedAddressId) {
      toast.error("Please select a delivery address");
      return;
    }
    if (!agreeTerms) {
      toast.error("Please accept the terms to continue");
      return;
    }

    const selectedAddress = addresses.find((a) => a.id === selectedAddressId);
    if (!selectedAddress) {
      toast.error("Selected address not found");
      return;
    }

    setPlacing(true);
    try {
      const orderId = await createOrder({
        userId: user.uid,
        buyerEmail: user.email ?? null,
        items: cartItems,
        shippingAddress: {
          fullName: selectedAddress.fullName,
          phone: selectedAddress.phone,
          addressLine: selectedAddress.addressLine,
          city: selectedAddress.city,
          postalCode: selectedAddress.postalCode,
          country: selectedAddress.country,
          notes: selectedAddress.notes,
        },
        paymentMethod,
        couponCode: appliedCoupon?.coupon.code ?? null,
        discount: couponDiscount,
        deliveryMethod: deliveryMethodId as "standard" | "express",
        rewardPoints: useRewardPoints ? rewardPointsToUse : 0,
        walletUsed: walletUsed,
      });

      if (typeof cartContext.clear === "function") {
        await cartContext.clear();
      }
      if (typeof cartContext.clearCart === "function") {
        await cartContext.clearCart();
      }

      toast.success("Order placed successfully!");
      navigate({
        to: "/order-success",
        search: { orderId },
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not place order"
      );
    } finally {
      setPlacing(false);
    }
  };

  // ---- Empty cart redirect ----
  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
        <SiteHeader />
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-orange-50 border-2 border-orange-100 flex items-center justify-center mb-5 text-[#f57224]">
              <ShoppingBag className="w-10 h-10 stroke-[1.5]" />
            </div>
            <h2 className="text-xl font-bold text-[#0f172a] mb-2">
              Your cart is empty
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Add products to your cart before checking out.
            </p>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white font-bold py-3.5 px-8 rounded-xl transition-all shadow-md text-sm"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Browse Products</span>
            </Link>
          </div>
        </main>
        <SiteFooter />
        <WhatsAppFab />
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans antialiased">
      <SiteHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-6 pb-32 lg:pb-8">
        {/* Breadcrumb */}
        <nav className="mb-4 text-xs sm:text-sm text-slate-500 flex items-center gap-1.5">
          <Link to="/" className="hover:text-[#f57224] transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <Link to="/cart" className="hover:text-[#f57224] transition-colors">
            Cart
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-[#0f172a]">Checkout</span>
        </nav>

        {/* Page Title */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#f57224]" />
            Secure Checkout
          </h1>
          <Link
            to="/cart"
            className="text-xs font-semibold text-slate-500 hover:text-[#f57224] flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Cart</span>
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          {/* ===================== LEFT COLUMN ===================== */}
          <div className="space-y-5">
            {/* ---- 1. DELIVERY ADDRESS ---- */}
            <CheckoutSection
              number={1}
              icon={<MapPin className="w-4 h-4" />}
              title="Delivery Address"
            >
              {addresses.length > 0 && !showAddressForm ? (
                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <div
                      key={addr.id}
                      onClick={() => setSelectedAddressId(addr.id)}
                      className={`relative border-2 rounded-xl p-4 cursor-pointer transition-all ${
                        selectedAddressId === addr.id
                          ? "border-[#f57224] bg-orange-50/50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            selectedAddressId === addr.id
                              ? "border-[#f57224] bg-[#f57224]"
                              : "border-slate-300"
                          }`}
                        >
                          {selectedAddressId === addr.id && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-[#0f172a]">
                              {addr.fullName}
                            </span>
                            <span className="text-xs text-slate-400">
                              {addr.phone}
                            </span>
                            {addr.isDefault && (
                              <span className="bg-[#0f172a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {addr.label} · {addr.addressLine}
                            {addr.city ? `, ${addr.city}` : ""}
                            {addr.postalCode ? ` - ${addr.postalCode}` : ""}
                            {addr.country ? `, ${addr.country}` : ""}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetDefault(addr.id);
                              }}
                              className="text-[10px] font-semibold text-[#f57224] hover:underline"
                            >
                              Set as default
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAddress(addr);
                                setShowAddressForm(true);
                              }}
                              className="text-[10px] font-semibold text-slate-500 hover:text-[#0f172a] flex items-center gap-0.5"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAddress(addr.id);
                              }}
                              className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 flex items-center gap-0.5"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setEditingAddress(null);
                      setShowAddressForm(true);
                    }}
                    className="w-full border-2 border-dashed border-slate-200 hover:border-[#f57224] rounded-xl py-3 text-sm font-semibold text-slate-500 hover:text-[#f57224] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add New Address</span>
                  </button>
                </div>
              ) : showAddressForm ? (
                <AddressForm
                  editing={editingAddress}
                  onSave={handleSaveAddress}
                  onCancel={() => {
                    setShowAddressForm(false);
                    setEditingAddress(null);
                  }}
                />
              ) : (
                <div className="text-center py-6">
                  <MapPin className="mx-auto w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500 mb-4">
                    No saved addresses yet
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddressForm(true)}
                    className="inline-flex items-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white text-sm font-bold py-2.5 px-5 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Delivery Address</span>
                  </button>
                </div>
              )}
            </CheckoutSection>

            {/* ---- 2. DELIVERY METHOD ---- */}
            <CheckoutSection
              number={2}
              icon={<Truck className="w-4 h-4" />}
              title="Delivery Method"
            >
              <div className="space-y-3">
                {DELIVERY_METHODS.map((method) => {
                  const Icon = method.icon;
                  const isSelected = deliveryMethodId === method.id;
                  return (
                    <div
                      key={method.id}
                      onClick={() => setDeliveryMethodId(method.id)}
                      className={`border-2 rounded-xl p-4 cursor-pointer transition-all flex items-center gap-3 ${
                        isSelected
                          ? "border-[#f57224] bg-orange-50/50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? "border-[#f57224] bg-[#f57224]"
                            : "border-slate-300"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <Icon
                        className={`w-5 h-5 ${
                          isSelected ? "text-[#f57224]" : "text-slate-400"
                        }`}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#0f172a]">
                            {method.name}
                          </span>
                          {method.badge && (
                            <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded">
                              {method.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {method.desc} · ETA{" "}
                          {method.etaDays[0]}-{method.etaDays[1]} days
                        </p>
                      </div>
                      <span className="text-sm font-bold text-[#0f172a]">
                        {method.charge === 0
                          ? "Free"
                          : formatPrice(method.charge)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CheckoutSection>

            {/* ---- 3. SELLER-WISE ORDER SPLIT ---- */}
            <CheckoutSection
              number={3}
              icon={<Store className="w-4 h-4" />}
              title="Order Items"
            >
              <div className="space-y-4">
                {Object.entries(sellerGroups).map(
                  ([sellerName, sellerItems]) => (
                    <div
                      key={sellerName}
                      className="border border-slate-200 rounded-xl overflow-hidden"
                    >
                      {/* Seller Header */}
                      <div className="bg-slate-50/80 px-4 py-2.5 border-b border-slate-200/60 flex items-center gap-2">
                        <Store className="w-4 h-4 text-[#0f172a]" />
                        <span className="text-sm font-bold text-[#0f172a]">
                          {sellerName}
                        </span>
                        {sellerItems[0]?.sellerVerified && (
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.2 rounded border border-amber-200">
                            Verified
                          </span>
                        )}
                      </div>
                      {/* Items */}
                      <div className="divide-y divide-slate-100">
                        {sellerItems.map((item: CartItem) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 p-3"
                          >
                            <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                              {item.image ? (
                                <img
                                  src={item.image}
                                  alt={item.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="w-5 h-5 text-slate-300" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs sm:text-sm font-semibold text-slate-800 line-clamp-2">
                                {item.title}
                              </h4>
                              <p className="text-xs text-slate-400 mt-0.5">
                                Qty: {item.quantity}
                                {item.originalPrice && item.originalPrice > item.price && (
                                  <span className="ml-2 text-[#f57224] font-semibold">
                                    {Math.round(
                                      ((item.originalPrice - item.price) /
                                        item.originalPrice) *
                                        100
                                    )}
                                    % OFF
                                  </span>
                                )}
                              </p>
                            </div>
                            <span className="text-sm font-bold text-[#0f172a] flex-shrink-0">
                              {formatPrice(item.price * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </CheckoutSection>

            {/* ---- 4. VOUCHER ---- */}
            <CheckoutSection
              number={4}
              icon={<Tag className="w-4 h-4" />}
              title="Voucher / Coupon"
            >
              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="text-sm font-bold text-emerald-700">
                        {appliedCoupon.coupon.code}
                      </span>
                      <p className="text-xs text-emerald-600">
                        {appliedCoupon.coupon.type === "percent"
                          ? `${appliedCoupon.coupon.value}% off`
                          : `${formatPrice(appliedCoupon.coupon.value)} off`}
                        {" · "}
                        You save {formatPrice(appliedCoupon.discount)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-full hover:bg-rose-50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleApplyCoupon();
                      }
                    }}
                    placeholder="Enter voucher code"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponBusy}
                    className="px-4 py-2.5 bg-[#0f172a] hover:bg-slate-800 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {couponBusy ? (
                      <span>Checking...</span>
                    ) : (
                      <>
                        <Tag className="w-3.5 h-3.5" />
                        <span>Apply</span>
                      </>
                    )}
                  </button>
                </div>
              )}
              {couponError && (
                <p className="text-xs text-rose-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {couponError}
                </p>
              )}
            </CheckoutSection>

            {/* ---- 5. REWARD POINTS ---- */}
            <CheckoutSection
              number={5}
              icon={<Gift className="w-4 h-4" />}
              title="Reward Points"
            >
              {rewardPoints > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Gift className="w-4 h-4 text-[#f57224]" />
                      <span className="text-sm text-slate-700">
                        Available:{" "}
                        <span className="font-bold text-[#0f172a]">
                          {rewardPoints.toLocaleString()} points
                        </span>
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      = {formatPrice(rewardPoints / POINTS_PER_CURRENCY_REDEEM)}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={useRewardPoints}
                      onChange={(e) => {
                        setUseRewardPoints(e.target.checked);
                        if (e.target.checked) {
                          setRewardPointsToUse(maxRewardPoints);
                        } else {
                          setRewardPointsToUse(0);
                        }
                      }}
                      className="w-4 h-4 accent-[#f57224] rounded"
                    />
                    <span className="text-sm font-semibold text-slate-700">
                      Use reward points
                    </span>
                  </label>
                  {useRewardPoints && (
                    <div className="mt-2">
                      <input
                        type="range"
                        min={0}
                        max={maxRewardPoints}
                        step={100}
                        value={rewardPointsToUse}
                        onChange={(e) =>
                          setRewardPointsToUse(Number(e.target.value))
                        }
                        className="w-full accent-[#f57224]"
                      />
                      <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
                        <span>0 pts</span>
                        <span className="font-bold text-[#f57224]">
                          {rewardPointsToUse.toLocaleString()} pts ={" "}
                          {formatPrice(
                            rewardPointsToUse / POINTS_PER_CURRENCY_REDEEM
                          )}
                        </span>
                        <span>{maxRewardPoints.toLocaleString()} pts</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Gift className="w-4 h-4" />
                  <span>
                    No reward points yet. Earn points with every purchase!
                  </span>
                </div>
              )}
            </CheckoutSection>

            {/* ---- 6. WALLET ---- */}
            <CheckoutSection
              number={6}
              icon={<Wallet className="w-4 h-4" />}
              title="Shop Nexa Wallet"
            >
              {walletBalance > 0 ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-[#f57224]" />
                    <span className="text-sm text-slate-700">
                      Balance:{" "}
                      <span className="font-bold text-[#0f172a]">
                        {formatPrice(walletBalance)}
                      </span>
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useWallet}
                      onChange={(e) => setUseWallet(e.target.checked)}
                      className="w-4 h-4 accent-[#f57224] rounded"
                    />
                    <span className="text-sm font-semibold text-slate-700">
                      Use wallet
                    </span>
                  </label>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Wallet className="w-4 h-4" />
                  <span>
                    Wallet balance is zero. Earn cashback with every order!
                  </span>
                </div>
              )}
              {useWallet && walletBalance > 0 && (
                <p className="text-xs text-emerald-600 mt-2">
                  {formatPrice(walletUsed)} will be deducted from your wallet.
                </p>
              )}
            </CheckoutSection>

            {/* ---- 7. PAYMENT METHOD ---- */}
            <CheckoutSection
              number={7}
              icon={<CreditCard className="w-4 h-4" />}
              title="Payment Method"
            >
              <div className="space-y-2">
                {/* COD - Active */}
                <PaymentOption
                  selected={paymentMethod === "cash_on_delivery"}
                  onClick={() => setPaymentMethod("cash_on_delivery")}
                  icon={<Banknote className="w-5 h-5" />}
                  label="Cash on Delivery"
                  desc="Pay when you receive your order"
                  active={true}
                />
                {/* bKash - Coming Soon */}
                <PaymentOption
                  selected={paymentMethod === "mobile_banking"}
                  onClick={() => setPaymentMethod("mobile_banking")}
                  icon={<Wallet className="w-5 h-5" />}
                  label="Mobile Banking"
                  desc="bKash, Nagad, Rocket"
                  active={true}
                />
                {/* Card - Coming Soon */}
                <PaymentOption
                  selected={paymentMethod === "card"}
                  onClick={() => setPaymentMethod("card")}
                  icon={<CreditCard className="w-5 h-5" />}
                  label="Credit / Debit Card"
                  desc="Visa, Mastercard, Amex"
                  active={true}
                />
                {/* SSLCommerz - Coming Soon */}
                <PaymentOption
                  selected={false}
                  onClick={() => {}}
                  icon={<Lock className="w-5 h-5" />}
                  label="SSLCommerz"
                  desc="All Bangladeshi payment methods"
                  active={false}
                />
                {/* Stripe - Coming Soon */}
                <PaymentOption
                  selected={false}
                  onClick={() => {}}
                  icon={<Lock className="w-5 h-5" />}
                  label="Stripe (International)"
                  desc="Global card payments"
                  active={false}
                />
              </div>
            </CheckoutSection>

            {/* ---- 8. TERMS ---- */}
            <CheckoutSection
              number={8}
              icon={<ShieldCheck className="w-4 h-4" />}
              title="Terms & Conditions"
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 w-5 h-5 accent-[#f57224] rounded border-slate-300"
                />
                <span className="text-xs text-slate-600 leading-relaxed">
                  I agree to Shop Nexa's{" "}
                  <span className="text-[#f57224] font-semibold">
                    Terms & Conditions
                  </span>
                  ,{" "}
                  <span className="text-[#f57224] font-semibold">
                    Return Policy
                  </span>
                  , and{" "}
                  <span className="text-[#f57224] font-semibold">
                    Privacy Policy
                  </span>
                  . I confirm that the delivery address and order details are
                  correct.
                </span>
              </label>
            </CheckoutSection>
          </div>

          {/* ===================== RIGHT COLUMN — ORDER SUMMARY ===================== */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5">
              <h2 className="text-base font-bold text-[#0f172a] mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-[#f57224]" />
                Order Summary
              </h2>

              {/* Items count */}
              <div className="space-y-2 mb-4">
                {enrichedItems.slice(0, 5).map((item: CartItem) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 text-xs"
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-4 h-4 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-1 font-medium text-slate-700">
                        {item.title}
                      </p>
                      <p className="text-slate-400">x{item.quantity}</p>
                    </div>
                    <span className="font-semibold text-[#0f172a]">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
                {enrichedItems.length > 5 && (
                  <p className="text-xs text-slate-400 text-center pt-1">
                    +{enrichedItems.length - 5} more items
                  </p>
                )}
              </div>

              {/* Price breakdown */}
              <div className="space-y-2.5 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Products Total</span>
                  <span className="font-semibold text-[#0f172a]">
                    {formatPrice(itemsSubtotal)}
                  </span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Voucher Discount</span>
                    <span className="font-semibold">
                      -{formatPrice(couponDiscount)}
                    </span>
                  </div>
                )}
                {rewardDiscountValue > 0 && (
                  <div className="flex justify-between text-purple-600">
                    <span>Reward Points</span>
                    <span className="font-semibold">
                      -{formatPrice(rewardDiscountValue)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Delivery Fee{" "}
                    <span className="text-[10px] text-slate-400">
                      ({selectedDelivery.name})
                    </span>
                  </span>
                  <span
                    className={`font-semibold ${
                      deliveryCharge === 0
                        ? "text-emerald-600"
                        : "text-[#0f172a]"
                    }`}
                  >
                    {deliveryCharge === 0 ? "FREE" : formatPrice(deliveryCharge)}
                  </span>
                </div>
                {walletUsed > 0 && (
                  <div className="flex justify-between text-[#f57224]">
                    <span>Wallet Credit</span>
                    <span className="font-semibold">
                      -{formatPrice(walletUsed)}
                    </span>
                  </div>
                )}
              </div>

              {/* Grand total */}
              <div className="flex justify-between items-baseline border-t border-slate-200 pt-4 mt-4">
                <span className="text-base font-bold text-[#0f172a]">
                  Grand Total
                </span>
                <span className="text-xl font-black text-[#f57224]">
                  {formatPrice(grandTotal)}
                </span>
              </div>

              {/* Estimated delivery */}
              <div className="mt-4 bg-slate-50 rounded-lg p-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Estimated Delivery</p>
                  <p className="text-sm font-bold text-[#0f172a]">
                    {estimatedDelivery}
                  </p>
                </div>
              </div>

              {/* Place Order - Desktop */}
              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={placing || !agreeTerms}
                className="mt-5 w-full bg-[#f57224] hover:bg-[#e0621f] text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {placing ? (
                  <>
                    <span className="animate-pulse">Placing Order...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Place Order</span>
                  </>
                )}
              </button>

              {!agreeTerms && (
                <p className="text-xs text-slate-400 text-center mt-2">
                  Please accept terms to continue
                </p>
              )}

              {/* Trust badges */}
              <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                <div className="flex flex-col items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span className="text-[10px] text-slate-500 font-medium">
                    Secure
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <RotateCcw className="w-4 h-4 text-blue-600" />
                  <span className="text-[10px] text-slate-500 font-medium">
                    7-Day Returns
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Package className="w-4 h-4 text-[#f57224]" />
                  <span className="text-[10px] text-slate-500 font-medium">
                    Fast Delivery
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ---- Mobile Sticky Checkout Bar ---- */}
      <div
        className="lg:hidden fixed left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-40 flex items-center justify-between gap-3 p-3 px-4"
        style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div>
          <span className="text-[10px] text-slate-500 block uppercase font-medium">
            Total ({enrichedItems.length} items)
          </span>
          <span className="text-lg font-black text-[#f57224]">
            {formatPrice(grandTotal)}
          </span>
        </div>
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={placing || !agreeTerms}
          className="bg-[#f57224] hover:bg-[#e0621f] text-white font-bold text-sm py-3 px-6 rounded-xl flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {placing ? (
            <span className="animate-pulse">Placing...</span>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Place Order</span>
            </>
          )}
        </button>
      </div>

      <SiteFooter />
      <WhatsAppFab />
      <MobileBottomNav />
    </div>
  );
}

// ----------------------------------------------------------------------
// Reusable Section Component
// ----------------------------------------------------------------------
function CheckoutSection({
  number,
  icon,
  title,
  children,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden">
      <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b border-slate-200/60 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-[#0f172a] text-white text-xs font-bold flex items-center justify-center">
          {number}
        </div>
        <div className="flex items-center gap-1.5 text-[#0f172a]">
          {icon}
          <h3 className="text-sm font-bold">{title}</h3>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ----------------------------------------------------------------------
// Payment Option Component
// ----------------------------------------------------------------------
function PaymentOption({
  selected,
  onClick,
  icon,
  label,
  desc,
  active,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  desc: string;
  active: boolean;
}) {
  return (
    <div
      onClick={active ? onClick : undefined}
      className={`border-2 rounded-xl p-3.5 flex items-center gap-3 transition-all ${
        !active
          ? "border-slate-100 bg-slate-50/50 opacity-60 cursor-not-allowed"
          : selected
          ? "border-[#f57224] bg-orange-50/50 cursor-pointer"
          : "border-slate-200 hover:border-slate-300 cursor-pointer"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          selected ? "border-[#f57224] bg-[#f57224]" : "border-slate-300"
        }`}
      >
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
      <div className={selected ? "text-[#f57224]" : "text-slate-400"}>
        {icon}
      </div>
      <div className="flex-1">
        <span className="text-sm font-bold text-[#0f172a]">{label}</span>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      {!active && (
        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
          COMING SOON
        </span>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Address Form Component
// ----------------------------------------------------------------------
function AddressForm({
  editing,
  onSave,
  onCancel,
}: {
  editing: Address | null;
  onSave: (data: AddressInput, id?: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    label: editing?.label || "Home",
    fullName: editing?.fullName || "",
    phone: editing?.phone || "",
    addressLine: editing?.addressLine || "",
    city: editing?.city || "",
    postalCode: editing?.postalCode || "",
    country: editing?.country || "Bangladesh",
    notes: editing?.notes || "",
    isDefault: editing?.isDefault || false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim() || form.fullName.trim().length < 2)
      e.fullName = "Enter receiver name";
    if (!form.phone.trim() || form.phone.trim().length < 6)
      e.phone = "Enter phone number";
    if (!form.addressLine.trim() || form.addressLine.trim().length < 4)
      e.addressLine = "Enter full address";
    if (!form.city.trim() || form.city.trim().length < 2)
      e.city = "Enter district/city";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSave(form, editing?.id);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormInput
          label="Address Label"
          value={form.label}
          onChange={(v) => setForm({ ...form, label: v })}
          placeholder="Home, Office..."
        />
        <FormInput
          label="Receiver Name"
          value={form.fullName}
          onChange={(v) => setForm({ ...form, fullName: v })}
          placeholder="Full name"
          error={errors.fullName}
        />
      </div>
      <FormInput
        label="Phone Number"
        value={form.phone}
        onChange={(v) => setForm({ ...form, phone: v })}
        placeholder="01XXXXXXXXX"
        error={errors.phone}
      />
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Division
        </label>
        <select
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
        >
          <option value="">Select division</option>
          {BD_DIVISIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormInput
          label="District / City"
          value={form.city}
          onChange={(v) => setForm({ ...form, city: v })}
          placeholder="District"
          error={errors.city}
        />
        <FormInput
          label="Postal Code"
          value={form.postalCode}
          onChange={(v) => setForm({ ...form, postalCode: v })}
          placeholder="Postal code"
        />
      </div>
      <FormInput
        label="Full Address"
        value={form.addressLine}
        onChange={(v) => setForm({ ...form, addressLine: v })}
        placeholder="House, road, area..."
        error={errors.addressLine}
      />
      <FormInput
        label="Landmark (optional)"
        value={form.notes}
        onChange={(v) => setForm({ ...form, notes: v })}
        placeholder="Nearby landmark"
      />
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          className="w-4 h-4 accent-[#f57224] rounded"
        />
        <span className="text-xs font-semibold text-slate-600">
          Set as default address
        </span>
      </label>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 bg-[#0f172a] hover:bg-slate-800 text-white text-sm font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4" />
          <span>{editing ? "Update Address" : "Save Address"}</span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Form Input Component
// ----------------------------------------------------------------------
function FormInput({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none transition-colors ${
          error
            ? "border-rose-300 focus:border-rose-500"
            : "border-slate-200 focus:border-[#f57224]"
        }`}
      />
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}

// ----------------------------------------------------------------------
// RotatedCcw icon (inline import fallback for trust badges)
// ----------------------------------------------------------------------
function RotateCcw({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export default CheckoutPage;
