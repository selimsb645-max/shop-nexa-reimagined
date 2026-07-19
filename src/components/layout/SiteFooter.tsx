import { Link } from "@tanstack/react-router";
import {
  ShoppingCart, Mail, MapPin, Phone, Facebook, Twitter, Instagram, Youtube, ShieldCheck,
} from "lucide-react";

const WHATSAPP = "https://wa.me/8801324997271";
const FACEBOOK = "https://www.facebook.com/profile.php?id=61592089432837";

export function SiteFooter() {
  return (
    <footer className="mt-8 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold">
                <span className="text-primary">Shop</span>
                <span className="text-accent">Nexa</span>
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              ShopNexa is your one-stop destination for all your needs. Quality products, best prices and great service.
            </p>
            <div className="mt-5 flex gap-3">
              <a href={FACEBOOK} target="_blank" rel="noreferrer" aria-label="Facebook" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 hover:bg-primary">
                <Facebook className="h-4 w-4" />
              </a>
              <a href="#" aria-label="Twitter" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 hover:bg-primary">
                <Twitter className="h-4 w-4" />
              </a>
              <a href="#" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 hover:bg-primary">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="#" aria-label="YouTube" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 hover:bg-primary">
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>
          <div>
            <h4 className="mb-4 font-semibold text-white">Shop</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/shop" className="hover:text-white">All Products</Link></li>
              <li><Link to="/shop" search={{ sort: "rating" as const }} className="hover:text-white">Best Sellers</Link></li>
              <li><Link to="/shop" search={{ sort: "price-desc" as const }} className="hover:text-white">Deals</Link></li>
              <li><Link to="/shop" search={{ sort: "newest" as const }} className="hover:text-white">New Arrivals</Link></li>
              <li><Link to="/wishlist" className="hover:text-white">Wishlist</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-semibold text-white">Customer Service</h4>
            <ul className="space-y-2 text-sm">
              <li><a href={WHATSAPP} target="_blank" rel="noreferrer" className="hover:text-white">Contact Us</a></li>
              <li><Link to="/orders" className="hover:text-white">Track Order</Link></li>
              <li><Link to="/cart" className="hover:text-white">My Cart</Link></li>
              <li><Link to="/account" className="hover:text-white">My Account</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-semibold text-white">Information</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white">About Us</a></li>
              <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white">Terms & Conditions</a></li>
              <li><a href="#" className="hover:text-white">Refund Policy</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-semibold text-white">Contact Us</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <a href={WHATSAPP} target="_blank" rel="noreferrer" className="hover:text-white">+880 1324 997271 (WhatsApp)</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <a href="mailto:support@shopnexa.com" className="hover:text-white">support@shopnexa.com</a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <span>123 Market Street,<br />Dhaka, Bangladesh</span>
              </li>
              <li className="flex items-center gap-2">
                <Facebook className="h-4 w-4 text-primary" />
                <a href={FACEBOOK} target="_blank" rel="noreferrer" className="hover:text-white">Facebook Page</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400 sm:flex-row">
          <div>© 2026 ShopNexa. All Rights Reserved.</div>
          <div className="flex items-center gap-2">
            <span>We Accept:</span>
            <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-white">VISA</span>
            <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-white">MC</span>
            <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-white">PayPal</span>
            <span className="rounded bg-slate-800 px-2 py-1 font-semibold text-white">Apple Pay</span>
          </div>
        </div>
      </div>
      <ShieldCheckSpacer />
    </footer>
  );
}

// Keeps ShieldCheck import referenced (used inside Newsletter aside on homepage);
// harmless empty element so tree-shaking works consistently.
function ShieldCheckSpacer() {
  return <div aria-hidden className="hidden"><ShieldCheck /></div>;
}
