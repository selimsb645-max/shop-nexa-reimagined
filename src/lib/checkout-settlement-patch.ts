/**
 * PATCH: checkout.server.ts — Settlement Integration
 *
 * This file shows the changes needed in the existing checkout.server.ts
 * to integrate the settlement architecture.
 *
 * In the "Seller mirrors + notifications" section (currently around line 380+),
 * replace the seller order write with settlement-enabled writes.
 *
 * Also add the settlement pending ledger entry for each seller.
 */

// ====================================================================
// INTEGRATION INSTRUCTIONS:
// ====================================================================
//
// In checkout.server.ts, REPLACE this block:
//
//   for (const [sid, sItems] of itemsBySeller.entries()) {
//     const sellerSubtotal = round2(sItems.reduce((s, it) => s + it.subtotal, 0));
//     const commissionRate = sellerCommissionRates.get(sid) ?? 0.08;
//     const commission = round2(sellerSubtotal * commissionRate);
//     const sellerEarnings = round2(sellerSubtotal - commission);
//     writes.push({ /* seller order mirror */ });
//     writes.push({ /* notification */ });
//   }
//
// WITH this:
//
//   import { computeSellerSettlement, buildSellerOrderWrite, buildSettlementPendingTxWrite } from "./settlement.server";
//
//   for (const [sid, sItems] of itemsBySeller.entries()) {
//     const sellerSubtotal = round2(sItems.reduce((s, it) => s + it.subtotal, 0));
//     const commissionRate = sellerCommissionRates.get(sid) ?? 0.08;
//
//     // Compute full settlement breakdown
//     const settlement = computeSellerSettlement({
//       sellerId: sid,
//       orderId,
//       sellerSubtotal,
//       orderSubtotal: subtotal,
//       orderDiscount: discount,
//       orderShipping: shipping,
//       commissionRate,
//       nowMs,
//     });
//
//     // Seller order mirror WITH settlement data
//     writes.push(buildSellerOrderWrite({
//       projectId,
//       sellerId: sid,
//       orderId,
//       buyerId: req.uid,
//       buyerName: req.shippingAddress.fullName,
//       buyerEmail: req.buyerEmail,
//       items: sItems,
//       settlement,
//       paymentMethod: req.paymentMethod,
//       paymentStatus,
//       shippingAddress: req.shippingAddress,
//       nowMs,
//     }));
//
//     // Immutable settlement ledger: pending entry
//     writes.push(buildSettlementPendingTxWrite({
//       projectId,
//       sellerId: sid,
//       orderId,
//       sellerEarnings: settlement.sellerNetEarnings,
//       nowMs,
//     }));
//
//     // Seller notification
//     writes.push({
//       update: {
//         name: docPath(projectId, ["sellers", sid, "notifications", newDocId()]),
//         fields: toFsFields({
//           type: "order",
//           title: "New order received",
//           message: `Order #${orderId.slice(0, 8)} · ${sItems.length} item${sItems.length > 1 ? "s" : ""}`,
//           link: `/seller/orders/${orderId}`,
//           read: false,
//           createdAt: nowMs,
//         }),
//       },
//     });
//   }
// ====================================================================

// This file is documentation-only. Apply the changes above to the real
// checkout.server.ts in your repo.
