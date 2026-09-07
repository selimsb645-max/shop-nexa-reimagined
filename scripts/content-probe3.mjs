import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
const e = page.locator('input[type="email"], input[name="email"]').first();
await e.waitFor({ state: "visible", timeout: 30000 });
await e.fill("admin@aventa.test");
await page.locator('input[type="password"]').first().fill("audit-pass-123");
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(4000);
await page.goto("http://localhost:5173/admin/orders", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
// main content area text
const main = await page.evaluate(() => {
  const el = document.querySelector("main") || document.body;
  return el.innerText.replace(/\s+/g, " ");
});
console.log("MAIN >>>", main.slice(0, 600));
await page.screenshot({ path: "scripts/audit-shots/debug-admin-orders.png" });
await browser.close();
