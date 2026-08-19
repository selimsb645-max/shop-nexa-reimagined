import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, TicketPercent, Loader, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
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
    <ServicePageLayout title="My Vouchers" subtitle="Active coupons and discounts">
      {isLoading ? (
        <div className="py-20 text-center">
          <Loader className="mx-auto h-8 w-8 animate-spin text-slate-300" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-orange-50 text-[#f57224]">
            <TicketPercent className="h-7 w-7" />
          </span>
          <h3 className="mt-4 text-base font-bold text-slate-800">No vouchers available</h3>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            Check back soon — new offers are added regularly.
          </p>
          <Link
            to="/shop"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#f57224] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95"
          >
            <ShoppingBag className="h-4 w-4" /> Start Shopping
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((c) => (
            <div
              key={c.code}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              {/* Discount header */}
              <div className="bg-gradient-to-br from-orange-50 to-white px-5 py-4">
                <div className="text-2xl font-black text-[#f57224]">
                  {c.type === "percent" ? `${c.value}% OFF` : `${formatPrice(c.value)} OFF`}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {c.minSubtotal > 0
                    ? `On orders above ${formatPrice(c.minSubtotal)}`
                    : "No minimum spend"}
                </div>
                <div className="text-xs text-slate-400">
                  {c.expiresAt ? `Valid until ${formatDate(c.expiresAt)}` : "No expiry"}
                </div>
              </div>
              {/* Code + actions */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-lg border border-dashed border-orange-200 bg-orange-50/50 px-3 py-2 text-sm font-bold tracking-wider text-[#f57224]">
                    {c.code}
                  </span>
                  <button
                    onClick={() => void copy(c.code)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                </div>
                <Link
                  to="/checkout"
                  search={{ code: c.code }}
                  className="mt-3 block rounded-xl bg-[#f57224] py-2.5 text-center text-sm font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-95"
                >
                  Use at checkout
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </ServicePageLayout>
  );
}
