/**
 * "Shop by Category" — premium, calm, neutral marketplace section.
 * Uses the live category data source; visuals come from the deterministic
 * mapping in @/lib/categoryVisuals (one coherent icon system, AVENTA blue).
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { getCategoryIcon } from "@/lib/categoryVisuals";

export interface ShowcaseCategory {
  id: string;
  name: string;
  slug: string;
}

export function CategoryShowcase({
  categories,
  isLoading,
}: {
  categories: ShowcaseCategory[];
  isLoading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:mb-5">
        <h2 className="min-w-0 text-[17px] font-bold tracking-tight text-slate-900 sm:text-xl">
          Shop by Category
        </h2>
        <Link
          to="/shop"
          className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-semibold text-[#1455c6] transition hover:text-[#0f459f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1455c6]/40 focus-visible:ring-offset-2 sm:text-sm"
        >
          View All Categories
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1 no-scrollbar [-webkit-overflow-scrolling:touch] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {isLoading
          ? Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-[132px] w-[136px] shrink-0 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 sm:h-[144px] sm:w-auto"
              />
            ))
          : categories.map((cat) => {
              const Icon = getCategoryIcon(cat);
              return (
                <Link
                  key={cat.id}
                  to="/shop"
                  search={{ category: cat.slug }}
                  aria-label={`Shop ${cat.name}`}
                  className="group flex h-[132px] w-[136px] shrink-0 snap-start flex-col items-center justify-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 pb-3 pt-4 text-center transition duration-200 hover:-translate-y-0.5 hover:border-[#1455c6]/35 hover:shadow-[0_8px_20px_rgba(15,23,42,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1455c6]/40 focus-visible:ring-offset-2 sm:h-[144px] sm:w-auto sm:pt-5"
                >
                  <span
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#eff4fd] text-[#1455c6] transition-colors duration-200 group-hover:bg-[#e2ebfb] sm:h-16 sm:w-16"
                    aria-hidden="true"
                  >
                    <Icon className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={1.6} />
                  </span>
                  <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-800 sm:text-sm">
                    {cat.name}
                  </span>
                </Link>
              );
            })}
      </div>
    </div>
  );
}
