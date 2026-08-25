/**
 * Notification Service for AVENTA SHOP
 *
 * Provider abstraction for SMS, WhatsApp, and future channels.
 * Order status notifications dispatched through this service.
 *
 * Providers are selected via environment configuration.
 * No API credentials are hardcoded — all from env vars.
 */

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type OrderEvent =
  | "ORDER_CREATED"
  | "ORDER_CONFIRMED"
  | "ORDER_PROCESSING"
  | "ORDER_SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "ORDER_DELIVERED"
  | "ORDER_CANCELLED";

export interface NotificationPayload {
  event: OrderEvent;
  orderId: string;
  customerName: string;
  phoneNumber: string;
  orderTotal: number;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  delivered: boolean;
  channel: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Provider interface                                                  */
/* ------------------------------------------------------------------ */

export interface NotificationProvider {
  name: string;
  send(payload: NotificationPayload): Promise<NotificationResult>;
}

/* ------------------------------------------------------------------ */
/* Mock provider (dev/testing)                                         */
/* ------------------------------------------------------------------ */

class MockNotificationProvider implements NotificationProvider {
  name = "mock";
  async send(payload: NotificationPayload): Promise<NotificationResult> {
    return { delivered: true, channel: this.name };
  }
}

/* ------------------------------------------------------------------ */
/* SMS provider                                                        */
/* ------------------------------------------------------------------ */

class SmsNotificationProvider implements NotificationProvider {
  name = "sms";
  async send(payload: NotificationPayload): Promise<NotificationResult> {
    const apiUrl = Deno.env.get("SMS_GATEWAY_URL");
    const apiKey = Deno.env.get("SMS_GATEWAY_API_KEY");
    if (!apiUrl || !apiKey) {
      return { delivered: false, channel: this.name, error: "SMS gateway not configured" };
    }
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          to: payload.phoneNumber,
          message: payload.message,
        }),
      });
      return {
        delivered: res.ok,
        channel: this.name,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        delivered: false,
        channel: this.name,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* WhatsApp provider                                                   */
/* ------------------------------------------------------------------ */

class WhatsAppNotificationProvider implements NotificationProvider {
  name = "whatsapp";
  async send(payload: NotificationPayload): Promise<NotificationResult> {
    const apiUrl = Deno.env.get("WHATSAPP_API_URL");
    const apiKey = Deno.env.get("WHATSAPP_API_KEY");
    if (!apiUrl || !apiKey) {
      return { delivered: false, channel: this.name, error: "WhatsApp gateway not configured" };
    }
    try {
      const templateMap: Record<OrderEvent, string> = {
        ORDER_CREATED: "order_created",
        ORDER_CONFIRMED: "order_confirmed",
        ORDER_PROCESSING: "order_processing",
        ORDER_SHIPPED: "order_shipped",
        OUT_FOR_DELIVERY: "out_for_delivery",
        ORDER_DELIVERED: "order_delivered",
        ORDER_CANCELLED: "order_cancelled",
      };
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          to: payload.phoneNumber,
          template: templateMap[payload.event] ?? "order_update",
          params: [payload.orderId, payload.message],
        }),
      });
      return {
        delivered: res.ok,
        channel: this.name,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        delivered: false,
        channel: this.name,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Provider factory                                                    */
/* ------------------------------------------------------------------ */

let _notificationProvider: NotificationProvider | null = null;

function getNotificationProvider(): NotificationProvider {
  if (_notificationProvider) return _notificationProvider;
  const name = Deno.env.get("NOTIFICATION_PROVIDER") ?? "mock";
  switch (name) {
    case "sms":
      _notificationProvider = new SmsNotificationProvider();
      break;
    case "whatsapp":
      _notificationProvider = new WhatsAppNotificationProvider();
      break;
    case "mock":
    default:
      _notificationProvider = new MockNotificationProvider();
      break;
  }
  return _notificationProvider;
}

/* ------------------------------------------------------------------ */
/* Message templates                                                   */
/* ------------------------------------------------------------------ */

const templates: Record<OrderEvent, (p: NotificationPayload) => string> = {
  ORDER_CREATED: (p) =>
    `Hi ${p.customerName}, your order #${p.orderId.slice(0, 8)} has been placed. Total: ৳${p.orderTotal}. We'll confirm it shortly.`,
  ORDER_CONFIRMED: (p) =>
    `Great news! Your order #${p.orderId.slice(0, 8)} is confirmed. We're preparing it for shipment.`,
  ORDER_PROCESSING: (p) =>
    `Your order #${p.orderId.slice(0, 8)} is being processed. Items are being packaged.`,
  ORDER_SHIPPED: (p) =>
    `Your order #${p.orderId.slice(0, 8)} has been shipped. Track it in your orders page.`,
  OUT_FOR_DELIVERY: (p) =>
    `Your order #${p.orderId.slice(0, 8)} is out for delivery. Please keep your phone available.`,
  ORDER_DELIVERED: (p) =>
    `Your order #${p.orderId.slice(0, 8)} has been delivered. Thank you for shopping with AVENTA SHOP!`,
  ORDER_CANCELLED: (p) =>
    `Your order #${p.orderId.slice(0, 8)} has been cancelled. Contact support for assistance.`,
};

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function sendOrderNotification(
  event: OrderEvent,
  payload: Omit<NotificationPayload, "event" | "message">,
): Promise<NotificationResult> {
  const fullPayload: NotificationPayload = {
    ...payload,
    event,
    message: templates[event](payload as NotificationPayload),
  };

  // Log security event (no sensitive data)
  }

  const provider = getNotificationProvider();
  try {
    return await provider.send(fullPayload);
  } catch (err) {
    return {
      delivered: false,
      channel: provider.name,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
