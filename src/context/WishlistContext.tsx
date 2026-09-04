import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useAuth } from "./AuthContext";
import { addToWishlist, listWishlist, removeFromWishlist } from "@/services/firebase/wishlist";
import type { Product, WishlistItem } from "@/types/commerce";
import { firebaseConfigured } from "@/services/firebase/config";

interface WishlistContextValue {
  items: WishlistItem[];
  count: number;
  loading: boolean;
  has: (productId: string) => boolean;
  toggle: (product: Product) => Promise<void>;
  remove: (productId: string) => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setLoading(true);
      if (authLoading) return;
      if (user && firebaseConfigured) {
        try {
          const remote = await listWishlist(user.uid);
          if (!cancelled) setItems(remote);
        } catch {
          if (!cancelled) setItems([]);
        }
      } else {
        setItems([]);
      }
      if (!cancelled) setLoading(false);
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const has = useCallback((id: string) => items.some((i) => i.productId === id), [items]);

  const toggle = useCallback(
    async (product: Product) => {
      if (!user) {
        toast.error("Sign in to save items to your wishlist");
        return;
      }
      if (has(product.id)) {
        setItems((prev) => prev.filter((i) => i.productId !== product.id));
        await removeFromWishlist(user.uid, product.id);
        toast.success("Removed from wishlist");
      } else {
        const item: WishlistItem = {
          productId: product.id,
          addedAt: Date.now(),
          title: product.title,
          image: product.images[0] ?? "",
          price: product.price,
          slug: product.slug,
        };
        setItems((prev) => [item, ...prev]);
        await addToWishlist(user.uid, product);
        toast.success("Added to wishlist");
      }
    },
    [user, has],
  );

  const remove = useCallback(
    async (productId: string) => {
      setItems((prev) => prev.filter((i) => i.productId !== productId));
      if (user && firebaseConfigured) await removeFromWishlist(user.uid, productId);
    },
    [user],
  );

  const value = useMemo<WishlistContextValue>(
    () => ({ items, count: items.length, loading, has, toggle, remove }),
    [items, loading, has, toggle, remove],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside WishlistProvider");
  return ctx;
}
