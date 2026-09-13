import { createFileRoute } from "@tanstack/react-router";
import { SellerGate } from "@/components/seller/SellerGate";
import { SellerMessagesPage } from "@/components/seller/SellerMessagesPage";

export const Route = createFileRoute("/_authenticated/seller/messages")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <SellerMessagesPage profile={profile} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Messages — AVENTA SHOP Seller" }] }),
});
