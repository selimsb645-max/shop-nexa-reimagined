/**
 * Transactional Email Templates for AVENTA SHOP
 *
 * Reusable HTML email components + full event templates.
 * All HTML is email-client compatible: inline styles, table-based layout,
 * no JavaScript, mobile-responsive.
 *
 * Branding: AVENTA SHOP orange (#f97316) + slate neutrals.
 * All links use SITE_URL from environment — never hard-coded.
 */

/* ------------------------------------------------------------------ */
/* Environment helpers                                                  */
/* ------------------------------------------------------------------ */

function getSiteUrl(): string {
  return (typeof Deno !== "undefined" && Deno.env.get("SITE_URL")) || "https://aventa-shop.com";
}

function formatPrice(amount: number): string {
  return `\u09F3${amount.toLocaleString("en-BD")}`;
}

function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Reusable Email Components                                            */
/* ------------------------------------------------------------------ */

export function EmailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>${title}</title>
<style>
  body { margin:0; padding:0; background:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif; }
  .wrapper { width:100%; max-width:600px; margin:0 auto; background:#ffffff; }
  @media(max-width:600px) { .wrapper { border-radius:0; } .px { padding:20px !important; } }
</style>
</head>
<body>
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;margin:0 auto;background:#ffffff;">
    ${bodyHtml}
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`;
}

export function EmailHeader(): string {
  return `<tr>
<td style="padding:24px 40px 20px 40px; background:linear-gradient(135deg,#f97316,#ea580c); text-align:center;" class="px">
  <span style="font-size:22px; font-weight:700; color:#ffffff; letter-spacing:-0.5px;">AVENTA SHOP</span>
</td>
</tr>`;
}

export function EmailFooter(): string {
  const siteUrl = getSiteUrl();
  return `<tr>
<td style="padding:24px 40px; background:#f8fafc; border-top:1px solid #e2e8f0;" class="px">
  <p style="margin:0 0 8px 0; font-size:13px; color:#64748b; text-align:center;">
    AVENTA SHOP \u2014 Your trusted marketplace
  </p>
  <p style="margin:0 0 12px 0; font-size:12px; color:#94a3b8; text-align:center;">
    Need help? Visit our <a href="${siteUrl}/help-center" style="color:#f97316; text-decoration:none;">Help Center</a> or contact help.shopnexa@gmail.com
  </p>
  <p style="margin:0; font-size:11px; color:#cbd5e1; text-align:center;">
    \u00A9 ${new Date().getFullYear()} AVENTA SHOP. All rights reserved.<br>
    This email was sent regarding your AVENTA SHOP account.
  </p>
</td>
</tr>`;
}

export function StatusBadge(status: string): string {
  const colors: Record<string, string> = {
    pending: "#f59e0b",
    confirmed: "#22c55e",
    processing: "#3b82f6",
    shipped: "#8b5cf6",
    out_for_delivery: "#06b6d4",
    delivered: "#22c55e",
    cancelled: "#ef4444",
    requested: "#f59e0b",
    approved: "#22c55e",
    rejected: "#ef4444",
    completed: "#22c55e",
  };
  const color = colors[status.toLowerCase().replace(/ /g, "_")] ?? "#64748b";
  return `<span style="display:inline-block; padding:4px 14px; background:${color}15; color:${color}; font-size:12px; font-weight:600; border-radius:99px; text-transform:capitalize;">${status.replace(/_/g, " ")}</span>`;
}

export function ActionButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td style="border-radius:10px; background:#f97316;">
      <a href="${href}" style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">${label}</a>
    </td>
  </tr>
</table>`;
}

export function InfoCard(content: string): string {
  return `<tr><td style="padding:0 40px 16px 40px;" class="px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
  <tr><td style="padding:20px 24px;">
    ${content}
  </td></tr>
</table>
</td></tr>`;
}

