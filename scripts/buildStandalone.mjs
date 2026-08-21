// Inline styles.css, app.js, and bundle.json into one self-contained HTML file
// for preview/artifact use. The deployed site keeps them as separate files.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const W = join(process.cwd(), "web");
let html = readFileSync(join(W, "index.html"), "utf8");
const css = readFileSync(join(W, "styles.css"), "utf8");
const js = readFileSync(join(W, "app.js"), "utf8");
const bundle = readFileSync(join(W, "data", "bundle.json"), "utf8");

html = html.replace('<link rel="stylesheet" href="/styles.css" />', `<style>\n${css}\n</style>`);
html = html.replace(
  '<script src="/app.js"></script>',
  `<script>window.__BUNDLE__ = ${bundle};</script>\n<script>\n${js}\n</script>`,
);
writeFileSync(join(W, "standalone.html"), html);
console.log("wrote web/standalone.html", (html.length / 1024).toFixed(0) + "kb");
