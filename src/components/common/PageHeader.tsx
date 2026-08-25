import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useBackNavigation } from "@/components/common/BackButton";

/**
 * Mobile-friendly page header with back button.
 * Uses browser history first, falls back to the provided route.
 * Replaces AppShell sidebar for customer sub-pages.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  backTo = "/account",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backTo?: string;
}) {
  const goBack = useBackNavigation(backTo);

  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={goBack}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-gray-900 sm:text-lg">{title}</h1>
          {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
