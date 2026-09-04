import { createFileRoute, Link } from "@tanstack/react-router";
import { Scale, Mail } from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";
import { SITE } from "@/config/site";

export const Route = createFileRoute("/terms")({
  ssr: false,
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Aventa Shop" },
      {
        name: "description",
        content: "The terms and conditions governing use of the Aventa Shop marketplace.",
      },
    ],
  }),
});

const LAST_UPDATED = "4 September 2026";

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "1. Introduction",
    points: [
      "These Terms & Conditions govern your use of Aventa Shop — an online marketplace operated in Bangladesh that connects customers with independent sellers.",
      "By creating an account, browsing, placing an order, or selling on Aventa Shop, you agree to these terms.",
    ],
  },
  {
    title: "2. Definitions",
    points: [
      "'Platform' means the Aventa Shop website and services. 'Seller' means a business or individual listing products on the Platform. 'Customer' means a user who purchases products through the Platform. 'Order' means a confirmed request to purchase products.",
    ],
  },
  {
    title: "3. Account Registration",
    points: [
      "You must provide accurate and complete information when registering.",
      "You are responsible for keeping your account credentials confidential and for all activity under your account.",
      "You must be at least 18 years old, or use the Platform under the supervision of a parent or guardian.",
    ],
  },
  {
    title: "4. Marketplace Usage",
    points: [
      "Aventa Shop is a marketplace. Products are listed and sold by independent sellers. Aventa Shop facilitates listings, orders, payments and delivery coordination.",
      "Product prices, descriptions and availability are provided by sellers and may change without notice.",
    ],
  },
  {
    title: "5. Customer Responsibilities",
    points: [
      "Provide accurate delivery information and be available to receive your order.",
      "Pay for orders using the payment methods available on the Platform.",
      "Do not misuse reviews, returns, coupons or the support system.",
    ],
  },
  {
    title: "6. Seller Responsibilities",
    points: [
      "List only products you are legally permitted to sell, with honest descriptions, images and prices.",
      "Honour confirmed orders and keep stock and order statuses accurate.",
      "Comply with all applicable Bangladeshi laws, including consumer rights regulations.",
    ],
  },
  {
    title: "7. Product Listings",
    points: [
      "Prohibited items include — but are not limited to — illegal goods, weapons, drugs, adult content, counterfeit items and hazardous materials.",
      "Aventa Shop may remove listings that violate these terms or applicable law, with or without notice.",
    ],
  },
  {
    title: "8. Orders",
    points: [
      "An order becomes confirmed when placed successfully and accepted on the Platform. Sellers are then responsible for packing and preparing the order for delivery.",
      "Orders may be cancelled if stock is unavailable, the listing is found to be invalid, or the order is suspected of fraud.",
    ],
  },
  {
    title: "9. Pricing",
    points: [
      "All prices are shown in Bangladeshi Taka (BDT) and include applicable taxes unless stated otherwise.",
      "Delivery charges depend on your delivery zone and are shown clearly before you confirm an order.",
    ],
  },
  {
    title: "10. Payments",
    points: [
      "Payments are collected centrally by the Platform and seller earnings are settled according to our settlement process.",
      "Refunds for cancelled, returned or undelivered orders are credited to your Aventa Shop wallet or original payment method where applicable.",
    ],
  },
  {
    title: "11. Delivery",
    points: [
      "Delivery timelines are estimates and may vary due to weather, location or other circumstances.",
      "Delivery availability depends on the delivery zones currently served by the Platform.",
    ],
  },
  {
    title: "12. Returns & Refunds",
    points: [
      "Returns are governed by our Returns & Refunds policy, available on the Platform.",
      "Eligibility, process and refund handling are described in that policy.",
    ],
  },
  {
    title: "13. Reviews & Ratings",
    points: [
      "Reviews must reflect genuine purchasing experiences. Fake, paid, defamatory or manipulated reviews may be removed.",
    ],
  },
  {
    title: "14. Promotions",
    points: [
      "Coupons, promo codes, flash sales and reward points are subject to their stated conditions and may be modified or discontinued at any time.",
      "Abuse of promotions (e.g., multiple accounts to farm rewards) may lead to cancellation of benefits and account suspension.",
    ],
  },
  {
    title: "15. Intellectual Property",
    points: [
      "The Aventa Shop name, logo, design and content are the property of the Platform. Sellers retain rights to their product content and grant the Platform a licence to display it for the purpose of operating the marketplace.",
    ],
  },
  {
    title: "16. Prohibited Activities",
    points: [
      "Do not scrape, hack, interfere with, or attempt to gain unauthorised access to the Platform.",
      "Do not use the Platform for fraudulent orders, payment abuse, harassment, or any unlawful purpose.",
    ],
  },
  {
    title: "17. Account Suspension",
    points: [
      "We may suspend or terminate accounts that violate these terms, engage in fraud, or put customers, sellers or the Platform at risk.",
    ],
  },
  {
    title: "18. Limitation of Liability",
    points: [
      "The Platform facilitates transactions between customers and sellers. To the extent permitted by law, Aventa Shop's liability is limited to the value of the affected order.",
      "Aventa Shop is not liable for indirect losses arising from the use of the Platform.",
    ],
  },
  {
    title: "19. Changes to Terms",
    points: [
      "We may update these terms from time to time. The 'Last Updated' date will reflect changes, and continued use of the Platform means you accept the updated terms.",
    ],
  },
  {
    title: "20. Governing Law",
    points: [
      "These terms are governed by the laws of Bangladesh, and disputes fall under the jurisdiction of Bangladeshi courts.",
    ],
  },
  {
    title: "21. Contact Information",
    points: [`Questions about these terms can be sent to ${SITE.supportEmail}.`],
  },
];

function TermsPage() {
  return (
    <PublicInfoLayout title="Terms & Conditions" subtitle="The rules of using Aventa Shop">
      <InfoCard className="mb-4">
        <p className="text-xs font-semibold text-slate-400">Last Updated: {LAST_UPDATED}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Welcome to Aventa Shop. These terms describe the rules that apply when you use our
          marketplace — as a customer, a seller, or a visitor.
        </p>
      </InfoCard>

      {SECTIONS.map((s) => (
        <InfoCard key={s.title} className="mb-3">
          <InfoHeading icon={<Scale className="h-5 w-5 shrink-0 text-orange-500" />}>
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
        <Mail className="h-5 w-5" /> Questions About These Terms?
      </Link>
    </PublicInfoLayout>
  );
}
