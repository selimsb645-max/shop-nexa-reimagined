# My Services — independent pages, no sidebar

## What I found

The old sidebar menu (`AppShell`) is already unused — no service page renders it. All eight
services already open as their own full-screen pages with the orange header, back arrow to
`/account`, footer and mobile bottom bar (`ServicePageLayout`), and all read live data.

So the remaining work is: delete the dead sidebar file for good, add the missing sections the
brief asks for on each page, and give every page a proper loading skeleton, empty state and
error state.

## Changes per page

**Wallet** — keep balance and transaction history; add a Cashback earned total next to
credited/spent, and a Withdraw button that is present but disabled with a "Coming soon" note
so it is ready for later.

**Vouchers** — split into three tabs: Available, Used, Expired. Used vouchers come from the
codes actually applied on the customer's past orders; expired ones from voucher end dates.

**Rewards** — keep points balance and tier; split the activity list into Earn history and
Redeem history tabs.

**Refer & Earn** — already has code, link, invited friends and earnings; add the missing
loading skeleton and error state.

**Messages** — already an independent inbox with unread badges and its own conversation page;
add skeleton and error state.

**Addresses** — already lists, adds, edits and deletes saved addresses; add skeleton and
error state.

**Notifications** — already a timeline with mark-as-read and real unread count; add skeleton
and error state.

**Be a Seller** — new dedicated page: introduction, benefits list, and an Apply button that
starts the existing seller registration flow. The Account service card and banner point here
instead of jumping straight into the form.

## Kept exactly as-is

Colors, spacing, typography, animations, branding, Firestore data and all existing routes.
Nothing in checkout, products, seller or admin areas is touched.

## Technical notes

- Remove `src/components/layout/AppShell.tsx` (dead sidebar shell).
- New `src/routes/_authenticated/be-a-seller.tsx`; update the two links in `account.tsx`.
- New `listCustomerVouchers(uid)` in `src/services/firebase/customerCoupons.ts` returning
  available / used / expired buckets, using coupon docs plus the customer's order coupon codes.
- Shared `ServiceSkeleton` / `ServiceError` blocks in `src/components/common/` so every page
  uses the same premium placeholders.
- Verify with typecheck and a browser pass over each route.
