// Dev-only: full-page screenshots of the explorer against the mock subgraph.
// Usage: node scripts/mock/screenshot.mjs [--base http://localhost:3000] [--only portfolio,orchestrators] [--out DIR]
// Uses the globally installed `playwright` package and the browsers in $PLAYWRIGHT_BROWSERS_PATH.

import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:3000").replace(/\/$/, "");
const ONLY = arg("only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OUT = arg(
  "out",
  "/tmp/claude-0/-home-user-explorer/298d5e51-8f56-5415-945e-f5cba722332b/scratchpad/shots"
);
const MOCK = arg("mock", "http://localhost:4010");
const SETTLE_MS = Number(arg("settle", 800));

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch {
    const root = execSync("npm root -g").toString().trim();
    return require(path.join(root, "playwright"));
  }
}

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  const dirs = fs.existsSync(base) ? fs.readdirSync(base) : [];
  for (const d of dirs
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .reverse()) {
    const bin = path.join(base, d, "chrome-linux", "chrome");
    if (fs.existsSync(bin)) return bin;
  }
  return undefined; // let Playwright resolve it
}

const WALLET = "0x22b544d19ffe43c6083327271d9f39020da30c65";
const WATCHED = "0x6a7b132393431e2b83af171b4e6e5bf54c091421";
const ORCH = "0x8b578b413186cd75590372acacb6fac64e9ead12";
const WATCHLIST = [
  { address: WALLET, label: "Main wallet" },
  { address: WATCHED, label: "Cold storage" },
  { address: ORCH, label: "My orchestrator" },
];

// Orchestrator B (where the demo wallet is bonded) comes from the mock itself.
async function orchestratorB() {
  try {
    const res = await fetch(`${MOCK}/health`);
    return (await res.json()).demo.B;
  } catch {
    return "0xb29178bd5e0da702ab69129048af7b9fcf222026";
  }
}

const COINGECKO = {
  livepeer: { usd: 6.42, usd_24h_change: 1.8 },
  ethereum: { usd: 3120.5 },
};

