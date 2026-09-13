/**
 * Push Notification Context
 * - Registers service worker on mount
 * - Listens for foreground FCM messages → shows toast
 * - Exposes enable/disable + permission status to components
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "./AuthContext";
import {
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  revokeNotificationPermission,
  onForegroundMessage,
  registerServiceWorker,
  type NotificationPermission,
} from "@/services/firebase/messaging";

interface PushNotificationContextValue {
  supported: boolean;
  permission: NotificationPermission;
  enabled: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

const PushNotificationContext = createContext<PushNotificationContextValue>({
  supported: false,
  permission: "unsupported",
  enabled: false,
  enable: async () => {},
  disable: async () => {},
});

export function PushNotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [supported] = useState(() => isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    getNotificationPermission(),
  );
  const [enabled, setEnabled] = useState(false);

  // Register service worker on mount
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Update permission status
  useEffect(() => {
    if (!supported) return;
    setPermission(getNotificationPermission());
  }, [supported]);

  // Listen for foreground messages
  useEffect(() => {
    if (!supported || permission !== "granted") return;

    const unsubscribe = onForegroundMessage((payload) => {
      const title = payload.notification?.title || "AVENTA SHOP";
      const body = payload.notification?.body || "You have a new update";
      const link = payload.data?.link;

      toast(title, {
        description: body,
        action: link
          ? {
              label: "View",
              onClick: () => {
                window.location.href = link;
              },
            }
          : undefined,
      });
    });

    return () => unsubscribe();
  }, [supported, permission]);

  // Auto-register token if permission was previously granted
  useEffect(() => {
    if (!user || !supported || getNotificationPermission() !== "granted") return;
    // Re-register token on login if permission is already granted
    requestNotificationPermission(user.uid)
      .then((result) => {
        if (result.granted) {
          setEnabled(true);
          setPermission("granted");
        }
      })
      .catch(() => {});
  }, [user, supported]);

  async function enable() {
    if (!user || !supported) return;
    const result = await requestNotificationPermission(user.uid);
    if (result.granted) {
      setEnabled(true);
      setPermission("granted");
      toast.success("Push notifications enabled! You'll get order updates on this device.");
    } else {
      toast.error(result.error || "Failed to enable notifications");
    }
  }

  async function disable() {
    if (!user) return;
    await revokeNotificationPermission(user.uid);
    setEnabled(false);
    setPermission("default");
    toast.success("Push notifications disabled for this device.");
  }

  return (
    <PushNotificationContext.Provider value={{ supported, permission, enabled, enable, disable }}>
      {children}
    </PushNotificationContext.Provider>
  );
}

export function usePushNotifications() {
  return useContext(PushNotificationContext);
}
