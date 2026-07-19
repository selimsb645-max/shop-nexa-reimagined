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
import {
  clearCart as fbClearCart,
  listCart,
  mergeGuestCart,
  removeCartItem,
  setCartItem,
  updateCartQuantity,
} from "@/services/firebase/cart";
import type { CartItem, Product } from "@/types/commerce";
import { firebaseConfigured } from "@/services/firebase/config";

const GUEST_KEY = "shopnexa:cart:v1";

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  loading: boolean;
  add: (product: Product, quantity?: number) => Promise<void>;
  updateQty: (productId: string, quantity: number) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  clear: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

function loadGuest(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function saveGuest(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Hydrate on mount / auth change
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setLoading(true);
      if (authLoading) return;
      if (user && firebaseConfigured) {
        const guest = loadGuest();
        if (guest.length) {
          try {
            await mergeGuestCart(user.uid, guest);
            saveGuest([]);
          } catch {
            /* ignore */
          }
        }
        try {
          const remote = await listCart(user.uid);
          if (!cancelled) setItems(remote);
        } catch {
          if (!cancelled) setItems([]);
        }
      } else {
        setItems(loadGuest());
      }
      if (!cancelled) setLoading(false);
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  useEffect(() => {
    if (!user && !authLoading) saveGuest(items);
  }, [items, user, authLoading]);

  const add = useCallback(
    async (product: Product, quantity = 1) => {
      const existing = items.find((i) => i.productId === product.id);
      const nextQty = Math.max(1, Math.min(product.stock, (existing?.quantity ?? 0) + quantity));
      const updated: CartItem = {
        productId: product.id,
        quantity: nextQty,
        addedAt: Date.now(),
        title: product.title,
        image: product.images[0] ?? "",
        price: product.price,
        slug: product.slug,
        stock: product.stock,
      };
      setItems((prev) => {
        const others = prev.filter((i) => i.productId !== product.id);
        return [updated, ...others];
      });
      if (user && firebaseConfigured) {
        try {
          await setCartItem(user.uid, product, nextQty);
        } catch (e) {
          toast.error("Could not update cart");
          throw e;
        }
      }
      toast.success(`${product.title} added to cart`);
    },
    [items, user],
  );

  const updateQty = useCallback(
    async (productId: string, quantity: number) => {
      const item = items.find((i) => i.productId === productId);
      if (!item) return;
      const capped = Math.max(0, Math.min(item.stock || quantity, quantity));
      setItems((prev) =>
        capped === 0
          ? prev.filter((i) => i.productId !== productId)
          : prev.map((i) => (i.productId === productId ? { ...i, quantity: capped } : i)),
      );
      if (user && firebaseConfigured) {
        await updateCartQuantity(user.uid, productId, capped, {
          title: item.title,
          image: item.image,
          price: item.price,
          slug: item.slug,
          stock: item.stock,
        });
      }
    },
    [items, user],
  );

  const remove = useCallback(
    async (productId: string) => {
      setItems((prev) => prev.filter((i) => i.productId !== productId));
      if (user && firebaseConfigured) await removeCartItem(user.uid, productId);
    },
    [user],
  );

  const clear = useCallback(async () => {
    setItems([]);
    if (user && firebaseConfigured) await fbClearCart(user.uid);
    else saveGuest([]);
  }, [user]);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((s, i) => s + i.quantity, 0);
    const subtotal =
      Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100;
    return { items, count, subtotal, loading, add, updateQty, remove, clear };
  }, [items, loading, add, updateQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
