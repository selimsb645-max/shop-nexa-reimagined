import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  Search, ShoppingCart, Heart, User, ChevronDown, Menu, Flame,
  Truck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { signOut } from "@/services/firebase/auth";

const WHATSAPP = "https://wa.me/8801324997271";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShoppingCart className="h-5 w-5" />
      </div>
      <span className="text-xl font-bold">
        <span className="text-primary">Shop</span>
        <span className="text-accent">Nexa</span>
      </span>
    </Link>
  );
}

export function TopBar() {
  return (
    <div className="bg-primary text-primary-foreground text-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4" />
          <span>Free Delivery on orders over $50</span>
        </div>
        <div className="hidden md:block">Welcome to ShopNexa!</div>
        <div className="hidden items-center gap-4 md:flex">
          <Link to="/orders" className="hover:underline">Track Order</Link>
          <a href={WHATSAPP} target="_blank" rel="noreferrer" className="hover:underline">Help & Support</a>
          <div className="flex items-center gap-1">English <ChevronDown className="h-3 w-3" /></div>
        </div>
      </div>
    </div>
  );
}

function AccountMenu() {
  const { user, profile, loading } = useAuth();
  if (loading) {
    return <div className="hidden h-8 w-24 animate-pulse rounded bg-muted md:block" />;
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
        <Link to="/seller" className="block px-3 py-2 text-sm hover:bg-muted">Seller Panel</Link>
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

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4">
        <Logo />
        <form onSubmit={onSearch} className="ml-4 hidden flex-1 md:flex">
          <div className="flex w-full items-stretch rounded-md border">
            <Link to="/shop" className="flex items-center gap-2 border-r px-4 text-sm text-muted-foreground hover:bg-muted">
              All Categories <ChevronDown className="h-4 w-4" />
            </Link>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for products, brands and more..."
              className="flex-1 px-4 py-2.5 text-sm outline-none"
            />
            <button type="submit" className="flex items-center gap-2 bg-accent px-6 text-sm font-medium text-accent-foreground hover:opacity-90">
              <Search className="h-4 w-4" /> Search
            </button>
          </div>
        </form>
        <div className="ml-auto flex items-center gap-5">
          <AccountMenu />
          <Link to="/wishlist" className="relative hidden items-center gap-1.5 text-sm md:flex">
            <Heart className="h-5 w-5" /> Wishlist
            {wishCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                {wishCount}
              </span>
            )}
          </Link>
          <Link to="/cart" className="relative flex items-center gap-1.5 text-sm">
            <ShoppingCart className="h-5 w-5" /> Cart
            <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
              {cartCount}
            </span>
          </Link>
        </div>
      </div>
      <nav className="border-t">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 text-sm">
          <Link
            to="/shop"
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            <Menu className="h-4 w-4" /> All Categories
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
