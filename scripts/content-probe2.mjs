import { chromium } from "playwright";
const BASE = "http://localhost:5173";
async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const e = page.locator('input[type="email"], input[name="email"]').first();
  await e.waitFor({ state: "visible", timeout: 30000 });
  await e.fill(email);
  await page.locator('input[type="password"]').first().fill("audit-pass-123");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 180));
});
page.on("pageerror", (e) => errors.push("PAGEERR: " + e.message.slice(0, 180)));
await signIn(page, "admin@aventa.test");
for (const route of ["/admin/orders", "/admin/finance", "/admin/wallets", "/admin/coupons"]) {
  errors.length = 0;
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  console.log(`\n=== ${route} (len=${text.length})`);
  console.log("TEXT:", text.slice(0, 350));
  console.log("ERRORS:", errors.slice(0, 5));
}
await browser.close();
