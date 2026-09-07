# Seller Finance v2 — Canonical Rail Migration (Sep 7, 2026)

## What changed

The v2 ledger-backed finance engine (`src/lib/finance/`) is now the **only**
rail that can move NEW seller money. The legacy float-taka rail
(`settlement.server.ts` withdrawals, `withdraw.server.ts`) is **frozen**:

- `requestSettlementWithdrawal` (backend + panel bridge) → always throws
  `finance/legacy-rail-frozen`. The seller Wallet page
  (`requestWalletWithdrawal`) is the only withdrawal path.
- `processSettlementWithdrawal` stays alive **only** to resolve in-flight
  legacy withdrawals. It hard-rejects v2-shaped docs
  (`finance/v2-withdrawal-use-v2-console`) so the legacy writer can never
  touch integer-minor v2 money. After the in-flight queue is drained, set
  `LEGACY_RESOLUTION_FROZEN = true` in `src/lib/finance/rail-mode.server.ts`
  (stage 2 of the freeze).
- `releaseSettlementIfEligible` / `batchReleaseSettlements` skip orders the
  v2 engine already covered (`settlements/st_{orderId}_{sellerId}`) —
  double credit is structurally impossible. Legacy-only orders still release.
- Refund reversal (`reverseSellerSettlement`) keeps its status-conditional
  wallet debit: it only debits what the legacy rail actually credited.
- `users/{uid}/walletTx`, `rewardTx`, `referrals` are now `allow write: if
  false` — no admin client writes to customer money mirrors.

## New tooling (read-only, report-only)

- `runCrossRailReconciliation` / `...All` — flags legacy "available" mirrors
  that are ALSO covered by a v2 settlement (historic double credit),
  status `REQUIRES_MANUAL_REVIEW`. **Never writes.**
- `reportWithdrawalMigration` — maps every legacy withdrawal doc to the v2
  lifecycle (pending→REQUESTED, completed→COMPLETED, rejected→REJECTED),
  converts float-taka → integer-minor, flags in-flight / unknown-status /
  invalid-amount docs for manual review. **Never writes.**
- `runReleaseSweep` (server fn) — v2 release sweep for return-window
  elapsed orders. **Gated**: it refuses to start while double-credit
  conflicts exist, until they are resolved via the reports above.

## Deployment checklist (production)

1. Deploy Firestore rules first: `firebase deploy --only firestore:rules`
   (users walletTx/rewardTx/referrals deny-alls ship in this ruleset).
2. Deploy the backend app (server fns + seller UI freeze).
3. Deploy the admin panel (v2-shaped withdrawal guard).
4. Run `getCrossRailReconciliation` → resolve every
   `REQUIRES_MANUAL_REVIEW` seller manually (credit the missing side once,
   or void the duplicate).
5. Run `getWithdrawalMigrationReport` → resolve flagged in-flight legacy
   withdrawals via the panel (approve/reject still works for legacy docs).
6. Only then: run `runReleaseSweep` (it self-checks for conflicts).

## Rollback

Every freeze is behind a flag or a guard, no data was migrated:

- Reopen legacy withdrawals: set `LEGACY_WITHDRAWALS_FROZEN = false`
  in `src/lib/finance/rail-mode.server.ts`, redeploy backend + revert the
  seller.settlements.tsx UI change.
- Reopen panel processing: revert the `amountMinor` guard commit.
- Rules: redeploy the previous ruleset (49eb3463) if the deny-alls break a
  live flow — the reports + engine changes are independent of rules.

Stage 2 (permanent freeze of in-flight resolution) should only be flipped
after the in-flight queue is verifiably empty.
