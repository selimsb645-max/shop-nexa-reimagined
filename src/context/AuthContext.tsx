import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseConfigured, getFirebaseAuth } from "@/services/firebase/config";
import { ensureUserProfile } from "@/services/firebase/firestore";
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

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          setProfile(await ensureUserProfile(u));
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

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
