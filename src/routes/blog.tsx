import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Newspaper,
  Search,
  TrendingUp,
  CalendarDays,
  Clock,
  ChevronRight,
  Mail,
} from "lucide-react";
import { useState } from "react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";
import { BLOG_ARTICLES, BLOG_CATEGORIES } from "@/data/blog";

export const Route = createFileRoute("/blog")({
  ssr: false,
  component: BlogPage,
  head: () => ({
    meta: [
      { title: "Blog — Aventa Shop" },
      {
        name: "description",
        content: "Shopping guides, deals tips, seller guides and Aventa Shop news.",
      },
    ],
  }),
});

function BlogPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = BLOG_ARTICLES.filter((a) => {
    const matchesQuery =
      !query ||
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.excerpt.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = !activeCategory || a.category === activeCategory;
    return matchesQuery && matchesCategory;
  });

  const featured = BLOG_ARTICLES[0];
  const latest = [...BLOG_ARTICLES].sort((a, b) => (a.date < b.date ? 1 : -1));
  const popular = [...BLOG_ARTICLES].sort((a, b) => b.readMinutes - a.readMinutes);

  return (
    <PublicInfoLayout title="Aventa Shop Blog" subtitle="Shopping made easier">
      {/* Featured Article */}
      {featured && (
        <Link
          to="/blog/$slug"
          params={{ slug: featured.slug }}
          className="mb-4 block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-orange-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-600">
              Featured
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-500">
              {featured.category}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{featured.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{featured.excerpt}</p>
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {featured.date}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {featured.readMinutes} min read
            </span>
            <span className="ml-auto flex items-center gap-1 font-semibold text-orange-500">
              Read Article
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </Link>
      )}

      {/* Search */}
      <InfoCard className="mb-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles..."
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>

        {/* Categories */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${activeCategory === null ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            All
          </button>
          {BLOG_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(activeCategory === c ? null : c)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${activeCategory === c ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </InfoCard>

      {/* Latest Articles */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<Newspaper className="h-5 w-5 text-orange-500" />}>
          {activeCategory ? activeCategory : "Latest Articles"}
        </InfoHeading>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No articles found. Try a different search or category.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((a) => (
              <Link
                key={a.slug}
                to="/blog/$slug"
                params={{ slug: a.slug }}
                className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition hover:border-orange-200 hover:bg-white hover:shadow-sm"
              >
                <span className="text-[10px] font-bold uppercase tracking-wide text-orange-500">
                  {a.category}
                </span>
                <h3 className="mt-1 text-sm font-semibold leading-snug text-slate-800">
                  {a.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {a.excerpt}
                </p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                  <span>{a.date}</span>
                  <span>{a.readMinutes} min read</span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-4 text-center text-xs text-slate-400">
          More articles are on the way — new guides and updates are added regularly.
        </p>
      </InfoCard>

      {/* Popular Articles */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<TrendingUp className="h-5 w-5 text-orange-500" />}>
          Popular Articles
        </InfoHeading>
        <div className="divide-y divide-slate-100">
          {popular.slice(0, 3).map((a) => (
            <Link
              key={a.slug}
              to="/blog/$slug"
              params={{ slug: a.slug }}
              className="flex items-center gap-3 py-3 transition hover:text-orange-600"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-50 text-xs font-bold text-orange-500">
                {a.category.charAt(0)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                {a.title}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </Link>
          ))}
        </div>
      </InfoCard>

      {/* Newsletter */}
      <InfoCard className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <Mail className="h-8 w-8" />
          <h2 className="text-lg font-bold">Get Updates</h2>
          <p className="text-sm text-white/85">
            New guides, deals and platform updates — delivered occasionally, never spammy.
          </p>
          <Link
            to="/contact-us"
            className="mt-1 rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-orange-600 transition hover:bg-orange-50 active:scale-[0.98]"
          >
            Stay in Touch
          </Link>
        </div>
      </InfoCard>
    </PublicInfoLayout>
  );
}
