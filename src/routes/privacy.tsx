import { createFileRoute } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ShieldCheck } from "lucide-react";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  ssr: true,
  component: PrivacyPolicyPage,
  head: () => ({
    ...seoHead({
      title: "Privacy Policy — AVENTA SHOP Data Protection",
      description:
        "Read AVENTA SHOP's Privacy Policy — how we collect, use, store, and protect your personal data. Your privacy and security are our top priorities.",
      path: "/privacy",
      type: "website",
    }),
  }),
});

const SECTIONS = [
  {
    title: "Information We Collect",
    content:
      "We collect information you provide when you create an account, place an order, or contact our support team. This includes your name, email, phone number, delivery address, and payment information. We also collect usage data such as browsing history and device information to improve your shopping experience.",
  },
  {
    title: "How We Use Your Information",
    content:
      "Your information is used to process orders, deliver products, communicate with you about your orders, provide customer support, send promotional offers (if you opt in), improve our services, and prevent fraud. We do not sell your personal information to third parties.",
  },
  {
    title: "Data Security",
    content:
      "We use industry-standard security measures to protect your personal information, including encrypted connections (SSL/TLS), secure payment processing, and restricted access to sensitive data. Your payment information is never stored on our servers — it is handled by certified payment processors.",
  },
  {
    title: "Cookies & Tracking",
    content:
      "We use cookies and similar technologies to remember your preferences, keep items in your cart, analyze traffic, and improve our services. You can control cookies through your browser settings, but disabling them may affect your shopping experience.",
  },
  {
    title: "Sharing with Third Parties",
    content:
      "We share your information only with trusted partners who help us operate our marketplace — such as delivery partners, payment processors, and cloud service providers. These partners are bound by strict confidentiality agreements and may only use your data to provide services on our behalf.",
  },
  {
    title: "Your Rights",
    content:
      "You have the right to access, update, or delete your personal information at any time through your account settings. You can also opt out of marketing communications by updating your preferences. To exercise your data rights, contact our support team.",
  },
  {
    title: "Children's Privacy",
    content:
      "AVENTA SHOP is not intended for children under 13 years of age. We do not knowingly collect personal information from children. If you believe a child has provided us with personal data, please contact us and we will take steps to delete it.",
  },
  {
    title: "Changes to This Policy",
    content:
      "We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice on our website or sending an email. The effective date below indicates when the policy was last updated.",
  },
];

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Last updated: August 2026. Your privacy is important to us. This policy explains how
          AVENTA SHOP collects, uses, and protects your personal information.
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

        <div className="mt-8 rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground">
          If you have any questions about this Privacy Policy, please contact us through our Help
          Center.
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
