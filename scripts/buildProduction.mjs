// Produce the exact static artifact deployed by Vercel. Generated preview and
// email files are intentionally excluded.
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = join(root, "web");
const output = join(root, "dist");

const bundle = JSON.parse(readFileSync(join(source, "data", "bundle.json"), "utf8"));
if (!Array.isArray(bundle.teams) || bundle.teams.length === 0) {
  throw new Error("web/data/bundle.json has no teams");
}
if (!bundle.seasons || Object.keys(bundle.seasons).length === 0) {
  throw new Error("web/data/bundle.json has no seasons");
}

rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "data"), { recursive: true });
for (const file of ["index.html", "styles.css", "app.js"]) {
  copyFileSync(join(source, file), join(output, file));
}
copyFileSync(join(source, "data", "bundle.json"), join(output, "data", "bundle.json"));

console.log(`Built dist/ with ${bundle.teams.length} teams and ${Object.keys(bundle.seasons).length} seasons.`);