export function SecurityNotice(text: string): string {
  return `<tr><td style="padding:0 40px 24px 40px;" class="px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px;">
  <tr><td style="padding:14px 18px;">
    <p style="margin:0; font-size:13px; color:#9a3412; line-height:1.5;">
      \uD83D\uDD12 ${text}
    </p>
  </td></tr>
</table>
</td></tr>`;
}

export function PriceBreakdown(
  items: { label: string; value: string }[],
  grandTotal: string,
): string {
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:6px 0; font-size:14px; color:#475569;">${item.label}</td><td style="padding:6px 0; font-size:14px; color:#1e293b; font-weight:500; text-align:right;">${item.value}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${rows}
  <tr><td colspan="2" style="padding:8px 0 0 0; border-top:2px solid #e2e8f0;"></td></tr>
  <tr><td style="padding:10px 0 0 0; font-size:16px; font-weight:700; color:#1e293b;">Grand Total</td><td style="padding:10px 0 0 0; font-size:16px; font-weight:700; color:#f97316; text-align:right;">${grandTotal}</td></tr>
</table>`;
}

export function OrderItems(
  items: Array<{ name: string; quantity: number; price: number; image?: string }>,
): string {
  const rows = items
    .map((item) => {
      const img = item.image
        ? `<img src="${item.image}" alt="" width="48" height="48" style="border-radius:8px; display:block;">`
        : `<div style="width:48px;height:48px;background:#f1f5f9;border-radius:8px;"></div>`;
      return `<tr>
  <td style="padding:8px 8px 8px 0; vertical-align:top;">${img}</td>
  <td style="padding:8px 8px 8px 0; vertical-align:top;"><p style="margin:0; font-size:14px; font-weight:500; color:#1e293b;">${item.name}</p><p style="margin:2px 0 0 0; font-size:13px; color:#64748b;">Qty: ${item.quantity} \u00D7 ${formatPrice(item.price)}</p></td>
  <td style="padding:8px 0; font-size:14px; font-weight:500; color:#1e293b; text-align:right; vertical-align:top;">${formatPrice(item.price * item.quantity)}</td>
</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

/* ------------------------------------------------------------------ */
/* Full Event Templates                                                 */
/* ------------------------------------------------------------------ */

export interface OrderEmailData {
  orderId: string;
  customerName: string;
  orderDate: string | Date;
  status: string;
  items: Array<{ name: string; quantity: number; price: number; image?: string }>;
  subtotal: number;
  discount: number;
  tax: number;
  taxLabel: string;
  deliveryFee: number;
  grandTotal: number;
  deliveryAddress: {
    fullName: string;
    addressLine: string;
    city: string;
    postalCode: string;
    phone: string;
  };
}

export interface WithdrawalEmailData {
  sellerName: string;
  withdrawalId: string;
  amount: number;
  requestDate: string | Date;
  status: string;
  paymentMethod: string;
  reason?: string;
}

export function orderCreatedEmail(data: OrderEmailData): { subject: string; html: string } {
  const siteUrl = getSiteUrl();
  const shortId = data.orderId.slice(0, 8);
  const body = `
    ${EmailHeader()}
    <tr><td style="padding:32px 40px 8px 40px;" class="px">
      <h1 style="margin:0; font-size:22px; font-weight:700; color:#1e293b;">Order Confirmed!</h1>
      <p style="margin:8px 0 0 0; font-size:15px; color:#64748b;">Hi ${data.customerName}, your order has been placed successfully.</p>
    </td></tr>
    ${InfoCard(`<div style="margin-bottom:12px;"><span style="font-size:13px; color:#64748b;">Order #</span><span style="font-size:15px; font-weight:600; color:#1e293b; margin-left:6px;">${shortId}</span></div>${StatusBadge(data.status)}<p style="margin:8px 0 0 0; font-size:13px; color:#64748b;">Placed on ${formatDate(data.orderDate)}</p>`)}
    <tr><td style="padding:0 40px 8px 40px;" class="px">
      <h2 style="margin:0 0 12px 0; font-size:16px; font-weight:600; color:#1e293b;">Order Summary</h2>
      ${OrderItems(data.items)}
    </td></tr>
    ${InfoCard(
      PriceBreakdown(
        [
          { label: "Subtotal", value: formatPrice(data.subtotal) },
          ...(data.discount > 0
            ? [{ label: "Discount", value: `-${formatPrice(data.discount)}` }]
            : []),
          ...(data.tax > 0
            ? [{ label: data.taxLabel || "Tax", value: `+${formatPrice(data.tax)}` }]
            : []),
          { label: "Delivery Fee", value: formatPrice(data.deliveryFee) },
        ],
        formatPrice(data.grandTotal),
      ),
    )}
    <tr><td style="padding:0 40px 8px 40px;" class="px">
      <h2 style="margin:0 0 8px 0; font-size:16px; font-weight:600; color:#1e293b;">Delivery Address</h2>
      <p style="margin:0; font-size:14px; color:#475569; line-height:1.6;">${data.deliveryAddress.fullName}<br>${data.deliveryAddress.addressLine}<br>${data.deliveryAddress.city}, ${data.deliveryAddress.postalCode}<br>${data.deliveryAddress.phone}</p>
    </td></tr>
    <tr><td style="padding:8px 40px;" class="px">${ActionButton("View Order", `${siteUrl}/orders/${data.orderId}`)}</td></tr>
    ${EmailFooter()}`;
  return {
    subject: `AVENTA SHOP \u2014 Order #${shortId} Confirmed`,
    html: EmailLayout(`Order #${shortId} Confirmed`, body),
  };
}

