import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  Search, ShoppingCart, Heart, User, ChevronDown, Menu, Flame,
  Truck, Mic, Globe, Headset, PackageSearch,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { signOut } from "@/services/firebase/auth";

const WHATSAPP = "https://wa.me/8801324997271";

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2">
      <div className="flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <ShoppingCart className="h-6 w-6" />
      </div>
      <span className="text-[22px] font-bold leading-none tracking-tight">
        <span className="text-primary">Shop</span>
        <span className="text-accent">Nexa</span>
      </span>
    </Link>
  );
}

export function TopBar() {
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-1.5 text-[11px] md:px-4 md:py-2 md:text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <Truck className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
          <span className="truncate">Free Delivery over $50</span>
        </div>
        <div className="hidden md:block">Welcome to ShopNexa!</div>
        <div className="flex shrink-0 items-center gap-3 md:gap-4">
          <Link to="/orders" className="flex items-center gap-1 hover:underline">
            <PackageSearch className="h-3.5 w-3.5 md:hidden" />
            <span className="hidden sm:inline">Track Order</span>
          </Link>
          <a href={WHATSAPP} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">
            <Headset className="h-3.5 w-3.5 md:hidden" />
            <span className="hidden sm:inline">Help</span>
          </a>
          <div className="flex items-center gap-1">
            <Globe className="h-3.5 w-3.5 md:hidden" />
            <span className="hidden sm:inline">English</span>
            <ChevronDown className="hidden h-3 w-3 sm:block" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountMenu() {
  const { user, profile, loading } = useAuth();
  if (loading) {
    return <div className="hidden h-8 w-24 skeleton rounded md:block" />;
  }
  if (!user) {
    return (
      <div className="hidden items-center gap-2 text-sm md:flex">
        <User className="h-5 w-5" />
        <div className="leading-tight">
          <div className="text-xs text-muted-foreground">Account</div>
          <div className="flex items-center gap-1 font-medium">
            <Link to="/login" className="hover:text-primary">Login</Link>
            <span className="text-muted-foreground">/</span>
            <Link to="/register" className="hover:text-primary">Register</Link>
          </div>
        </div>
      </div>
    );
  }
  const name = profile?.displayName || user.displayName || user.email?.split("@")[0] || "Account";
  return (
    <div className="group relative hidden md:block">
      <Link to="/account" className="flex items-center gap-2 text-sm">
        {(profile?.photoURL || user.photoURL) ? (
          <img src={profile?.photoURL || user.photoURL || ""} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="leading-tight">
          <div className="text-xs text-muted-foreground">Hi, {name.split(" ")[0]}</div>
          <div className="font-medium">My Account</div>
        </div>
      </Link>
      <div className="invisible absolute right-0 top-full z-30 mt-1 w-48 rounded-md border bg-background py-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
        <Link to="/account" className="block px-3 py-2 text-sm hover:bg-muted">Profile</Link>
        <Link to="/orders" className="block px-3 py-2 text-sm hover:bg-muted">Orders</Link>
        <Link to="/wishlist" className="block px-3 py-2 text-sm hover:bg-muted">Wishlist</Link>
        <Link to="/wallet" className="block px-3 py-2 text-sm hover:bg-muted">Wallet</Link>
        {profile?.role === "admin" && (
          <Link to="/admin" className="block px-3 py-2 text-sm hover:bg-muted">Admin</Link>
        )}
        <button
          onClick={() => signOut()}
          className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { count: cartCount } = useCart();
  const { count: wishCount } = useWishlist();

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate({ to: "/shop", search: term ? { q: term } : {} });
  };

  const searchField = (
    <>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search products"
        placeholder="Search products, brands and more..."
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground md:px-4 md:py-2.5"
      />
      <button
        type="button"
        aria-label="Voice search"
        onClick={() => navigate({ to: "/shop", search: {} })}
        className="flex w-10 shrink-0 items-center justify-center text-muted-foreground transition hover:text-primary md:w-11"
      >
        <Mic className="h-[18px] w-[18px]" />
      </button>
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-3 py-2.5 md:px-4 md:py-4">
        <Logo />
        {/* Desktop search */}
        <form onSubmit={onSearch} className="ml-4 hidden flex-1 md:flex">
          <div className="flex w-full items-stretch overflow-hidden rounded-xl border focus-within:border-primary">
            <Link to="/shop" className="flex items-center gap-2 border-r px-4 text-sm text-muted-foreground hover:bg-muted">
              All Categories <ChevronDown className="h-4 w-4" />
            </Link>
            {searchField}
            <button type="submit" className="ripple flex items-center gap-2 bg-accent px-6 text-sm font-medium text-accent-foreground transition hover:opacity-90">
              <Search className="h-4 w-4" /> Search
            </button>
          </div>
        </form>
        <div className="ml-auto flex items-center gap-4 md:gap-5">
          <AccountMenu />
          <Link to="/wishlist" className="relative hidden items-center gap-1.5 text-sm md:flex">
            <Heart className="h-5 w-5" /> Wishlist
            {wishCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                {wishCount}
              </span>
            )}
          </Link>
          {/* Cart lives in the bottom nav on mobile — desktop keeps it here. */}
          <Link to="/cart" className="relative hidden items-center gap-1.5 text-sm md:flex">
            <ShoppingCart className="h-5 w-5" /> Cart
            <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
              {cartCount}
            </span>
          </Link>
          <Link
            to="/wishlist"
            aria-label="Wishlist"
            className="relative flex h-11 w-11 items-center justify-center rounded-full text-foreground transition active:scale-90 md:hidden"
          >
            <Heart className="h-[22px] w-[22px]" />
            {wishCount > 0 && (
              <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground ring-2 ring-background">
                {wishCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Mobile full-width search below the logo */}
      <form onSubmit={onSearch} className="px-3 pb-2.5 md:hidden">
        <div className="flex items-stretch overflow-hidden rounded-full border bg-card focus-within:border-primary">
          <button type="submit" aria-label="Search" className="flex w-11 shrink-0 items-center justify-center text-muted-foreground">
            <Search className="h-[18px] w-[18px]" />
          </button>
          {searchField}
        </div>
      </form>

      <nav className="hidden border-t md:block">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-2.5 text-sm">
          <Link
            to="/shop"
            className="ripple flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            <Menu className="h-4 w-4 shrink-0" /> All Categories
          </Link>
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "border-b-2 border-primary text-primary" }}
            className="py-2 hover:text-primary"
          >
            Home
          </Link>
          <Link to="/shop" activeProps={{ className: "text-primary" }} className="py-2 hover:text-primary">Shop</Link>
          <Link to="/shop" search={{ sort: "price-desc" as const }} className="py-2 hover:text-primary">Deals</Link>
          <Link to="/wishlist" className="py-2 hover:text-primary">Wishlist</Link>
          <Link to="/orders" className="py-2 hover:text-primary">Orders</Link>
          <div className="ml-auto flex items-center gap-2 text-destructive">
            <Flame className="h-4 w-4" />
            <span className="font-medium">Hot Deals</span>
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </nav>
    </header>
  );
}
