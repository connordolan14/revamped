// Sends the weekly write-up via Resend (free tier). On the free tier you can
// send from onboarding@resend.dev to your own account email with no domain
// setup; add a verified domain later to send from your own address / to the
// group. Env: RESEND_API_KEY, EMAIL_TO, optional EMAIL_FROM.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildWriteup } from "./writeup.js";

async function main() {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.EMAIL_TO;
  const from = process.env.EMAIL_FROM || "Revamped League <onboarding@resend.dev>";
  if (!key || !to) { console.error("Missing RESEND_API_KEY or EMAIL_TO — skipping email."); process.exit(0); }

  const bundle = JSON.parse(readFileSync(join(process.cwd(), "web/data/bundle.json"), "utf8"));
  const w = buildWriteup(bundle);

  const attachments: { filename: string; content: string }[] = [];
  for (const [file, name] of [["web/data/email-standings.png", "standings.png"], ["web/data/email-power.png", "power.png"]] as const) {
    const fp = join(process.cwd(), file);
    if (existsSync(fp)) attachments.push({ filename: name, content: readFileSync(fp).toString("base64") });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [to], subject: w.subject, html: w.html, text: w.text,
      attachments: attachments.length ? attachments : undefined,
    }),
  });
  if (!res.ok) { console.error("Resend error:", res.status, await res.text()); process.exit(1); }
  console.log(`Email sent to ${to} — "${w.subject}" (${attachments.length} image attachment(s))`);
}
main().catch((e) => { console.error(e); process.exit(1); });
