import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseConfigured, getFirebaseAuth } from "@/services/firebase/config";
import { ensureUserProfile } from "@/services/firebase/firestore";
import { createSession, updateSessionActivity, removeCurrentSession } from "@/services/firebase/sessions";
import type { AppUserProfile } from "@/types/user";

interface AuthContextValue {
  user: User | null;
  profile: AppUserProfile | null;
  loading: boolean;
  configured: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      // If a different user signed in (or signed out), clean up previous session
      if (lastUidRef.current && lastUidRef.current !== u?.uid) {
        // Previous user signed out or switched — don't delete session here,
        // it's handled by the signOut() function
      }

      setUser(u);
      if (u) {
        lastUidRef.current = u.uid;
        try {
          setProfile(await ensureUserProfile(u));
          // Create or update session record in Firestore
          await createSession(u.uid).catch(() => {});
        } catch {
          setProfile(null);
        }
      } else {
        // Clean up session on sign out
        if (lastUidRef.current) {
          await removeCurrentSession(lastUidRef.current).catch(() => {});
        }
        lastUidRef.current = null;
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Periodically update lastActiveAt (every 5 minutes)
  useEffect(() => {
    if (!user?.uid) return;
    const interval = setInterval(() => {
      updateSessionActivity(user.uid).catch(() => {});
    }, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [user?.uid]);

  const refreshProfile = async () => {
    if (!user) return;
    setProfile(await ensureUserProfile(user));
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, configured: firebaseConfigured, refreshProfile }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
