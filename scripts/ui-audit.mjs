/**
 * AVENTA SHOP — Responsive UI Sanity Audit harness (Playwright)
 *
 * Usage: node scripts/ui-audit.mjs --role admin --viewport 360x800
 *        node scripts/ui-audit.mjs --role seller --all-viewports
 *        node scripts/ui-audit.mjs --list
 *
 * Logs in once (Firebase Auth emulator on localhost:9099), then walks
 * the given routes at the given viewports, capturing per route/viewport:
 *   - console errors / page errors
 *   - failed network requests (>=400, excluding expected 4xx probes)
 *   - horizontal overflow (document.scrollWidth > innerWidth)
 *   - elements overflowing the viewport horizontally (clipped content)
 *   - invisible/zero-size interactive elements
 *   - screenshot for manual review
 * Results are appended to scripts/audit-results.jsonl
 */
import { chromium } from "playwright";
import { mkdirSync, appendFileSync, existsSync, readFileSync } from "node:fs";

const BASE = process.env.AUDIT_BASE ?? "http://localhost:5173";
const OUT_DIR = "scripts/audit-shots";
const RESULTS = "scripts/audit-results.jsonl";
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = {
  mobile360: { width: 360, height: 800 },
  mobile390: { width: 390, height: 844 },
  tablet768: { width: 768, height: 1024 },
  desktop1280: { width: 1280, height: 800 },
  desktop1440: { width: 1440, height: 900 },
};

// ── CLI ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}

const ROLES = {
  admin: {
    email: "admin@aventa.test",
    password: "audit-pass-123",
    routesFile: "scripts/routes-admin.json",
  },
  seller: {
    email: "seller@aventa.test",
    password: "audit-pass-123",
    routesFile: "scripts/routes-seller.json",
  },
};

const role = arg("role", "admin");
const viewportArg = arg("viewport", "all");
const listOnly = args.includes("--list");
const routes = JSON.parse(readFileSync(ROLES[role].routesFile, "utf-8"));
const done = new Set();
if (existsSync(RESULTS)) {
  for (const line of readFileSync(RESULTS, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      done.add(`${r.role}|${r.route}|${r.viewport}`);
    } catch {}
  }
}

if (listOnly) {
  console.log(routes.join("\n"));
  process.exit(0);
}

const viewports =
  viewportArg === "all"
    ? Object.entries(VIEWPORTS)
    : [[viewportArg, VIEWPORTS[viewportArg]]].filter(([, v]) => v);

if (!viewports.length) {
  console.error("unknown viewport:", viewportArg);
  process.exit(1);
}

// ── Login (Firebase Auth emulator REST) ─────────────────────────────
async function signIn(page, email, password) {
  // Create/verify the user via the emulator REST API, then sign in
  // through the app's own /login page so all app state is real.
  const signup = await fetch(
    `http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!signup.ok) {
    const signin = await fetch(
      `http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    if (!signin.ok) throw new Error(`auth emulator login failed: ${await signin.text()}`);
  }

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });

  // Fill the login form (selectors are best-effort; adjust to app)
  const emailSel = 'input[type="email"], input[name="email"], input[autocomplete="email"]';
  const passSel = 'input[type="password"]';
  const emailInput = page.locator(emailSel).first();
  const passInput = page.locator(passSel).first();

  // Wait (up to 30s) for the form to actually render (cold route compile)
  await emailInput.waitFor({ state: "visible", timeout: 30000 });
  await passInput.waitFor({ state: "visible", timeout: 10000 });

  if (await emailInput.count()) {
    await emailInput.fill(email);
    await passInput.fill(password);
    const submit = page
      .locator(
        'button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")',
      )
      .first();
    await submit.click();
    await page.waitForTimeout(3000);
    // dismiss any post-login dialogs/modals via Escape
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(800);
    return true;
  }
  throw new Error("login form not found on /login");
}

