import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/common/BackButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Mail, Phone, MessageCircle, MapPin, Clock, Headphones } from "lucide-react";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/contact")({
  ssr: true,
  component: ContactPage,
  head: () => ({
    ...seoHead({
      title: "Contact AVENTA SHOP — Customer Support & Inquiries",
      description: "Get in touch with AVENTA SHOP customer support. Find our email, phone number, and office address. We're here to help with orders, returns, payments and more.",
      path: "/contact",
      type: "website",
    }),
  }),
});

const CONTACT_OPTIONS = [
  {
    icon: <Headphones className="h-6 w-6" />,
    title: "Customer Support",
    description: "Open a support ticket for order issues, returns, or general inquiries.",
    link: "/support",
    linkText: "Open Ticket",
  },
  {
    icon: <Mail className="h-6 w-6" />,
    title: "Email Us",
    description: "support@aventashop.com",
    link: "mailto:support@aventashop.com",
    linkText: "Send Email",
  },
  {
    icon: <Phone className="h-6 w-6" />,
    title: "Call Us",
    description: "+880 1700-000000",
    link: "tel:+8801700000000",
    linkText: "Call Now",
  },
  {
    icon: <MessageCircle className="h-6 w-6" />,
    title: "Live Chat",
    description: "Chat with our support team during business hours.",
    link: "/support",
    linkText: "Start Chat",
  },
];

function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <BackButton fallbackTo="/" label="Back" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">Contact Us</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          We're here to help. Reach out through any of the channels below.
        </p>

        {/* Contact options */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {CONTACT_OPTIONS.map((option, i) => {
            const isExternal = option.link.startsWith("mailto:") || option.link.startsWith("tel:");
            return (
              <div
                key={i}
                className="flex items-center gap-4 rounded-2xl border bg-background p-5 shadow-sm"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  {option.icon}
                </span>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">{option.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                  {isExternal ? (
                    <a
                      href={option.link}
                      className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                    >
                      {option.linkText} →
                    </a>
                  ) : (
                    <Link
                      to={option.link}
                      className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                    >
                      {option.linkText} →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Office address */}
        <div className="mb-8 rounded-2xl border bg-muted/30 p-6">
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Our Office</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            AVENTA SHOP Headquarters<br />
            Dhaka, Bangladesh<br />
            Level 5, Gulshan Avenue, Gulshan-1, Dhaka 1212
          </p>
        </div>

        {/* Business hours */}
        <div className="flex items-center gap-3 rounded-xl border bg-background p-4 shadow-sm">
          <Clock className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Business Hours</h3>
            <p className="text-xs text-muted-foreground">
              Saturday – Thursday: 9:00 AM – 10:00 PM (BST) | Friday: Closed
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
