import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Gift,
  Plus,
  Loader,
  Mail,
  DollarSign,
  Sparkles,
  Clock,
} from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { listUserGiftCards, purchaseGiftCard } from "@/services/firebase/giftCards";
import { firebaseConfigured } from "@/services/firebase/config";
import { formatPrice } from "@/utils/format";

export const Route = createFileRoute("/_authenticated/gift-cards")({
  ssr: false,
  component: GiftCardsPage,
  head: () => ({ meta: [{ title: "Gift Cards — ShopNexa" }] }),
});

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000];

function GiftCardsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");

  const { data: giftCards, isLoading } = useQuery({
    queryKey: ["giftCards", user?.uid],
    queryFn: () => listUserGiftCards(user!.uid),
    enabled: !!user && firebaseConfigured,
  });

  const purchaseMutation = useMutation({
    mutationFn: () =>
      purchaseGiftCard(user!.uid, {
        amount,
        senderName: user!.displayName || user!.email || "Shopper",
        senderEmail: user!.email ?? "",
        recipientName,
        recipientEmail,
        message,
        theme: "classic",
      }),
    onSuccess: () => {
      toast.success("Gift card purchased successfully!");
      queryClient.invalidateQueries({ queryKey: ["giftCards"] });
      setShowForm(false);
      setRecipientName("");
      setRecipientEmail("");
      setMessage("");
      setAmount(1000);
    },
    onError: () => toast.error("Failed to purchase gift card"),
  });

  return (
    <ServicePageLayout title={t("giftCards.title")} subtitle={t("giftCards.subtitle")}>

        {/* {t("giftCards.buy")} Button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-5 w-5" /> Buy Gift Card
          </button>
        )}

        {/* Purchase Form */}
        {showForm && (
          <div className="mb-6 rounded-2xl border bg-background p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Purchase Gift Card</h2>
            <div className="space-y-4">
              {/* Amount Selection */}
              <div>
                <label className="mb-2 block text-sm font-medium">Select Amount</label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {PRESET_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setAmount(amt)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        amount === amt
                          ? "border-primary bg-primary/5 text-primary"
                          : "hover:border-primary/40"
                      }`}
                    >
                      {formatPrice(amt)}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="Custom amount"
                    min={100}
                  />
                </div>
              </div>

              {/* Recipient */}
              <div>
                <label className="mb-1 block text-sm font-medium">Recipient Name</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="Friend's name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Recipient Email</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="friend@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Message (Optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="Add a personal message..."
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => purchaseMutation.mutate()}
                  disabled={purchaseMutation.isPending || !recipientName || !recipientEmail}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {purchaseMutation.isPending ? (
                    <><Loader className="h-4 w-4" /> Processing...</>
                  ) : (
                    <><DollarSign className="h-4 w-4" /> Buy for {formatPrice(amount)}</>
                  )}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Gift Cards List */}
        {isLoading ? (
          <div className="py-20 text-center">
            <Loader className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !giftCards || giftCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/30 py-20 text-center">
            <Gift className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold">{t("giftCards.empty")} yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Purchase a gift card for friends and family
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {giftCards.map((card) => (
              <div
                key={card.id}
                className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground shadow-sm"
              >
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10" />
                <div className="absolute -bottom-8 -left-8 h-20 w-20 rounded-full bg-white/10" />
                <div className="relative z-10">
                  <div className="mb-4 flex items-center justify-between">
                    <Sparkles className="h-6 w-6" />
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      card.status === "active" ? "bg-green-400/30" : "bg-red-400/30"
                    }`}>
                      {card.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-2xl font-bold">{formatPrice(card.balance)}</p>
                  <p className="text-xs opacity-80">Balance: {formatPrice(card.balance)} / {formatPrice(card.amount)}</p>
                  <div className="mt-3 space-y-1">
                    <p className="text-xs opacity-80">
                      <Mail className="mr-1 inline h-3 w-3" />
                      To: {card.recipientName}
                    </p>
                    <p className="font-mono text-sm tracking-wider">{card.code}</p>
                    <p className="text-xs opacity-60">
                      <Clock className="mr-1 inline h-3 w-3" />
                      Expires: {new Date(card.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </ServicePageLayout>
  );
}
