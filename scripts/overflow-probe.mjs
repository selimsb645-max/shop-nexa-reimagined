import { chromium } from "playwright";
const BASE = process.env.AUDIT_BASE ?? "http://localhost:5173";
const role = process.env.PROBE_ROLE ?? "admin";
const routes = JSON.parse(process.env.PROBE_ROUTES ?? "[]");
const viewports = { mobile360: { width: 360, height: 800 }, tablet768: { width: 768, height: 1024 } };
const vps = (process.env.PROBE_VPS ?? "mobile360,tablet768").split(",");
const browser = await chromium.launch();
for (const vpName of vps) {
  const vp = viewports[vpName] ?? { width: 1280, height: 800 };
  const page = await browser.newPage({ viewport: vp });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').first().waitFor({ state: "visible", timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(role === "admin" ? "admin@aventa.test" : "seller@aventa.test");
  await page.locator('input[type="password"]').first().fill("audit-pass-123");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const out = await page.evaluate(() => {
      const vw = window.innerWidth;
      const wide = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 1 || r.left < -1) {
          const cls = (typeof el.className === "string" ? el.className : "").slice(0, 70);
          wide.push({
            tag: el.tagName.toLowerCase(),
            cls,
            left: Math.round(r.left),
            right: Math.round(r.right),
            w: Math.round(r.width),
            text: (el.textContent || "").trim().slice(0, 30),
            kids: el.children.length,
          });
          if (wide.length >= 12) break;
        }
      }
      return { vw, scrollW: document.documentElement.scrollWidth, wide };
    });
    // keep only outermost offenders (drop elements whose parent is already listed)
    console.log(`\n### ${route} @${vpName} vw=${out.vw} scrollW=${out.scrollW}`);
    for (const w of out.wide) console.log(JSON.stringify(w));
  }
}
await browser.close();
