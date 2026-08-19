/**
 * ServicePageLayout — Premium page shell for Account sub-pages.
 *
 * Mirrors the My Orders design language:
 *   - Orange gradient header with back arrow, title, subtitle
 *   - max-w-5xl content area
 *   - SiteFooter + WhatsAppFab + MobileBottomNav
 *
 * Usage:
 *   <ServicePageLayout title="My Wallet" subtitle="Balance & transactions" icon={<Wallet />}>
 *     {children}
 *   </ServicePageLayout>
 */

import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WhatsAppFab } from "@/components/layout/SiteChrome";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

export function ServicePageLayout({
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
      {/* Orange gradient header */}
      <header className="relative overflow-hidden bg-gradient-to-r from-orange-500 via-orange-500 to-orange-600 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 pb-4 pt-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Link
              to="/account"
              aria-label="Back to account"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition hover:bg-white/25 active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2} />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold sm:text-xl">{title}</h1>
              {subtitle && (
                <p className="truncate text-xs text-white/80">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 pb-24 lg:pb-8">
        {children}
      </main>

      <SiteFooter />
      <WhatsAppFab />
      <MobileBottomNav />
    </div>
  );
}
