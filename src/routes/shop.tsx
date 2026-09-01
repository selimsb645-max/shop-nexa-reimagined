import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  SlidersHorizontal,
  X,
  ChevronDown,
  Star,
  Check,
  LayoutGrid,
  List,
  Sparkles,
  ChevronRight,
  ChevronUp,
  Truck,
  RotateCcw,
  PackageX,
} from "lucide-react";
import { BackButton } from "@/components/common/BackButton";
import { buildMetaTags } from "@/lib/seo";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ProductCard } from "@/components/product/ProductCard";
import { listCategories } from "@/services/firebase/categories";
import { listProducts } from "@/services/firebase/products";
import { firebaseConfigured } from "@/services/firebase/config";
import { useState, useMemo, useEffect } from "react";
import type { Product } from "@/types/commerce";

type ExtendedProduct = Partial<Product> & {
  discountPrice?: number;
  ratings?: number;
  rate?: number;
  isFreeDelivery?: boolean;
  freeShipping?: boolean;
  isFreeShipping?: boolean;
  brand?: string;
  categoryId?: string;
  color?: string | string[];
  colors?: string | string[];
  createdAt?: string | number;
};

// ----------------------------------------------------------------------
// Route & Search Params Definition
// ----------------------------------------------------------------------

export interface ShopSearchParams {
  q?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  color?: string;
  freeDelivery?: boolean;
  sort?: string;
}

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>): ShopSearchParams => {
    return {
      q: typeof search.q === "string" ? search.q : undefined,
      category: typeof search.category === "string" ? search.category : undefined,
      brand: typeof search.brand === "string" ? search.brand : undefined,
      minPrice:
        typeof search.minPrice === "number"
          ? search.minPrice
          : search.minPrice
            ? Number(search.minPrice)
            : undefined,
      maxPrice:
        typeof search.maxPrice === "number"
          ? search.maxPrice
          : search.maxPrice
            ? Number(search.maxPrice)
            : undefined,
      rating:
        typeof search.rating === "number"
          ? search.rating
          : search.rating
            ? Number(search.rating)
            : undefined,
      color: typeof search.color === "string" ? search.color : undefined,
      freeDelivery:
        search.freeDelivery === true ||
        search.freeDelivery === "true" ||
        search.freeDelivery === 1,
      sort: typeof search.sort === "string" ? search.sort : "best-match",
    };
  },
  component: ShopPage,
  head: () => ({
    meta: [
      { title: "Shop & Categories — AVENTA SHOP" },
      {
        name: "description",
        content:
          "Browse thousands of products, top brands, and exclusive discounts on AVENTA SHOP.",
      },
    ],
  }),
});

// ----------------------------------------------------------------------
// Constants & Color Definitions
// ----------------------------------------------------------------------

const DEFAULT_BRANDS = [
  "Apple",
  "Samsung",
  "Nike",
  "Sony",
  "Adidas",
  "NexaTech",
  "Puma",
  "Xiaomi",
  "LG",
  "Asus",
  "Lenovo",
  "Philips",
];

const COLOR_PALETTE = [
  { name: "Black", bg: "#000000", border: "border-slate-300" },
  { name: "White", bg: "#FFFFFF", border: "border-slate-300" },
  { name: "Navy", bg: "#0F172A", border: "border-slate-300" },
  { name: "Blue", bg: "#2563EB", border: "border-transparent" },
  { name: "Red", bg: "#EF4444", border: "border-transparent" },
  { name: "Green", bg: "#22C55E", border: "border-transparent" },
  { name: "Silver", bg: "#E2E8F0", border: "border-slate-300" },
  { name: "Gold", bg: "#EAB308", border: "border-transparent" },
  { name: "Orange", bg: "#F97316", border: "border-transparent" },
  { name: "Pink", bg: "#EC4899", border: "border-transparent" },
];

const PRICE_PRESETS = [
  { label: "Under $50", min: undefined, max: 50 },
  { label: "$50 - $100", min: 50, max: 100 },
  { label: "$100 - $300", min: 100, max: 300 },
  { label: "$300+", min: 300, max: undefined },
];

// Helper to safely extract price
function getProductPrice(p: Partial<Product>): number {
  if (typeof p.price === "number") return p.price;
  const extP = p as ExtendedProduct;
  if (typeof extP.discountPrice === "number") return extP.discountPrice;
  return 0;
}

