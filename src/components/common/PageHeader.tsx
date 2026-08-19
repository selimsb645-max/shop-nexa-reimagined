import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Mobile-friendly page header with back button.
 * Replaces AppShell sidebar for customer sub-pages.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link
          to="/account"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200 active:scale-95"
          aria-label="Back to Account"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-gray-900 sm:text-lg">{title}</h1>
          {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
