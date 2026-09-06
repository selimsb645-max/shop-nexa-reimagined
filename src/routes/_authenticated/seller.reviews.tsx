/**
 * AVENTA SHOP — Seller Reviews & Ratings
 *
 * Route: /seller/reviews
 * Reuses existing infrastructure:
 * - listReviews (reviews service — approved reviews per product subcollection)
 * - listSellerProducts (sellerProducts service)
 * - SellerProfile.rating / ratingCount (server-denormalized totals)
 * - SellerGate for auth + seller authorization
 *
 * Note: the existing backend does not support seller responses to reviews,
 * so this page is read-only. Verified identity fields stay read-only.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Star, MessageSquare, Loader, Star as StarIcon } from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import { listSellerProducts } from "@/services/firebase/sellerProducts";
import { listReviews } from "@/services/firebase/reviews";
import { formatDate } from "@/utils/format";
import type { Product, Review } from "@/types/commerce";
import type { SellerProfile } from "@/types/seller";

export const Route = createFileRoute("/_authenticated/seller/reviews")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <ReviewsPage profile={profile} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Reviews — Seller — AVENTA SHOP" }] }),
});

/** Batch size for per-product review fetches (bounded, avoids unbounded N+1). */
const REVIEW_FETCH_BATCH = 25;

interface ReviewRow extends Review {
  productTitle: string;
}

function ReviewsPage({ profile }: { profile: SellerProfile }) {
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const products: Product[] = await listSellerProducts(profile.uid);
        const out: ReviewRow[] = [];
        // Fetch reviews per product in small batches to keep load bounded.
        for (let i = 0; i < products.length; i += REVIEW_FETCH_BATCH) {
          const batch = products.slice(i, i + REVIEW_FETCH_BATCH);
          const results = await Promise.all(
            batch.map(async (p) =>
              (await listReviews(p.id)).map((r) => ({ ...r, productTitle: p.title })),
            ),
          );
          out.push(...results.flat());
        }
        out.sort((a, b) => b.createdAt - a.createdAt);
        if (!cancelled) setRows(out);
      } catch {
        if (!cancelled) setError("Unable to load reviews. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.uid]);

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const overall = profile.rating > 0 ? profile.rating : null;
  const totalReviews = profile.ratingCount;

  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: rows?.filter((r) => Math.round(r.rating) === stars).length ?? 0,
  }));

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#0f172a] sm:text-2xl">
          Reviews &amp; Ratings
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          What customers are saying about your products.
        </p>
      </div>

      {/* Rating summary */}
      <section className="grid gap-3 sm:grid-cols-[auto,1fr] sm:items-center sm:gap-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col items-center justify-center sm:w-40">
          {overall === null ? (
            <p className="text-sm font-medium text-slate-400">No data yet</p>
          ) : (
            <>
              <p className="text-4xl font-bold text-[#0f172a]">{overall.toFixed(1)}</p>
              <div
                className="mt-1 flex items-center gap-0.5"
                aria-label={`Rated ${overall.toFixed(1)} out of 5`}
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <StarIcon
                    key={i}
                    className={`h-4 w-4 ${i <= Math.round(overall) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {totalReviews} review{totalReviews === 1 ? "" : "s"}
              </p>
            </>
          )}
        </div>
        <div className="space-y-1.5">
          {distribution.map(({ stars, count }) => (
            <div key={stars} className="flex items-center gap-2 text-sm">
              <span className="flex w-10 items-center gap-1 text-slate-500">
                {stars} <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              </span>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{
                    width: rows && rows.length > 0 ? `${(count / rows.length) * 100}%` : "0%",
                  }}
                />
              </div>
              <span className="w-8 text-right font-medium text-[#0f172a]">
                {rows === null ? "…" : count}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Review list */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <MessageSquare className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-bold text-[#0f172a]">Customer Reviews</h2>
        </div>

        {rows === null ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-100">
              <Star className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="mt-4 text-base font-bold text-[#0f172a]">No Reviews Yet</h3>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              Your customer reviews will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {rows.map((r) => (
              <li key={`${r.productId}-${r.id}`} className="flex gap-3 px-4 py-4 sm:px-5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                  {initials(r.userName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold text-[#0f172a]">
                      {firstName(r.userName)}
                    </span>
                    <span
                      className="flex items-center gap-0.5"
                      aria-label={`${r.rating} out of 5 stars`}
                    >
                      {[1, 2, 3, 4, 5].map((i) => (
                        <StarIcon
                          key={i}
                          className={`h-3 w-3 ${i <= Math.round(r.rating) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(r.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">on {r.productTitle}</p>
                  {r.title && <p className="mt-1 text-sm font-medium text-[#0f172a]">{r.title}</p>}
                  {r.comment && (
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{r.comment}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Privacy: customers are shown by first name / initials only. */
function firstName(name: string): string {
  return name.split(" ")[0] || "Customer";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}
