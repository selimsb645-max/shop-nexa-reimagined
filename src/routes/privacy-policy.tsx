import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Mail } from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";
import { SITE } from "@/config/site";

export const Route = createFileRoute("/privacy-policy")({
  ssr: false,
  component: PrivacyPolicyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Aventa Shop" },
      {
        name: "description",
        content: "How Aventa Shop collects, uses and protects your information.",
      },
    ],
  }),
});

const LAST_UPDATED = "4 September 2026";

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "1. Introduction",
    points: [
      "This Privacy Policy explains how Aventa Shop collects, uses and protects your information when you use our marketplace.",
      "We collect only the information needed to run the Platform and serve you well.",
    ],
  },
  {
    title: "2. Information We Collect",
    points: [
      "Account details you provide when registering (name, email, phone number).",
      "Order information (delivery address, ordered products, order history).",
      "Technical information such as device type and basic usage data needed to keep the Platform secure and functional.",
    ],
  },
  {
    title: "3. Account Information",
    points: [
      "Your account information is used to identify you, keep your orders and wallet secure, and personalise your experience.",
    ],
  },
  {
    title: "4. Order Information",
    points: [
      "Order details are shared with the relevant seller and delivery personnel strictly to fulfil your order.",
      "Your full contact details are never displayed publicly on the Platform.",
    ],
  },
  {
    title: "5. Payment Information",
    points: [
      "Payments are collected centrally by the Platform. We record the payment method used and transaction status for each order.",
      "We do not store your card numbers or mobile banking PINs.",
    ],
  },
  {
    title: "6. Device & Technical Information",
    points: [
      "We use standard technical measures such as session records to keep your account secure and detect fraud.",
    ],
  },
  {
    title: "7. Cookies",
    points: [
      "We use cookies and similar technologies to keep you signed in, remember your cart and preferences, and understand how the Platform is used.",
      "You can control cookies through your browser settings, though some features may stop working without them.",
    ],
  },
  {
    title: "8. How We Use Information",
    points: [
      "To process orders, payments, deliveries, returns and refunds.",
      "To provide customer support and resolve disputes.",
      "To send service notifications such as order updates (and, if you opt in, promotional updates you can turn off anytime).",
      "To improve the Platform and prevent fraud and abuse.",
    ],
  },
  {
    title: "9. Data Sharing",
    points: [
      "We do not sell your personal data. We share information only with the parties needed to run the marketplace — sellers fulfilling your orders, delivery partners, and service providers — and only as required by law.",
    ],
  },
  {
    title: "10. Seller / Marketplace Data",
    points: [
      "Sellers' business information is used to verify them and operate the marketplace. Sellers must handle customer data received through orders with the same care described in this policy.",
    ],
  },
  {
    title: "11. Security",
    points: [
      "We apply reasonable technical and organisational measures to protect your information against unauthorised access, loss or misuse.",
      "No system is perfectly secure, but we treat the security of your data as a core responsibility.",
    ],
  },
  {
    title: "12. Data Retention",
    points: [
      "We keep your account and order records for as long as your account is active, and afterwards as needed for legal, accounting and dispute-resolution purposes.",
    ],
  },
  {
    title: "13. User Rights",
    points: [
      "You may access and update your profile information from your account settings.",
      "You may request correction or deletion of your data by contacting support, subject to our record-keeping obligations.",
    ],
  },
  {
    title: "14. Children's Privacy",
    points: [
      "The Platform is not directed at children under 13, and we do not knowingly collect their personal information.",
    ],
  },
  {
    title: "15. Third-Party Services",
    points: [
      "The Platform uses third-party services (such as analytics and infrastructure providers) that process data on our behalf under their own security standards.",
    ],
  },
  {
    title: "16. Changes to This Policy",
    points: [
      "We may update this policy as the Platform evolves. The 'Last Updated' date will change, and significant updates will be highlighted on the Platform.",
    ],
  },
  {
    title: "17. Contact Us",
    points: [`Privacy questions can be sent to ${SITE.supportEmail}.`],
  },
];

function PrivacyPolicyPage() {
  return (
    <PublicInfoLayout title="Privacy Policy" subtitle="How we handle your data">
      <InfoCard className="mb-4">
        <p className="text-xs font-semibold text-slate-400">Last Updated: {LAST_UPDATED}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Your privacy matters. This policy explains what information Aventa Shop collects, why we
          collect it, and the choices you have.
        </p>
      </InfoCard>

      {SECTIONS.map((s) => (
        <InfoCard key={s.title} className="mb-3">
          <InfoHeading icon={<ShieldCheck className="h-5 w-5 shrink-0 text-orange-500" />}>
            {s.title}
          </InfoHeading>
          {s.points.map((p, i) => (
            <p key={i} className="mb-2 text-sm leading-relaxed text-slate-600 last:mb-0">
              {p}
            </p>
          ))}
        </InfoCard>
      ))}

      <Link
        to="/contact-us"
        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
      >
        <Mail className="h-5 w-5" /> Privacy Questions?
      </Link>
    </PublicInfoLayout>
  );
}
