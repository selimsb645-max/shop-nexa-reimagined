# Firebase Billing Requirements — AVENTA Architecture Analysis

*Written Sep 7, 2026 (19:15 Dhaka). Project: `studio-6202246915-3b319` ("AVENTA SHOP").*

## Current verified status (Sep 7, 2026)

`firebase deploy --only firestore:rules` **SUCCEEDED** from this repo at 19:15
Dhaka — the full hardened ruleset (money collections deny-all, legacy
`users/{uid}/walletTx` writes denied, finance/campaign/QC locks) is now
**LIVE in production**. Rules compiled with only unused-function warnings
and released cleanly.

Important nuance: a Firestore *rules* deploy does **not** require billing
(it works on the free Spark plan too). So this success proves the earlier
deploy blocker no longer reproduces for this operation, but it does **not**
by itself prove the billing account is active for billable operations
(Storage, Cloud Functions, Firestore paid usage). Do not assume billing is
fully enabled — verify with a billable-op probe before relying on it.

History: Sep 5–6 deploys of the same command failed with a billing-account
error ("Firebase billing account is disabled"). The project is on Blaze;
a Blaze project whose linked billing account is disabled fails billable
operations across the board. That state no longer reproduces for rules.

## Which Firebase operations require billing, and why

| Operation | Billing required? | Why |
|---|---|---|
| Cloud Functions for Firebase (gen1 & gen2) deploy | **YES — Blaze plan** | Functions build on Cloud Build and run on Cloud Run; Google requires a linked billing account even when usage stays inside the always-free tier. Typical error: "Billing must be enabled for this project". |
| Cloud Storage for Firebase — provisioning a (default) bucket | **YES — Blaze plan** | Google policy change: since Oct 30, 2024 new buckets (including the default bucket) can only be provisioned on Blaze; access to pre-existing buckets also requires Blaze since Oct 1, 2025. |
| Firestore — usage beyond free tier | **YES** | Spark free tier: 50K doc reads / 20K writes / 20K deletes per day, 1 GiB stored, 10 GiB/month egress. Beyond that, pay-as-you-go (Blaze) only. |
| Firestore — named (non-default) databases | **YES** | Official pricing: "To create a named (non-default) database, you must enable billing. There's no free quota for named databases." |
| Firebase Phone Authentication (SMS) | **YES** | Billed per SMS; cannot enable on Spark. |
| Cloud Run / App Hosting / paid networking egress | **YES** | GCP compute products require a billing account. |
| Blaze project with DISABLED billing account | everything billable fails | This was AVENTA's actual blocker state — the account exists but suspended; all billing-gated APIs reject. |

Operations that do NOT require billing (free on Spark):

- Firebase Authentication (email + social/Google sign-in — unlimited users).
- Firestore DEFAULT database within the daily free quotas.
- Firestore **rules + indexes deploys** (`firebase deploy --only firestore:rules` / `firestore:indexes` — management API, free). Verified live Sep 7.
- Cloud Messaging (FCM) push notifications — free on both plans.
- Firebase Hosting (10 GiB/month bandwidth) — not used by AVENTA (Vercel).
- Firebase Emulator Suite — local, free.
- Analytics / Remote Config / Crashlytics — free.

## AVENTA architecture — what runs without billing, what doesn't

### Runs WITHOUT billing ✅

1. **All three web apps (customer storefront, seller portal, admin panel)
   hosting** — deployed on Vercel, not Firebase. Zero Firebase billing
   dependency.
2. **All server-side business logic** — TanStack Start server functions run
   on Vercel/Nitro (Node), NOT Firebase Cloud Functions. The single biggest
   Blaze requirement in Firebase therefore does not apply to this
   architecture. This was an intentional design choice.
3. **Firebase Auth** (email + social) — free.
4. **Firestore default database** — free tier (50K reads / 20K writes /
   20K deletes / day, 1 GiB). Sufficient for early production traffic;
   NOT sufficient for marketplace scale — a Daraz-style storefront blows
   through 50K reads/day with a few hundred visitors (every page load
   reads dozens of documents; em dash feeds and admin tables read more).
   Crossing the quota without Blaze = database writes/reads rejected.
5. **Firestore security rules + indexes deploys** — free (rules verified
   live Sep 7; indexes deploy pending, also free).
6. **FCM web push notifications** — free.
7. **All automations** (Facebook posting, Sheets sync, scheduled jobs) run
   on Base44 agent workflows — no Firebase scheduled functions, no
   dependency.

### Blocked or limited WITHOUT billing ❌

1. **Cloud Storage — product images + avatars** (`ProductForm.tsx`,
   `edit-profile.tsx`, `seller.settings.tsx` use Firebase Storage).
   Bucket provisioning requires Blaze (2024 policy). If AVENTA's bucket
   predates Oct 2024, access still required Blaze by Oct 1, 2025.
   → **This is the architecture's one hard billing dependency.** Without
   billing, image upload/download in production fails.
   Mitigation option: move images to Vercel Blob / another CDN and drop
   the Storage dependency, or enable billing.
2. **Firestore at scale** — past 50K reads/20K writes per day the default
   DB stops serving (Spark) or starts billing (Blaze). A multi-vendor
   marketplace will need Blaze eventually.
3. **Phone/SMS login** (if ever added) — Blaze + per-SMS cost.
4. **Named Firestore databases** — not used by AVENTA today; would need
   billing if adopted.
5. **Cloud Functions** — not used today (Vercel instead); would need
   Blaze if adopted.

## Bottom line

AVENTA's architecture was deliberately built so that the only hard
production dependency on Firebase billing is **Cloud Storage (images)**
and, at scale, **Firestore quotas**. Auth, rules, indexes, push, hosting,
and all server logic run without a billing requirement.

The Sep 7 rules deploy succeeded, so the gate sequence
(`docs/finance-v2-canonical-rail.md`) has completed step 1. Still pending:
storage rules deploy (`firebase deploy --only storage` — needs the bucket
and therefore confirms whether billable ops work now), Firestore indexes
deploy (free), and the production app deploys before the reconciliation /
migration reports can run.
