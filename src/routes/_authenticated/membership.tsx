import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star, Crown, Gift, Sparkles, Check } from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { firebaseConfigured } from "@/services/firebase/config";
import { getRewardPoints } from "@/services/firebase/wallet";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";

export const Route = createFileRoute("/_authenticated/membership")({
  ssr: false,
  component: MembershipPage,
  head: () => ({ meta: [{ title: "Aventa Prime Membership — Aventa Shop" }] }),
});

const TIERS = [
  {
    name: "Silver",
    icon: <Star className="h-6 w-6" />,
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    minPoints: 0,
    benefits: ["1x reward points", "Standard shipping", "Basic support"],
  },
  {
    name: "Gold",
    icon: <Crown className="h-6 w-6" />,
    color: "text-orange-500",
    bgColor: "bg-orange-100",
    minPoints: 1000,
    benefits: [
      "2x reward points",
      "Free shipping over ৳500",
      "Priority support",
      "Early access to sales",
    ],
  },
  {
    name: "Platinum",
    icon: <Sparkles className="h-6 w-6" />,
    color: "text-purple-500",
    bgColor: "bg-purple-100",
    minPoints: 5000,
    benefits: [
      "3x reward points",
      "Free shipping always",
      "VIP support line",
      "Exclusive deals",
      "Birthday gifts",
    ],
  },
];

function MembershipPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: points } = useQuery({
    queryKey: ["rewards", "points", user?.uid],
    queryFn: () => getRewardPoints(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  const currentPoints = points ?? 0;
  const currentTier = [...TIERS].reverse().find((t) => currentPoints >= t.minPoints) ?? TIERS[0];
  const nextTier = TIERS.find((t) => t.minPoints > currentPoints);

  return (
    <ServicePageLayout title={t("membership.title")} subtitle={t("membership.subtitle")}>
      {/* Current status */}
      <div className="mb-6 rounded-2xl border bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-80">{t("membership.currentTier")}</p>
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              {currentTier.icon}
              {currentTier.name} Member
            </h2>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-80">{t("rewards.points")}</p>
            <p className="text-2xl font-bold">{currentPoints}</p>
          </div>
        </div>
        {nextTier && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs opacity-80">
              <span>Progress to {nextTier.name}</span>
              <span>
                {currentPoints} / {nextTier.minPoints}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${Math.min((currentPoints / nextTier.minPoints) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tier cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {TIERS.map((tier) => {
          const isCurrent = tier.name === currentTier.name;
          const isUnlocked = currentPoints >= tier.minPoints;
          return (
            <div
              key={tier.name}
              className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm transition ${
                isCurrent ? "border-primary bg-primary/5" : "bg-background"
              }`}
            >
              {isCurrent && (
                <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">
                  CURRENT
                </span>
              )}
              <div
                className={`mb-3 grid h-12 w-12 place-items-center rounded-xl ${tier.bgColor} ${tier.color}`}
              >
                {tier.icon}
              </div>
              <h3 className="text-lg font-bold">{tier.name}</h3>
              <p className="text-xs text-muted-foreground">
                {tier.minPoints === 0 ? "Free" : `${tier.minPoints} points required`}
              </p>
              <div className="mt-3 space-y-1.5">
                {tier.benefits.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check
                      className={`h-4 w-4 ${isUnlocked ? "text-green-500" : "text-muted-foreground/40"}`}
                    />
                    <span className={isUnlocked ? "" : "text-muted-foreground/60"}>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Member benefits */}
      <div className="mt-6 rounded-2xl border bg-background p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Gift className="h-5 w-5 text-primary" />
          Member Benefits
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            "Earn points on every purchase",
            "Exclusive member-only deals",
            "Free shipping on qualifying orders",
            "Early access to flash sales",
            "Birthday special offers",
            "Priority customer support",
          ].map((benefit, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm"
            >
              <Check className="h-4 w-4 text-green-500" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>
      </div>
    </ServicePageLayout>
  );
}
