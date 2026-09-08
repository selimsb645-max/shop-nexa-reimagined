import { Link } from "@tanstack/react-router";
import {
  ShoppingCart,
  Facebook,
  Youtube,
  Instagram,
  Twitter,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  CreditCard,
  Wallet,
} from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="w-full font-sans text-slate-800 border-t border-slate-200">
      {/* Main Multi-Column Section - Light Gray Background #f4f4f4 */}
      <div className="bg-[#f4f4f4] py-10 px-4 sm:px-6 lg:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Column 1: Customer Care */}
          <div>
            <h3 className="text-base font-bold text-[#0f172a] uppercase tracking-wider mb-4 border-b-2 border-[#f97316] pb-1 inline-block">
              Customer Care
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  to="/help-center"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200 flex items-center gap-1.5"
                >
                  Help Center
                </Link>
              </li>
              <li>
                <Link
                  to="/how-to-buy"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  How to Buy
                </Link>
              </li>
              <li>
                <Link
                  to="/returns-policy"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  Returns &amp; Refunds
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  Contact Us
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link
                  to="/track-orders-info"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  Track Order
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: AVENTA SHOP */}
          <div>
            <h3 className="text-base font-bold text-[#0f172a] uppercase tracking-wider mb-4 border-b-2 border-[#f97316] pb-1 inline-block">
              AVENTA SHOP
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  to="/about"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  to="/digital-payments"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  Digital Payments
                </Link>
              </li>
              <li>
                <Link
                  to="/blog"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  AVENTA SHOP Blog
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  to="/seller/register"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  Become a Seller
                </Link>
              </li>
              <li>
                <Link
                  to="/affiliate"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  Affiliate Program
                </Link>
              </li>
              <li>
                <Link
                  to="/mart"
                  className="text-slate-600 hover:text-[#f97316] transition-colors duration-200"
                >
                  AVENTA SHOP Mart
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: App Download */}
          <div>
            <h3 className="text-base font-bold text-[#0f172a] uppercase tracking-wider mb-4 border-b-2 border-[#f97316] pb-1 inline-block">
              App Download
            </h3>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-[#f97316] text-white p-2 rounded-lg">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-[#f97316] tracking-wide">
                    Happy Shopping
                  </p>
                  <p className="text-sm font-bold text-slate-800">Download AVENTA SHOP App</p>
                </div>
              </div>

              {/* QR Code and App Download Buttons */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                {/* QR Code Placeholder SVG */}
                <div className="w-24 h-24 bg-slate-50 border border-slate-200 rounded-lg p-1.5 flex flex-col items-center justify-center shrink-0">
                  <svg
                    viewBox="0 0 100 100"
                    className="w-full h-full text-slate-800"
                    fill="currentColor"
                  >
                    <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
                    {/* Top Left Finder Pattern */}
                    <rect x="5" y="5" width="30" height="30" fill="#0f172a" />
                    <rect x="10" y="10" width="20" height="20" fill="#ffffff" />
                    <rect x="15" y="15" width="10" height="10" fill="#f97316" />

                    {/* Top Right Finder Pattern */}
                    <rect x="65" y="5" width="30" height="30" fill="#0f172a" />
                    <rect x="70" y="10" width="20" height="20" fill="#ffffff" />
                    <rect x="75" y="15" width="10" height="10" fill="#f97316" />

                    {/* Bottom Left Finder Pattern */}
                    <rect x="5" y="65" width="30" height="30" fill="#0f172a" />
                    <rect x="10" y="70" width="20" height="20" fill="#ffffff" />
                    <rect x="15" y="75" width="10" height="10" fill="#f97316" />

                    {/* Data Modules */}
                    <rect x="42" y="10" width="8" height="8" fill="#0f172a" />
                    <rect x="52" y="20" width="8" height="8" fill="#0f172a" />
                    <rect x="42" y="30" width="8" height="8" fill="#f97316" />
                    <rect x="10" y="42" width="8" height="8" fill="#0f172a" />
                    <rect x="22" y="42" width="8" height="8" fill="#0f172a" />
                    <rect x="34" y="42" width="12" height="12" fill="#0f172a" />
                    <rect x="52" y="42" width="12" height="12" fill="#f97316" />
                    <rect x="70" y="42" width="8" height="8" fill="#0f172a" />
                    <rect x="82" y="42" width="8" height="8" fill="#0f172a" />

                    <rect x="42" y="60" width="8" height="8" fill="#0f172a" />
                    <rect x="52" y="70" width="8" height="8" fill="#f97316" />
                    <rect x="65" y="65" width="10" height="10" fill="#0f172a" />
                    <rect x="80" y="65" width="10" height="10" fill="#0f172a" />
                    <rect x="65" y="80" width="10" height="10" fill="#f97316" />
                    <rect x="80" y="80" width="10" height="10" fill="#0f172a" />
                  </svg>
                  <span className="text-[9px] text-slate-500 font-medium mt-0.5 text-center leading-tight">
                    Scan to Download
                  </span>
                </div>

                {/* Download Buttons */}
                <div className="flex flex-col gap-2 w-full">
                  {/* App Store */}
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="flex items-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white px-2.5 py-1.5 rounded-lg transition-colors duration-200"
                  >
                    <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.22c.62-.75 1.04-1.8 0.92-2.85-.9.04-2 0.6-2.65 1.36-.58.67-1.09 1.75-.95 2.78 1.01.08 2.05-.54 2.68-1.29z" />
                    </svg>
                    <div className="text-left leading-tight">
                      <p className="text-[8px] uppercase font-medium text-slate-300">
                        Download on the
                      </p>
                      <p className="text-xs font-semibold text-white">App Store</p>
                    </div>
                  </a>

                  {/* Google Play */}
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="flex items-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white px-2.5 py-1.5 rounded-lg transition-colors duration-200"
                  >
                    <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                      <path d="M3.609 1.814L13.792 12 3.61 22.186a1.98 1.98 0 01-.61-1.428V3.242c0-.53.223-1.037.61-1.428zM15.206 13.414l2.586 2.586-11.455 6.613 8.869-9.199zm0-2.828L6.337 1.387l11.455 6.613-2.586 2.586zm1.414 1.414l3.83-2.212c.732-.423.732-1.11 0-1.533l-3.83-2.212-2.828 2.828 2.828 2.828z" />
                    </svg>
                    <div className="text-left leading-tight">
                      <p className="text-[8px] uppercase font-medium text-slate-300">GET IT ON</p>
                      <p className="text-xs font-semibold text-white">Google Play</p>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Column 4: Contact & Brand Info */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-[#0f172a] text-[#f97316] px-3 py-1.5 rounded-lg font-bold text-lg flex items-center gap-2 border border-slate-700">
                <ShoppingCart className="w-5 h-5 text-[#f97316]" />
                <span className="text-white font-extrabold tracking-tight">
                  AVENTA <span className="text-[#f97316]">SHOP</span>
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Bangladesh&apos;s leading e-commerce marketplace for authentic electronics, lifestyle
              products, and everyday essentials.
            </p>

            <ul className="space-y-2.5 text-xs text-slate-700">
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#f97316] shrink-0" />
                <a
                  href="mailto:help.aventashop@gmail.com"
                  className="hover:text-[#f97316] font-medium transition-colors"
                >
                  <span className="text-slate-500">Customer Support:</span>{" "}
                  help.aventashop@gmail.com
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#f97316] shrink-0" />
                <a
                  href="mailto:orders.aventashop@gmail.com"
                  className="hover:text-[#f97316] font-medium transition-colors"
                >
                  <span className="text-slate-500">Order Support:</span> orders.aventashop@gmail.com
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#f97316] shrink-0" />
                <a
                  href="mailto:info.aventashop@gmail.com"
                  className="hover:text-[#f97316] font-medium transition-colors"
                >
                  <span className="text-slate-500">General/Business:</span>{" "}
                  info.aventashop@gmail.com
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#f97316] shrink-0 mt-0.5" />
                <span>Dhaka, Bangladesh</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* BOTTOM STRIP - Navy Background #0f172a */}
      <div className="bg-[#0f172a] text-slate-300 py-8 px-4 sm:px-6 lg:px-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center pb-6 border-b border-slate-800">
            {/* Payment Methods */}
            <div>
              <p className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-2.5 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-[#f97316]" />
                <span>Payment Methods</span>
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                {/* COD Badge */}
                <span className="bg-slate-800 text-slate-200 text-[11px] font-bold px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-amber-400" />
                  COD
                </span>

                {/* Visa Badge */}
                <span className="bg-slate-800 text-white text-[11px] font-black px-2.5 py-1 rounded border border-slate-700 tracking-wider italic text-blue-400">
                  VISA
                </span>

                {/* Mastercard Badge */}
                <span className="bg-slate-800 text-white text-[11px] font-bold px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 -mr-1.5 opacity-90"></span>
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 opacity-90"></span>
                  <span className="ml-1 text-[10px] text-slate-300">Mastercard</span>
                </span>

                {/* bKash Badge */}
                <span className="bg-slate-800 text-[#e2136e] font-extrabold text-[11px] px-2.5 py-1 rounded border border-slate-700">
                  bKash
                </span>

                {/* Nagad Badge */}
                <span className="bg-slate-800 text-[#f7921e] font-extrabold text-[11px] px-2.5 py-1 rounded border border-slate-700">
                  Nagad
                </span>

                {/* Rocket Badge */}
                <span className="bg-slate-800 text-[#8c3494] font-extrabold text-[11px] px-2.5 py-1 rounded border border-slate-700">
                  Rocket
                </span>
              </div>
            </div>

            {/* Verified By Section */}
            <div className="text-left md:text-center">
              <p className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-2.5 flex items-center md:justify-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Verified &amp; Secured</span>
              </p>
              <div className="inline-flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-left leading-tight">
                  <p className="font-semibold text-slate-100">Verified by AVENTA SHOP</p>
                  <p className="text-[10px] text-slate-400">256-Bit SSL Secured Checkout</p>
                </div>
              </div>
            </div>

            {/* Follow Us */}
            <div className="text-left md:text-right">
              <p className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-2.5">
                Follow Us
              </p>
              <div className="flex items-center md:justify-end gap-3">
                <a
                  href="https://www.facebook.com/profile.php?id=61592089432837"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="AVENTA SHOP Facebook Page"
                  className="w-9 h-9 bg-slate-800 hover:bg-[#f97316] text-slate-300 hover:text-white rounded-full flex items-center justify-center transition-all duration-200 border border-slate-700"
                >
                  <Facebook className="w-4 h-4" />
                </a>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  aria-label="AVENTA SHOP YouTube"
                  className="w-9 h-9 bg-slate-800 hover:bg-[#f97316] text-slate-300 hover:text-white rounded-full flex items-center justify-center transition-all duration-200 border border-slate-700"
                >
                  <Youtube className="w-4 h-4" />
                </a>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  aria-label="AVENTA SHOP Instagram"
                  className="w-9 h-9 bg-slate-800 hover:bg-[#f97316] text-slate-300 hover:text-white rounded-full flex items-center justify-center transition-all duration-200 border border-slate-700"
                >
                  <Instagram className="w-4 h-4" />
                </a>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  aria-label="AVENTA SHOP Twitter"
                  className="w-9 h-9 bg-slate-800 hover:bg-[#f97316] text-slate-300 hover:text-white rounded-full flex items-center justify-center transition-all duration-200 border border-slate-700"
                >
                  <Twitter className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          {/* Copyright Row */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-slate-400 pt-2">
            <p>© 2026 AVENTA SHOP. All Rights Reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
