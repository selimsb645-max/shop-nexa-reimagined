/**
 * AVENTA SHOP — Wallet transport auth helper.
 *
 * Verifies the Firebase ID token AND that the caller is a registered
 * seller (sellers/{uid} doc exists). Sellers can then access only
 * their OWN wallet/ledger — enforced by passing this uid downstream.
 */

import { verifyIdToken, getProjectId, docPath, batchGetDocs } from "../firebase-admin.server";

export async function verifySellerToken(
  idToken: string,
): Promise<{ uid: string; email: string | null }> {
  const { uid, email } = await verifyIdToken(idToken);
  const projectId = getProjectId();
  const name = docPath(projectId, ["sellers", uid]);
  const docs = await batchGetDocs(projectId, [name]);
  if (!docs.get(name)?.exists) {
    throw new Error("wallet/auth: seller account not found.");
  }
  return { uid, email };
}
