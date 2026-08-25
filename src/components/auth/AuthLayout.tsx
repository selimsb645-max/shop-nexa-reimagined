import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">
              <span className="text-primary">AVENTA</span>
              <span className="text-accent">SHOP</span>
            </span>
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-xl border bg-background p-8 shadow-sm">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
