import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Zap, Clock, ArrowLeft, ShoppingCart, Tag } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { ProductCard, ProductCardSkeleton } from "@/components/product/ProductCard";
import { listActiveFlashSales, computeFlashSalePrice, type FlashSale } from "@/services/firebase/flashSales";
import { listAllProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { formatPrice } from "@/utils/format";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/flash-sales")({
  ssr: false,
  component: FlashSalesPage,
  head: () => ({
    meta: [
      { title: "Flash Sales — ShopNexa" },
      { name: "description", content: "Limited time flash sales and mega deals on ShopNexa." },
    ],
  }),
});

function FlashSalesPage() {
  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ["flashSales", "active"],
    queryFn: listActiveFlashSales,
    enabled: firebaseConfigured,
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products", "all"],
    queryFn: listAllProducts,
    enabled: firebaseConfigured,
  });

  const isLoading = salesLoading || productsLoading;
  const activeSale = sales?.[0] ?? null;
  const saleProductIds = new Set(activeSale?.productIds ?? []);
  const saleProducts = (products ?? []).filter((p) => saleProductIds.has(p.id));

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Zap className="h-6 w-6 text-orange-500" />
              Flash Sales
            </h1>
            <p className="text-sm text-muted-foreground">Limited time mega deals</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : !activeSale || saleProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/30 py-20 text-center">
            <Zap className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold">No active flash sales</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check back soon for amazing deals!
            </p>
            <Link
              to="/shop"
              className="mt-4 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <>
            {/* Sale Banner */}
            <FlashSaleBanner sale={activeSale} />

            {/* Countdown */}
            <FlashSaleCountdown endsAt={activeSale.endsAt} />

            {/* Products Grid */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {saleProducts.map((product) => {
                const flashPrice = computeFlashSalePrice(product.price, activeSale.discountPercent);
                return (
                  <div key={product.id} className="relative">
                    <ProductCard product={product} />
                    <div className="absolute left-2 top-2 z-10 rounded-lg bg-red-500 px-2 py-1 text-xs font-bold text-white shadow-md">
                      -{activeSale.discountPercent}%
                    </div>
                    <div className="absolute right-2 top-2 z-10 rounded-lg bg-orange-500 px-2 py-1 text-xs font-bold text-white shadow-md">
                      {formatPrice(flashPrice)}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}

function FlashSaleBanner({ sale }: { sale: FlashSale }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white shadow-lg">
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wider opacity-90">Flash Sale</span>
        </div>
        <h2 className="text-2xl font-bold sm:text-3xl">{sale.title}</h2>
        {sale.description && (
          <p className="mt-1 text-sm opacity-90">{sale.description}</p>
        )}
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 backdrop-blur">
          <Tag className="h-4 w-4" />
          <span className="text-lg font-bold">{sale.discountPercent}% OFF</span>
        </div>
      </div>
    </div>
  );
}

function FlashSaleCountdown({ endsAt }: { endsAt: number }) {
  const [remaining, setRemaining] = useState(getRemaining(endsAt));

  useEffect(() => {
    const timer = setInterval(() => setRemaining(getRemaining(endsAt)), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (remaining.total <= 0) return null;

  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
      <Clock className="h-5 w-5 text-orange-500" />
      <span className="text-sm font-medium text-muted-foreground">Ends in:</span>
      <div className="flex gap-2">
        <CountdownUnit value={remaining.hours} label="Hrs" />
        <CountdownUnit value={remaining.minutes} label="Min" />
        <CountdownUnit value={remaining.seconds} label="Sec" />
      </div>
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">
      <span className="text-lg font-bold tabular-nums">{String(value).padStart(2, "0")}</span>
      <span className="text-[10px] opacity-80">{label}</span>
    </div>
  );
}

function getRemaining(target: number) {
  const total = Math.max(0, target - Date.now());
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor(total / 1000 / 60 / 60);
  return { total, hours, minutes, seconds };
}
