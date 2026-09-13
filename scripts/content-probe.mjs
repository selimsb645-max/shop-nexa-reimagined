import { chromium } from "playwright";
const BASE = process.env.AUDIT_BASE || "http://localhost:5173";
const EXPECT = {
  admin: {
    "/admin/orders": ["ord-audit", "Rahim"],
    "/admin/sellers": ["Dhaka Gadgets"],
    "/admin/qc": ["USB-C Fast Charger"],
    "/admin/finance": ["1,2", "12", "৳"],
    "/admin/wallets": ["Dhaka Gadgets"],
    "/admin/coupons": ["SAVE100"],
  },
  seller: {
    "/seller": ["Dhaka Gadgets"],
    "/seller/orders": ["ord-audit"],
    "/seller/wallet": ["48,000", "৳"],
    "/seller/products": ["Wireless Earbuds"],
    "/seller/coupons": ["GADGET15"],
  },
};
async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const e = page.locator('input[type="email"], input[name="email"]').first();
  await e.waitFor({ state: "visible", timeout: 30000 });
  await e.fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3500);
}
const browser = await chromium.launch();
for (const role of ["admin", "seller"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await signIn(page, `${role}@aventa.test`, "audit-pass-123");
  for (const [route, needles] of Object.entries(EXPECT[role])) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2800);
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    const found = needles.filter((n) => text.includes(n));
    const len = text.length;
    console.log(
      `${found.length === needles.length ? "OK " : "MISS"} ${role} ${route} bodyLen=${len} found=[${found}] missing=[${needles.filter((n) => !found.includes(n))}]`,
    );
  }
  await page.close();
}
await browser.close();