export function orderStatusEmail(
  event:
    | "ORDER_CONFIRMED"
    | "ORDER_PROCESSING"
    | "ORDER_SHIPPED"
    | "OUT_FOR_DELIVERY"
    | "ORDER_DELIVERED"
    | "ORDER_CANCELLED",
  data: OrderEmailData,
): { subject: string; html: string } {
  const siteUrl = getSiteUrl();
  const shortId = data.orderId.slice(0, 8);
  const messages: Record<typeof event, string> = {
    ORDER_CONFIRMED: "Great news! Your order is confirmed and being prepared.",
    ORDER_PROCESSING: "Your order is now being processed. Items are being packaged.",
    ORDER_SHIPPED: "Your order has been shipped! Track it in your orders page.",
    OUT_FOR_DELIVERY: "Your order is out for delivery. Please keep your phone available.",
    ORDER_DELIVERED: "Your order has been delivered. Thank you for shopping with AVENTA SHOP!",
    ORDER_CANCELLED: "Your order has been cancelled. Contact support for assistance.",
  };
  const statusLabels: Record<typeof event, string> = {
    ORDER_CONFIRMED: "confirmed",
    ORDER_PROCESSING: "processing",
    ORDER_SHIPPED: "shipped",
    OUT_FOR_DELIVERY: "out for delivery",
    ORDER_DELIVERED: "delivered",
    ORDER_CANCELLED: "cancelled",
  };
  const body = `
    ${EmailHeader()}
    <tr><td style="padding:32px 40px 8px 40px;" class="px">
      <h1 style="margin:0; font-size:22px; font-weight:700; color:#1e293b;">Order ${StatusBadge(statusLabels[event])}</h1>
      <p style="margin:8px 0 0 0; font-size:15px; color:#64748b;">Hi ${data.customerName}, ${messages[event]}</p>
    </td></tr>
    ${InfoCard(`<div style="margin-bottom:8px;"><span style="font-size:13px; color:#64748b;">Order #</span><span style="font-size:15px; font-weight:600; color:#1e293b; margin-left:6px;">${shortId}</span></div>${StatusBadge(statusLabels[event])}`)}
    ${event === "ORDER_SHIPPED" || event === "OUT_FOR_DELIVERY" ? InfoCard(`<p style="margin:0; font-size:14px; color:#475569; line-height:1.6;">${data.deliveryAddress.fullName}<br>${data.deliveryAddress.addressLine}<br>${data.deliveryAddress.city}, ${data.deliveryAddress.postalCode}</p>`) : ""}
    <tr><td style="padding:8px 40px;" class="px">${ActionButton("View Order", `${siteUrl}/orders/${data.orderId}`)}</td></tr>
    ${event === "ORDER_CANCELLED" ? SecurityNotice("If you did not request this cancellation, please contact support immediately.") : ""}
    ${EmailFooter()}`;
  const label = statusLabels[event];
  return {
    subject: `AVENTA SHOP \u2014 Order #${shortId} ${label.charAt(0).toUpperCase() + label.slice(1)}`,
    html: EmailLayout(`Order ${label}`, body),
  };
}

