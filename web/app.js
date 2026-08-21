/* Revamped League — static SPA (dependency-free). Hash-routed.
   Data: window.__BUNDLE__ (inlined build) or ./data/bundle.json (deployed). */

const $ = (sel, r = document) => r.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) { if (kid == null) continue; e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return e;
};
const fmt = (n, d = 0) => (n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const mdInline = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
let B = null, TByR = new Map();

/* ---------- shared ---------- */
function initials(name) { return (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }
function avatar(url, name, size = 28) {
  const wrap = h("span", { class: "ava", style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px` });
  if (url) { const img = h("img", { src: url, loading: "lazy", alt: "" }); img.addEventListener("error", () => { img.remove(); wrap.textContent = initials(name); }); wrap.append(img); }
  else wrap.textContent = initials(name);
  return wrap;
}
function playerHeadshot(playerId, size = 30) {
  if (!playerId) return null;
  const wrap = h("span", { class: "rec-headshot", style: `width:${size}px;height:${size}px` });
  const img = h("img", { src: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`, loading: "lazy", alt: "" });
  img.addEventListener("error", () => wrap.remove());
  wrap.append(img);
  return wrap;
}
function teamCell(team, rank, size = 28) {
  return h("div", { class: "team-cell" },
    rank ? h("span", { class: "chip", style: "background:var(--surface-3);color:var(--ink-2)" }, rank) : null,
    avatar(team.avatar, team.teamName, size),
    h("div", {}, h("div", { class: "nm" }, team.teamName), h("div", { class: "hd" }, "@" + team.handle)));
}
function pageHead(title, sub) { return h("div", { class: "page-head" }, h("h1", {}, title), sub ? h("p", {}, sub) : null); }
function table(headers, rows, opts = {}) {
  return h("div", { class: "tbl-wrap" }, h("table", opts.cls ? { class: opts.cls } : {},
    h("thead", {}, h("tr", {}, headers.map((hd) => h("th", { class: hd.l ? "l" : "" }, hd.t)))),
    h("tbody", {}, rows)));
}
function seasonNote() {
  if (B.state.inSeason) return null;
  return h("p", { class: "muted", style: "font-size:12.5px;margin:-6px 0 14px" }, "2026 kicks off soon — showing the 2025 final season until Week 1.");
}
function nameOf(rid) { const t = TByR.get(rid); return t ? t.teamName : "—"; }
const latestSeasonKey = () => Object.keys(B.seasons || {}).sort().pop();

/* ---------- HOME: standings + power + weekly recap ---------- */
function pageHome() {
  const sk = latestSeasonKey(); const s = B.seasons[sk];
  const wrap = h("div", {});
  wrap.append(pageHead("Revamped League"));
  wrap.append(seasonNote());

  // top: standings (left) + power (right)
  const stdCard = h("div", { class: "card pad" }, h("div", { class: "mini-title" }, "Standings"));
  s.standings.forEach((st, i) => stdCard.append(h("div", { class: "mini-row" + (i === 5 ? " playoff-line" : ""), onclick: () => location.hash = "#/standings", style: "cursor:pointer" },
    h("div", { class: "mini-rank" }, st.rank), h("div", { class: "match-side" }, avatar(st.avatar, st.teamName, 20), h("span", { class: "mini-name" }, st.teamName)),
    h("div", { class: "mini-stats" },
      h("span", { class: "st pct" }, st.winPct.toFixed(3).replace(/^0/, "")),
      h("span", { class: "rec-grid" }, h("span", { class: "rw" }, st.wins), h("span", { class: "rh" }, "–"), h("span", { class: "rl" }, st.losses)),
      h("span", { class: "st stk", style: `color:${(st.streak || "").startsWith("W") ? "var(--up)" : (st.streak || "").startsWith("L") ? "var(--down)" : "var(--muted)"};font-weight:600` }, st.streak)))));
  const powCard = h("div", { class: "card pad" }, h("div", { class: "mini-title" }, "Power Rankings"));
  s.power.forEach((p) => {
    const d = p.trend == null ? h("span", { class: "muted", style: "font-size:12px" }, "—")
      : h("span", { class: "trend " + (p.trend > 0 ? "up" : p.trend < 0 ? "down" : "flat"), style: "font-size:12px" }, p.trend > 0 ? `▲${p.trend}` : p.trend < 0 ? `▼${Math.abs(p.trend)}` : "—");
    powCard.append(h("div", { class: "mini-row" }, h("div", { class: "mini-rank" }, p.rank),
      h("div", { class: "match-side" }, avatar(p.avatar, p.teamName, 20), h("span", { class: "mini-name" }, p.teamName)), d));
  });
  wrap.append(h("div", { class: "home-cols" }, stdCard, powCard));

  // weekly recap — driven by the CURRENT season (2026). Empty until games are played.
  const curSeason = B.state.season;
  const recaps = B.seasons[curSeason]?.recaps || [];
  const schedWeeks = (B.schedule?.weeks || []).map((w) => w.week);
  const weekOptions = recaps.length ? recaps.map((r) => r.week) : (schedWeeks.length ? schedWeeks : [1]);
  wrap.append(h("div", { class: "section-title" }, "Weekly recap"));
  wrap.append(h("p", { class: "muted", style: "font-size:12.5px;margin:-6px 0 12px" }, `${curSeason} season`));
  const sel = h("select", { class: "team-select", style: "max-width:200px" }, weekOptions.map((wk) => h("option", { value: wk }, "Week " + wk)));
  const box = h("div", {});
  sel.addEventListener("change", () => renderRecap(Number(sel.value)));
  wrap.append(h("div", { class: "wk-select-row" }, h("span", { class: "muted", style: "font-size:13px" }, "Week"), sel));
  wrap.append(box);
  function renderRecap(week) {
    box.innerHTML = "";
    const r = recaps.find((x) => x.week === week);
    if (!r) { box.append(h("div", { class: "callout", style: "text-align:left" }, h("strong", {}, `Week ${week} — no recap available yet.`), `The Week ${week} recap and matchups post here after the games.`)); return; }
    const write = h("div", { class: "card pad" });
    write.append(h("div", { style: "font-weight:700;font-size:16px;margin-bottom:10px;letter-spacing:-.01em" }, r.headline));
    const lines = h("div", { class: "recap-lines" }); r.lines.forEach((l) => lines.append(h("p", { html: mdInline(l) }))); write.append(lines);
    const mcard = h("div", { class: "card pad" }, h("div", { class: "mini-title", style: "margin-bottom:6px" }, "Matchups"));
    const top6 = new Set(r.topSix);
    r.games.forEach((g) => {
      const aWin = g.w === g.a, bWin = g.w === g.b;
      mcard.append(h("div", { class: "match-row" },
        h("div", { class: "match-side" + (aWin ? "" : " lose") }, avatar(TByR.get(g.a)?.avatar, nameOf(g.a), 22), h("span", { class: "nm2" }, nameOf(g.a)), top6.has(g.a) ? h("span", { class: "dot6", title: "Top-6 bonus" }) : null, h("span", { class: "pts" }, fmt(g.aP, 1))),
        h("div", { class: "match-mid" }, "def."),
        h("div", { class: "match-side r" + (bWin ? "" : " lose") }, avatar(TByR.get(g.b)?.avatar, nameOf(g.b), 22), h("span", { class: "nm2" }, nameOf(g.b)), top6.has(g.b) ? h("span", { class: "dot6", title: "Top-6 bonus" }) : null, h("span", { class: "pts" }, fmt(g.bP, 1)))));
    });
    box.append(h("div", { class: "recap-cols" }, write, mcard));
  }
  const def = recaps.length
    ? (B.state.recapSeason === curSeason && recaps.some((r) => r.week === B.state.recapWeek) ? B.state.recapWeek : recaps[recaps.length - 1].week)
    : weekOptions[0];
  sel.value = def; renderRecap(def);
  return wrap;
}

/* ---------- STANDINGS ---------- */
function pageStandings() {
  const sk = latestSeasonKey(); const s = B.seasons[sk];
  const wrap = h("div", {});
  wrap.append(pageHead("Standings")); wrap.append(seasonNote());
  wrap.append(h("div", { class: "seg", style: "margin-bottom:14px" }, h("button", { class: "active" }, sk + (s.complete ? " (final)" : B.state.inSeason ? ` · Week ${B.state.week}` : ""))));
  const headers = [{ t: "#" }, { t: "Team", l: true }, { t: "Record" }, { t: "Win%" }, { t: "H2H" }, { t: "PF" }, { t: "PA" }, { t: "Max" }, { t: "Avg" }, { t: "Top-6" }, { t: "Moves" }, { t: "Streak" }];
  const rows = s.standings.map((st) => h("tr", { class: st.rank === 6 ? "playoff-line" : "" },
    h("td", { class: "rank" }, st.rank), h("td", { class: "l" }, teamCell(st, st.rank)),
    h("td", { class: "tnum", style: "font-weight:600" }, `${st.wins}–${st.losses}`),
    h("td", { class: "tnum muted" }, st.winPct.toFixed(3).replace(/^0/, "")),
    h("td", { class: "tnum muted" }, `${st.h2hWins}–${st.h2hLosses}`),
    h("td", { class: "tnum" }, fmt(st.pf, 1)), h("td", { class: "tnum muted" }, fmt(st.pa, 1)),
    h("td", { class: "tnum" }, fmt(st.maxPF, 1)), h("td", { class: "tnum muted" }, fmt(st.avgPF, 1)),
    h("td", { class: "tnum" }, st.topFinishes), h("td", { class: "tnum muted" }, st.moves == null ? "—" : st.moves),
    h("td", { class: "tnum" }, st.streak)));
  wrap.append(table(headers, rows));
  wrap.append(h("p", { class: "muted", style: "font-size:11.5px;margin-top:8px" }, "Line marks the 6-team playoff cut · Max = highest single week · Top-6 = weeks in the scoring-bonus group · Moves = transactions (live in-season)."));
  wrap.append(h("div", { class: "section-title" }, "Weekly scoring — " + sk));
  wrap.append(weeklyHeatmap(s.weeklyScores));
  return wrap;
}
const GREEN6 = ["#2fbf5b", "#28a54c", "#1f8c40", "#177535", "#12602c", "#0d4f25"];
const RED6 = ["#e8a29f", "#e07d78", "#d75f59", "#cb4a44", "#b73a35", "#9c2f2b"];
function heatCell(rk) { if (rk <= 6) { const i = rk - 1; return { bg: GREEN6[i], fg: i < 1 ? "#06220f" : "#eafff0" }; } const i = rk - 7; return { bg: RED6[i], fg: i < 1 ? "#3a0f0d" : "#fff0ef" }; }
function weeklyHeatmap(matrix) {
  const nWeeks = Math.max(...matrix.map((m) => m.scores.length));
  const ranks = matrix.map(() => new Array(nWeeks).fill(0));
  for (let w = 0; w < nWeeks; w++) { const order = matrix.map((m, i) => ({ i, p: m.scores[w] ?? 0 })).sort((a, b) => b.p - a.p); order.forEach((o, k) => (ranks[o.i][w] = k + 1)); }
  const totals = matrix.map((m) => m.scores.reduce((x, y) => x + y, 0));
  const idx = matrix.map((_, i) => i).sort((a, b) => totals[b] - totals[a]);
  const inner = h("div", { class: "heat", style: `grid-template-columns:130px repeat(${nWeeks},minmax(30px,1fr));min-width:${130 + nWeeks * 34}px` });
  inner.append(h("div", { class: "hlabel muted", style: "font-size:11px" }, "Team \\ Wk"));
  for (let w = 1; w <= nWeeks; w++) inner.append(h("div", { class: "hcell", style: "background:transparent;color:var(--muted);font-weight:600" }, w));
  for (const i of idx) {
    const m = matrix[i];
    inner.append(h("div", { class: "hlabel" }, avatar(TByR.get(m.rosterId)?.avatar, m.teamName, 18), h("span", { style: "margin-left:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, m.teamName.length > 15 ? "@" + m.handle : m.teamName)));
    for (let w = 0; w < nWeeks; w++) { const sc = m.scores[w] ?? 0; const c = heatCell(ranks[i][w]); inner.append(h("div", { class: "hcell", style: `background:${c.bg};color:${c.fg}`, title: `${m.teamName} · Wk ${w + 1}: ${sc} (${ranks[i][w] <= 6 ? "top-6 ✓" : "missed"})` }, Math.round(sc))); }
  }
  const leg = h("div", { class: "hleg" }, h("span", {}, "Top 6 (earned +0.5 bonus)"), h("span", { class: "sw" }, GREEN6.slice().reverse().map((c) => h("i", { style: `background:${c}` }))), h("span", { style: "margin-left:8px" }, "Bottom 6"), h("span", { class: "sw" }, RED6.map((c) => h("i", { style: `background:${c}` }))), h("span", { class: "muted" }, "· bright→dim = high→low"));
  return h("div", { class: "card pad" }, h("div", { style: "overflow-x:auto" }, inner), leg);
}

/* ---------- SCHEDULE ---------- */
function pageSchedule() {
  const wrap = h("div", {});
  wrap.append(pageHead("Schedule"));
  const sch = B.schedule;
  // build a season -> {playoffStart, upcoming, weeks:[{week, games:[{a,b,aP?,bP?,w?}]}]} map
  const seasons = {};
  if (sch && sch.weeks?.length) seasons[sch.season] = { playoffStart: sch.playoffStart, upcoming: true, weeks: sch.weeks };
  const past = {};
  for (const m of B.history.matchups) {
    if (m.isPlayoff || m.oppRosterId == null) continue;
    (past[m.season] ||= {})[m.week] ||= [];
    past[m.season][m.week].push(m);
  }
  for (const [seasonKey, weeksObj] of Object.entries(past)) {
    if (seasons[seasonKey]) continue;
    const weeks = Object.entries(weeksObj).map(([wk, entries]) => {
      const seen = new Set(), games = [];
      for (const e of entries) { const key = [e.rosterId, e.oppRosterId].sort((a, b) => a - b).join("-"); if (seen.has(key)) continue; seen.add(key); games.push({ a: e.rosterId, b: e.oppRosterId, aP: e.points, bP: e.oppPoints, w: e.result === "W" ? e.rosterId : e.result === "L" ? e.oppRosterId : null }); }
      return { week: Number(wk), games };
    }).sort((a, b) => a.week - b.week);
    seasons[seasonKey] = { upcoming: false, weeks };
  }
  const seasonKeys = Object.keys(seasons).sort().reverse();
  if (!seasonKeys.length) { wrap.append(h("div", { class: "callout" }, "Schedule loads from Sleeper when it's posted.")); return wrap; }

  const teamsSorted = [...B.teams].sort((a, b) => a.teamName.localeCompare(b.teamName));
  const seasonSel = h("select", { class: "team-select", style: "max-width:150px" }, seasonKeys.map((s) => h("option", { value: s }, s)));
  const teamSel = h("select", { class: "team-select" }, h("option", { value: "none" }, "No highlight"), teamsSorted.map((t) => h("option", { value: t.rosterId }, t.teamName)));
  const box = h("div", { style: "margin-top:14px" });
  let highlight = null;
  seasonSel.addEventListener("change", render);
  teamSel.addEventListener("change", () => { highlight = teamSel.value === "none" ? null : Number(teamSel.value); render(); });
  wrap.append(h("div", { class: "wk-select-row", style: "flex-wrap:wrap" },
    h("span", { class: "muted", style: "font-size:13px" }, "Season"), seasonSel,
    h("span", { class: "muted", style: "font-size:13px;margin-left:8px" }, "Highlight"), teamSel));
  wrap.append(box);

  function gtSide(rid, right, pts, win) {
    return h("div", { class: "gt" + (right ? " r" : "") + (rid === highlight ? " on" : "") + (win === false ? " dim" : "") },
      avatar(TByR.get(rid)?.avatar, nameOf(rid), 20), h("span", { class: "gn" }, nameOf(rid)),
      pts != null ? h("span", { class: "gpts" + (win ? " gw" : "") }, fmt(pts, 1)) : null);
  }
  function render() {
    box.innerHTML = "";
    const s = seasons[seasonSel.value];
    const grid = h("div", { class: "weeks-grid" });
    s.weeks.forEach((wk) => {
      const wbox = h("div", { class: "card pad" }, h("div", { class: "mini-title", style: "margin-bottom:10px" }, "Week " + wk.week));
      wk.games.forEach((g) => {
        const scored = g.aP != null;
        wbox.append(h("div", { class: "game-cell" },
          gtSide(g.a, false, scored ? g.aP : null, scored ? g.w === g.a : undefined),
          h("span", { class: "vs" }, scored ? "" : "vs"),
          gtSide(g.b, true, scored ? g.bP : null, scored ? g.w === g.b : undefined)));
      });
      grid.append(wbox);
    });
    box.append(grid);
    box.append(h("p", { class: "muted", style: "font-size:11.5px;margin-top:12px" }, s.upcoming
      ? `Weeks 1–14 regular season. Playoffs begin Week ${s.playoffStart || 15} (top 6 seeds, top 2 byes).`
      : `${seasonSel.value} regular season — final results.`));
  }
  render();
  return wrap;
}

/* ---------- HISTORY ---------- */
const TROPHY_EMOJI = { "Champion": "🏆", "Runner-Up": "🥈", "3rd Place": "🥉", "Toilet Bowl": "🚽", "Dead Last (Reg.)": "💩" };
function bTeamRow(rid, pts, win, seedOf, byeText) {
  return h("div", { class: "bteam " + (win ? "bw" : "bl") },
    h("div", { class: "bt-n" }, h("span", { class: "bseed" }, seedOf ? seedOf(rid) : ""), avatar(TByR.get(rid)?.avatar, nameOf(rid), 18), h("span", {}, nameOf(rid))),
    byeText ? h("span", { class: "bp muted" }, byeText) : h("span", { class: "bp" }, fmt(pts, 1)));
}
function bGameBox(g, seedOf) { return h("div", { class: "bgame" }, bTeamRow(g.a, g.aP, g.w === g.a, seedOf), bTeamRow(g.b, g.bP, g.w === g.b, seedOf)); }
function bByeBox(rid, seedOf) { return h("div", { class: "bgame bye" }, bTeamRow(rid, 0, true, seedOf, "BYE"), h("div", { class: "byemsg muted" }, "advances to semifinal")); }
function recTeams(ids) {
  if (!ids || !ids.length) return null;
  const multi = ids.length > 1;
  return h("div", { class: "rec-teams" }, ids.map((it) =>
    h("div", { class: "bteam" + (multi ? (it.win ? " bw" : " bl") : "") },
      h("div", { class: "bt-n" }, avatar(TByR.get(it.rid)?.avatar, nameOf(it.rid), 16), h("span", {}, nameOf(it.rid))))));
}
function bracketColumn(title, games, seedOf) {
  const col = h("div", { class: "bround" }, h("div", { class: "mini-title" }, title));
  games.forEach((g) => { if (g) col.append(bGameBox(g, seedOf)); });
  return col;
}
const TROPHY_META = [
  ["champion", "🏆", "Champion"], ["runnerUp", "🥈", "Runner-Up"], ["third", "🥉", "3rd Place"],
  ["toiletBowl", "🚽", "Toilet Bowl"], ["deadLast", "💩", "Dead Last (Reg.)"],
];
function pageHistory() {
  const wrap = h("div", {});
  wrap.append(pageHead("History"));
  const season = B.history.seasons[0];
  const seedMap = new Map((season.seeds || []).map((rid, i) => [rid, i + 1]));
  const seedOf = (rid) => seedMap.get(rid) ?? "";

  // League history
  wrap.append(h("div", { class: "section-title" }, "League history — " + season.season));

  // season trophies
  if (season.trophies) {
    const tr = h("div", { class: "season-trophies" });
    TROPHY_META.forEach(([k, em, lb]) => {
      const rid = season.trophies[k]; const t = TByR.get(rid);
      tr.append(h("div", { class: "strophy" }, h("div", { class: "em" }, em), h("div", { class: "lb" }, lb),
        h("div", { class: "tm" }, avatar(t?.avatar, nameOf(rid), 18), h("span", {}, nameOf(rid)))));
    });
    wrap.append(tr);
  }

  if (season.bracket) {
    const b = season.bracket;
    const byes = new Set(b.byes || []);
    const feeder = (t) => byes.has(t) ? { bye: true, rid: t } : { game: (b.round1 || []).find((g) => g.w === t) || null, rid: t };
    // Quarterfinal column includes the bye teams as their own boxes, ordered so each
    // pair of boxes feeds the semifinal below it → a proper 8→4→2 bracket.
    const qfCol = h("div", { class: "bround" }, h("div", { class: "mini-title" }, "Quarterfinals"));
    (b.semis || []).forEach((s) => [feeder(s.a), feeder(s.b)].forEach((it) => {
      qfCol.append(it.bye ? bByeBox(it.rid, seedOf) : (it.game ? bGameBox(it.game, seedOf) : h("div", { class: "bgame" }, bTeamRow(it.rid, 0, true, seedOf))));
    }));
    const bracket = h("div", { class: "bracket" }, qfCol,
      bracketColumn("Semifinals", b.semis, seedOf),
      bracketColumn("Championship", [b.final], seedOf),
      bracketColumn("3rd place", [b.third], seedOf));
    wrap.append(h("div", { class: "card pad", style: "margin-bottom:8px" }, h("div", { class: "mini-title", style: "margin-bottom:10px" }, "Playoff bracket · seeds shown · top 2 seeds bye"), bracket));
  }

  // all-time records
  const R = B.history.records;
  if (R) {
    wrap.append(h("div", { style: "margin-top:34px" }, pageHead("All-Time Records")));
    const po = (r) => r.isPlayoff ? " (PO)" : "";
    const gwhen = (r) => r ? `${nameOf(r.rosterId)} ${fmt(r.value, 1)}–${fmt(r.oppPoints, 1)} ${nameOf(r.oppRosterId)} · ${r.season} Wk ${r.week}${po(r)}` : "";
    const cards = h("div", { class: "records-grid" });
    const rc = (lb, vl, sb, live, teamIds, headshot) => h("div", { class: "rec-card" + (live ? " live" : "") },
      h("div", { class: "lb" }, lb),
      h("div", { class: "vl" }, vl),
      h("div", { class: "sb" }, sb),
      recTeams(teamIds),
      headshot || null);
    const bpw = B.history.recordPlayerWeek;
    cards.append(rc("Highest player-week", bpw ? fmt(bpw.points, 1) : "—", bpw ? `${bpw.name} · ${nameOf(bpw.rosterId)} · ${bpw.season} Wk ${bpw.week}${bpw.isPlayoff ? " (PO)" : ""}` : "", !bpw,
      bpw ? [{ rid: bpw.rosterId }] : null, bpw ? playerHeadshot(bpw.playerId, 44) : null));
    cards.append(rc("Most points, one team", fmt(R.highestWeek?.value, 1), gwhen(R.highestWeek), false,
      R.highestWeek ? [{ rid: R.highestWeek.rosterId }] : null));
    cards.append(rc("Highest-scoring game", fmt(R.highestGame?.total, 1), R.highestGame ? `${nameOf(R.highestGame.aRoster)} ${fmt(R.highestGame.aP, 1)}–${fmt(R.highestGame.bP, 1)} ${nameOf(R.highestGame.bRoster)} · ${R.highestGame.season} Wk ${R.highestGame.week}` : "", false,
      R.highestGame ? [{ rid: R.highestGame.aRoster, win: true }, { rid: R.highestGame.bRoster, win: false }] : null));
    cards.append(rc("Biggest blowout", R.biggestBlowout ? "+" + fmt(R.biggestBlowout.value, 1) : "—", R.biggestBlowout ? `${nameOf(R.biggestBlowout.rosterId)} ${fmt(R.biggestBlowout.points, 1)}–${fmt(R.biggestBlowout.oppPoints, 1)} ${nameOf(R.biggestBlowout.oppRosterId)} · ${R.biggestBlowout.season} Wk ${R.biggestBlowout.week}${po(R.biggestBlowout)}` : "", false,
      R.biggestBlowout ? [{ rid: R.biggestBlowout.rosterId, win: true }, { rid: R.biggestBlowout.oppRosterId, win: false }] : null));
    cards.append(rc("Fewest points, one team", fmt(R.lowestWeek?.value, 1), gwhen(R.lowestWeek), false,
      R.lowestWeek ? [{ rid: R.lowestWeek.rosterId }] : null));
    cards.append(rc("Longest win streak", (R.longestWinStreak?.len ?? "—") + "W", R.longestWinStreak ? `${nameOf(R.longestWinStreak.rosterId)} · ${R.longestWinStreak.season}` : "", false,
      R.longestWinStreak ? [{ rid: R.longestWinStreak.rosterId }] : null));
    cards.append(rc("Longest losing streak", (R.longestLossStreak?.len ?? "—") + "L", R.longestLossStreak ? `${nameOf(R.longestLossStreak.rosterId)} · ${R.longestLossStreak.season}` : "", false,
      R.longestLossStreak ? [{ rid: R.longestLossStreak.rosterId }] : null));
    cards.append(rc("Most points, season", fmt(R.mostPointsSeason?.points, 1), R.mostPointsSeason ? `${nameOf(R.mostPointsSeason.rosterId)} · ${R.mostPointsSeason.season}` : "", false,
      R.mostPointsSeason ? [{ rid: R.mostPointsSeason.rosterId }] : null));
    wrap.append(cards);
  }

  // Team explorer
  wrap.append(h("div", { style: "margin-top:34px" }, pageHead("Team Explorer")));
  const teamsSorted = [...B.teams].sort((a, b) => a.teamName.localeCompare(b.teamName));
  const seasonKeys = [...new Set(B.history.matchups.map((m) => m.season))].sort().reverse();
  const teamSel = h("select", { class: "team-select" }, teamsSorted.map((t) => h("option", { value: t.rosterId }, t.teamName + " (@" + t.handle + ")")));
  const seasonSel = h("select", { class: "team-select", style: "max-width:160px" }, seasonKeys.map((s) => h("option", { value: s }, s)));
  const detail = h("div", { style: "margin-top:16px" });
  teamSel.addEventListener("change", () => renderTeam());
  seasonSel.addEventListener("change", () => renderLog());
  const teamLogoWrap = h("span", { style: "display:inline-flex;align-items:center;gap:8px;margin-left:6px" });
  wrap.append(h("div", { class: "wk-select-row", style: "flex-wrap:wrap" }, h("span", { class: "muted", style: "font-size:13px" }, "Team"), teamSel, teamLogoWrap));
  wrap.append(detail);

  function tile(label, val, sub, live, headshot) { return h("div", { class: "card tile" + (live ? " " : ""), style: live ? "border-style:dashed;opacity:.9" : "" }, h("div", { class: "label" }, label), h("div", { class: "val tnum" }, val), sub ? h("div", { class: "sub" }, sub) : null, headshot || null); }
  let logMount;
  function renderTeam() {
    const rid = Number(teamSel.value);
    detail.innerHTML = "";
    const meTeam = TByR.get(rid);
    teamLogoWrap.innerHTML = ""; teamLogoWrap.append(avatar(meTeam?.avatar, nameOf(rid), 26));
    const at = B.history.allTime[rid]; if (!at) { detail.append(h("div", { class: "callout" }, "No history yet.")); return; }
    // per-team streaks (regular season)
    const reg = B.history.matchups.filter((m) => m.rosterId === rid && !m.isPlayoff).sort((a, b) => (a.season.localeCompare(b.season)) || a.week - b.week);
    let w = 0, l = 0, mw = 0, ml = 0; for (const g of reg) { w = g.result === "W" ? w + 1 : 0; l = g.result === "L" ? l + 1 : 0; mw = Math.max(mw, w); ml = Math.max(ml, l); }
    // trophy case
    const trophies = B.history.trophiesByRoster[rid] || [];
    const tc = h("div", { class: "trophy-case" });
    if (!trophies.length) tc.append(h("div", { class: "trophy empty" }, "No trophies yet"));
    trophies.forEach((t) => tc.append(h("div", { class: "trophy" }, h("span", { class: "em" }, TROPHY_EMOJI[t.trophy] || "•"), h("span", {}, t.trophy), h("span", { class: "muted", style: "font-weight:400" }, "’" + t.season.slice(2)))));
    detail.append(h("div", { class: "mini-title", style: "margin-bottom:6px" }, "Trophy case"), tc);

    detail.append(h("div", { class: "grid cols-4", style: "margin-top:16px" },
      tile("All-time record", `${at.halfWins}–${at.halfLosses}`, `${at.h2hW}–${at.h2hL} H2H · ${at.seasonsPlayed} season${at.seasonsPlayed === 1 ? "" : "s"}`),
      tile("Avg / week", fmt(at.avgPoints, 1), `${at.games} games`),
      tile("Best reg. finish", at.bestFinish ? ordinal(at.bestFinish) : "—", `avg ${at.avgFinish ?? "—"}`),
      tile("Top-6 weeks", at.top6, `of ${at.games}`)));
    const gscore = (o) => o ? `${fmt(o.points, 1)}–${fmt(o.oppPoints, 1)} vs ${nameOf(o.oppRosterId)} · ${o.season} Wk ${o.week}` : "";
    detail.append(h("div", { class: "grid cols-4", style: "margin-top:14px" },
      tile("Highest week", fmt(at.highWeek?.points, 1), at.highWeek ? `${at.highWeek.oppPoints != null ? fmt(at.highWeek.oppPoints, 1) + " opp · " : ""}${at.highWeek.season} Wk ${at.highWeek.week}` : ""),
      tile("Lowest week", fmt(at.lowWeek?.points, 1), at.lowWeek ? `${at.lowWeek.oppPoints != null ? fmt(at.lowWeek.oppPoints, 1) + " opp · " : ""}${at.lowWeek.season} Wk ${at.lowWeek.week}` : ""),
      tile("Longest win streak", mw + "W", "regular season"),
      tile("Longest losing streak", ml + "L", "regular season")));
    detail.append(h("div", { class: "grid cols-4", style: "margin-top:14px" },
      at.bestPlayerWeek
        ? tile("Top player-week", fmt(at.bestPlayerWeek.points, 1), `${at.bestPlayerWeek.name} · ${at.bestPlayerWeek.season} Wk ${at.bestPlayerWeek.week}${at.bestPlayerWeek.isPlayoff ? " (PO)" : ""}`, false, playerHeadshot(at.bestPlayerWeek.playerId, 36))
        : tile("Top player-week", "—", "unlocks with live scoring", true),
      tile("Biggest win", at.biggestWin ? "+" + fmt(at.biggestWin.margin, 1) : "—", gscore(at.biggestWin)),
      tile("Worst loss", at.worstLoss ? fmt(at.worstLoss.margin, 1) : "—", gscore(at.worstLoss)),
      tile("All-time PF", fmt(at.pointsFor, 0), `${at.avgPoints} / game`)));

    // biggest rival — full-width richer card
    if (at.rival) {
      const rvId = at.rival.rosterId, rv = TByR.get(rvId), me = TByR.get(rid);
      const games = B.history.matchups.filter((m) => m.rosterId === rid && m.oppRosterId === rvId).sort((a, b) => (b.season.localeCompare(a.season)) || b.week - a.week);
      const wins = games.filter((g) => g.result === "W").length, losses = games.filter((g) => g.result === "L").length;
      const closest = Math.min(...games.map((g) => Math.abs(g.margin ?? 999)));
      const avgAbs = games.reduce((s, g) => s + Math.abs(g.margin ?? 0), 0) / (games.length || 1);
      const hasPO = games.some((g) => g.isPlayoff);
      const sentence = rivalLine(nameOf(rvId), wins, losses, games.length, closest, avgAbs, hasPO);
      const log = h("div", { class: "rival-games" });
      games.forEach((g) => log.append(h("div", { class: "match-row", style: "grid-template-columns:auto 1fr auto" },
        h("div", { class: "tnum muted", style: "font-size:12px;min-width:78px" }, g.isPlayoff ? `PO Wk ${g.week}` : `${g.season} Wk ${g.week}`),
        h("div", { class: "tnum", style: "text-align:center;font-weight:600" }, `${fmt(g.points, 1)}–${fmt(g.oppPoints, 1)}`),
        h("span", { class: "result-b res-" + g.result }, g.result))));
      const card = h("div", { class: "card pad rival-card" }, h("div", { class: "rival-inner" },
        h("div", { class: "rival-left" },
          h("div", { class: "mini-title" }, "Biggest rival"),
          h("div", { class: "rival-head" }, avatar(me?.avatar, nameOf(rid), 26), h("span", { class: "muted", style: "font-size:13px" }, "vs"), avatar(rv?.avatar, nameOf(rvId), 30), h("span", { class: "rn" }, nameOf(rvId))),
          h("div", { style: "font-size:26px;font-weight:800;letter-spacing:-.02em;margin:6px 0 2px" }, `${wins}–${losses}`),
          h("p", { class: "muted", style: "font-size:13.5px;line-height:1.6;margin:6px 0 0" }, sentence)),
        h("div", { class: "rival-right" }, h("div", { class: "mini-title", style: "margin-bottom:4px" }, "Every meeting"), log)));
      detail.append(h("div", { style: "margin-top:18px" }, card));
    }

    detail.append(h("div", { class: "wk-select-row", style: "margin-top:18px" }, h("div", { class: "section-title", style: "margin:0;border:0;padding:0" }, "Matchup log"), h("span", { style: "flex:1" }), h("span", { class: "muted", style: "font-size:13px" }, "Season"), seasonSel));
    logMount = h("div", {}); detail.append(logMount); renderLog();
  }
  function renderLog() {
    if (!logMount) return; logMount.innerHTML = "";
    const rid = Number(teamSel.value), season = seasonSel.value;
    const log = B.history.matchups.filter((m) => m.rosterId === rid && m.season === season).sort((a, b) => b.week - a.week);
    const rows = log.map((m) => {
      const opp = m.oppRosterId != null ? TByR.get(m.oppRosterId) : null;
      return h("tr", {},
        h("td", { class: "tnum muted" }, m.isPlayoff ? h("span", { class: "result-b", style: "background:rgba(80,140,255,.16);color:var(--accent);width:auto;padding:0 6px;font-size:10px" }, "PO Wk " + m.week) : "Wk " + m.week),
        h("td", { class: "l" }, opp ? h("span", {}, avatar(opp.avatar, opp.teamName, 18), h("span", { style: "margin-left:8px" }, opp.teamName)) : "—", (!m.isPlayoff && m.top6) ? h("span", { class: "dot6", title: "Top-6 scoring week" }) : null),
        h("td", { class: "tnum" }, `${fmt(m.points, 1)}${m.oppPoints != null ? "–" + fmt(m.oppPoints, 1) : ""}`),
        h("td", {}, m.result ? h("span", { class: "result-b res-" + m.result }, m.result) : "—"));
    });
    logMount.append(table([{ t: "When" }, { t: "Opponent", l: true }, { t: "Score" }, { t: "Res" }], rows));
  }
  renderTeam(); teamSel.value = teamsSorted[0].rosterId; renderTeam();
  wrap.append(h("p", { class: "muted", style: "font-size:11.5px;margin-top:14px" }, "Reg-season records exclude playoffs; the matchup log includes playoff games (blue tag). Player-weeks are credited to whoever rostered them that week, so trades are handled correctly."));
  return wrap;
}
function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function rivalLine(nm, w, l, n, closest, avgAbs, hasPO) {
  let lead;
  if (w > l) lead = `You've handled ${nm} more often than not — ${w}–${l} across ${n} meeting${n > 1 ? "s" : ""}`;
  else if (l > w) lead = `${nm} has your number: ${l}–${w} against you in ${n} meeting${n > 1 ? "s" : ""}`;
  else lead = `Nobody's settled this one — dead even at ${w}–${l} over ${n} meeting${n > 1 ? "s" : ""}`;
  let tex;
  if (closest <= 6) tex = ", and it keeps coming down to the final whistle.";
  else if (avgAbs >= 30) tex = ", though it's usually a laugher one way or the other.";
  else if (avgAbs >= 18) tex = ", and neither side shows much mercy.";
  else tex = ", and every one's been a grind.";
  const po = hasPO ? " There's a playoff meeting on the ledger — the kind that gets brought up again at the next draft." : "";
  return lead + tex + po;
}

/* ---------- RULES ---------- */
function pageRules() {
  const wrap = h("div", {});
  wrap.append(pageHead("Rulebook", "Last updated " + (B.rulebook?.updated || "")));
  const seg = h("div", { class: "seg", style: "margin-bottom:16px" });
  const cur = h("div", { class: "card pad md", html: B.rulebook?.html || "" });
  const prop = h("div", { style: "display:none" });
  const bC = h("button", { class: "active", onclick: () => { cur.style.display = ""; prop.style.display = "none"; bC.classList.add("active"); bP.classList.remove("active"); } }, "Current rules");
  const bP = h("button", { onclick: () => { cur.style.display = "none"; prop.style.display = ""; bP.classList.add("active"); bC.classList.remove("active"); } }, "Proposed (offseason)");
  seg.append(bC, bP); wrap.append(seg, cur, prop);
  const proposed = B.rulebook?.proposed || [];
  if (!proposed.length) prop.append(h("div", { class: "callout", style: "text-align:left" }, h("strong", {}, "No proposals on the table yet."), "Per the rulebook (§10), new rules are proposed in the group chat or to the commissioner during the offseason. Send me proposals and I'll list them here for the meeting."));
  else prop.append(h("div", { class: "card pad" }, proposed.map((p) => h("div", { class: "rule-item" }, h("div", { class: "k" }, p.title), h("div", { class: "v muted" }, p.note || "")))));
  return wrap;
}

/* ---------- router ---------- */
const ROUTES = {
  "/": { fn: pageHome, nav: "Home", g: "◆" },
  "/standings": { fn: pageStandings, nav: "Standings", g: "▤" },
  "/schedule": { fn: pageSchedule, nav: "Schedule", g: "▦" },
  "/history": { fn: pageHistory, nav: "History", g: "🏆" },
  "/rules": { fn: pageRules, nav: "Rules", g: "§" },
};
const BOTTOM = ["/", "/standings", "/schedule", "/history", "/rules"];
function buildNav() {
  const nav = $("#nav"), bot = $("#botnav"); nav.innerHTML = ""; bot.innerHTML = "";
  for (const [path, r] of Object.entries(ROUTES)) nav.append(h("a", { href: "#" + path, "data-path": path }, r.nav));
  for (const path of BOTTOM) { const r = ROUTES[path]; bot.append(h("a", { href: "#" + path, "data-path": path }, h("span", { class: "g" }, r.g), r.nav)); }
}
function route() {
  const path = location.hash.replace(/^#/, "") || "/";
  const r = ROUTES[path] || ROUTES["/"];
  const main = $("#main"); main.innerHTML = ""; main.append(r.fn()); window.scrollTo(0, 0);
  document.querySelectorAll("[data-path]").forEach((a) => a.classList.toggle("active", a.getAttribute("data-path") === path));
}
function initTheme() {
  let saved = null; try { saved = localStorage.getItem("rl-theme"); } catch {}
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  $("#themeBtn").textContent = (saved === "light") ? "☾" : "☀";
  $("#themeBtn").addEventListener("click", () => { const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"; document.documentElement.setAttribute("data-theme", next); try { localStorage.setItem("rl-theme", next); } catch {} $("#themeBtn").textContent = next === "light" ? "☾" : "☀"; });
}
async function boot() {
  try { B = window.__BUNDLE__ || await (await fetch("./data/bundle.json")).json(); }
  catch (e) { $("#main").innerHTML = `<div class="callout"><strong>Couldn't load league data</strong>${e.message}</div>`; return; }
  TByR = new Map(B.teams.map((t) => [t.rosterId, t]));
  buildNav(); initTheme();
  window.addEventListener("hashchange", route); route();
}
boot();
