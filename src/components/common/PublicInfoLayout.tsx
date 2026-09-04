/**
 * PublicInfoLayout — Premium page shell for public footer/info pages.
 *
 * Mirrors the My Orders design language:
 *   - SiteHeader on top
 *   - Orange gradient hero with back arrow (to home), title, subtitle
 *   - max-w-5xl content area with 2xl rounded cards
 *   - SiteFooter + WhatsAppFab + MobileBottomNav
 *
 * Usage:
 *   <PublicInfoLayout title="About Us" subtitle="Who we are">
 *     {children}
 *   </PublicInfoLayout>
 */

import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

export function PublicInfoLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans antialiased">
      <SiteHeader />

      {/* Orange gradient hero header */}
      <header className="relative overflow-hidden bg-gradient-to-r from-orange-500 via-orange-500 to-orange-600 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 pb-6 pt-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              aria-label="Back to home"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition hover:bg-white/25 active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2} />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold sm:text-2xl">{title}</h1>
              {subtitle && <p className="truncate text-xs text-white/80 sm:text-sm">{subtitle}</p>}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 pb-24 lg:pb-8">
        {children}
      </main>

      <SiteFooter />
      <WhatsAppFab />
      <MobileBottomNav />
    </div>
  );
}

/** A standard 2xl rounded white card used across info pages. */
export function InfoCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

/** Section heading inside an InfoCard. */
export function InfoHeading({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900 sm:text-lg">
      {icon}
      {children}
    </h2>
  );
}