export function passwordResetEmail(data: { recipientName: string; resetLink: string }): {
  subject: string;
  html: string;
} {
  const body = `
    ${EmailHeader()}
    <tr><td style="padding:32px 40px 8px 40px;" class="px">
      <h1 style="margin:0; font-size:22px; font-weight:700; color:#1e293b;">Reset Your Password</h1>
      <p style="margin:8px 0 0 0; font-size:15px; color:#64748b;">Hi ${data.recipientName}, we received a request to reset your AVENTA SHOP password.</p>
    </td></tr>
    <tr><td style="padding:16px 40px 8px 40px;" class="px">
      <p style="margin:0; font-size:14px; color:#475569; line-height:1.6;">Click the button below to set a new password. This link will expire in 1 hour for security reasons.</p>
    </td></tr>
    <tr><td style="padding:8px 40px;" class="px">${ActionButton("Reset Password", data.resetLink)}</td></tr>
    ${SecurityNotice("If you did not request a password reset, you can safely ignore this email. Your account is still secure.")}
    <tr><td style="padding:0 40px 24px 40px;" class="px"><p style="margin:0; font-size:13px; color:#94a3b8;">Or copy this link: ${data.resetLink}</p></td></tr>
    ${EmailFooter()}`;
  return {
    subject: "AVENTA SHOP \u2014 Reset Your Password",
    html: EmailLayout("Reset Your Password", body),
  };
}

