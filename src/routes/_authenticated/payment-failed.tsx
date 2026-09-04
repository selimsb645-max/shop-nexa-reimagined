import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle, ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/payment-failed")({
  ssr: false,
  component: PaymentFailedPage,
  head: () => ({ meta: [{ title: "Payment Failed — Aventa Shop" }] }),
});

function PaymentFailedPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 grid h-20 w-20 place-items-center rounded-full bg-red-100">
            <XCircle className="h-12 w-12 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold">{t("paymentFailed.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn't process your payment. Please try again or use a different payment method.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/checkout"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <ArrowLeft className="h-4 w-4" /> Try Again
          </Link>
          <Link
            to="/support"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-medium transition hover:bg-muted"
          >
            Contact Support
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
