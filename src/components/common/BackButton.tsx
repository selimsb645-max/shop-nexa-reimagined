import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/**
 * Hook that navigates back using browser history when available,
 * falling back to the provided fallback route when there's no
 * history to go back to (e.g. user landed directly on the page).
 */
export function useBackNavigation(fallbackTo: string) {
  const navigate = useNavigate();

  return useCallback(() => {
    // If there's browser history, go back
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // No history — navigate to the fallback route
      navigate({ to: fallbackTo });
    }
  }, [fallbackTo, navigate]);
}

/**
 * Reusable BackButton component.
 * Uses browser history first, falls back to fallbackTo when no history exists.
 */
export function BackButton({
  fallbackTo = "/",
  label = "Back",
  className,
}: {
  fallbackTo?: string;
  label?: string;
  className?: string;
}) {
  const goBack = useBackNavigation(fallbackTo);

  return (
    <button
      type="button"
      onClick={goBack}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 active:scale-95"
      }
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={2} />
      {label}
    </button>
  );
}
