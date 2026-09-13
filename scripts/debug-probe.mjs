import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 250));
});
page.on("pageerror", (e) => errors.push("PAGEERR: " + e.message.slice(0, 250)));

await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
const e = page.locator('input[type="email"], input[name="email"]').first();
await e.waitFor({ state: "visible", timeout: 30000 });
await e.fill("admin@aventa.test");
await page.locator('input[type="password"]').first().fill("audit-pass-123");
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(4000);
console.log("after login url:", page.url());

await page.goto("http://localhost:5173/admin", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
console.log("url:", page.url());
console.log(
  "BODY >>>",
  (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 500),
);
console.log("ERRORS >>>", JSON.stringify(errors.slice(0, 10), null, 1));
await browser.close();