async function main() {
  const { chromium } = loadPlaywright();
  const B = await orchestratorB();

  const pages = [
    { name: "portfolio", path: "/", watchlist: true },
    { name: "onboarding", path: "/", watchlist: false },
    { name: "account", path: `/accounts/${WATCHED}`, watchlist: true },
    { name: "orchestrators", path: "/orchestrators", watchlist: true },
    { name: "orchestrator", path: `/orchestrators/${B}`, watchlist: true },
    { name: "network", path: "/network", watchlist: true },
    { name: "governance", path: "/governance", watchlist: true },
    { name: "activity", path: "/activity", watchlist: true },
  ];
  const variants = [
    {
      key: "desktop-dark",
      viewport: { width: 1440, height: 900 },
      theme: "dark",
    },
    {
      key: "desktop-light",
      viewport: { width: 1440, height: 900 },
      theme: "light",
    },
    {
      key: "mobile-dark",
      viewport: { width: 390, height: 844 },
      theme: "dark",
      mobile: true,
      pages: ["portfolio", "orchestrators"],
    },
  ];

  const jobs = [];
  for (const v of variants) {
    for (const p of pages) {
      if (v.pages && !v.pages.includes(p.name)) continue;
      const id = `${p.name}-${v.key}`;
      if (ONLY.length && !ONLY.some((o) => id.includes(o))) continue;
      jobs.push({ id, page: p, variant: v });
    }
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: findChromium(),
    headless: true,
  });
  const report = [];

  for (const { id, page: p, variant: v } of jobs) {
    const context = await browser.newContext({
      viewport: v.viewport,
      deviceScaleFactor: v.mobile ? 2 : 1,
      isMobile: Boolean(v.mobile),
      hasTouch: Boolean(v.mobile),
      colorScheme: v.theme,
    });
    await context.addInitScript(
      ({ theme, watchlist }) => {
        try {
          if (!sessionStorage.getItem("__seeded")) {
            localStorage.clear();
            localStorage.setItem("theme", theme);
            if (watchlist)
              localStorage.setItem(
                "livepeer-explorer.watchlist",
                JSON.stringify(watchlist)
              );
            sessionStorage.setItem("__seeded", "1");
          }
        } catch {}
      },
      { theme: v.theme, watchlist: p.watchlist ? WATCHLIST : null }
    );

    const baseHost = new URL(BASE).host;
    const mockHost = new URL(MOCK).host;
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.host === "api.coingecko.com") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify(COINGECKO),
        });
      }
      if (
        url.host === baseHost ||
        url.host === mockHost ||
        url.protocol === "data:" ||
        url.protocol === "blob:"
      ) {
        return route.continue();
      }
      return route.abort("blockedbyclient");
    });

    const page = await context.newPage();
    const consoleErrors = [];
    const failed = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on("pageerror", (err) =>
      consoleErrors.push(`pageerror: ${err.message.slice(0, 300)}`)
    );
    page.on("requestfailed", (req) => {
      const url = req.url();
      const reason = req.failure()?.errorText ?? "";
      if (reason.includes("BLOCKED_BY_CLIENT")) return; // our own external-host block
      failed.push(`${req.method()} ${url.slice(0, 140)} ${reason}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 400)
        failed.push(`${res.status()} ${res.url().slice(0, 140)}`);
    });

    let status = null;
    const t0 = Date.now();
    try {
      const res = await page.goto(BASE + p.path, {
        waitUntil: "networkidle",
        timeout: 90_000,
      });
      status = res?.status() ?? null;
    } catch (err) {
      consoleErrors.push(`goto: ${err.message.split("\n")[0]}`);
    }
    await page.waitForTimeout(SETTLE_MS);
    try {
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
    } catch {}

    // Cheap layout/content probes.
    const probe = await page
      .evaluate(() => {
        const doc = document.documentElement;
        const text = document.body?.innerText ?? "";
        const wide = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (
            r.right > doc.clientWidth + 1 &&
            r.width > 0 &&
            getComputedStyle(el).position !== "fixed"
          ) {
            wide.push(
              `${el.tagName.toLowerCase()}.${String(el.className)
                .split(" ")
                .slice(0, 3)
                .join(".")} right=${Math.round(r.right)}`
            );
            if (wide.length >= 5) break;
          }
        }
        return {
          theme: doc.dataset.theme,
          horizontalOverflow: doc.scrollWidth > doc.clientWidth,
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          nan: (text.match(/\bNaN\b|Infinity|undefined/g) ?? []).length,
          skeletons: document.querySelectorAll(
            '[data-slot="skeleton"], .animate-pulse'
          ).length,
          wide,
          title: document.title,
        };
      })
      .catch((e) => ({ error: e.message }));

    const file = path.join(OUT, `${id}.png`);
    await page
      .screenshot({ path: file, fullPage: true })
      .catch((e) => consoleErrors.push(`screenshot: ${e.message}`));
    report.push({
      id,
      url: p.path,
      status,
      ms: Date.now() - t0,
      file,
      probe,
      consoleErrors,
      failed,
    });
    await context.close();

    const flags = [
      status && status >= 400 ? `HTTP ${status}` : null,
      probe.horizontalOverflow
        ? `h-overflow ${probe.scrollWidth}>${probe.clientWidth}`
        : null,
      probe.nan ? `NaN/undefined x${probe.nan}` : null,
      probe.skeletons ? `skeletons x${probe.skeletons}` : null,
      consoleErrors.length ? `console errors x${consoleErrors.length}` : null,
      failed.length ? `failed requests x${failed.length}` : null,
    ].filter(Boolean);
    console.log(
      `${flags.length ? "!!" : "ok"} ${id.padEnd(30)} ${String(status).padEnd(
        4
      )} ${String(Date.now() - t0).padStart(6)}ms ${flags.join(", ")}`
    );
    for (const e of consoleErrors.slice(0, 6))
      console.log(`     console: ${e}`);
    for (const e of failed.slice(0, 6)) console.log(`     request: ${e}`);
    for (const w of probe.wide ?? []) console.log(`     overflow: ${w}`);
  }

  await browser.close();
  fs.writeFileSync(
    path.join(OUT, "report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(
    `\n${report.length} screenshots in ${OUT} (report.json alongside)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
