import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  Heart,
  User,
  Search,
  Menu,
  X,
  ChevronDown,
  Globe,
  HelpCircle,
  Smartphone,
  Store,
  LogOut,
  Package,
  Settings,
  Sparkles,
  Flame,
  Award,
  Tag,
  LayoutGrid,
  Check,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { signOut } from "@/services/firebase/auth";
import { listCategories } from "@/services/firebase/categories";
import { firebaseConfigured } from "@/services/firebase/config";

export interface TopBarProps {
  className?: string;
}

export function TopBar({ className = "" }: TopBarProps) {
  const navigate = useNavigate();
  const authContext = (useAuth() as any) || {};
  const user = authContext?.user ?? null;

  const [language, setLanguage] = useState<string>("EN");
  const [currency, setCurrency] = useState<string>("USD");
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState<boolean>(false);

  const handleSignOut = async () => {
    try {
      if (typeof signOut === "function") {
        await signOut();
      } else if (authContext?.signOut) {
        await authContext.signOut();
      }
      navigate({ to: "/login" });
    } catch (err) {
      console.error("TopBar sign out error:", err);
    }
  };

  return (
    <div
      className={`bg-[#1a1f3a] text-white text-xs py-1.5 px-4 border-b border-slate-800 ${className}`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left Links / App Promo */}
        <div className="hidden sm:flex items-center gap-4 text-slate-300">
          <span className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer">
            <Smartphone className="w-3.5 h-3.5 text-[#f57224]" />
            <span>Save More on App</span>
          </span>
          <span className="text-slate-700">|</span>
          <Link
            to="/seller/register"
            className="flex items-center gap-1.5 hover:text-[#f57224] transition-colors"
          >
            <Store className="w-3.5 h-3.5 text-[#f57224]" />
            <span>Become a Seller</span>
          </Link>
        </div>

        {/* Right-aligned Links */}
        <div className="flex items-center gap-3 sm:gap-4 ml-auto text-slate-300">
          <Link
            to="/help-center"
            className="flex items-center gap-1 hover:text-[#f57224] transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Help & Support</span>
          </Link>

          <span className="text-slate-700">|</span>

          {/* Language & Currency Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
              className="flex items-center gap-1 hover:text-white transition-colors focus:outline-none"
              aria-label="Select Language and Currency"
            >
              <Globe className="w-3.5 h-3.5 text-[#f57224]" />
              <span>
                {language} / {currency}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {isLangDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-40 bg-white text-slate-800 rounded-md shadow-lg border border-slate-200 py-1.5 z-50 text-xs"
                onMouseLeave={() => setIsLangDropdownOpen(false)}
              >
                <div className="px-3 py-1 font-bold text-[10px] text-slate-400 uppercase tracking-wider border-b">
                  Language
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage("EN");
                    setIsLangDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 flex items-center justify-between ${
                    language === "EN" ? "text-[#f57224] font-bold" : ""
                  }`}
                >
                  English {language === "EN" && <Check className="w-3.5 h-3.5 text-[#f57224]" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage("BN");
                    setIsLangDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 flex items-center justify-between ${
                    language === "BN" ? "text-[#f57224] font-bold" : ""
                  }`}
                >
                  Bangla {language === "BN" && <Check className="w-3.5 h-3.5 text-[#f57224]" />}
                </button>

                <div className="px-3 py-1 font-bold text-[10px] text-slate-400 uppercase tracking-wider border-b border-t mt-1">
                  Currency
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCurrency("USD");
                    setIsLangDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 flex items-center justify-between ${
                    currency === "USD" ? "text-[#f57224] font-bold" : ""
                  }`}
                >
                  USD ($) {currency === "USD" && <Check className="w-3.5 h-3.5 text-[#f57224]" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrency("BDT");
                    setIsLangDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 flex items-center justify-between ${
                    currency === "BDT" ? "text-[#f57224] font-bold" : ""
                  }`}
                >
                  BDT (৳) {currency === "BDT" && <Check className="w-3.5 h-3.5 text-[#f57224]" />}
                </button>
              </div>
            )}
          </div>

          <span className="text-slate-700">|</span>

          {/* User / Auth Links */}
          {user ? (
            <div className="flex items-center gap-3">
              <Link
                to="/account"
                className="hover:text-[#f57224] transition-colors font-medium truncate max-w-[120px]"
              >
                Hi, {user.displayName || user.email?.split("@")[0] || "User"}
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="hover:text-[#f57224] transition-colors flex items-center gap-1 text-slate-300"
              >
                <LogOut className="w-3 h-3" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="hover:text-[#f57224] transition-colors font-medium"
              >
                Login
              </Link>
              <span className="text-slate-700">|</span>
              <Link
                to="/register"
                className="hover:text-[#f57224] transition-colors font-semibold text-[#f57224]"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const navigate = useNavigate();
  const authContext = (useAuth() as any) || {};
  const user = authContext?.user ?? null;

  const cartContext = (useCart() as any) || {};
  const cartCount =
    cartContext?.cartCount ??
    cartContext?.totalItems ??
    cartContext?.count ??
    (Array.isArray(cartContext?.items)
      ? cartContext.items.reduce(
          (acc: number, item: any) => acc + (item.quantity || 1),
          0
        )
      : 0);

  const wishlistContext = (useWishlist() as any) || {};
  const wishlistCount =
    wishlistContext?.count ??
    wishlistContext?.totalItems ??
    (Array.isArray(wishlistContext?.items)
      ? wishlistContext.items.length
      : Array.isArray(wishlistContext?.wishlistItems)
      ? wishlistContext.wishlistItems.length
      : 0);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState<boolean>(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState<boolean>(false);

  // Fallback category list
  const defaultCategories = [
    { id: "electronics", name: "Electronics & Gadgets", slug: "electronics" },
    { id: "fashion", name: "Fashion & Apparel", slug: "fashion" },
    { id: "home-lifestyle", name: "Home & Lifestyle", slug: "home-lifestyle" },
    { id: "health-beauty", name: "Health & Beauty", slug: "health-beauty" },
    { id: "groceries", name: "Groceries & Pets", slug: "groceries" },
    { id: "sports-outdoor", name: "Sports & Outdoor", slug: "sports-outdoor" },
    { id: "automotive", name: "Automotive & Motorbike", slug: "automotive" },
  ];

  // Fetch categories with React Query
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      if (!firebaseConfigured) return defaultCategories;
      try {
        const res = await listCategories();
        if (Array.isArray(res) && res.length > 0) {
          return res;
        }
        return defaultCategories;
      } catch (err) {
        console.warn("Categories fetch error:", err);
        return defaultCategories;
      }
    },
    staleTime: 1000 * 60 * 15,
  });

  const categories = categoriesData || defaultCategories;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate({
        to: "/products",
        search: { search: searchQuery.trim() },
      } as any);
    }
  };

  const handleSignOut = async () => {
    try {
      if (typeof signOut === "function") {
        await signOut();
      } else if (authContext?.signOut) {
        await authContext.signOut();
      }
      setIsAccountMenuOpen(false);
      navigate({ to: "/login" });
    } catch (err) {
      console.error("SiteHeader sign out error:", err);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm font-sans">
      {/* Top Bar Component */}
      <TopBar />

      {/* Main Header Bar */}
      <div className="bg-white border-b border-slate-100 py-3.5 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 md:gap-8">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="bg-[#1a1f3a] p-2 rounded-xl text-white group-hover:bg-[#252b52] transition-colors shadow-sm">
              <ShoppingCart className="w-6 h-6 text-[#f57224]" />
            </div>
            <div className="flex items-baseline">
              <span className="text-[#1a1f3a] font-extrabold text-2xl tracking-tight">
                Shop
              </span>
              <span className="text-[#f57224] font-extrabold text-2xl tracking-tight">
                Nexa
              </span>
            </div>
          </Link>

          {/* Search Bar Center */}
          <form
            onSubmit={handleSearchSubmit}
            className="hidden md:flex flex-1 max-w-2xl items-center relative"
          >
            <div className="relative w-full flex items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in Shop Nexa"
                className="w-full pl-4 pr-24 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a1f3a]/20 focus:border-[#1a1f3a] focus:bg-white transition-all text-slate-800 placeholder-slate-400"
              />
              <button
                type="submit"
                className="absolute right-1 top-1 bottom-1 px-4 bg-[#1a1f3a] text-white rounded-md hover:bg-[#f57224] transition-colors flex items-center justify-center font-semibold text-xs uppercase tracking-wider gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
              </button>
            </div>
          </form>

          {/* Right Action Icons (Cart, Wishlist, Account) */}
          <div className="flex items-center gap-3 sm:gap-6">
            {/* Wishlist Icon */}
            <Link
              to="/wishlist"
              className="relative p-2 text-slate-700 hover:text-[#f57224] transition-colors flex flex-col items-center group"
              aria-label="Wishlist"
            >
              <div className="relative">
                <Heart className="w-6 h-6 group-hover:scale-105 transition-transform" />
                {wishlistCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-[#f57224] text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center ring-2 ring-white">
                    {wishlistCount > 99 ? "99+" : wishlistCount}
                  </span>
                )}
              </div>
              <span className="hidden lg:block text-[11px] font-medium mt-0.5 text-slate-600 group-hover:text-[#f57224]">
                Wishlist
              </span>
            </Link>

            {/* Cart Icon */}
            <Link
              to="/cart"
              className="relative p-2 text-slate-700 hover:text-[#f57224] transition-colors flex flex-col items-center group"
              aria-label="Shopping Cart"
            >
              <div className="relative">
                <ShoppingCart className="w-6 h-6 group-hover:scale-105 transition-transform" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-[#f57224] text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center ring-2 ring-white">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </div>
              <span className="hidden lg:block text-[11px] font-medium mt-0.5 text-slate-600 group-hover:text-[#f57224]">
                Cart
              </span>
            </Link>

            {/* Account Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                className="p-1.5 sm:p-2 text-slate-700 hover:text-[#f57224] transition-colors flex items-center gap-1.5 rounded-lg hover:bg-slate-50 focus:outline-none"
              >
                <div className="w-7 h-7 rounded-full bg-[#1a1f3a]/10 text-[#1a1f3a] flex items-center justify-center font-bold text-xs">
                  {user?.displayName ? (
                    user.displayName.charAt(0).toUpperCase()
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>
                <div className="hidden lg:flex flex-col items-start text-left">
                  <span className="text-xs font-semibold text-slate-800 leading-none">
                    {user ? user.displayName || "Account" : "Hello, Sign In"}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 leading-none flex items-center">
                    Account & Orders <ChevronDown className="w-3 h-3 ml-0.5" />
                  </span>
                </div>
              </button>

              {/* Account Dropdown Menu */}
              {isAccountMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50"
                  onMouseLeave={() => setIsAccountMenuOpen(false)}
                >
                  {user ? (
                    <>
                      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {user.displayName || "User"}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {user.email}
                        </p>
                      </div>

                      <Link
                        to="/account"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-[#f57224] transition-colors"
                      >
                        <User className="w-4 h-4 text-slate-400" />
                        My Account
                      </Link>

                      <Link
                        to="/track-orders"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-[#f57224] transition-colors"
                      >
                        <Package className="w-4 h-4 text-slate-400" />
                        My Orders
                      </Link>

                      <Link
                        to="/wishlist"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-[#f57224] transition-colors"
                      >
                        <Heart className="w-4 h-4 text-slate-400" />
                        My Wishlist
                      </Link>

                      <Link
                        to="/settings"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-[#f57224] transition-colors"
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        Settings
                      </Link>

                      <div className="border-t border-slate-100 my-1"></div>

                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors text-left font-medium"
                      >
                        <LogOut className="w-4 h-4 text-red-500" />
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <div className="p-3">
                      <p className="text-xs text-slate-600 mb-2.5 text-center">
                        Welcome to Shop Nexa!
                      </p>
                      <Link
                        to="/login"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="block w-full py-2 px-4 bg-[#1a1f3a] text-white text-xs font-semibold text-center rounded-lg hover:bg-slate-800 transition-colors mb-2 shadow-sm"
                      >
                        Sign In
                      </Link>
                      <Link
                        to="/register"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="block w-full py-2 px-4 border border-[#f57224] text-[#f57224] text-xs font-semibold text-center rounded-lg hover:bg-orange-50 transition-colors"
                      >
                        Create Account
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mobile Hamburger Menu Toggle */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-slate-700 hover:text-[#1a1f3a] focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="mt-3 md:hidden">
          <form onSubmit={handleSearchSubmit} className="flex items-center relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in Shop Nexa"
              className="w-full pl-4 pr-12 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a1f3a]"
            />
            <button
              type="submit"
              className="absolute right-1 top-1 bottom-1 px-3 bg-[#1a1f3a] text-white rounded-md"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Category Bar */}
      <div className="bg-slate-50 border-b border-slate-200 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          {/* All Categories Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCategoryOpen(!isCategoryOpen)}
              className="bg-[#1a1f3a] text-white px-4 py-2.5 text-xs font-semibold flex items-center gap-2 hover:bg-slate-800 transition-colors uppercase tracking-wider rounded-t-md"
            >
              <LayoutGrid className="w-4 h-4 text-[#f57224]" />
              <span>All Categories</span>
              <ChevronDown
                className={`w-3.5 h-3.5 ml-1 transition-transform ${
                  isCategoryOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Category Dropdown List */}
            {isCategoryOpen && (
              <div
                className="absolute top-full left-0 w-64 bg-white border border-slate-200 shadow-xl rounded-b-lg py-2 z-50"
                onMouseLeave={() => setIsCategoryOpen(false)}
              >
                {categories.map((cat: any, idx: number) => {
                  const catName =
                    typeof cat === "string"
                      ? cat
                      : cat.name || cat.title || "Category";
                  const catSlug =
                    typeof cat === "object" && cat.slug
                      ? cat.slug
                      : catName.toLowerCase().replace(/\s+/g, "-");
                  return (
                    <Link
                      key={cat.id || idx}
                      to="/products"
                      search={{ category: catSlug } as any}
                      onClick={() => setIsCategoryOpen(false)}
                      className="flex items-center justify-between px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-[#f57224] transition-colors"
                    >
                      <span className="font-medium">{catName}</span>
                      <ChevronDown className="w-3 h-3 text-slate-400 -rotate-90" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <nav className="flex items-center gap-6 text-xs font-medium text-slate-700">
            <Link
              to="/flash-sales"
              className="flex items-center gap-1.5 text-[#f57224] font-bold hover:opacity-80 transition-opacity"
            >
              <Flame className="w-4 h-4 fill-[#f57224]" />
              <span>Flash Sale</span>
            </Link>

            <Link
              to="/products"
              search={{ sort: "bestsellers" } as any}
              className="flex items-center gap-1.5 hover:text-[#f57224] transition-colors"
            >
              <Award className="w-4 h-4 text-amber-500" />
              <span>Best Sellers</span>
            </Link>

            <Link
              to="/products"
              search={{ sort: "newest" } as any}
              className="flex items-center gap-1.5 hover:text-[#f57224] transition-colors"
            >
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span>New Arrivals</span>
            </Link>

            <Link
              to="/products"
              search={{ deals: "true" } as any}
              className="flex items-center gap-1.5 hover:text-[#f57224] transition-colors"
            >
              <Tag className="w-4 h-4 text-emerald-500" />
              <span>Deals & Offers</span>
            </Link>
          </nav>

          {/* Tagline / Promo */}
          <div className="hidden lg:flex items-center text-[11px] text-slate-500 font-medium">
            <span className="bg-orange-100 text-[#f57224] font-bold px-2 py-0.5 rounded text-[10px] mr-2">
              FREE SHIPPING
            </span>
            <span>On orders over $50</span>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 py-4 px-4 space-y-4">
          <div className="font-bold text-xs uppercase tracking-wider text-slate-400 border-b pb-1">
            Categories
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {categories.slice(0, 6).map((cat: any, idx: number) => {
              const catName =
                typeof cat === "string"
                  ? cat
                  : cat.name || cat.title || "Category";
              const catSlug =
                typeof cat === "object" && cat.slug
                  ? cat.slug
                  : catName.toLowerCase().replace(/\s+/g, "-");
              return (
                <Link
                  key={cat.id || idx}
                  to="/products"
                  search={{ category: catSlug } as any}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-1.5 px-2 rounded bg-slate-50 hover:bg-slate-100 text-slate-700 text-center truncate"
                >
                  {catName}
                </Link>
              );
            })}
          </div>

          <div className="font-bold text-xs uppercase tracking-wider text-slate-400 border-b pb-1 pt-2">
            Quick Navigation
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <Link
              to="/flash-sales"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2 text-[#f57224] font-bold py-1"
            >
              <Flame className="w-4 h-4 text-[#f57224]" /> Flash Sale
            </Link>
            <Link
              to="/products"
              search={{ sort: "bestsellers" } as any}
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2 text-slate-700 py-1"
            >
              <Award className="w-4 h-4 text-amber-500" /> Best Sellers
            </Link>
            <Link
              to="/products"
              search={{ sort: "newest" } as any}
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2 text-slate-700 py-1"
            >
              <Sparkles className="w-4 h-4 text-purple-500" /> New Arrivals
            </Link>
            <Link
              to="/products"
              search={{ deals: "true" } as any}
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2 text-slate-700 py-1"
            >
              <Tag className="w-4 h-4 text-emerald-500" /> Deals & Offers
            </Link>
            <Link
              to="/help-center"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2 text-slate-700 py-1"
            >
              <HelpCircle className="w-4 h-4 text-blue-500" /> Help & Support
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
