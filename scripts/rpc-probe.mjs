import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const posts = [];
page.on("response", async (res) => {
  const url = res.url();
  if (res.request().method() === "POST" && !url.includes("/v1/") && !url.includes("googleapis")) {
    let body = "";
    try { body = (await res.text()).slice(0, 300); } catch {}
    posts.push({ url: url.slice(0, 120), status: res.status(), body });
  }
});
await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
const e = page.locator('input[type="email"], input[name="email"]').first();
await e.waitFor({ state: "visible", timeout: 30000 });
await e.fill("seller@aventa.test");
await page.locator('input[type="password"]').first().fill("audit-pass-123");
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(4000);
await page.goto("http://localhost:5173/seller/wallet", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const toast = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map(t => t.innerText));
console.log("TOASTS:", toast);
console.log("POSTS:", JSON.stringify(posts, null, 1).slice(0, 1200));
await browser.close();
