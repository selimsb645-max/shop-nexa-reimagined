import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSellerProfile } from "@/services/firebase/sellers";
import type { SellerProfile } from "@/types/seller";

export function useSellerProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await getSellerProfile(user.uid);
      setProfile(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load seller profile");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { profile, loading, error, refresh };
}
