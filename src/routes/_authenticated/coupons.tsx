import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, TicketPercent } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Spinner } from "@/components/common/Spinner";
import { listAvailableCoupons } from "@/services/firebase/customerCoupons";
import { formatDate, formatPrice } from "@/utils/format";

export const Route = createFileRoute("/_authenticated/coupons")({
  component: CouponsPage,
});

function CouponsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["availableCoupons"],
    queryFn: listAvailableCoupons,
  });

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`${code} copied`);
    } catch {
      toast.error("Could not copy the code");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-6">
      <PageHeader title="Vouchers" subtitle="Available coupons and discounts" />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Coupons</h1>
          <p className="text-sm text-muted-foreground">Active vouchers you can use at checkout</p>
        </div>

        {isLoading ? (
          <div className="py-16 text-center">
            <Spinner />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border bg-background p-16 text-center">
            <TicketPercent className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No coupons available</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check back soon — new offers are added regularly.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.map((c) => (
              <div key={c.code} className="rounded-lg border bg-background p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {c.type === "percent" ? `${c.value}% OFF` : `${formatPrice(c.value)} OFF`}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {c.minSubtotal > 0
                        ? `On orders above ${formatPrice(c.minSubtotal)}`
                        : "No minimum spend"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.expiresAt ? `Valid until ${formatDate(c.expiresAt)}` : "No expiry"}
                    </div>
                  </div>
                  <span className="rounded-md border border-dashed px-3 py-1.5 text-sm font-bold tracking-wider">
                    {c.code}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => void copy(c.code)}
                    className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy code
                  </button>
                  <Link
                    to="/checkout"
                    search={{ code: c.code }}
                    className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    Use at checkout
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
