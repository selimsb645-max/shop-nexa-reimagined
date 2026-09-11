import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { Store, MapPin, Loader, ChevronRight, Search } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { listPublicStores } from "@/lib/store.functions";
import { seoHead, jsonLdScript, getSiteUrl } from "@/lib/seo";

export const Route = createFileRoute("/stores")({
  ssr: true,
  component: StoresDirectory,
  head: () => ({
    ...seoHead({
      title: "All Stores — AVENTA SHOP",
      description:
        "Browse all verified seller stores on AVENTA SHOP. Discover trusted shops with quality products and fast delivery.",
      path: "/stores",
      type: "website",
      image: "/brand/aventa-shop-logo.png",
    }),
  }),
});

interface DirectoryStore {
  shopName: string;
  shopSlug: string;
  description: string;
  logoUrl: string | null;
  city: string;
  area: string | null;
  country: string;
}

function StoresDirectory() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-stores"],
    queryFn: async () => listPublicStores({ data: {} }),
    staleTime: 1000 * 60 * 5,
  });

  const [q, setQ] = useState("");

  // Breadcrumb + ItemList JSON-LD for SEO
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "stores-directory-jsonld";
    script.textContent = jsonLdScript({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: getSiteUrl(),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Stores",
          item: `${getSiteUrl()}/stores`,
        },
      ],
    });
    document.head.appendChild(script);
    return () => {
      document.getElementById("stores-directory-jsonld")?.remove();
    };
  }, []);

  const stores = useMemo<DirectoryStore[]>(() => {
    const all = data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((s) =>
      `${s.shopName} ${s.city} ${s.area ?? ""} ${s.country}`.toLowerCase().includes(term),
    );
  }, [data, q]);

  return (
    <>
      <SiteHeader />

      <main className="flex-1 bg-[#f8f9fa] min-h-screen">
        {/* Page header */}
        <div className="bg-[#1a1f3a] text-white">
          <div className="max-w-7xl mx-auto px-4 py-10 sm:py-14">
            <div className="flex items-center gap-2 text-xs text-slate-300 mb-3">
              <Link to="/" className="hover:text-white transition-colors">Home</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-white font-medium">Stores</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">All Stores</h1>
            <p className="mt-2 text-sm text-slate-300 max-w-xl">
              Discover verified sellers on AVENTA SHOP — browse their storefronts and shop with confidence.
            </p>

            {/* Search */}
            <div className="mt-6 max-w-md relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search stores by name or location…"
                className="w-full rounded-xl border border-white/10 bg-white/10 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-[#f57224] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Stores grid */}
        <div className="max-w-7xl mx-auto px-4 py-8 pb-24 md:pb-12">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
              <Loader className="w-5 h-5 animate-spin" /> Loading stores…
            </div>
          ) : isError ? (
            <div className="text-center py-24">
              <p className="text-sm text-slate-500">Could not load stores. Please try again.</p>
            </div>
          ) : stores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 px-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Store className="w-8 h-8 text-slate-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">
                {q ? "No stores match your search" : "No stores yet"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {q ? "Try a different name or location." : "Verified seller stores will appear here soon."}
              </p>
              <Link
                to="/shop"
                className="mt-6 inline-flex items-center gap-1.5 bg-[#f57224] hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-xl text-sm transition-colors"
              >
                Browse All Products <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-4">
                {stores.length} store{stores.length > 1 ? "s" : ""}
                {q ? ` matching “${q.trim()}”` : ""}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {stores.map((s) => (
                  <Link
                    key={s.shopSlug}
                    to="/store/$slug"
                    params={{ slug: s.shopSlug }}
                    className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-[#f57224]/40 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-14 h-14 rounded-xl bg-[#1a1f3a] flex items-center justify-center text-white font-extrabold text-lg shrink-0 overflow-hidden">
                        {s.logoUrl ? (
                          <img src={s.logoUrl} alt={s.shopName} className="w-full h-full object-cover" />
                        ) : (
                          s.shopName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[#1a1f3a] group-hover:text-[#f57224] transition-colors truncate">
                          {s.shopName}
                        </h3>
                        {(s.city || s.country) && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                              {[s.city, s.area, s.country].filter(Boolean).join(", ")}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                    {s.description && (
                      <p className="mt-3 text-xs text-slate-500 line-clamp-2">{s.description}</p>
                    )}
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#f57224]">
                      Visit Store <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <SiteFooter />
      <MobileBottomNav />
    </>
  );
}
