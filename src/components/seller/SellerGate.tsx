import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, Clock, Lock, ShieldAlert } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { SellerShell } from "./SellerShell";
import { useSellerProfile } from "@/hooks/useSellerProfile";

interface Props {
  children: (profile: NonNullable<ReturnType<typeof useSellerProfile>["profile"]>) => ReactNode;
}

export function SellerGate({ children }: Props) {
  const { profile, loading, error } = useSellerProfile();

  if (loading) {
    return (
      <SellerShell>
        <div className="flex items-center gap-2 rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Spinner /> Loading seller workspace...
        </div>
      </SellerShell>
    );
  }

  if (error) {
    return (
      <SellerShell>
        <div className="rounded-lg border bg-background p-8 text-sm text-destructive">{error}</div>
      </SellerShell>
    );
  }

  if (!profile) {
    return (
      <SellerShell>
        <EmptyState
          icon={<Lock className="h-7 w-7" />}
          title="Become a seller on ShopNexa"
          body="Register your shop to start listing products, managing inventory, and receiving orders."
          action={
            <Link
              to="/seller/register"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Register as seller
            </Link>
          }
        />
      </SellerShell>
    );
  }

  if (profile.status === "pending") {
    return (
      <SellerShell shopName={profile.shopName}>
        <EmptyState
          icon={<Clock className="h-7 w-7" />}
          title="Your application is under review"
          body="Our team is reviewing your seller application. You'll be notified as soon as your shop is approved."
        />
      </SellerShell>
    );
  }

  if (profile.status === "rejected") {
    return (
      <SellerShell shopName={profile.shopName}>
        <EmptyState
          icon={<ShieldAlert className="h-7 w-7" />}
          title="Application not approved"
          body={
            profile.rejectionReason ||
            "Unfortunately your seller application wasn't approved. Please contact support for more information."
          }
        />
      </SellerShell>
    );
  }

  if (profile.status === "suspended") {
    return (
      <SellerShell shopName={profile.shopName}>
        <EmptyState
          icon={<Ban className="h-7 w-7" />}
          title="Your seller account is suspended"
          body="Please contact ShopNexa support to resolve this."
        />
      </SellerShell>
    );
  }

  return <SellerShell shopName={profile.shopName}>{children(profile)}</SellerShell>;
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
