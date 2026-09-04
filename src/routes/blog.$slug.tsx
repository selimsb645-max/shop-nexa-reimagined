import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Clock, ChevronLeft, Tag, ChevronRight, ArrowLeft } from "lucide-react";
import { PublicInfoLayout, InfoCard } from "@/components/common/PublicInfoLayout";
import { BLOG_ARTICLES } from "@/data/blog";

export const Route = createFileRoute("/blog/$slug")({
  ssr: false,
  component: BlogArticlePage,
  head: () => ({ meta: [{ title: "Article — Aventa Shop Blog" }] }),
});

function BlogArticlePage() {
  const { slug } = Route.useParams() as { slug: string };
  const article = BLOG_ARTICLES.find((a) => a.slug === slug);
  const related = BLOG_ARTICLES.filter((a) => a.slug !== slug).slice(0, 2);

  if (!article) {
    return (
      <PublicInfoLayout title="Article Not Found" subtitle="Aventa Shop Blog">
        <InfoCard className="text-center">
          <p className="text-sm text-slate-500">Sorry, we couldn't find that article.</p>
          <Link
            to="/blog"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-orange-500"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Blog
          </Link>
        </InfoCard>
      </PublicInfoLayout>
    );
  }

  return (
    <PublicInfoLayout
      title={article.title}
      subtitle={`${article.category} • ${article.readMinutes} min read`}
    >
      <InfoCard className="mb-4">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 font-semibold text-orange-500">
            <Tag className="h-3.5 w-3.5" />
            {article.category}
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {article.date}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {article.readMinutes} min
          </span>
        </div>
        <article className="space-y-4">
          {article.body.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-slate-600">
              {p}
            </p>
          ))}
        </article>
        <div className="mt-6 border-t border-slate-100 pt-4">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1 text-sm font-semibold text-orange-500 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" /> Back to all articles
          </Link>
        </div>
      </InfoCard>

      {related.length > 0 && (
        <InfoCard>
          <h2 className="mb-3 text-sm font-bold text-slate-900">More From the Blog</h2>
          <div className="divide-y divide-slate-100">
            {related.map((a) => (
              <Link
                key={a.slug}
                to="/blog/$slug"
                params={{ slug: a.slug }}
                className="flex items-center gap-3 py-3 transition hover:text-orange-600"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                  {a.title}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </Link>
            ))}
          </div>
        </InfoCard>
      )}
    </PublicInfoLayout>
  );
}
