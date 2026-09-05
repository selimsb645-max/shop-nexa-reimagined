/**
 * Firebase Cloud Messaging (FCM) — client-side push notification service.
 *
 * Responsibilities:
 * - Request notification permission
 * - Get and register FCM token
 * - Save token to user's Firestore doc so server can send pushes
 * - Listen for foreground messages (in-app toast)
 */
import { getMessaging, getToken, onMessage, deleteToken, type Messaging } from "firebase/messaging";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { getApp, getDb } from "./config";

let messagingInstance: Messaging | null = null;

function getMessagingInstance(): Messaging {
  if (!messagingInstance) {
    messagingInstance = getMessaging(getApp());
  }
  return messagingInstance;
}

// Firebase vAPID key — this is a public key for web push, safe to ship in client code
const VAPID_KEY = "BDZGalHpCd0gKKvQ8HB6uYhDaHAQa-5Xg7zvEdksagPdRnsuPdOcSG_r02Q4u5h-bIZdUu12cziENG93FwhLzp8";

export type NotificationPermission = "granted" | "denied" | "default" | "unsupported";

/** Check if the browser supports service workers and push notifications */
export function isPushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

/** Get current notification permission status */
export function getNotificationPermission(): NotificationPermission {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as NotificationPermission;
}

/** Request permission and get FCM token */
export async function requestNotificationPermission(userId: string): Promise<{ granted: boolean; token?: string; error?: string }> {
  if (!isPushSupported()) {
    return { granted: false, error: "Push notifications are not supported on this device" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { granted: false, error: "Notification permission denied" };
    }

    const messaging = getMessagingInstance();

    // Register the service worker for FCM
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      return { granted: false, error: "Failed to get push token" };
    }

    // Save token to user's Firestore document
    await setDoc(doc(getDb(), "users", userId, "fcmTokens", token), {
      token,
      platform: "web",
      createdAt: serverTimestamp(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    });

    return { granted: true, token };
  } catch (err) {
    console.error("FCM token error:", err);
    return {
      granted: false,
      error: err instanceof Error ? err.message : "Failed to enable notifications",
    };
  }
}

/** Remove the FCM token (disable notifications) */
export async function revokeNotificationPermission(userId: string): Promise<void> {
  try {
    const messaging = getMessagingInstance();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY }).catch(() => null);
    if (token) {
      await deleteToken(messaging);
      await deleteDoc(doc(getDb(), "users", userId, "fcmTokens", token));
    }
  } catch (err) {
    console.error("FCM revoke error:", err);
  }
}

/** Listen for foreground push messages (when app is open) */
export function onForegroundMessage(callback: (payload: { notification?: { title?: string; body?: string; icon?: string; tag?: string }; data?: Record<string, string> }) => void): () => void {
  const messaging = getMessagingInstance();
  return onMessage(messaging, callback);
}

/** Register the service worker for PWA installability + FCM */
export async function registerServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
  } catch (err) {
    console.error("Service worker registration failed:", err);
  }
}
