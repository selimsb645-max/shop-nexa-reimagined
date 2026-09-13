import { createFileRoute } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FileText } from "lucide-react";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  ssr: true,
  component: TermsPage,
  head: () => ({
    ...seoHead({
      title: "Terms & Conditions — AVENTA SHOP Marketplace Rules",
      description:
        "Read AVENTA SHOP's Terms & Conditions — the rules and guidelines for using our online marketplace, buying products, and selling as a vendor.",
      path: "/terms",
      type: "website",
    }),
  }),
});

const SECTIONS = [
  {
    title: "Acceptance of Terms",
    content:
      "By accessing or using AVENTA SHOP, you agree to be bound by these Terms & Conditions. If you do not agree with any part of these terms, please do not use our services.",
  },
  {
    title: "Account Registration",
    content:
      "To place orders or sell products, you must create an account with accurate and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. You must be at least 18 years old to register.",
  },
  {
    title: "Orders & Payments",
    content:
      "When you place an order, you agree to pay the listed price including any applicable taxes and delivery charges. We accept Cash on Delivery, credit/debit cards, and mobile banking. We reserve the right to cancel or refuse any order at our discretion.",
  },
  {
    title: "Delivery",
    content:
      "We strive to deliver products within the estimated timeframe. Delivery times may vary based on location and product availability. Free shipping is available for orders above ৳500. We are not liable for delays caused by circumstances beyond our control.",
  },
  {
    title: "Returns & Refunds",
    content:
      "You may request a return within 7 days of delivery for eligible products. Items must be in original condition with tags and packaging intact. Refunds are processed to your original payment method or AVENTA SHOP wallet within 7-10 business days.",
  },
  {
    title: "Seller Obligations",
    content:
      "Sellers must provide accurate product descriptions, fair pricing, and genuine products. Sellers are responsible for fulfilling orders on time and maintaining adequate stock. AVENTA SHOP reserves the right to suspend or terminate seller accounts that violate our policies.",
  },
  {
    title: "Prohibited Activities",
    content:
      "Users must not list counterfeit or illegal products, manipulate reviews or ratings, misuse the platform for fraudulent activities, or violate intellectual property rights. Violations may result in account suspension and legal action.",
  },
  {
    title: "Limitation of Liability",
    content:
      "AVENTA SHOP is a marketplace platform that connects buyers and sellers. We are not liable for the quality, safety, or legality of products listed by sellers. Our liability is limited to the value of the transaction in dispute.",
  },
  {
    title: "Intellectual Property",
    content:
      "All content on AVENTA SHOP — including logos, designs, text, and graphics — is owned by AVENTA SHOP and protected by intellectual property laws. You may not use, copy, or distribute our content without prior written consent.",
  },
  {
    title: "Changes to Terms",
    content:
      "We may update these Terms & Conditions at any time. Continued use of AVENTA SHOP after changes constitutes acceptance of the updated terms. The effective date below indicates when the terms were last updated.",
  },
];

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>
        <div className="mb-6 flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Terms & Conditions</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Last updated: August 2026. Please read these terms carefully before using AVENTA SHOP.
        </p>

        <div className="space-y-6">
          {SECTIONS.map((section, i) => (
            <div key={i}>
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                {i + 1}. {section.title}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{section.content}</p>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
