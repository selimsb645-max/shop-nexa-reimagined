import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  MessageCircle,
  Headphones,
  Store,
  Briefcase,
  Send,
  HelpCircle,
  Clock,
} from "lucide-react";
import { PublicInfoLayout, InfoCard, InfoHeading } from "@/components/common/PublicInfoLayout";
import { SITE } from "@/config/site";
import { useAuth } from "@/context/AuthContext";
import { createTicket } from "@/services/firebase/support";

export const Route = createFileRoute("/contact-us")({
  ssr: false,
  component: ContactUsPage,
  head: () => ({
    meta: [
      { title: "Contact Us — Aventa Shop" },
      {
        name: "description",
        content:
          "Reach the Aventa Shop team for customer support, seller support or business inquiries.",
      },
    ],
  }),
});

const CONTACT_OPTIONS = [
  {
    icon: <Headphones className="h-6 w-6" />,
    title: "Customer Support",
    text: "Orders, payments, returns and account help.",
    route: "/help-center" as const,
  },
  {
    icon: <Store className="h-6 w-6" />,
    title: "Seller Support",
    text: "Store, listings, orders and earnings help for sellers.",
    route: "/become-a-seller" as const,
  },
  {
    icon: <Briefcase className="h-6 w-6" />,
    title: "Business Inquiry",
    text: "Partnerships and business collaborations.",
    route: "/affiliate" as const,
  },
];

function ContactUsPage() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.info("Please sign in so we can reply to your message.");
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toast.error("Please fill in the subject and message.");
      return;
    }
    setSending(true);
    try {
      await createTicket(user.uid, {
        subject: subject.trim(),
        category: orderId.trim() ? "order" : "other",
        orderId: orderId.trim() || null,
        message: `${name.trim() ? `From: ${name.trim()} (${email.trim() || user.email})\n\n` : ""}${message.trim()}`,
      });
      toast.success("Message sent! Our support team will get back to you.");
      setSubject("");
      setOrderId("");
      setMessage("");
    } catch {
      toast.error("Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <PublicInfoLayout title="Contact Us" subtitle="How can we help?">
      {/* Contact Options */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {CONTACT_OPTIONS.map((c) => (
          <Link
            key={c.title}
            to={c.route}
            className="rounded-2xl border border-slate-200/80 bg-white p-5 text-center shadow-sm transition hover:border-orange-200 hover:shadow-md"
          >
            <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full bg-orange-50 text-orange-500">
              {c.icon}
            </div>
            <h3 className="text-sm font-bold text-slate-800">{c.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{c.text}</p>
          </Link>
        ))}
      </div>

      {/* Contact Form */}
      <InfoCard className="mb-4">
        <InfoHeading icon={<Send className="h-5 w-5 text-orange-500" />}>
          Send Us a Message
        </InfoHeading>
        {user ? (
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Your email"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Order ID (optional)"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Your message..."
              rows={4}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 sm:col-span-2"
            />
            <button
              type="submit"
              disabled={sending}
              className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-60 sm:col-span-2"
            >
              <Send className="h-4 w-4" /> {sending ? "Sending..." : "Send Message"}
            </button>
          </form>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-slate-500">
              Sign in to send us a message — we reply right in your account.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/login"
                className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 transition hover:border-orange-300"
              >
                Create Account
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              You can also reach us directly using the channels below.
            </p>
          </div>
        )}
      </InfoCard>

      {/* Direct Channels */}
      <InfoCard className="mb-4">
        <InfoHeading>Reach Us Directly</InfoHeading>
        <div className="grid gap-3 sm:grid-cols-3">
          <a
            href={`tel:${SITE.supportPhone}`}
            className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 transition hover:bg-slate-100"
          >
            <Phone className="h-5 w-5 text-orange-500" />
            <div>
              <p className="text-xs font-semibold text-slate-500">Phone</p>
              <p className="text-sm font-bold text-slate-800">{SITE.supportPhone}</p>
            </div>
          </a>
          <a
            href={`mailto:${SITE.supportEmail}`}
            className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 transition hover:bg-slate-100"
          >
            <Mail className="h-5 w-5 text-orange-500" />
            <div>
              <p className="text-xs font-semibold text-slate-500">Email</p>
              <p className="text-sm font-bold text-slate-800">{SITE.supportEmail}</p>
            </div>
          </a>
          <a
            href={`https://wa.me/${SITE.whatsappNumber}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 transition hover:bg-slate-100"
          >
            <MessageCircle className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-xs font-semibold text-slate-500">WhatsApp</p>
              <p className="text-sm font-bold text-slate-800">Chat with us</p>
            </div>
          </a>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" /> Support hours: 9:00 AM – 9:00 PM, every day
        </p>
      </InfoCard>

      {/* FAQ CTA */}
      <Link
        to="/help-center"
        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
      >
        <HelpCircle className="h-5 w-5" /> Visit Help Center
      </Link>
    </PublicInfoLayout>
  );
}
