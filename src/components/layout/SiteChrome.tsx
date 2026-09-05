import type { ReactNode } from "react";

/**
 * SiteChrome — minimal page wrapper.
 * The floating WhatsApp button has been removed per global support cleanup.
 * If you need a floating action, use BackButton or a custom FAB.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
