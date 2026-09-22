import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const restockSchema = z.object({
  idToken: z.string().min(10),
  productId: z.string().min(1).max(200),
  newStock: z.number().int().min(0).max(1_000_000),
});

/**
 * Seller sets total stock for one of their own products. Goes through
 * the Admin SDK (see seller-inventory.server.ts) because Firestore
 * rules block ALL client SDK writes to products.stock.
 */
export const restockProduct = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => restockSchema.parse(data))
  .handler(async ({ data }) => {
    const { restockProductServer } = await import("./seller-inventory.server");
    const result = await restockProductServer(data.idToken, data.productId, data.newStock);
    return result;
  });
