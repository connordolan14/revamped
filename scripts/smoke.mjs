import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const root = join(process.cwd(), "dist");
if (!existsSync(join(root, "index.html"))) {
  throw new Error("dist/index.html is missing; run npm run build first");
}

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const requested = join(root, pathname.replace(/^\/+/, ""));
  const file = extname(pathname) && existsSync(requested) ? requested : join(root, "index.html");
  response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
  createReadStream(file).on("error", () => {
    response.statusCode = 404;
    response.end("Not found");
  }).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start smoke-test server");
const base = `http://127.0.0.1:${address.port}`;

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.PW_EXECUTABLE || undefined,
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  // The live overlay is deliberately outside this static-artifact test. Return
  // empty successful lists so browser consoles stay quiet in offline CI.
  await page.route("https://api.sleeper.app/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "[]",
  }));

  for (const route of ["/", "/standings", "/schedule", "/history", "/rules"]) {
    const response = await page.goto(base + route, { waitUntil: "networkidle" });
    if (!response?.ok()) throw new Error(`${route} returned ${response?.status() ?? "no response"}`);
    await page.locator("#main").waitFor({ state: "visible" });
    const mainText = (await page.locator("#main").innerText()).trim();
    if (!mainText || mainText === "Loading league…") throw new Error(`${route} did not render`);
  }

  const navItems = await page.locator("#nav a").count();
  if (navItems !== 5) throw new Error(`Expected 5 navigation items, found ${navItems}`);
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log("Smoke test passed: 5 routes rendered with no browser errors.");
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