// Helper to safely extract rating
function getProductRating(p: Partial<Product>): number {
  if (typeof p.rating === "number") return p.rating;
  const extP = p as ExtendedProduct;
  if (typeof extP.ratings === "number") return extP.ratings;
  if (typeof extP.rate === "number") return extP.rate;
  return 4.5;
}

// Helper to check if item is free delivery eligible
function isProductFreeDelivery(p: Partial<Product>): boolean {
  const extP = p as ExtendedProduct;
  if (extP.freeDelivery || extP.isFreeDelivery || extP.freeShipping || extP.isFreeShipping) {
    return true;
  }
  if (Array.isArray(p.tags) && p.tags.some((t) => t.toLowerCase().includes("free"))) {
    return true;
  }
  return getProductPrice(p) >= 100; // Default threshold
}

// ----------------------------------------------------------------------
// Main ShopPage Component
// ----------------------------------------------------------------------

function ShopPage() {
  const searchParams = Route.useSearch();

  // Sync state from search params
  const [searchInput, setSearchInput] = useState(searchParams.q || "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.category ? [searchParams.category] : []
  );
  const [selectedBrands, setSelectedBrands] = useState<string[]>(
    searchParams.brand ? [searchParams.brand] : []
  );
  const [minPriceInput, setMinPriceInput] = useState<string>(
    searchParams.minPrice ? String(searchParams.minPrice) : ""
  );
  const [maxPriceInput, setMaxPriceInput] = useState<string>(
    searchParams.maxPrice ? String(searchParams.maxPrice) : ""
  );
  const [appliedMinPrice, setAppliedMinPrice] = useState<number | undefined>(
    searchParams.minPrice
  );
  const [appliedMaxPrice, setAppliedMaxPrice] = useState<number | undefined>(
    searchParams.maxPrice
  );
  const [selectedRating, setSelectedRating] = useState<number | undefined>(
    searchParams.rating
  );
  const [selectedColors, setSelectedColors] = useState<string[]>(
    searchParams.color ? [searchParams.color] : []
  );
  const [freeDeliveryOnly, setFreeDeliveryOnly] = useState<boolean>(
    Boolean(searchParams.freeDelivery)
  );
  const [sortOption, setSortOption] = useState<string>(
    searchParams.sort || "best-match"
  );

  // UI States
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [visibleCount, setVisibleCount] = useState<number>(18);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState<boolean>(false);
  const [showMoreCategories, setShowMoreCategories] = useState<boolean>(false);
  const [showMoreBrands, setShowMoreBrands] = useState<boolean>(false);

  // Synchronize when URL search parameters change externally
  useEffect(() => {
    if (searchParams.q !== undefined) setSearchInput(searchParams.q);
    if (searchParams.category) setSelectedCategories([searchParams.category]);
    if (searchParams.brand) setSelectedBrands([searchParams.brand]);
    if (searchParams.minPrice !== undefined) {
      setMinPriceInput(String(searchParams.minPrice));
      setAppliedMinPrice(searchParams.minPrice);
    }
    if (searchParams.maxPrice !== undefined) {
      setMaxPriceInput(String(searchParams.maxPrice));
      setAppliedMaxPrice(searchParams.maxPrice);
    }
    if (searchParams.rating !== undefined) setSelectedRating(searchParams.rating);
    if (searchParams.color) setSelectedColors([searchParams.color]);
    if (searchParams.freeDelivery !== undefined)
      setFreeDeliveryOnly(Boolean(searchParams.freeDelivery));
    if (searchParams.sort) setSortOption(searchParams.sort);
  }, [
    searchParams.q,
    searchParams.category,
    searchParams.brand,
    searchParams.minPrice,
    searchParams.maxPrice,
    searchParams.rating,
    searchParams.color,
    searchParams.freeDelivery,
    searchParams.sort,
  ]);

  // Query Categories
  const { data: rawCategories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      try {
        return await listCategories();
      } catch (err) {
        console.warn("Error loading categories:", err);
        return [];
      }
    },
    enabled: firebaseConfigured,
  });

  // Query Products
  const { data: allProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products", "shop-listing"],
    queryFn: async () => {
      try {
        return await listProducts();
      } catch (err) {
        console.warn("Error loading products:", err);
        return [];
      }
    },
    enabled: firebaseConfigured,
  });

  // Build dynamic brand list from loaded products
  const dynamicBrands = useMemo(() => {
    const brandSet = new Set<string>(DEFAULT_BRANDS);
    allProducts.forEach((p) => {
      const extP = p as ExtendedProduct;
      if (extP.brand && typeof extP.brand === "string") {
        brandSet.add(extP.brand);
      }
    });
    return Array.from(brandSet);
  }, [allProducts]);

  // Extract total category options
  const categoryOptions = useMemo(() => {
    if (Array.isArray(rawCategories) && rawCategories.length > 0) {
      return rawCategories.map((cat: { id?: string; slug?: string; name?: string }) => ({
        id: cat.id || cat.slug || cat.name?.toLowerCase() || "unknown",
        name: cat.name || "Category",
        slug: cat.slug || cat.name?.toLowerCase().replace(/\s+/g, "-") || "unknown",
      }));
    }
    // Fallback standard categories if empty
    return [
      { id: "electronics", name: "Electronics", slug: "electronics" },
      { id: "fashion", name: "Fashion & Clothing", slug: "fashion" },
      { id: "home-living", name: "Home & Living", slug: "home-living" },
      { id: "beauty", name: "Beauty & Personal Care", slug: "beauty" },
      { id: "groceries", name: "Groceries & Food", slug: "groceries" },
      { id: "sports", name: "Sports & Outdoors", slug: "sports" },
      { id: "automotive", name: "Automotive & Motors", slug: "automotive" },
      { id: "watches-jewelry", name: "Watches & Jewelry", slug: "watches-jewelry" },
    ];
  }, [rawCategories]);

  // Filter products client-side based on all criteria
  const filteredProducts = useMemo(() => {
    let list = [...allProducts];

    // 1. Search Query
    if (searchInput.trim()) {
      const q = searchInput.toLowerCase().trim();
      list = list.filter((p) => {
        const title = (p.title || p.title || "").toLowerCase();
        const desc = (p.description || "").toLowerCase();
        const cat = (p.categorySlug || "").toLowerCase();
        const brand = ((p as ExtendedProduct).brand || "").toLowerCase();
        const tags = Array.isArray(p.tags) ? p.tags.join(" ").toLowerCase() : "";
        return (
          title.includes(q) ||
          desc.includes(q) ||
          cat.includes(q) ||
          brand.includes(q) ||
          tags.includes(q)
        );
      });
    }

    // 2. Categories Filter
    if (selectedCategories.length > 0) {
      list = list.filter((p) => {
        const prodCat = (p.categorySlug || (p as ExtendedProduct).categoryId || "").toLowerCase();
        return selectedCategories.some((sc) => {
          const scLower = sc.toLowerCase();
          return prodCat.includes(scLower) || scLower.includes(prodCat);
        });
      });
    }

    // 3. Brands Filter
    if (selectedBrands.length > 0) {
      list = list.filter((p) => {
        const b = ((p as ExtendedProduct).brand || "").toLowerCase();
        return selectedBrands.some((sb) => b.includes(sb.toLowerCase()));
      });
    }

    // 4. Price Range Filter
    if (appliedMinPrice !== undefined) {
      list = list.filter((p) => getProductPrice(p) >= appliedMinPrice);
    }
    if (appliedMaxPrice !== undefined) {
      list = list.filter((p) => getProductPrice(p) <= appliedMaxPrice);
    }

    // 5. Rating Filter
    if (selectedRating !== undefined) {
      list = list.filter((p) => getProductRating(p) >= selectedRating);
    }

    // 6. Color Family Filter
    if (selectedColors.length > 0) {
      list = list.filter((p) => {
        const extP = p as ExtendedProduct;
        const colorAttr = (extP.color || extP.colors || []).toString().toLowerCase();
        const desc = (p.description || "").toLowerCase();
        const title = (p.title || p.title || "").toLowerCase();
        return selectedColors.some((c) => {
          const cLower = c.toLowerCase();
          return colorAttr.includes(cLower) || title.includes(cLower) || desc.includes(cLower);
        });
      });
    }

    // 7. Free Delivery Filter
    if (freeDeliveryOnly) {
      list = list.filter((p) => isProductFreeDelivery(p));
    }

    // 8. Sorting Logic
    switch (sortOption) {
      case "price-low-high":
        list.sort((a, b) => getProductPrice(a) - getProductPrice(b));
        break;
      case "price-high-low":
        list.sort((a, b) => getProductPrice(b) - getProductPrice(a));
        break;
      case "rating":
        list.sort((a, b) => getProductRating(b) - getProductRating(a));
        break;
      case "newest":
        list.sort((a, b) => {
          const extA = a as ExtendedProduct;
          const extB = b as ExtendedProduct;
          const timeA = extA.createdAt || a.id || 0;
          const timeB = extB.createdAt || b.id || 0;
          return String(timeB).localeCompare(String(timeA));
        });
        break;
      case "best-match":
      default:
        // Default rank: top rating first, then featured
        list.sort((a, b) => {
          const scoreA = getProductRating(a) + (a.featured ? 2 : 0);
          const scoreB = getProductRating(b) + (b.featured ? 2 : 0);
          return scoreB - scoreA;
        });
        break;
    }

    return list;
  }, [
    allProducts,
    searchInput,
    selectedCategories,
    selectedBrands,
    appliedMinPrice,
    appliedMaxPrice,
    selectedRating,
    selectedColors,
    freeDeliveryOnly,
    sortOption,
  ]);

  // Paginated display slice
  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const hasMore = visibleCount < filteredProducts.length;

  // Active filter count calculation
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategories.length > 0) count += selectedCategories.length;
    if (selectedBrands.length > 0) count += selectedBrands.length;
    if (appliedMinPrice !== undefined || appliedMaxPrice !== undefined) count += 1;
    if (selectedRating !== undefined) count += 1;
    if (selectedColors.length > 0) count += selectedColors.length;
    if (freeDeliveryOnly) count += 1;
    if (searchInput.trim()) count += 1;
    return count;
  }, [
    selectedCategories,
    selectedBrands,
    appliedMinPrice,
    appliedMaxPrice,
    selectedRating,
    selectedColors,
    freeDeliveryOnly,
    searchInput,
  ]);

  // Handler: Apply Price Filter
  const handleApplyPrice = () => {
    const minVal = minPriceInput ? Number(minPriceInput) : undefined;
    const maxVal = maxPriceInput ? Number(maxPriceInput) : undefined;
    setAppliedMinPrice(minVal);
    setAppliedMaxPrice(maxVal);
  };

  // Handler: Apply Price Preset
  const handlePricePreset = (min?: number, max?: number) => {
    setMinPriceInput(min !== undefined ? String(min) : "");
    setMaxPriceInput(max !== undefined ? String(max) : "");
    setAppliedMinPrice(min);
    setAppliedMaxPrice(max);
  };

  // Handler: Clear All Filters
  const handleClearAll = () => {
    setSearchInput("");
    setSelectedCategories([]);
    setSelectedBrands([]);
    setMinPriceInput("");
    setMaxPriceInput("");
    setAppliedMinPrice(undefined);
    setAppliedMaxPrice(undefined);
    setSelectedRating(undefined);
    setSelectedColors([]);
    setFreeDeliveryOnly(false);
    setSortOption("best-match");
    setVisibleCount(18);
  };

  // Category Toggle
  const toggleCategory = (catId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  };

  // Brand Toggle
  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  };

  // Color Toggle
  const toggleColor = (colorName: string) => {
    setSelectedColors((prev) =>
      prev.includes(colorName)
        ? prev.filter((c) => c !== colorName)
        : [...prev, colorName]
    );
  };

  // Visible Categories & Brands lists
  const visibleCategories = showMoreCategories
    ? categoryOptions
    : categoryOptions.slice(0, 6);

  const visibleBrands = showMoreBrands
    ? dynamicBrands
    : dynamicBrands.slice(0, 8);

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-slate-900 font-sans antialiased flex flex-col">
      {/* Site Header */}
      <SiteHeader />

      {/* Breadcrumbs Navigation Bar */}
      <div className="bg-white border-b border-slate-200 py-2.5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap">
            <Link to="/" className="hover:text-orange-600 transition-colors">
              Home
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-800">
              {selectedCategories.length === 1
                ? categoryOptions.find((c) => c.id === selectedCategories[0])?.name ||
                  selectedCategories[0]
                : searchInput
                  ? `Search: "${searchInput}"`
                  : "All Categories"}
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-4 text-slate-600">
            <span className="flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-orange-500" /> Free Shipping Available
            </span>
            <span>|</span>
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" /> 100% Authentic
            </span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 flex-1">
        <div className="mb-3">
          <BackButton fallbackTo="/" label="Back" className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 active:scale-95" />
        </div>
        {/* Mobile Filter Toggle & Quick Bar */}
        <div className="lg:hidden mb-3 bg-white rounded-lg p-3 border border-slate-200 shadow-sm flex items-center justify-between gap-2">
          <button
            onClick={() => setIsMobileFilterOpen(true)}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-md text-xs font-semibold hover:bg-slate-800 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-orange-400" />
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>

          <div className="flex items-center gap-2">
            {/* Mobile View Switcher */}
            <div className="flex items-center bg-slate-100 rounded-md p-0.5 border border-slate-200">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded ${
                  viewMode === "grid"
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-slate-500"
                }`}
                title="Grid View"
                aria-label="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded ${
                  viewMode === "list"
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-slate-500"
                }`}
                title="List View"
                aria-label="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Sort Dropdown */}
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md py-2 px-2 focus:ring-1 focus:ring-orange-500 font-medium"
            >
              <option value="best-match">Best Match</option>
              <option value="price-low-high">Price: Low to High</option>
              <option value="price-high-low">Price: High to Low</option>
              <option value="newest">Newest Arrivals</option>
              <option value="rating">Top Rated</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ==================================================================== */}
          {/* LEFT SIDEBAR - FILTERS (Desktop) */}
          {/* ==================================================================== */}
          <aside className="hidden lg:block lg:col-span-3 space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden sticky top-20">
              {/* Sidebar Header */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <SlidersHorizontal className="w-4 h-4 text-orange-400" />
                  <span>FILTERS</span>
                  {activeFilterCount > 0 && (
                    <span className="bg-orange-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-xs text-orange-400 hover:text-orange-300 font-medium underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Clear All
                  </button>
                )}
              </div>

              <div className="p-4 space-y-6 max-h-[calc(100vh-140px)] overflow-y-auto divide-y divide-slate-100">
                {/* 1. Category Filter */}
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-3 flex items-center justify-between">
                    <span>Category</span>
                  </h3>
                  <div className="space-y-2">
                    {visibleCategories.map((cat) => {
                      const isChecked = selectedCategories.includes(cat.id);
                      return (
                        <label
                          key={cat.id}
                          className="flex items-center justify-between text-xs text-slate-700 hover:text-orange-600 cursor-pointer select-none group"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCategory(cat.id)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                            />
                            <span className={isChecked ? "font-bold text-orange-600" : ""}>
                              {cat.name}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {categoryOptions.length > 6 && (
                    <button
                      onClick={() => setShowMoreCategories(!showMoreCategories)}
                      className="mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1"
                    >
                      {showMoreCategories ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" /> View Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" /> View More (
                          {categoryOptions.length - 6})
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* 2. Brand Filter */}
                <div className="pt-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-3">
                    Brand
                  </h3>
                  <div className="space-y-2">
                    {visibleBrands.map((brand) => {
                      const isChecked = selectedBrands.includes(brand);
                      return (
                        <label
                          key={brand}
                          className="flex items-center gap-2 text-xs text-slate-700 hover:text-orange-600 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleBrand(brand)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                          />
                          <span className={isChecked ? "font-bold text-orange-600" : ""}>
                            {brand}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {dynamicBrands.length > 8 && (
                    <button
                      onClick={() => setShowMoreBrands(!showMoreBrands)}
                      className="mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1"
                    >
                      {showMoreBrands ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" /> View Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" /> View More (
                          {dynamicBrands.length - 8})
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* 3. Price Range Filter */}
                <div className="pt-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-3">
                    Price Range ($)
                  </h3>
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="number"
                      placeholder="Min"
                      value={minPriceInput}
                      onChange={(e) => setMinPriceInput(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-slate-50"
                    />
                    <span className="text-slate-400 text-xs">-</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={maxPriceInput}
                      onChange={(e) => setMaxPriceInput(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-slate-50"
                    />
                    <button
                      onClick={handleApplyPrice}
                      className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                    >
                      Apply
                    </button>
                  </div>

                  {/* Price Quick Preset Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {PRICE_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => handlePricePreset(preset.min, preset.max)}
                        className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                          appliedMinPrice === preset.min && appliedMaxPrice === preset.max
                            ? "bg-orange-50 border-orange-500 text-orange-600 font-bold"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Rating Filter */}
                <div className="pt-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-3">
                    Rating
                  </h3>
                  <div className="space-y-1.5">
                    {[5, 4, 3, 2, 1].map((stars) => {
                      const isSelected = selectedRating === stars;
                      return (
                        <button
                          key={stars}
                          onClick={() =>
                            setSelectedRating(isSelected ? undefined : stars)
                          }
                          className={`w-full flex items-center justify-between text-xs py-1 px-1.5 rounded transition-colors ${
                            isSelected
                              ? "bg-orange-50 text-orange-600 font-bold"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3.5 h-3.5 ${
                                  i < stars
                                    ? "text-amber-400 fill-amber-400"
                                    : "text-slate-200"
                                }`}
                              />
                            ))}
                            <span className="ml-1 text-[11px] text-slate-600">
                              {stars === 5 ? "5 Stars" : "& up"}
                            </span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-orange-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Color Family Filter */}
                <div className="pt-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-3">
                    Color Family
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {COLOR_PALETTE.map((c) => {
                      const isChecked = selectedColors.includes(c.name);
                      return (
                        <button
                          key={c.name}
                          onClick={() => toggleColor(c.name)}
                          className={`flex items-center gap-2 p-1.5 rounded border text-xs text-left transition-colors ${
                            isChecked
                              ? "border-orange-500 bg-orange-50 font-bold text-orange-600"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-full ${c.border} shrink-0`}
                            style={{ backgroundColor: c.bg }}
                          />
                          <span className="truncate text-[11px]">{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 6. Free Delivery Toggle */}
                <div className="pt-4">
                  <label className="flex items-center justify-between cursor-pointer select-none p-2 bg-slate-50 rounded border border-slate-200 hover:border-orange-200 transition-colors">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <Truck className="w-4 h-4 text-orange-500" />
                      <span>Free Delivery</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={freeDeliveryOnly}
                      onChange={(e) => setFreeDeliveryOnly(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                    />
                  </label>
                </div>

                {/* Clear All Action */}
                {activeFilterCount > 0 && (
                  <div className="pt-4">
                    <button
                      onClick={handleClearAll}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 rounded text-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-600" /> Clear All Filters
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* ==================================================================== */}
          {/* RIGHT MAIN SECTION - PRODUCT LISTING */}
          {/* ==================================================================== */}
          <section className="lg:col-span-9 space-y-4">
            {/* Top Toolbar Bar */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-sm sm:text-base font-bold text-slate-900">
                  {searchInput ? (
                    <>
                      Results for &quot;<span className="text-orange-600">{searchInput}</span>&quot;
                    </>
                  ) : (
                    "All Products"
                  )}
                </h1>
                <p className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-800">
                    {filteredProducts.length}
                  </span>{" "}
                  items found
                </p>
              </div>

              {/* Controls (Sort & View Toggles for Desktop) */}
              <div className="hidden sm:flex items-center gap-3 self-end sm:self-auto">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium whitespace-nowrap">
                    Sort By:
                  </span>
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-md py-1.5 px-3 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-orange-500"
                  >
                    <option value="best-match">Best Match</option>
                    <option value="price-low-high">Price: Low to High</option>
                    <option value="price-high-low">Price: High to Low</option>
                    <option value="newest">Newest</option>
                    <option value="rating">Customer Rating</option>
                  </select>
                </div>

                {/* View Mode Switcher */}
                <div className="flex items-center bg-slate-100 rounded-md p-1 border border-slate-200">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === "grid"
                        ? "bg-white text-orange-600 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="Grid View"
                aria-label="Grid view"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === "list"
                        ? "bg-white text-orange-600 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="List View"
                aria-label="List view"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Active Filter Chips Bar */}
            {activeFilterCount > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 font-semibold mr-1">Active Filters:</span>

                {searchInput && (
                  <span className="inline-flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-700 px-2.5 py-1 rounded-full font-medium">
                    Search: &quot;{searchInput}&quot;
                    <button
                      onClick={() => setSearchInput("")}
                      className="hover:text-orange-900 ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {selectedCategories.map((catId) => (
                  <span
                    key={catId}
                    className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-800 px-2.5 py-1 rounded-full font-medium"
                  >
                    Category:{" "}
                    {categoryOptions.find((c) => c.id === catId)?.name || catId}
                    <button
                      onClick={() => toggleCategory(catId)}
                      className="hover:text-red-600 ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {selectedBrands.map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-800 px-2.5 py-1 rounded-full font-medium"
                  >
                    Brand: {b}
                    <button
                      onClick={() => toggleBrand(b)}
                      className="hover:text-red-600 ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {(appliedMinPrice !== undefined || appliedMaxPrice !== undefined) && (
                  <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-800 px-2.5 py-1 rounded-full font-medium">
                    Price: ${appliedMinPrice ?? 0} - ${appliedMaxPrice ?? "Max"}
                    <button
                      onClick={() => {
                        setAppliedMinPrice(undefined);
                        setAppliedMaxPrice(undefined);
                        setMinPriceInput("");
                        setMaxPriceInput("");
                      }}
                      className="hover:text-red-600 ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {selectedRating !== undefined && (
                  <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-800 px-2.5 py-1 rounded-full font-medium">
                    Rating: {selectedRating}★ & Up
                    <button
                      onClick={() => setSelectedRating(undefined)}
                      className="hover:text-red-600 ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {selectedColors.map((color) => (
                  <span
                    key={color}
                    className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-800 px-2.5 py-1 rounded-full font-medium"
                  >
                    Color: {color}
                    <button
                      onClick={() => toggleColor(color)}
                      className="hover:text-red-600 ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {freeDeliveryOnly && (
                  <span className="inline-flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-700 px-2.5 py-1 rounded-full font-medium">
                    Free Delivery
                    <button
                      onClick={() => setFreeDeliveryOnly(false)}
                      className="hover:text-orange-900 ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                <button
                  onClick={handleClearAll}
                  className="text-orange-600 font-bold hover:underline ml-auto text-xs"
                >
                  Clear All
                </button>
              </div>
            )}

            {/* Products Container */}
            {productsLoading || categoriesLoading ? (
              /* Loading Skeletons Grid */
              <div
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5"
                    : "space-y-3"
                }
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-lg p-3 border border-slate-200 animate-pulse space-y-3"
                  >
                    <div className="bg-slate-200 h-36 rounded-md w-full" />
                    <div className="h-3 bg-slate-200 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 rounded w-1/2" />
                    <div className="h-4 bg-orange-200 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              /* Empty State */
              <div className="bg-white rounded-lg border border-slate-200 p-8 sm:p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PackageX className="w-8 h-8" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 mb-1">
                  No Products Found
                </h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
                  We couldn&apos;t find any products matching your current search parameters or filter criteria. Try resetting filters or searching with different keywords.
                </p>
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-lg text-xs transition-colors shadow-sm"
                >
                  <RotateCcw className="w-4 h-4" /> Clear All Filters
                </button>
              </div>
            ) : (
              /* Product Display Grid / List */
              <>
                <div
                  className={
                    viewMode === "grid"
                      ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3.5"
                      : "space-y-3"
                  }
                >
                  {displayedProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {/* Load More Button & Progress Bar */}
                <div className="pt-6 text-center space-y-3">
                  <p className="text-xs text-slate-500 font-medium">
                    Showing{" "}
                    <span className="font-bold text-slate-900">
                      {displayedProducts.length}
                    </span>{" "}
                    of{" "}
                    <span className="font-bold text-slate-900">
                      {filteredProducts.length}
                    </span>{" "}
                    products
                  </p>

                  {/* Progress Bar */}
                  <div className="max-w-xs mx-auto bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          (displayedProducts.length / filteredProducts.length) * 100
                        )}%`,
                      }}
                    />
                  </div>

                  {hasMore && (
                    <button
                      onClick={() => setVisibleCount((prev) => prev + 18)}
                      className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-8 py-3 rounded-lg text-xs transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
                    >
                      <span>Load More Products</span>
                      <ChevronDown className="w-4 h-4 text-orange-400" />
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {/* Mobile Slide-Over Filter Drawer */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileFilterOpen(false)}
          />

          {/* Offcanvas Drawer Content */}
          <div className="relative ml-auto w-full max-w-xs bg-white h-full shadow-2xl flex flex-col z-10">
            {/* Drawer Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <SlidersHorizontal className="w-4 h-4 text-orange-400" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="bg-orange-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsMobileFilterOpen(false)}
                className="p-1 hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-300" />
              </button>
            </div>

            {/* Drawer Filter List */}
            <div className="p-4 flex-1 overflow-y-auto space-y-6 divide-y divide-slate-100">
              {/* Category */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-3">
                  Category
                </h4>
                <div className="space-y-2">
                  {categoryOptions.map((cat) => {
                    const isChecked = selectedCategories.includes(cat.id);
                    return (
                      <label
                        key={cat.id}
                        className="flex items-center gap-2 text-xs text-slate-700 select-none cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCategory(cat.id)}
                          className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                        />
                        <span className={isChecked ? "font-bold text-orange-600" : ""}>
                          {cat.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Brand */}
              <div className="pt-4">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-3">
                  Brand
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {dynamicBrands.map((brand) => {
                    const isChecked = selectedBrands.includes(brand);
                    return (
                      <label
                        key={brand}
                        className="flex items-center gap-2 text-xs text-slate-700 select-none cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleBrand(brand)}
                          className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                        />
                        <span className={isChecked ? "font-bold text-orange-600" : ""}>
                          {brand}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Price Range */}
              <div className="pt-4">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-3">
                  Price Range ($)
                </h4>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={minPriceInput}
                    onChange={(e) => setMinPriceInput(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded bg-slate-50"
                  />
                  <span>-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxPriceInput}
                    onChange={(e) => setMaxPriceInput(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded bg-slate-50"
                  />
                </div>
                <button
                  onClick={() => {
                    handleApplyPrice();
                    setIsMobileFilterOpen(false);
                  }}
                  className="w-full bg-orange-500 text-white font-bold py-2 rounded text-xs"
                >
                  Apply Price Filter
                </button>
              </div>

              {/* Rating */}
              <div className="pt-4">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-3">
                  Rating
                </h4>
                <div className="space-y-1">
                  {[5, 4, 3, 2, 1].map((stars) => (
                    <button
                      key={stars}
                      onClick={() =>
                        setSelectedRating(selectedRating === stars ? undefined : stars)
                      }
                      className={`w-full flex items-center justify-between text-xs py-1.5 px-2 rounded ${
                        selectedRating === stars
                          ? "bg-orange-50 font-bold text-orange-600"
                          : "text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < stars
                                ? "text-amber-400 fill-amber-400"
                                : "text-slate-200"
                            }`}
                          />
                        ))}
                        <span className="ml-1 text-[11px]">& up</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div className="pt-4">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900 mb-3">
                  Color Family
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => toggleColor(c.name)}
                      className={`flex items-center gap-2 p-1.5 rounded border text-xs ${
                        selectedColors.includes(c.name)
                          ? "border-orange-500 bg-orange-50 text-orange-600 font-bold"
                          : "border-slate-200 text-slate-700"
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-slate-300"
                        style={{ backgroundColor: c.bg }}
                      />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Free Delivery */}
              <div className="pt-4">
                <label className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200 text-xs font-semibold">
                  <span className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-orange-500" /> Free Delivery Only
                  </span>
                  <input
                    type="checkbox"
                    checked={freeDeliveryOnly}
                    onChange={(e) => setFreeDeliveryOnly(e.target.checked)}
                    className="w-4 h-4 text-orange-500 rounded border-slate-300"
                  />
                </label>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button
                onClick={handleClearAll}
                className="w-1/2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2.5 rounded-lg text-xs"
              >
                Clear All
              </button>
              <button
                onClick={() => setIsMobileFilterOpen(false)}
                className="w-1/2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-lg text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Elements & Footers */}
<SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
