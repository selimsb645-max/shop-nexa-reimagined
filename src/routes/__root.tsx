import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { CartProvider } from "../context/CartContext";
import { WishlistProvider } from "../context/WishlistContext";
import { I18nProvider } from "../i18n/I18nContext";
import { MobileBottomNav } from "../components/layout/MobileBottomNav";
import { PushNotificationProvider } from "../context/PushNotificationContext";
import { PWAInstallPrompt } from "../components/layout/PWAInstallPrompt";
import { SupportChatWidget } from "../components/support/SupportChatWidget";
import { SellerModeGuard } from "../components/seller/SellerModeGuard";
import {
  buildMetaTags,
  organizationJsonLd,
  websiteJsonLd,
  jsonLdScript,
  getSiteUrl,
} from "../lib/seo";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico?v=2", type: "image/x-icon" },
      { rel: "icon", href: "/favicon.svg?v=2", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=2" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "canonical", href: getSiteUrl() + "/" },
    ],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=5" },
      { name: "theme-color", content: "#f57224" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "AVENTA SHOP" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "application-name", content: "AVENTA SHOP" },
      { title: "AVENTA SHOP - Shop Smarter. Live Better." },
      {
        name: "description",
        content:
          "AVENTA SHOP is your one-stop online shop for electronics, fashion, grocery, beauty and more. Top quality products at unbeatable prices with free delivery over $50.",
      },
      { name: "author", content: "AVENTA SHOP" },
      { name: "robots", content: "index, follow" },
      // Canonical
      // Open Graph
      { property: "og:title", content: "AVENTA SHOP - Shop Smarter. Live Better." },
      {
        property: "og:description",
        content:
          "Everything you need in one place. Top quality products at unbeatable prices with free delivery over $50.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: getSiteUrl() + "/" },
      { property: "og:image", content: getSiteUrl() + "/brand/aventa-shop-logo.png" },
      { property: "og:site_name", content: "AVENTA SHOP" },
      { property: "og:locale", content: "en_US" },
      // Twitter Card
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@AventaShop" },
      { name: "twitter:title", content: "AVENTA SHOP - Shop Smarter. Live Better." },
      {
        name: "twitter:description",
        content: "Everything you need in one place. Top quality products at unbeatable prices.",
      },
      { name: "twitter:image", content: getSiteUrl() + "/brand/aventa-shop-logo.png" },
    ],
    scripts: [
      { type: "application/ld+json", children: jsonLdScript(organizationJsonLd()) },
      { type: "application/ld+json", children: jsonLdScript(websiteJsonLd()) },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PushNotificationProvider>
          <I18nBridge>
            <CartProvider>
              <WishlistProvider>
                <SellerModeGuard />
                {/* Required: nested routes render here. */}
                <div className="animate-fade-in pb-24 md:pb-0">
                  <Outlet />
                </div>
                <MobileBottomNav />
                <PWAInstallPrompt />
                <SupportChatWidget />
                <Toaster position="top-right" richColors />
              </WishlistProvider>
            </CartProvider>
          </I18nBridge>
        </PushNotificationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Bridge: reads the current user from AuthContext and passes uid to I18nProvider */
function I18nBridge({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <I18nProvider uid={user?.uid}>{children}</I18nProvider>;
}
