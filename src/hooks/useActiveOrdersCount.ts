import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { listOrders } from "@/services/firebase/orders";
import { firebaseConfigured } from "@/services/firebase/config";

export function useActiveOrdersCount(): number {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["orders", "active", user?.uid],
    queryFn: () => listOrders(user!.uid),
    enabled: Boolean(user && firebaseConfigured),
    refetchOnWindowFocus: false,
  });
  if (!data) return 0;
  return data.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length;
}
