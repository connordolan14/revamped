import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { chromium } from "playwright";

const ROOT = join(process.cwd(), "web");
const OUT = join(process.cwd(), "shots");
mkdirSync(OUT, { recursive: true });
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  let fp = join(ROOT, p);
  if (!(existsSync(fp) && statSync(fp).isFile())) fp = join(ROOT, "index.html"); // SPA fallback, mirrors vercel.json rewrite
  res.writeHead(200, { "content-type": MIME[extname(fp)] || "text/plain" });
  res.end(readFileSync(fp));
});
await new Promise((r) => server.listen(4599, r));

const routes = [
  ["home", "/"], ["standings", "/standings"], ["schedule", "/schedule"],
  ["history", "/history"], ["rules", "/rules"],
];
const browser = await chromium.launch({ executablePath: process.env.PW || undefined });
const errors = [];
for (const theme of ["dark"]) {
  for (const [w, name] of [[1280, "desktop"], [390, "mobile"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${name}] ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`[${name}] PAGEERR ${e.message}`));
    for (const [rn, path] of routes) {
      await page.goto(`http://localhost:4599${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(OUT, `${name}-${rn}.png`), fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log("shots written to /shots");
if (errors.length) { console.log("CONSOLE ERRORS:\n" + errors.join("\n")); process.exit(2); }
else console.log("no console/page errors");
