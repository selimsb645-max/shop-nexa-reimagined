/**
 * Seeds the local Firebase emulators (auth + firestore) with audit data
 * for the Aventa responsive UI sanity audit. NEVER touches production.
 *
 *   node scripts/seed-emulator.mjs
 */
const PROJECT = "studio-6202246915-3b319";
const AUTH = "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

const now = Date.now();

// ── helpers ─────────────────────────────────────────────────────────
const v = {
  s: (x) => ({ stringValue: String(x) }),
  n: (x) => ({ integerValue: String(Math.round(x)) }),
  f: (x) => ({ doubleValue: Number(x) }),
  b: (x) => ({ booleanValue: !!x }),
  arr: (xs) => ({ arrayValue: { values: xs } }),
  strArr: (xs) => v.arr(xs.map(v.s)),
  map: (m) => ({ mapValue: { fields: fsFields(m) } }),
  null: () => ({ nullValue: null }),
};
function fsFields(obj) {
  const out = {};
  for (const [k, val] of Object.entries(obj)) out[k] = val;
  return out;
}

async function putDoc(path, fields) {
  const res = await fetch(`${FS}/${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`seed ${path}: ${res.status} ${await res.text()}`);
}

async function makeUser(email, password, displayName) {
  const res = await fetch(AUTH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
  });
  let uid;
  if (res.ok) {
    uid = (await res.json()).localId;
  } else {
    const signin = await fetch(
      "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
    );
    uid = (await signin.json()).localId;
  }
  console.log(`auth user ${email} -> ${uid}`);
  return uid;
}

// ── auth users ──────────────────────────────────────────────────────
const ADMIN = await makeUser("admin@aventa.test", "audit-pass-123", "Aventa Admin");
const SELLER = await makeUser("seller@aventa.test", "audit-pass-123", "Dhaka Gadgets");
const CUSTOMER = await makeUser("customer@aventa.test", "audit-pass-123", "Rahim Uddin");

// ── users/{uid} ─────────────────────────────────────────────────────
await putDoc(`users/${ADMIN}`, {
  role: v.s("admin"),
  adminRole: v.s("super_admin"),
  blocked: v.b(false),
  displayName: v.s("Aventa Admin"),
  email: v.s("admin@aventa.test"),
  photoURL: v.null(),
  createdAt: v.n(now),
  updatedAt: v.n(now),
});
await putDoc(`users/${SELLER}`, {
  role: v.s("seller"),
  adminRole: v.null(),
  blocked: v.b(false),
  displayName: v.s("Dhaka Gadgets"),
  email: v.s("seller@aventa.test"),
  photoURL: v.null(),
  createdAt: v.n(now),
  updatedAt: v.n(now),
});
await putDoc(`users/${CUSTOMER}`, {
  role: v.s("customer"),
  blocked: v.b(false),
  displayName: v.s("Rahim Uddin"),
  email: v.s("customer@aventa.test"),
  createdAt: v.n(now),
});

// ── sellers/{uid} ───────────────────────────────────────────────────
await putDoc(`sellers/${SELLER}`, {
  uid: v.s(SELLER),
  shopName: v.s("Dhaka Gadgets BD"),
  shopSlug: v.s("dhaka-gadgets-bd"),
  description: v.s("Authentic gadgets and electronics with warranty."),
  logoUrl: v.null(),
  bannerUrl: v.null(),
  phone: v.s("+8801711223344"),
  email: v.s("seller@aventa.test"),
  addressLine: v.s("House 12, Road 5, Dhanmondi"),
  city: v.s("Dhaka"),
  area: v.s("Dhanmondi"),
  country: v.s("Bangladesh"),
  postalCode: v.s("1209"),
  status: v.s("approved"),
  currentStep: v.s("completed"),
  termsAccepted: v.b(true),
  termsAcceptedAt: v.n(now - 90 * 864e5),
  submittedAt: v.n(now - 85 * 864e5),
  approvedAt: v.n(now - 80 * 864e5),
  commissionRate: v.f(0.1),
  totalEarnings: v.f(125000),
  availableBalance: v.f(48000),
  pendingBalance: v.f(22000),
  withdrawnTotal: v.f(55000),
  bankInfo: v.map({
    bankName: v.s("BRAC Bank"),
    accountName: v.s("Dhaka Gadgets BD"),
    accountNumber: v.s("1501203344556"),
    branch: v.s("Dhanmondi"),
  }),
  verified: v.b(true),
  totalProducts: v.n(8),
  totalOrders: v.n(34),
  rating: v.f(4.6),
  ratingCount: v.n(41),
  followers: v.n(320),
  createdAt: v.n(now - 90 * 864e5),
  updatedAt: v.n(now - 864e5),
});

// ── cleanup stale docs from previous seed versions ─────────────────
async function delDoc(path) {
  await fetch(`${FS}/${path}`, {
    method: "DELETE",
    headers: { authorization: "Bearer owner" },
  }).catch(() => {});
}
for (let i = 1; i <= 6; i++) {
  await delDoc(`orders/ord-audit-${String(i).padStart(2, "0")}`);
}
await delDoc("withdrawals/wd-02");
await delDoc(`sellerLedger/led_${SELLER}_sample01`);

// ── categories ──────────────────────────────────────────────────────
const CATS = [
  ["electronics", "Electronics", 1],
  ["fashion", "Fashion", 2],
  ["home-living", "Home & Living", 3],
  ["beauty", "Beauty & Care", 4],
];
for (const [id, name, order] of CATS) {
  await putDoc(`categories/${id}`, {
    name: v.s(name),
    slug: v.s(id),
    image: v.null(),
    order: v.n(order),
    commissionRate: v.f(0.0645),
  });
}

// ── products ────────────────────────────────────────────────────────
const PRODUCTS = [
  [
    "prd-01",
    "Wireless Earbuds Pro",
    "wireless-earbuds-pro",
    "electronics",
    "published",
    2450,
    42,
    4.5,
  ],
  ["prd-02", "Smart Watch X9", "smart-watch-x9", "electronics", "published", 5990, 18, 4.7],
  [
    "prd-03",
    "Bluetooth Speaker Mini",
    "bluetooth-speaker-mini",
    "electronics",
    "published",
    1899,
    60,
    4.2,
  ],
  [
    "prd-04",
    "Power Bank 20000mAh",
    "power-bank-20000mah",
    "electronics",
    "published",
    2150,
    8,
    4.4,
  ],
  ["prd-05", "USB-C Fast Charger", "usb-c-fast-charger", "electronics", "draft", 990, 100, 0],
  [
    "prd-06",
    "Cotton Panjabi Classic",
    "cotton-panjabi-classic",
    "fashion",
    "published",
    1750,
    25,
    4.1,
  ],
  ["prd-07", "Table Lamp Warm", "table-lamp-warm", "home-living", "published", 1250, 12, 4.0],
  ["prd-08", "Hair Dryer Ionic", "hair-dryer-ionic", "beauty", "archived", 3200, 5, 3.9],
];
for (const [id, title, slug, cat, status, price, stock, rating] of PRODUCTS) {
  await putDoc(`products/${id}`, {
    title: v.s(title),
    slug: v.s(slug),
    shortDescription: v.s(`${title} — genuine product with warranty.`),
    description: v.s(
      `${title}. Imported authentic product. 7-day replacement warranty. Cash on delivery available nationwide.`,
    ),
    brand: v.s("Aventa"),
    price: v.f(price),
    compareAtPrice: v.f(price * 1.25),
    costPrice: v.f(price * 0.7),
    tax: v.f(0),
    images: v.strArr([]),
    categoryId: v.s(cat),
    categorySlug: v.s(cat),
    subcategoryId: v.null(),
    subcategorySlug: v.null(),
    stock: v.n(stock),
    rating: v.f(rating),
    reviewCount: v.n(Math.round(rating * 3)),
    tags: v.strArr(["aventa", cat]),
    featured: v.b(status === "published" && rating > 4.3),
    freeDelivery: v.b(false),
    sellerId: v.s(SELLER),
    sku: v.s(`SKU-${id.toUpperCase()}`),
    status: v.s(status),
    createdAt: v.n(now - 30 * 864e5),
    updatedAt: v.n(now - 864e5),
  });
}

// ── orders ──────────────────────────────────────────────────────────
// Real schema (audited):
//   customer copy → users/{CUSTOMER}/orders/{id}  (lowercase status)
//   seller mirror → sellers/{SELLER}/orders/{id}  (+ settlement map)
//   admin list    → collectionGroup("orders"), filtered to users/* parents
const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const SETTLEMENT_STATUSES = ["released", "released", "hold", "hold", "pending", "reversed"];
const orderItem = (pid, qty) =>
  v.map({
    productId: v.s(pid),
    title: v.s(PRODUCTS.find((p) => p[0] === pid)[1]),
    image: v.s(""),
    price: v.f(PRODUCTS.find((p) => p[0] === pid)[5]),
    quantity: v.n(qty),
    sellerId: v.s(SELLER),
    slug: v.s(PRODUCTS.find((p) => p[0] === pid)[2]),
    stock: v.n(99),
  });
const sellerItem = (pid, qty) => {
  const price = PRODUCTS.find((p) => p[0] === pid)[5];
  return v.map({
    productId: v.s(pid),
    title: v.s(PRODUCTS.find((p) => p[0] === pid)[1]),
    price: v.f(price),
    quantity: v.n(qty),
    subtotal: v.f(price * qty),
    sellerId: v.s(SELLER),
    slug: v.s(PRODUCTS.find((p) => p[0] === pid)[2]),
  });
};
for (let i = 0; i < 6; i++) {
  const oid = `ord-audit-${String(i + 1).padStart(2, "0")}`;
  const pid = `prd-0${(i % 4) + 1}`;
  const qty = 1 + (i % 3);
  const price = PRODUCTS.find((p) => p[0] === pid)[5];
  const subtotal = Math.round(price * qty);
  const commission = Math.round(subtotal * 0.1);
  const earnings = subtotal - commission;
  const status = ORDER_STATUSES[i];
  const setStatus = SETTLEMENT_STATUSES[i];
  const createdAt = now - i * 864e5 - 3600e3;
  const addr = v.map({
    fullName: v.s("Rahim Uddin"),
    name: v.s("Rahim Uddin"),
    phone: v.s("+8801811223344"),
    addressLine: v.s("Flat 4B, Road 7, Banani"),
    city: v.s("Dhaka"),
    area: v.s("Banani"),
    postalCode: v.s("1213"),
    country: v.s("Bangladesh"),
  });

  // customer copy — users/{CUSTOMER}/orders
  await putDoc(`users/${CUSTOMER}/orders/${oid}`, {
    userId: v.s(CUSTOMER),
    userName: v.s("Rahim Uddin"),
    userPhone: v.s("+8801811223344"),
    items: v.arr([orderItem(pid, qty)]),
    subtotal: v.f(subtotal),
    discount: v.f(0),
    shipping: v.f(60),
    tax: v.f(0),
    taxRate: v.f(0),
    taxLabel: v.s("VAT"),
    total: v.f(subtotal + 60),
    platformFee: v.f(commission),
    promoDiscount: v.f(0),
    rewardDiscount: v.f(0),
    walletUsed: v.f(0),
    couponCode: v.null(),
    promoCode: v.null(),
    status: v.s(status),
    payment: v.map({
      method: v.s(i % 2 ? "bkash" : "cash_on_delivery"),
      status: v.s(status === "cancelled" ? "unpaid" : "paid"),
      provider: v.null(),
      transactionId: v.s(`TXN-AUDIT-${i}`),
      paidAt: v.n(status === "cancelled" ? 0 : createdAt + 600e3),
    }),
    shippingAddress: addr,
    deliveryZone: v.s("INSIDE_DHAKA"),
    deliveryZoneLabel: v.s("Inside Dhaka"),
    deliveryCharge: v.f(60),
    tracking: v.arr([]),
    createdAt: v.n(createdAt),
    updatedAt: v.n(now - i * 432e5),
  });

  // seller mirror — sellers/{SELLER}/orders (+ settlement fields)
  await putDoc(`sellers/${SELLER}/orders/${oid}`, {
    id: v.s(oid),
    sellerId: v.s(SELLER),
    buyerId: v.s(CUSTOMER),
    buyerName: v.s("Rahim Uddin"),
    buyerEmail: v.s("customer@aventa.test"),
    items: v.arr([sellerItem(pid, qty)]),
    subtotal: v.f(subtotal),
    discount: v.f(0),
    tax: v.f(0),
    taxLabel: v.s("VAT"),
    platformFee: v.f(commission),
    commission: v.f(commission),
    earnings: v.f(earnings),
    total: v.f(subtotal + 60),
    status: v.s(status),
    paymentMethod: v.s(i % 2 ? "bkash" : "cash_on_delivery"),
    paymentStatus: v.s(status === "cancelled" ? "unpaid" : "paid"),
    tracking: v.arr([]),
    shipping: v.map({
      courier: v.s(status === "shipped" || status === "delivered" ? "Pathao" : null),
      trackingNumber: v.s(status === "shipped" || status === "delivered" ? "PTH-8834210" : null),
      shippingCharge: v.f(60),
      status: v.s(status),
      shippedAt: v.n(status === "shipped" || status === "delivered" ? createdAt + 864e5 : null),
      deliveredAt: v.n(status === "delivered" ? createdAt + 3 * 864e5 : null),
      estimatedDays: v.n(3),
      warehouseId: v.null(),
    }),
    shippingAddress: addr,
    settlement: v.map({
      settlementStatus: v.s(setStatus),
      sellerSubtotal: v.f(subtotal),
      commissionAmount: v.f(commission),
      sellerNetEarnings: v.f(earnings),
      holdUntil: v.n(now + 5 * 864e5),
      releasedAt: v.n(setStatus === "released" ? createdAt + 7 * 864e5 : null),
    }),
    createdAt: v.n(createdAt),
    updatedAt: v.n(now - i * 432e5),
  });
}

// ── QC reviews ──────────────────────────────────────────────────────
await putDoc("qcReviews/qcr-01", {
  reviewId: v.s("qcr-01"),
  productId: v.s("prd-05"),
  productTitle: v.s("USB-C Fast Charger"),
  sellerUid: v.s(SELLER),
  status: v.s("PENDING_REVIEW"),
  checklist: v.arr([
    v.map({ id: v.s("title"), label: v.s("Title quality"), pass: v.b(true), note: v.s("") }),
    v.map({
      id: v.s("images"),
      label: v.s("Images"),
      pass: v.b(false),
      note: v.s("No images uploaded"),
    }),
    v.map({ id: v.s("description"), label: v.s("Description"), pass: v.b(true), note: v.s("") }),
  ]),
  reviewerUid: v.null(),
  failReasons: v.strArr([]),
  decision: v.null(),
  reviewerNote: v.null(),
  submittedAt: v.n(now - 3600e3),
  reviewedAt: v.null(),
  listedAt: v.null(),
});
await putDoc("qcReviews/qcr-02", {
  reviewId: v.s("qcr-02"),
  productId: v.s("prd-03"),
  productTitle: v.s("Bluetooth Speaker Mini"),
  sellerUid: v.s(SELLER),
  status: v.s("APPROVED"),
  checklist: v.arr([]),
  reviewerUid: v.s(ADMIN),
  failReasons: v.strArr([]),
  decision: v.s("APPROVED"),
  reviewerNote: v.s("Looks good."),
  submittedAt: v.n(now - 3 * 864e5),
  reviewedAt: v.n(now - 2 * 864e5),
  listedAt: v.n(now - 2 * 864e5),
});

// ── wallet: sellerFinance + walletTx + withdrawals ───────────────────
await putDoc(`sellerFinance/${SELLER}`, {
  availableMinor: v.n(4800000),
  heldMinor: v.n(2200000),
  totalEarnedMinor: v.n(12500000),
  paidOutMinor: v.n(3000000),
  entrySeq: v.n(6),
  status: v.s("ACTIVE"),
  currency: v.s("BDT"),
  updatedAt: v.n(now - 864e5),
  lastEntryAt: v.n(now - 2 * 864e5),
  lastEntryType: v.s("ORDER_CREDIT"),
});
// v1 wallet (readSellerFinancials): amount is signed taka, status/type strings
const WTXS = [
  ["sale", 24500, "ord-audit-01 settled", 6],
  ["sale", 59900, "ord-audit-02 settled", 5],
  ["sale", 3798, "ord-audit-03 settled", 4],
  ["sale", 4300, "ord-audit-04 settled", 3],
  ["withdrawal", -30000, "Bank payout BRAC ****3456", 2],
  ["sale", 3500, "ord-audit-06 settled", 1],
];
for (const [type, amount, note, dAgo] of WTXS) {
  await putDoc(`sellers/${SELLER}/walletTx/tx-${String(dAgo).padStart(3, "0")}`, {
    type: v.s(type),
    amount: v.f(amount),
    status: v.s("completed"),
    note: v.s(note),
    createdAt: v.n(now - dAgo * 864e5),
  });
}

// v1 settlementTx ledger (seller Earnings/Settlements "recent transactions")
const STXS = [
  ["sale", "ord-audit-01", 24500, 22050, "released", 6],
  ["commission", "ord-audit-01", -2450, 22050, "released", 6],
  ["sale", "ord-audit-03", 3798, 3418, "hold", 4],
  ["withdrawal", null, -30000, 0, "completed", 2],
  ["sale", "ord-audit-06", 3500, 3150, "pending", 1],
];
for (const [type, oid, amount, se, st, dAgo] of STXS) {
  await putDoc(`sellers/${SELLER}/settlementTx/stx-${String(dAgo).padStart(2, "0")}-${type}`, {
    type: v.s(type),
    orderId: oid ? v.s(oid) : v.null(),
    amount: v.f(amount),
    sellerEarnings: v.f(se),
    settlementStatus: v.s(st),
    note: v.s(""),
    createdBy: v.s("system"),
    createdAt: v.n(now - dAgo * 864e5),
  });
}

// v2 sellerLedger (wallet page): transactionId/seq/balance* chain —
// ends at availableMinor 4,800,000 / heldMinor 2,200,000
const LEDGER = [
  [1, "ORDER_CREDIT", "CREDIT", 3800000, "ord-audit-01", 0, 3800000, 0, 0, 6],
  [2, "ORDER_CREDIT", "CREDIT", 8700000, "ord-audit-03", 3800000, 12500000, 0, 0, 5],
  [3, "COMMISSION_DEBIT", "DEBIT", -1250000, null, 12500000, 11250000, 0, 0, 5],
  [4, "SETTLEMENT_HOLD", "DEBIT", -2200000, "ord-audit-04", 11250000, 9050000, 0, 2200000, 3],
  [5, "PAYOUT", "DEBIT", -3000000, null, 9050000, 6050000, 2200000, 2200000, 2],
  [6, "REFUND_DEBIT", "DEBIT", -1250000, "ord-audit-05", 6050000, 4800000, 2200000, 2200000, 1],
];
for (const [seq, type, dir, amount, oid, bB, bA, hB, hA, dAgo] of LEDGER) {
  await putDoc(`sellerLedger/led-${String(seq).padStart(3, "0")}`, {
    transactionId: v.s(`txn-ledger-${String(seq).padStart(3, "0")}`),
    seq: v.n(seq),
    sellerId: v.s(SELLER),
    type: v.s(type),
    amountMinor: v.n(Math.abs(amount)),
    currency: v.s("BDT"),
    orderId: oid ? v.s(oid) : v.null(),
    reference: v.null(),
    direction: v.s(dir),
    status: v.s("COMPLETED"),
    createdBy: v.s("system"),
    balanceBefore: v.n(bB),
    balanceAfter: v.n(bA),
    heldBefore: v.n(hB),
    heldAfter: v.n(hA),
    createdAt: v.n(now - dAgo * 864e5),
  });
}

await putDoc(`sellers/${SELLER}/withdrawals/wd-01`, {
  withdrawalId: v.s("wd-01"),
  sellerId: v.s(SELLER),
  amountMinor: v.n(3000000),
  currency: v.s("BDT"),
  status: v.s("COMPLETED"),
  method: v.s("bank"),
  destination: v.s("BRAC Bank 1501****3456"),
  note: v.null(),
  requestedAt: v.n(now - 10 * 864e5),
  processedAt: v.n(now - 8 * 864e5),
  processedBy: v.s(ADMIN),
});
await putDoc(`sellers/${SELLER}/withdrawals/wd-02`, {
  withdrawalId: v.s("wd-02"),
  sellerId: v.s(SELLER),
  amountMinor: v.n(1500000),
  currency: v.s("BDT"),
  status: v.s("REQUESTED"),
  method: v.s("bkash"),
  destination: v.s("bkash 01711223344"),
  note: v.null(),
  requestedAt: v.n(now - 432e5),
});
// ── settlements + ledger ────────────────────────────────────────────
for (const [oid, status, amount] of [
  ["ord-audit-01", "HELD", 405000],
  ["ord-audit-03", "RELEASED", 1080000],
]) {
  const sid = `st_${oid}_${SELLER}`;
  await putDoc(`settlements/${sid}`, {
    settlementId: v.s(sid),
    orderId: v.s(oid),
    sellerId: v.s(SELLER),
    status: v.s(status),
    grossMinor: v.n(Math.round(amount * 1.1)),
    commissionMinor: v.n(Math.round(amount * 0.1)),
    netMinor: v.n(amount),
    currency: v.s("BDT"),
    holdUntil: v.n(now + 5 * 864e5),
    createdAt: v.n(now - 4 * 864e5),
    updatedAt: v.n(now - 864e5),
  });
}
// ── coupons / promo codes ───────────────────────────────────────────
await putDoc("coupons/SAVE100", {
  code: v.s("SAVE100"),
  type: v.s("fixed"),
  value: v.f(100),
  minOrder: v.f(500),
  maxDiscount: v.null(),
  productIds: v.strArr([]),
  sellerId: v.null(),
  startDate: v.n(now - 7 * 864e5),
  endDate: v.n(now + 30 * 864e5),
  usageLimit: v.n(500),
  usedCount: v.n(42),
  perCustomerLimit: v.n(1),
  active: v.b(true),
  createdAt: v.n(now - 7 * 864e5),
});
await putDoc("coupons/GADGET15", {
  code: v.s("GADGET15"),
  type: v.s("percent"),
  value: v.f(15),
  minOrder: v.f(1000),
  maxDiscount: v.f(300),
  productIds: v.strArr(["prd-01", "prd-02"]),
  sellerId: v.s(SELLER),
  startDate: v.n(now - 2 * 864e5),
  endDate: v.n(now + 14 * 864e5),
  usageLimit: v.n(100),
  usedCount: v.n(7),
  perCustomerLimit: v.n(2),
  active: v.b(true),
  createdAt: v.n(now - 2 * 864e5),
});

// ── flash sale campaigns ────────────────────────────────────────────
await putDoc("flashSales/camp-01", {
  campaignId: v.s("camp-01"),
  title: v.s("Eid Electronics Flash Sale"),
  status: v.s("SCHEDULED"),
  startAt: v.n(now + 2 * 864e5),
  endAt: v.n(now + 3 * 864e5),
  discountPercent: v.f(20),
  productIds: v.strArr(["prd-01", "prd-02"]),
  createdBy: v.s(ADMIN),
  createdAt: v.n(now - 864e5),
});

// ── announcements / banners / delivery zones ────────────────────────
await putDoc("announcements/ann-01", {
  title: v.s("Eid Sale is live"),
  message: v.s("Up to 50% off on electronics this week!"),
  type: v.s("promo"),
  priority: v.s("high"),
  gradient: v.s("from-orange-500 to-amber-500"),
  icon: v.s("megaphone"),
  ctaLabel: v.s("Shop now"),
  ctaLink: v.s("/shop"),
  active: v.b(true),
  createdAt: v.n(now - 2 * 864e5),
});
await putDoc("banners/ban-01", {
  title: v.s("Gadget Fest"),
  subtitle: v.s("Best deals on earbuds & watches"),
  imageUrl: v.s(""),
  ctaLabel: v.s("Shop"),
  ctaLink: v.s("/shop"),
  position: v.s("hero"),
  active: v.b(true),
  order: v.n(1),
  createdAt: v.n(now - 5 * 864e5),
});
for (const [id, name, charge] of [
  ["dz-inside", "Inside Dhaka", 60],
  ["dz-suburb", "Dhaka Suburb", 100],
  ["dz-outside", "Outside Dhaka", 130],
]) {
  await putDoc(`deliveryZones/${id}`, {
    id: v.s(id),
    name: v.s(name),
    zone: v.s(id.replace("dz-", "").toUpperCase()),
    charge: v.f(charge),
    etaDays: v.arr([v.n(1), v.n(3)]),
    active: v.b(true),
    createdAt: v.n(now - 20 * 864e5),
  });
}

// ── reviews / returns / notifications / messages ────────────────────
for (const [id, pid, rating, title] of [
  ["rev-01", "prd-01", 5, "Excellent sound quality"],
  ["rev-02", "prd-02", 4, "Good value for money"],
]) {
  await putDoc(`reviews/${id}`, {
    productId: v.s(pid),
    userId: v.s(CUSTOMER),
    userName: v.s("Rahim Uddin"),
    userPhoto: v.null(),
    rating: v.n(rating),
    title: v.s(title),
    comment: v.s("Delivered fast, packaging was solid. Would buy again from this seller."),
    createdAt: v.n(now - 6 * 864e5),
    isApproved: v.b(true),
  });
}
await putDoc("returns/ret-01", {
  orderId: v.s("ord-audit-02"),
  userId: v.s(CUSTOMER),
  sellerId: v.s(SELLER),
  productId: v.s("prd-02"),
  reason: v.s("Item did not match description"),
  status: v.s("REQUESTED"),
  createdAt: v.n(now - 864e5),
});
for (const [id, uid, title, body] of [
  ["ntf-01", SELLER, "Payout processed", "Your bank payout of ৳30,000 was processed successfully."],
  ["ntf-02", SELLER, "New order received", "Order ord-audit-06 — 1x Cotton Panjabi Classic."],
  [
    "ntf-03",
    ADMIN,
    "Settlement awaiting hold release",
    "2 settlements scheduled for release this week.",
  ],
]) {
  await putDoc(`notifications/${id}`, {
    userId: v.s(uid),
    title: v.s(title),
    body: v.s(body),
    type: v.s("system"),
    read: v.b(false),
    createdAt: v.n(now - 3600e3),
  });
}
await putDoc("conversations/conv-01", {
  participants: v.strArr([SELLER, CUSTOMER]),
  sellerId: v.s(SELLER),
  lastMessage: v.s("Has my order shipped yet?"),
  lastMessageAt: v.n(now - 7200e3),
  createdAt: v.n(now - 2 * 864e5),
});
await putDoc("conversations/conv-01/messages/msg-01", {
  senderId: v.s(CUSTOMER),
  text: v.s("Has my order shipped yet?"),
  createdAt: v.n(now - 7200e3),
});
await putDoc("conversations/conv-01/messages/msg-02", {
  senderId: v.s(SELLER),
  text: v.s("Yes, courier picked it up today. You'll get tracking tonight."),
  createdAt: v.n(now - 3600e3),
});

// ── global settings (finance config) ───────────────────────────────
await putDoc("settings/finance", {
  commissionDefault: v.f(0.1),
  settlementHoldDays: v.n(7),
  defaultReturnWindowDays: v.n(7),
  categoryReturnWindowOverrides: v.map({}),
  updatedAt: v.n(now - 10 * 864e5),
  updatedBy: v.s(ADMIN),
});

console.log("\n✅ seed complete");
console.log(`ADMIN=${ADMIN}\nSELLER=${SELLER}\nCUSTOMER=${CUSTOMER}`);
