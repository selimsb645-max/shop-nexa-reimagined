/**
 * PATCH: firestore.rules — Settlement Protection
 *
 * Add these rules to your existing firestore.rules file.
 * These ensure that settlement data is NEVER writable by clients.
 */

// ====================================================================
// ADD TO firestore.rules (inside the sellers block):
// ====================================================================

/*

    // ---- SETTLEMENT RULES ----
    // Settlement ledger entries are APPEND-ONLY and server-side only.
    // Clients (including sellers) can only READ their own settlement data.
    // No client may create, update, or delete settlement entries.
    
    match /sellers/{sellerId}/settlementTx/{txId} {
      // Sellers can read their own immutable settlement ledger
      allow read: if isSelf(sellerId) || isAdmin();
      // ALL writes are server-side only (service account bypasses rules)
      allow create, update, delete: if false;
    }
    
    // Seller orders WITH settlement data — sellers can update status/tracking
    // but CANNOT touch settlement fields
    match /sellers/{sellerId}/orders/{orderId} {
      allow read: if isSelf(sellerId) || isAdmin();
      // Created by server-side checkout only
      allow create: if false;
      // Sellers can update order status/tracking but NOT settlement fields
      allow update: if isApprovedSeller() && request.auth.uid == sellerId
        && !request.resource.data.diff(resource.data).affectedKeys()
             .hasAny([
               'settlement',
               'earnings',
               'commission',
               'commissionRate',
               'discountShare',
               'shippingShare',
               'netSubtotal',
               'subtotal'
             ])
        && !request.resource.data.diff(resource.data).affectedKeys()
             .hasAny(['paymentStatus', 'paymentMethod']);
      // Admin can update anything
      allow update: if isAdmin();
      allow delete: if false;
    }
    
    // Withdrawals — created by server function, status updated by admin
    match /sellers/{sellerId}/withdrawals/{withdrawalId} {
      allow read: if isSelf(sellerId) || isAdmin();
      allow create: if false; // Server-side only
      allow update: if false; // Server-side only (admin actions go through server fn)
      allow delete: if false;
    }
    
    // Wallet ledger — append-only, server-side
    match /sellers/{sellerId}/walletTx/{txId} {
      allow read: if isSelf(sellerId) || isAdmin();
      allow create, update, delete: if false; // Server-side only
    }

*/

// ====================================================================
// Also update the existing seller order update rule to add the
// settlement field protection. Find this block:
//
//   match /sellers/{sellerId}/orders/{orderId} {
//     allow read, write: if isApprovedSeller() && request.auth.uid == sellerId;
//   }
//
// And REPLACE with the version above that blocks settlement field edits.
// ====================================================================