// ── Per-page responsive checks (injected into the page) ─────────────
function pageChecks() {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const overflowX = doc.scrollWidth - vw;

  // Elements that visually extend beyond the viewport (clipped content)
  const clipped = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 && r.width > 24 && el.children.length < 8) {
      const cls = (typeof el.className === "string" ? el.className : "").slice(0, 60);
      clipped.push({
        tag: el.tagName.toLowerCase(),
        cls,
        right: Math.round(r.right),
        text: (el.textContent || "").trim().slice(0, 40),
      });
      if (clipped.length >= 8) break;
    }
  }

  // Overlapping buttons heuristic: two visible buttons whose rects intersect
  const overlaps = [];
  const btns = [...document.querySelectorAll("button, a.btn, [role='button']")].slice(0, 120);
  for (let i = 0; i < btns.length; i++) {
    const a = btns[i].getBoundingClientRect();
    if (a.width === 0) continue;
    for (let j = i + 1; j < btns.length; j++) {
      const b = btns[j].getBoundingClientRect();
      if (b.width === 0) continue;
      const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (ix > 12 && iy > 12 && ix * iy > 0.35 * Math.min(a.width * a.height, b.width * b.height)) {
        overlaps.push([
          btns[i].textContent?.trim().slice(0, 20),
          btns[j].textContent?.trim().slice(0, 20),
        ]);
        if (overlaps.length >= 5) break;
      }
    }
    if (overlaps.length >= 5) break;
  }

  // Tiny touch targets on mobile
  const tinyTargets = [];
  if (vw < 500) {
    for (const el of document.querySelectorAll("button, a[href], [role='button'], input, select")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24)) {
        tinyTargets.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 40),
          h: Math.round(r.height),
          w: Math.round(r.width),
        });
        if (tinyTargets.length >= 6) break;
      }
    }
  }

  // Horizontal-scrollable tables (intentional pattern is fine — flag width)
  const scrollableTables = [...document.querySelectorAll("table")].filter(
    (t) => t.scrollWidth > t.clientWidth,
  ).length;

  return {
    overflowX,
    clipped,
    overlaps,
    tinyTargets,
    scrollableTables,
    title: document.title,
  };
}

// ── Audit loop ─────────────────────────────────────────────────────
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORTS.mobile360 });
let page = await context.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
});
page.on("pageerror", (err) => consoleErrors.push(`PAGEERROR: ${err.message.slice(0, 300)}`));
page.on("response", (res) => {
  if (res.status() >= 400 && res.url().includes("localhost:5173")) {
    // server function failures matter; static 404s of optional assets too
    consoleErrors.push(`HTTP ${res.status()} ${res.url().slice(0, 120)}`);
  }
});

await signIn(page, ROLES[role].email, ROLES[role].password);
console.log(`[audit] logged in as ${role}`);

for (const [vpName, vp] of viewports) {
  await page.setViewportSize(vp);
  for (const route of routes) {
    if (done.has(`${role}|${route}|${vpName}`)) {
      console.log(`  SKIP          ${route} @${vpName}`);
      continue;
    }
    const url = `${BASE}${route}`;
    consoleErrors.length = 0;
    let status = "PASS";
    let checks = null;
    let loadErr = null;

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2800); // let TanStack suspense + queries settle
      checks = await page.evaluate(pageChecks);
      if (consoleErrors.length) status = "CONSOLE";
      if (checks.overflowX > 4) status = "OVERFLOW";
      if (checks.clipped.length) status = status === "PASS" ? "CLIPPED" : status;
      if (page.url().includes("/login")) status = "AUTH_REDIRECT";
    } catch (e) {
      status = "ERROR";
      loadErr = String(e.message || e).slice(0, 200);
    }

    const shot = `${OUT_DIR}/${role}-${route.replace(/\//g, "_") || "root"}-${vpName}.png`;
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});

    const record = {
      ts: new Date().toISOString(),
      role,
      route,
      viewport: vpName,
      status,
      loadErr,
      checks,
      console: [...new Set(consoleErrors)].slice(0, 6),
      shot,
    };
    appendFileSync(RESULTS, JSON.stringify(record) + "\n");
    const extra = checks
      ? ` overflowX=${checks.overflowX} clipped=${checks.clipped.length} tblscroll=${checks.scrollableTables}`
      : "";
    console.log(`  ${status.padEnd(13)} ${route} @${vpName}${extra}`);
  }
}

await browser.close();
console.log(`[audit] done — results in ${RESULTS}`);
