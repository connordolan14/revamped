// Render the Standings and Power pages to PNGs for the weekly email,
// matching the screenshots Connor forwards today. Serves web/ locally and
// screenshots the main content of each page.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { chromium } from "playwright";

const ROOT = join(process.cwd(), "web");
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  let fp = join(ROOT, p);
  if (!(existsSync(fp) && statSync(fp).isFile())) fp = join(ROOT, "index.html"); // SPA fallback, mirrors vercel.json rewrite
  res.writeHead(200, { "content-type": MIME[extname(fp)] || "text/plain" }); res.end(readFileSync(fp));
});
await new Promise((r) => server.listen(4611, r));
const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });
const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
for (const [route, out] of [["/standings", "email-standings.png"], ["/power", "email-power.png"]]) {
  await page.goto(`http://localhost:4611${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const el = await page.$("main");
  await el.screenshot({ path: join(ROOT, "data", out) });
  console.log("rendered", out);
}
await browser.close(); server.close();