export function withdrawalEmail(
  event:
    "WITHDRAWAL_REQUESTED" | "WITHDRAWAL_APPROVED" | "WITHDRAWAL_REJECTED" | "WITHDRAWAL_COMPLETED",
  data: WithdrawalEmailData,
): { subject: string; html: string } {
  const siteUrl = getSiteUrl();
  const shortRef = data.withdrawalId.slice(0, 8);
  const messages: Record<typeof event, string> = {
    WITHDRAWAL_REQUESTED: "Your withdrawal request has been received and is being processed.",
    WITHDRAWAL_APPROVED: "Your withdrawal request has been approved! Payment is being initiated.",
    WITHDRAWAL_REJECTED: `Your withdrawal request has been rejected. ${data.reason ?? "Please contact support for details."}`,
    WITHDRAWAL_COMPLETED:
      "Your withdrawal has been completed. The funds have been transferred to your account.",
  };
  const statusMap: Record<typeof event, string> = {
    WITHDRAWAL_REQUESTED: "requested",
    WITHDRAWAL_APPROVED: "approved",
    WITHDRAWAL_REJECTED: "rejected",
    WITHDRAWAL_COMPLETED: "completed",
  };
  const body = `
    ${EmailHeader()}
    <tr><td style="padding:32px 40px 8px 40px;" class="px">
      <h1 style="margin:0; font-size:22px; font-weight:700; color:#1e293b;">Withdrawal ${StatusBadge(statusMap[event])}</h1>
      <p style="margin:8px 0 0 0; font-size:15px; color:#64748b;">Hi ${data.sellerName}, ${messages[event]}</p>
    </td></tr>
    ${InfoCard(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:6px 0; font-size:14px; color:#64748b;">Withdrawal Ref</td><td style="padding:6px 0; font-size:14px; font-weight:500; color:#1e293b; text-align:right;">#${shortRef}</td></tr>
      <tr><td style="padding:6px 0; font-size:14px; color:#64748b;">Amount</td><td style="padding:6px 0; font-size:14px; font-weight:700; color:#f97316; text-align:right;">${formatPrice(data.amount)}</td></tr>
      <tr><td style="padding:6px 0; font-size:14px; color:#64748b;">Request Date</td><td style="padding:6px 0; font-size:14px; color:#1e293b; text-align:right;">${formatDate(data.requestDate)}</td></tr>
      <tr><td style="padding:6px 0; font-size:14px; color:#64748b;">Payment Method</td><td style="padding:6px 0; font-size:14px; color:#1e293b; text-align:right;">${data.paymentMethod}</td></tr>
      <tr><td style="padding:6px 0; font-size:14px; color:#64748b;">Status</td><td style="padding:6px 0; text-align:right;">${StatusBadge(statusMap[event])}</td></tr>
    </table>`)}
    <tr><td style="padding:8px 40px;" class="px">${ActionButton("View Dashboard", `${siteUrl}/seller/dashboard`)}</td></tr>
    ${SecurityNotice("Never share your bank details or account credentials with anyone. AVENTA SHOP will never ask for your password.")}
    ${EmailFooter()}`;
  const label = statusMap[event];
  return {
    subject: `AVENTA SHOP \u2014 Withdrawal #${shortRef} ${label.charAt(0).toUpperCase() + label.slice(1)}`,
    html: EmailLayout(`Withdrawal ${label}`, body),
  };
}

/* ------------------------------------------------------------------ */
/* Centralized template dispatcher                                     */
/* ------------------------------------------------------------------ */

export type EmailEvent =
  | "ORDER_CREATED"
  | "ORDER_CONFIRMED"
  | "ORDER_PROCESSING"
  | "ORDER_SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "ORDER_DELIVERED"
  | "ORDER_CANCELLED"
  | "PASSWORD_RESET"
  | "WITHDRAWAL_REQUESTED"
  | "WITHDRAWAL_APPROVED"
  | "WITHDRAWAL_REJECTED"
  | "WITHDRAWAL_COMPLETED";

export interface EmailTemplateData {
  order?: OrderEmailData;
  withdrawal?: WithdrawalEmailData;
  recipientName?: string;
  resetLink?: string;
}

export function renderEmailTemplate(
  event: EmailEvent,
  data: EmailTemplateData,
): { subject: string; html: string } {
  switch (event) {
    case "ORDER_CREATED":
      if (!data.order) throw new Error("order data required for ORDER_CREATED");
      return orderCreatedEmail(data.order);
    case "ORDER_CONFIRMED":
    case "ORDER_PROCESSING":
    case "ORDER_SHIPPED":
    case "OUT_FOR_DELIVERY":
    case "ORDER_DELIVERED":
    case "ORDER_CANCELLED":
      if (!data.order) throw new Error(`order data required for ${event}`);
      return orderStatusEmail(event, data.order);
    case "PASSWORD_RESET":
      if (!data.recipientName || !data.resetLink)
        throw new Error("recipientName and resetLink required for PASSWORD_RESET");
      return passwordResetEmail({ recipientName: data.recipientName, resetLink: data.resetLink });
    case "WITHDRAWAL_REQUESTED":
    case "WITHDRAWAL_APPROVED":
    case "WITHDRAWAL_REJECTED":
    case "WITHDRAWAL_COMPLETED":
      if (!data.withdrawal) throw new Error(`withdrawal data required for ${event}`);
      return withdrawalEmail(event, data.withdrawal);
    default:
      throw new Error(`Unknown email event: ${event}`);
  }
}
