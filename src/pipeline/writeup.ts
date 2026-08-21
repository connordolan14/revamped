// Weekly write-up generator. Deterministic (no LLM) so CI is reliable — produces
// a solid factual draft Connor can lightly edit before forwarding. Reads the
// freshly built bundle and emits { subject, text, html }.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function ordinal(n: number) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

export function buildWriteup(bundle: any) {
  const inSeason = bundle.state?.inSeason;
  const seasonKey = Object.keys(bundle.seasons || {}).sort().pop();
  const season = seasonKey ? bundle.seasons[seasonKey] : null;
  const lines: string[] = [];
  let subject: string;

  if (inSeason && season?.standings?.length) {
    const wk = bundle.state.week - 1;
    subject = `Revamped League — Week ${wk} recap, standings & power rankings`;
    const st = season.standings;
    const leader = st[0];
    lines.push(`**Week ${wk} is in the books.** ${leader.teamName} sits atop the standings at ${leader.wins}–${leader.losses}.`);
    // biggest power mover
    const movers = (season.power || []).filter((p: any) => p.trend != null).sort((a: any, b: any) => Math.abs(b.trend) - Math.abs(a.trend));
    if (movers[0]?.trend) {
      const m = movers[0];
      lines.push(`Biggest power-ranking mover: **${m.teamName}** ${m.trend > 0 ? "up" : "down"} ${Math.abs(m.trend)} to ${ordinal(m.rank)}.`);
    }
    // top scorer of the week
    const wkScores = (season.weeklyScores || []).map((m: any) => ({ team: m.teamName, pts: m.scores[wk - 1] ?? 0 })).sort((a: any, b: any) => b.pts - a.pts);
    if (wkScores[0]) lines.push(`Top score of the week: **${wkScores[0].team}** with ${wkScores[0].pts.toFixed(1)}.`);
    lines.push("");
    lines.push("**Standings (top 6 in bold made the weekly bonus race):**");
    st.forEach((s: any, i: number) => lines.push(`${i + 1}. ${s.teamName} — ${s.wins}–${s.losses} (${s.pf.toFixed(0)} PF)`));
    lines.push("");
    lines.push("**Power Rankings:**");
    (season.power || []).forEach((p: any) => lines.push(`${p.rank}. ${p.teamName}${p.trend ? ` (${p.trend > 0 ? "▲" : "▼"}${Math.abs(p.trend)})` : ""}`));
  } else {
    subject = `Revamped League — preseason check-in`;
    const lastSeason = bundle.history?.seasons?.[0];
    const champ = lastSeason?.champion;
    lines.push(`**Preseason is here.** The 2026 season kicks off soon.`);
    if (champ) lines.push(`Reigning champ: **${champ.teamName}** — the target on everyone's back.`);
    if (lastSeason) {
      lines.push("");
      lines.push(`**${lastSeason.season} final standings:**`);
      (lastSeason.standings || []).forEach((s: any) => lines.push(`${s.rank}. ${s.teamName} — ${s.record}`));
    }
  }

  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:640px;margin:0 auto">
    <h2 style="letter-spacing:-.02em;margin:0 0 4px">${subject}</h2>
    <p style="color:#666;font-size:13px;margin:0 0 16px">Revamped League · auto-generated draft — edit before forwarding.</p>
    ${lines.map((l) => l === "" ? "<br>" : `<p style="margin:2px 0">${l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`).join("")}
    <hr style="border:none;border-top:1px solid #eee;margin:18px 0">
    <p style="font-size:13px"><a href="${bundle.league?.sleeperUrl || "#"}" style="color:#2a78d6">Open the league site →</a></p>
  </div>`;
  return { subject, text, html };
}

// CLI: build the writeup from web/data/bundle.json and save to dist/writeup.json
if (import.meta.url === `file://${process.argv[1]}`) {
  const bundle = JSON.parse(readFileSync(join(process.cwd(), "web/data/bundle.json"), "utf8"));
  const w = buildWriteup(bundle);
  writeFileSync(join(process.cwd(), "web/data/writeup.json"), JSON.stringify(w, null, 2));
  console.log("SUBJECT:", w.subject);
  console.log("\n" + w.text);
}
