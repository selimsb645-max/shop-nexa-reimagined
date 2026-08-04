import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CreditCard, Truck, Wallet, ShoppingBag } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/common/Spinner";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { computeShipping, createOrder } from "@/services/firebase/orders";
import { validateCoupon, CouponError } from "@/services/firebase/coupons";
import { formatPrice } from "@/utils/format";
import type { PaymentMethod, Coupon } from "@/types/commerce";

export const Route = createFileRoute("/_authenticated/checkout")({
  component: CheckoutPage,
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({
    code: typeof s.code === "string" ? s.code : undefined,
  }),
});

const addressSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  phone: z.string().trim().min(6, "Enter a valid phone").max(20),
  addressLine: z.string().trim().min(4, "Enter your address").max(200),
  city: z.string().trim().min(2, "Enter your city").max(60),
  postalCode: z.string().trim().min(2, "Enter a postal code").max(20),
  country: z.string().trim().min(2, "Enter your country").max(60),
  notes: z.string().max(500).optional(),
  paymentMethod: z.enum(["cash_on_delivery", "card", "mobile_banking"]),
});
type CheckoutValues = z.infer<typeof addressSchema>;

function CheckoutPage() {
  const { user, profile } = useAuth();
  const { items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [applied, setApplied] = useState<{ coupon: Coupon; discount: number } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    if (search.code && items.length > 0 && !applied) {
      setCouponBusy(true);
      validateCoupon(search.code, subtotal)
        .then(setApplied)
        .catch(() => {
          /* silently ignore */
        })
        .finally(() => setCouponBusy(false));
    }
  }, [search.code, items.length, subtotal, applied]);

  const discount = applied?.discount ?? 0;
  const shipping = items.length ? computeShipping(subtotal - discount) : 0;
  const total = Math.max(0, subtotal - discount + shipping);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      fullName: profile?.displayName ?? user?.displayName ?? "",
      phone: "",
      addressLine: "",
      city: "",
      postalCode: "",
      country: "Bangladesh",
      notes: "",
      paymentMethod: "cash_on_delivery",
    },
  });

  const submit = async (v: CheckoutValues) => {
    if (!user) return;
    if (!items.length) {
      toast.error("Your cart is empty");
      return;
    }
    try {
      const orderId = await createOrder({
        userId: user.uid,
        buyerEmail: user.email ?? null,
        items,

        shippingAddress: {
          fullName: v.fullName,
          phone: v.phone,
          addressLine: v.addressLine,
          city: v.city,
          postalCode: v.postalCode,
          country: v.country,
          notes: v.notes,
        },
        paymentMethod: v.paymentMethod as PaymentMethod,
        couponCode: applied?.coupon.code ?? null,
        discount,
      });
      await clear();
      toast.success("Order placed successfully");
      navigate({ to: "/order/$orderId", params: { orderId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not place order");
    }
  };

  if (items.length === 0) {
    return (
      <AppShell>
        <div className="rounded-lg border bg-background p-16 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Your cart is empty</h2>
          <Link to="/shop" className="mt-4 inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">
            Browse Products
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-bold">Checkout</h1>
      <form onSubmit={handleSubmit(submit)} className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-lg border bg-background p-5">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Truck className="h-5 w-5" /> Shipping Address
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full Name" error={errors.fullName?.message}>
                <input {...register("fullName")} className="input" />
              </Field>
              <Field label="Phone" error={errors.phone?.message}>
                <input {...register("phone")} className="input" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address" error={errors.addressLine?.message}>
                  <input {...register("addressLine")} className="input" />
                </Field>
              </div>
              <Field label="City" error={errors.city?.message}>
                <input {...register("city")} className="input" />
              </Field>
              <Field label="Postal Code" error={errors.postalCode?.message}>
                <input {...register("postalCode")} className="input" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Country" error={errors.country?.message}>
                  <input {...register("country")} className="input" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Order Notes (optional)" error={errors.notes?.message}>
                  <textarea {...register("notes")} rows={2} className="input" />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-background p-5">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <CreditCard className="h-5 w-5" /> Payment Method
            </h2>
            <div className="space-y-2">
              <PayOption {...register("paymentMethod")} value="cash_on_delivery" label="Cash on Delivery" desc="Pay when you receive your order" icon={<Wallet className="h-5 w-5" />} />
              <PayOption {...register("paymentMethod")} value="card" label="Credit / Debit Card" desc="Secure payment via card" icon={<CreditCard className="h-5 w-5" />} />
              <PayOption {...register("paymentMethod")} value="mobile_banking" label="Mobile Banking" desc="bKash, Nagad, Rocket" icon={<Wallet className="h-5 w-5" />} />
            </div>
          </section>
        </div>

        <aside className="h-fit rounded-lg border bg-background p-5">
          <h2 className="mb-4 text-lg font-semibold">Order Summary</h2>
          <div className="space-y-3 border-b pb-4">
            {items.map((i) => (
              <div key={i.productId} className="flex gap-3 text-sm">
                <img src={i.image} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                <div className="flex-1">
                  <div className="line-clamp-1 font-medium">{i.title}</div>
                  <div className="text-xs text-muted-foreground">Qty: {i.quantity}</div>
                </div>
                <div className="font-semibold">{formatPrice(i.price * i.quantity)}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-b py-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {applied && (
              <div className="flex justify-between text-green-600">
                <span>Coupon ({applied.coupon.code})</span>
                <span>-{formatPrice(discount)}</span>
              </div>
            )}
            {couponBusy && <div className="text-xs text-muted-foreground">Validating coupon…</div>}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
            </div>
          </div>
          <div className="flex justify-between pt-4 text-base font-semibold">
            <span>Total</span>
            <span className="text-primary">{formatPrice(total)}</span>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-accent py-3 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting && <Spinner />} Place Order
          </button>
        </aside>
      </form>
      <style>{`.input{width:100%;border:1px solid hsl(var(--border));border-radius:0.375rem;padding:0.5rem 0.75rem;font-size:.875rem;outline:none}.input:focus{border-color:hsl(var(--primary))}`}</style>
    </AppShell>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

const PayOption = React.forwardRef<
  HTMLInputElement,
  { value: string; label: string; desc: string; icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>
>(function PayOption({ value, label, desc, icon, ...rest }, ref) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
      <input ref={ref} type="radio" value={value} {...rest} className="accent-primary" />
      <div className="text-primary">{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
});

import React from "react";
