/**
 * Server-side FCM push notification sender.
 *
 * Uses Firebase REST API to send push notifications to a user's registered FCM tokens.
 * Called when order status changes (admin updates order) or other important events.
 *
 * No SDK needed — uses the Firestore REST API + FCM HTTP v1 endpoint via access token.
 */
import { getAccessToken, getProjectId } from "./firebase-admin.server";

interface FCMMessage {
  title: string;
  body: string;
  link?: string;
  tag?: string;
}

interface FCMToken {
  token: string;
}

/** Fetch all FCM tokens for a user from Firestore via REST API */
async function getUserFCMTokens(userId: string): Promise<string[]> {
  const projectId = getProjectId();
  const accessToken = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}/fcmTokens`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return [];

  const data = await response.json() as { documents?: Array<{ name: string; fields: Record<string, { stringValue?: string }> }> };
  if (!data.documents) return [];

  return data.documents.map((doc) => {
    const fields = doc.fields;
    return fields.token?.stringValue ?? "";
  }).filter(Boolean);
}

/** Send a push notification to a user's devices via FCM HTTP v1 API */
export async function sendPushNotification(userId: string, message: FCMMessage): Promise<void> {
  try {
    const tokens = await getUserFCMTokens(userId);
    if (tokens.length === 0) return; // No registered devices

    const projectId = getProjectId();
    const accessToken = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    // Send to each token individually (FCM v1 doesn't support multicast via REST easily)
    const promises = tokens.map(async (token) => {
      const body = {
        message: {
          token,
          notification: {
            title: message.title,
            body: message.body,
          },
          data: {
            link: message.link || "/",
            tag: message.tag || "aventa-notification",
          },
          android: {
            notification: {
              icon: "/brand/aventa-shop-logo.png",
              color: "#f57224",
              tag: message.tag || "aventa-notification",
            },
          },
          webpush: {
            notification: {
              icon: "/brand/aventa-shop-logo.png",
              badge: "/brand/aventa-shop-logo.png",
              tag: message.tag || "aventa-notification",
              requireInteraction: false,
              vibrate: [200, 100, 200],
            },
            fcmOptions: {
              link: message.link || "/",
            },
          },
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        // If token is invalid, we should clean it up — but for now just log
        console.error(`FCM send failed for token ${token.slice(0, 10)}...:`, response.status);
      }

      return response.ok;
    });

    await Promise.allSettled(promises);
  } catch (err) {
    // Don't throw — push notification failure should not block order updates
    console.error("sendPushNotification error:", err);
  }
}

/** Push notification for order status change */
export async function notifyOrderStatusChange(
  userId: string,
  orderId: string,
  status: string,
  note?: string,
): Promise<void> {
  const statusMessages: Record<string, { title: string; body: string }> = {
    confirmed: {
      title: "Order Confirmed ✓",
      body: `Your order #${orderId.slice(-8)} has been confirmed. We're preparing it for shipment.`,
    },
    processing: {
      title: "Order Processing",
      body: `Your order #${orderId.slice(-8)} is being processed.`,
    },
    shipped: {
      title: "Order Shipped 🚚",
      body: `Your order #${orderId.slice(-8)} has been shipped! Track it in the app.`,
    },
    out_for_delivery: {
      title: "Out for Delivery 🛵",
      body: `Your order #${orderId.slice(-8)} is out for delivery. Get ready!`,
    },
    delivered: {
      title: "Order Delivered ✅",
      body: `Your order #${orderId.slice(-8)} has been delivered. Enjoy your purchase!`,
    },
    cancelled: {
      title: "Order Cancelled",
      body: `Your order #${orderId.slice(-8)} has been cancelled.${note ? ` ${note}` : ""}`,
    },
    refunded: {
      title: "Refund Processed",
      body: `Your refund for order #${orderId.slice(-8)} has been processed.`,
    },
  };

  const msg = statusMessages[status] ?? {
    title: "Order Update",
    body: `Your order #${orderId.slice(-8)} status: ${status}${note ? `. ${note}` : ""}`,
  };

  await sendPushNotification(userId, {
    ...msg,
    link: `/orders`,
    tag: `order-${orderId}`,
  });
}
