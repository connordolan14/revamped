/* Revamped League — static SPA (dependency-free). History (clean-URL) routed.
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
    h("thead", {}, h("tr", {}, headers.map((hd) => h("th", {
      class: [hd.l ? "l" : "", hd.left ? "la" : "", hd.onclick ? "sortable" : "", hd.sort ? "sorted-" + hd.sort : ""].filter(Boolean).join(" "),
      onclick: hd.onclick, title: hd.title, "aria-sort": hd.sort ? (hd.sort === "asc" ? "ascending" : "descending") : null,
    }, hd.t)))),
    h("tbody", {}, rows)));
}
/* Sortable columns: cols are [{ t, l?, k: (row) => value, asc?, title? }]; the
   caller owns `sort` ({ col, dir }) and re-renders on change. Nulls always sink
   to the bottom; `tie` breaks equal values. */
function sortRows(rows, cols, sort, tie = () => 0) {
  const col = cols.find((c) => c.t === sort.col) || cols[0];
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = col.k(a), y = col.k(b);
    if (x == null || y == null) return (x == null) - (y == null) || tie(a, b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir || tie(a, b);
  });
}
function sortHeaders(cols, sort, onSort) {
  return cols.map((c) => ({
    t: c.t, l: c.l, left: c.left, title: c.title,
    sort: c.t === sort.col ? sort.dir : null,
    onclick: () => onSort(c.t === sort.col
      ? { col: c.t, dir: sort.dir === "asc" ? "desc" : "asc" }
      : { col: c.t, dir: c.asc ? "asc" : "desc" }),
  }));
}
function seasonNote() {
  if (B.state.inSeason) return null;
  return h("p", { class: "muted", style: "font-size:12.5px;margin:-6px 0 14px" }, `Preseason — the ${B.state.season} records are reset to 0–0. Power rankings are seeded by roster strength only until Week 1 scores land.`);
}
function nameOf(rid) { const t = TByR.get(rid); return t ? t.teamName : "—"; }
const latestSeasonKey = () => Object.keys(B.seasons || {}).sort().pop();
const streakText = (s) => /^[WL]0$/.test(s || "") ? "—" : s;

/* ---------- HOME: standings + power + weekly recap ---------- */
function pageHome() {
  const sk = latestSeasonKey(); const s = B.seasons[sk];
  const wrap = h("div", {});
  wrap.append(pageHead("Revamped League"));
  const note = seasonNote();
  if (note) wrap.append(note);

  // top: standings (left) + power (right)
  const stdCard = h("div", { class: "card pad" }, h("div", { class: "mini-title" }, "Standings"));
  s.standings.forEach((st, i) => stdCard.append(h("div", { class: "mini-row" + (i === 5 ? " playoff-line" : ""), onclick: () => navigate("/standings"), style: "cursor:pointer" },
    h("div", { class: "mini-rank" }, st.rank), h("div", { class: "match-side" }, avatar(st.avatar, st.teamName, 20), h("span", { class: "mini-name" }, st.teamName)),
    h("div", { class: "mini-stats" },
      h("span", { class: "st pct" }, st.winPct.toFixed(3).replace(/^0/, "")),
      h("span", { class: "rec-grid" }, h("span", { class: "rw" }, st.wins), h("span", { class: "rh" }, "–"), h("span", { class: "rl" }, st.losses)),
      h("span", { class: "st stk", style: `color:${/^W[1-9]/.test(st.streak || "") ? "var(--up)" : /^L[1-9]/.test(st.streak || "") ? "var(--down)" : "var(--muted)"};font-weight:600` }, streakText(st.streak))))));
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
    // Prose comes from the generated article; a week without one shows the
    // matchups alone rather than an auto-written stand-in.
    const write = h("div", { class: "card pad" });
    if (r.article) {
      write.append(h("div", { style: "font-weight:700;font-size:16px;margin-bottom:10px;letter-spacing:-.01em" }, r.article.title));
      const lines = h("div", { class: "recap-lines" });
      r.article.body.forEach((p) => lines.append(h("p", { html: mdInline(p) })));
      write.append(lines);
      if (r.article.forTheRecord?.length) {
        write.append(h("div", { class: "ftr-title" }, "For the record"));
        const ul = h("ul", { class: "ftr-list" });
        r.article.forTheRecord.forEach((t) => ul.append(h("li", { html: mdInline(t) })));
        write.append(ul);
      }
    } else {
      write.append(h("div", { class: "callout", style: "text-align:left;margin:0" },
        h("strong", {}, `The Week ${week} write-up is not up yet.`),
        "Scores are final below. The column posts once it's written."));
    }
    const mcard = h("div", { class: "card pad" }, h("div", { class: "mini-title", style: "margin-bottom:6px" }, "Matchups"));
    const top6 = new Set(r.topSix);
    r.games.forEach((g) => {
      const aWin = g.w === g.a, bWin = g.w === g.b;
      mcard.append(h("div", { class: "wk-match" },
        h("div", { class: "wk-match-side" + (aWin ? "" : " lose") }, avatar(TByR.get(g.a)?.avatar, nameOf(g.a), 26), h("span", { class: "wk-match-name" }, nameOf(g.a)), top6.has(g.a) ? h("span", { class: "dot6", title: "Top-6 bonus" }) : null, h("span", { class: "wk-match-pts" }, fmt(g.aP, 1))),
        h("div", { class: "wk-match-side" + (bWin ? "" : " lose") }, avatar(TByR.get(g.b)?.avatar, nameOf(g.b), 26), h("span", { class: "wk-match-name" }, nameOf(g.b)), top6.has(g.b) ? h("span", { class: "dot6", title: "Top-6 bonus" }) : null, h("span", { class: "wk-match-pts" }, fmt(g.bP, 1)))));
    });
    mcard.append(h("div", { class: "wk-match-legend" }, h("span", { class: "dot6" }), " = top-6 in weekly scoring"));
    box.append(h("div", { class: "recap-cols" }, write, mcard));
  }
  const def = recaps.length
    ? (B.state.recapSeason === curSeason && recaps.some((r) => r.week === B.state.recapWeek) ? B.state.recapWeek : recaps[recaps.length - 1].week)
    : weekOptions[0];
  sel.value = def; renderRecap(def);

  const activity = recentActivity();
  if (activity) wrap.append(activity);
  return wrap;
}

/* Recent roster moves — bundle feed, replaced by live Sleeper reads when liveSync lands. */
const TX_LABEL = { free_agent: "Add", waiver: "Waiver", trade: "Trade", commissioner: "Commish" };
function recentActivity() {
  const tx = (B.transactions || []).slice(0, 8);
  if (!tx.length) return null;
  const wrap = h("div", {});
  wrap.append(h("div", { class: "section-title" }, "Recent activity"));
  const card = h("div", { class: "card pad" });
  tx.forEach((t, i) => {
    const adds = (t.adds || []).map((a) => a.player).filter(Boolean).join(", ");
    const drops = (t.drops || []).map((d) => d.player).filter(Boolean).join(", ");
    const label = !adds && drops ? "Drop" : (TX_LABEL[t.type] || "Move");
    card.append(h("div", { style: `display:flex;gap:10px;align-items:center;padding:9px 4px;font-size:13px${i ? ";border-top:1px solid var(--hair)" : ""}` },
      h("span", { class: "pill", style: "flex:0 0 64px; text-align:center" }, label),
      h("strong", { style: "flex:0 0 140px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, (t.rosterIds || []).map(nameOf).join(" ↔ ") || "—"),
      h("span", { style: "flex:1;min-width:0;display:flex;flex-direction:column;gap:2px" },
        adds ? h("span", { style: "color:var(--up)" }, "+ " + adds) : null,
        drops ? h("span", { class: "muted" }, "− " + drops) : null),
      t.faab != null ? h("span", { class: "muted", style: "flex:none;font-size:12px" }, "$" + t.faab) : null));
  });
  wrap.append(card);
  return wrap;
}

/* ---------- STANDINGS ---------- */
function pageStandings() {
  const wrap = h("div", {});
  wrap.append(pageHead("Standings"));
  const seasonKeys = Object.keys(B.seasons || {}).sort().reverse();
  const seasonSel = h("select", { class: "team-select", style: "max-width:150px" }, seasonKeys.map((sk) => h("option", { value: sk }, sk)));
  seasonSel.value = latestSeasonKey();
  seasonSel.addEventListener("change", render);
  wrap.append(h("div", { class: "wk-select-row", style: "margin-bottom:14px" }, h("span", { class: "muted", style: "font-size:13px" }, "Season"), seasonSel));
  const box = h("div", {});
  wrap.append(box);
  let sort = { col: "#", dir: "asc" };

  function render() {
    box.innerHTML = "";
    const sk = seasonSel.value; const s = B.seasons[sk];
    if (sk === B.state.season) { const note = seasonNote(); if (note) box.append(note); }
    const streakNum = (x) => { const m = /^([WL])(\d+)$/.exec(x || ""); return m ? (m[1] === "W" ? 1 : -1) * Number(m[2]) : 0; };
    const cols = [
      { t: "#", k: (st) => st.rank, asc: true },
      { t: "Team", l: true, k: (st) => st.teamName.toLowerCase(), asc: true },
      { t: "Record", k: (st) => st.wins },
      { t: "Win%", k: (st) => st.winPct },
      { t: "H2H", k: (st) => st.h2hWins },
      { t: "PF", k: (st) => st.pf },
      { t: "PA", k: (st) => st.pa },
      { t: "Max PF", k: (st) => st.maxPF, title: "Potential points — best possible lineup every week (from Sleeper)" },
      { t: "Avg", k: (st) => st.avgPF },
      { t: "Top-6", k: (st) => st.topFinishes },
      { t: "Moves", k: (st) => st.moves },
      { t: "FAAB", k: (st) => st.faabLeft },
      { t: "Streak", k: (st) => streakNum(st.streak), cur: true },
    ];
    // Streak only means something for the season in progress.
    const isCur = sk === B.state.season;
    const shown = (c) => isCur || !c.cur;
    const visible = cols.filter(shown);
    // A hidden sort column (Streak on a past season) falls back to rank order.
    if (!visible.some((c) => c.t === sort.col)) sort = { col: "#", dir: "asc" };
    const sorted = sortRows(s.standings, visible, sort, (a, b) => a.rank - b.rank);
    const byRank = sort.col === "#" && sort.dir === "asc";
    const headers = sortHeaders(visible, sort, (next) => { sort = next; render(); });
    const rows = sorted.map((st) => h("tr", { class: byRank && st.rank === 6 ? "playoff-line" : "" },
      h("td", { class: "rank" }, st.rank), h("td", { class: "l" }, teamCell(st)),
      h("td", { class: "tnum", style: "font-weight:600" }, `${st.wins}–${st.losses}`),
      h("td", { class: "tnum muted" }, st.winPct.toFixed(3).replace(/^0/, "")),
      h("td", { class: "tnum muted" }, `${st.h2hWins}–${st.h2hLosses}`),
      h("td", { class: "tnum" }, fmt(st.pf, 1)), h("td", { class: "tnum muted" }, fmt(st.pa, 1)),
      h("td", { class: "tnum" }, fmt(st.maxPF, 1)), h("td", { class: "tnum muted" }, fmt(st.avgPF, 1)),
      h("td", { class: "tnum" }, st.topFinishes), h("td", { class: "tnum muted" }, st.moves == null ? "—" : st.moves),
      h("td", { class: "tnum muted" }, st.faabLeft == null ? "—" : "$" + st.faabLeft),
      isCur ? h("td", { class: "tnum" }, streakText(st.streak)) : null));
    box.append(table(headers, rows, { cls: "standings-tbl" }));
    box.append(h("p", { class: "muted", style: "font-size:11.5px;margin-top:8px" }, "Line marks the 6-team playoff cut (when sorted by rank) · Click a column header to sort · Max PF = potential points with the best possible lineup each week · Top-6 = weeks in the scoring-bonus group · Moves = transactions · FAAB = waiver budget remaining (live in-season)."));
    if (s.weeklyScores.some((m) => m.scores.length)) {
      box.append(h("div", { class: "section-title" }, "Weekly scoring — " + sk));
      box.append(weeklyHeatmap(s.weeklyScores, sk === B.state.season ? (B.league.playoffWeekStart - 1) : 0));
    }
  }
  render();
  return wrap;
}
const GREEN6 = ["#3d9765", "#3a8f60", "#37875c", "#337e57", "#307653", "#2d6e4f"];
const RED6 = ["#c17572", "#ba6b67", "#b3615c", "#ac5751", "#a54d47", "#9e433d"];
function heatCell(rk) { if (rk <= 6) return { bg: GREEN6[rk - 1], fg: "#f4f7f5" }; return { bg: RED6[rk - 7], fg: "#f7f2f1" }; }
function weeklyHeatmap(matrix, minWeeks = 0) {
  const nWeeks = Math.max(minWeeks, ...matrix.map((m) => m.scores.length));
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
    for (let w = 0; w < nWeeks; w++) {
      if (w >= m.scores.length) { inner.append(h("div", { class: "hcell", style: "background:transparent" })); continue; }
      const sc = m.scores[w]; const c = heatCell(ranks[i][w]);
      inner.append(h("div", { class: "hcell", style: `background:${c.bg};color:${c.fg}`, title: `${m.teamName} · Wk ${w + 1}: ${sc} (${ranks[i][w] <= 6 ? "top-6 ✓" : "missed"})` }, Math.round(sc)));
    }
  }
  const leg = h("div", { class: "hleg" }, h("span", {}, "Top 6 (earned +0.5 bonus)"), h("span", { class: "sw" }, GREEN6.slice().reverse().map((c) => h("i", { style: `background:${c}` }))), h("span", { style: "margin-left:8px" }, "Bottom 6"), h("span", { class: "sw" }, RED6.map((c) => h("i", { style: `background:${c}` }))), h("span", { class: "muted" }, "· bright→dim = high→low"));
  return h("div", { class: "card pad" }, h("div", { style: "overflow-x:auto" }, inner), leg);
}

/* ---------- ALL-TIME ROSTERS ---------- */
// Every player a franchise has rostered (regular season). Usage comes from
// Sleeper's weekly roster snapshots; stints from draft picks + transactions.
const DAY_MS = 86400000;
const fmtDate = (ts) => ts == null ? "—" : new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
function stintFrom(f, short = false) {
  if (!f || f.how === "unknown") return short ? "—" : "Before records";
  if (f.how === "draft") return short ? (f.draft || "Draft").replace(" draft · ", " ") : (f.draft || "Draft");
  if (f.how === "waiver") return (short ? "Waiver" : "Waiver claim") + (f.faab != null ? ` ($${f.faab})` : "");
  if (f.how === "free_agent") return short ? "Free agent" : "Free-agent pickup";
  const via = f.commish ? " (commissioner)" : "";
  if (f.how === "trade") return short || f.team == null ? "Trade" + (short ? "" : via) : `Trade from ${nameOf(f.team)}${via}`;
  return short ? "Commish" : "Commissioner move";
}
function stintTo(t) {
  if (!t) return "Still on roster";
  if (t.how === "trade") return (t.team != null ? `Traded to ${nameOf(t.team)}` : "Traded") + (t.commish ? " (commissioner)" : "");
  if (t.how === "waiver" || t.how === "free_agent") return "Dropped";
  if (t.how === "commissioner") return "Commissioner move";
  return "Left roster";
}
function stintDays(st, now) {
  if (st.from?.ts == null || (st.to && st.to.ts == null)) return null;
  return Math.max(0, Math.round(((st.to ? st.to.ts : now) - st.from.ts) / DAY_MS));
}
function pageRosters() {
  const wrap = h("div", {});
  wrap.append(pageHead("All-Time Rosters"));
  const RH = B.rosterHistory;
  if (!RH || !Object.keys(RH.byRoster || {}).length) {
    wrap.append(h("div", { class: "callout" }, "Roster history builds from Sleeper on the next data refresh."));
    return wrap;
  }
  const now = Date.now();
  const teamsSorted = [...B.teams].sort((a, b) => a.teamName.localeCompare(b.teamName));
  const ALL = "all";
  const teamSel = h("select", { class: "team-select", style: "max-width:220px" },
    h("option", { value: ALL }, "All franchises"),
    teamsSorted.map((t) => h("option", { value: t.rosterId }, t.teamName)));
  teamSel.value = String(teamsSorted[0]?.rosterId ?? ALL);
  const posSel = h("select", { class: "team-select", style: "max-width:110px", title: "FLEX = RB, WR, and TE" }, ["All", "QB", "RB", "WR", "TE", "FLEX"].map((p) => h("option", { value: p }, p)));
  let show = "all", sort = { col: "Pts", dir: "desc" };
  const expanded = new Set();
  const seg = h("div", { class: "seg" });
  const segBtns = [["all", "All"], ["current", "Current"], ["former", "Former"]].map(([v, label]) => {
    const btn = h("button", { class: v === show ? "active" : "", onclick: () => { show = v; segBtns.forEach((b) => b.classList.toggle("active", b === btn)); render(); } }, label);
    seg.append(btn); return btn;
  });
  teamSel.addEventListener("change", () => { expanded.clear(); render(); });
  posSel.addEventListener("change", render);
  wrap.append(h("div", { class: "wk-select-row", style: "flex-wrap:wrap;margin-bottom:14px" },
    h("div", { class: "wk-select-pair" }, h("span", { class: "muted", style: "font-size:13px" }, "Franchise"), teamSel),
    h("div", { class: "wk-select-pair" }, h("span", { class: "muted", style: "font-size:13px" }, "Pos"), posSel),
    seg));
  const box = h("div", {});
  wrap.append(box);

  const P = (id) => B.players?.[id] || { n: id, p: "", t: null };
  const FLEX = new Set(["RB", "WR", "TE"]);
  // Arrival order. Every pick in a draft shares the draft's timestamp, so
  // break that tie by pick (round.pick from the label) — a few ms per pick
  // never crosses into another event, which are days apart.
  const acquiredKey = (r) => {
    const f = r.stints[0].from;
    if (f?.ts == null) return null;
    const m = f.how === "draft" && /(\d+)\.(\d+)$/.exec(f.draft || "");
    return f.ts + (m ? Number(m[1]) * 100 + Number(m[2]) : 0);
  };
  // Weeks · GP · GS · GS% · Pts · Start Pts · Bench Pts · Start PPG · PPG
  const usageCells = (u, strong) => [
    h("td", { class: "tnum" }, u.weeks), h("td", { class: "tnum" }, u.games ?? "—"), h("td", { class: "tnum" }, u.starts),
    h("td", { class: "tnum muted" }, u.weeks ? Math.round((u.starts / u.weeks) * 100) + "%" : "—"),
    h("td", { class: "tnum", style: strong ? "font-weight:600" : null }, fmt(u.pts, 1)), h("td", { class: "tnum" }, fmt(u.startPts, 1)),
    h("td", { class: "tnum muted" }, fmt(u.pts - u.startPts, 1)),
    h("td", { class: "tnum muted" }, u.starts ? fmt(u.startPts / u.starts, 1) : "—"),
    h("td", { class: "tnum muted" }, u.games ? fmt(u.pts / u.games, 1) : "—"),
  ];
  const rowDays = (r) => { const d = r.stints.map((st) => stintDays(st, now)); return d.some((x) => x == null) ? null : d.reduce((a, b) => a + b, 0); };
  // League-wide view: one row per player, totals across every franchise.
  const teamChip = (rid) => h("span", { class: "tenure-team" }, avatar(TByR.get(rid)?.avatar, nameOf(rid), 18), nameOf(rid));
  const tenuresCol = { t: "Tenures", k: (r) => r.stints.length, title: "Separate stays on a roster, across all franchises" };
  const tenuresCell = (r) => h("td", { class: "tnum" }, r.stints.length);
  const withLeague = (list, on) => on ? [list[0], tenuresCol, ...list.slice(1)] : list;
  const baseCols = [
    { t: "Player", l: true, k: (r) => P(r.id).n.toLowerCase(), asc: true },
    { t: "Age", k: (r) => P(r.id).a ?? null, asc: true },
    { t: "Acquired", left: true, k: acquiredKey, asc: true, title: "How the player first joined this franchise (sorts in the order they arrived)" },
    { t: "Days", k: rowDays, title: "Days on this roster, across all tenures" },
    { t: "Wks", k: (r) => r.weeks, title: "Regular-season weeks on the roster" },
    { t: "GP", k: (r) => r.games, title: "Games played while on the roster (no byes or inactive weeks)" },
    { t: "GS", k: (r) => r.starts, title: "Games started" },
    { t: "GS%", k: (r) => r.weeks ? r.starts / r.weeks : null, title: "Share of rostered weeks in the starting lineup" },
    { t: "Pts", k: (r) => r.pts, title: "Points scored while on the roster (starting or benched)" },
    { t: "Start Pts", k: (r) => r.startPts, title: "Points scored in the starting lineup" },
    { t: "Bench Pts", k: (r) => r.pts - r.startPts, title: "Points left on the bench" },
    { t: "Start PPG", k: (r) => r.starts ? r.startPts / r.starts : null, title: "Points per start" },
    { t: "PPG", k: (r) => r.games ? r.pts / r.games : null, title: "Points per game played, starting or benched (byes and inactive weeks excluded)" },
  ];

  // player id → every tenure on every franchise, oldest first (unknown starts first).
  const careers = new Map();
  for (const [rid, rows] of Object.entries(RH.byRoster)) {
    for (const row of rows) for (const st of row.stints) {
      if (!careers.has(row.id)) careers.set(row.id, []);
      careers.get(row.id).push({ rid: Number(rid), st });
    }
  }
  for (const list of careers.values()) list.sort((a, b) => (a.st.from?.ts ?? -Infinity) - (b.st.from?.ts ?? -Infinity) || (a.st.to ? 0 : 1) - (b.st.to ? 0 : 1));

  function tenureRow({ rid, st }, selectedRid, playerId, span) {
    const days = stintDays(st, now);
    const range = `${fmtDate(st.from?.ts)} → ${st.to ? fmtDate(st.to.ts) : "now"}`;
    const own = rid === selectedRid;
    const plain = selectedRid == null; // league-wide: no franchise to highlight
    const team = TByR.get(rid);
    const teamLink = h("span", {
      class: "tenure-team" + (own ? "" : " other"),
      title: own ? null : `Open ${nameOf(rid)}`,
      onclick: own ? null : (e) => { e.stopPropagation(); teamSel.value = String(rid); expanded.clear(); expanded.add(`${rid}:${playerId}`); render(); },
    }, avatar(team?.avatar, nameOf(rid), 16), nameOf(rid));
    return h("tr", { class: "tenure-row" + (own ? " own" : "") + (plain ? " plain" : "") },
      h("td", { class: "l", colspan: span },
        h("div", { class: "tenure-line" }, teamLink, h("span", { class: "muted" }, " · "), stintFrom(st.from), h("span", { class: "muted" }, " → "), stintTo(st.to)),
        h("div", { class: "muted", style: "font-size:11.5px" }, range)),
      h("td", { class: "tnum" }, days == null ? "—" : fmt(days)),
      ...usageCells(st, false));
  }

  // `open` = true/false draws the expand caret; null = not expandable.
  // `leagueWide` adds the player's current team to the sub-line.
  function playerCell(r, open, leagueWide = false) {
    const pill = !leagueWide;
    const meta = P(r.id);
    return h("td", { class: "l" }, h("div", { class: "team-cell" },
      open == null ? null : h("span", { class: "caret" }, open ? "▾" : "▸"),
      playerHeadshot(r.id, 26),
      h("div", {},
        h("div", { class: "nm" }, meta.n, pill && r.stints.length > 1 ? h("span", { class: "pill", style: "margin-left:6px", title: `${r.stints.length} separate tenures with this team` }, "×" + r.stints.length) : null),
        h("div", { class: "hd" },
          meta.p ? h("span", { class: "pos-" + meta.p, style: "font-weight:600" }, meta.p) : null,
          meta.t ? " · " + meta.t : "",
          leagueWide && r.rid != null ? h("span", { class: "now-on" }, " · ", teamChip(r.rid)) : null))));
  }

  // Postseason: winners-bracket games only (incl. the 3rd-place game).
  const basePostCols = [
    { t: "Player", l: true, k: (r) => P(r.id).n.toLowerCase(), asc: true },
    { t: "Seasons", left: true, k: (r) => r.post.seasons.join(","), title: "Seasons with a playoff game for this franchise" },
    { t: "G", k: (r) => r.post.weeks, title: "Playoff games the team played with him on the roster" },
    { t: "GP", k: (r) => r.post.games, title: "Playoff weeks he played an NFL game" },
    { t: "GS", k: (r) => r.post.starts, title: "Playoff games started" },
    { t: "GS%", k: (r) => r.post.starts / r.post.weeks },
    { t: "Pts", k: (r) => r.post.pts, title: "Playoff points while on the roster (starting or benched)" },
    { t: "Start Pts", k: (r) => r.post.startPts, title: "Playoff points in the starting lineup" },
    { t: "Bench Pts", k: (r) => r.post.pts - r.post.startPts, title: "Playoff points left on the bench" },
    { t: "Start PPG", k: (r) => r.post.starts ? r.post.startPts / r.post.starts : null, title: "Points per playoff start" },
    { t: "PPG", k: (r) => r.post.games ? r.post.pts / r.post.games : null, title: "Playoff points per game played, starting or benched" },
  ];
  let postSort = { col: "Start Pts", dir: "desc" };
  function renderPostseason(all, keep, leagueWide) {
    const postCols = withLeague(basePostCols, leagueWide);
    if (!postCols.some((c) => c.t === postSort.col)) postSort = { col: "Start Pts", dir: "desc" };
    const played = all.filter((r) => r.post);
    box.append(h("div", { class: "section-title" }, "Postseason"));
    if (!played.length) {
      box.append(h("div", { class: "callout" }, leagueWide ? "No playoff games yet." : "No playoff games yet for this franchise."));
      return;
    }
    const sorted = sortRows(played.filter(keep), postCols, postSort, (a, b) => b.post.startPts - a.post.startPts);
    const rows = sorted.map((r) => h("tr", { class: r.current ? "current" : "former" },
      playerCell(r, null, leagueWide),
      leagueWide ? tenuresCell(r) : null,
      h("td", { class: "la muted" }, r.post.seasons.join(", ")),
      ...usageCells(r.post, true)));
    if (!rows.length) rows.push(h("tr", {}, h("td", { class: "l muted", colspan: postCols.length }, "No players match.")));
    box.append(table(sortHeaders(postCols, postSort, (next) => { postSort = next; render(); }), rows, { cls: "standings-tbl roster-tbl" }));
    box.append(h("p", { class: "muted", style: "font-size:11.5px;margin-top:8px" },
      "Winners-bracket games only: each playoff round plus the 3rd-place game. Byes, the 5th-place game, and the toilet bowl don't count."));
  }

  // Sum a player's rows across franchises. `rid` = his current team (or null),
  // `stints` = every tenure in the league, oldest first.
  function combinePlayers(rows) {
    const add = (a, b) => ({
      weeks: a.weeks + b.weeks, games: (a.games ?? 0) + (b.games ?? 0), starts: a.starts + b.starts,
      pts: a.pts + b.pts, startPts: a.startPts + b.startPts,
    });
    const byId = new Map();
    for (const r of rows) {
      const cur = byId.get(r.id);
      if (!cur) {
        byId.set(r.id, { ...r, rid: r.current ? r.rid : null, stints: (careers.get(r.id) || []).map((t) => t.st) });
        continue;
      }
      Object.assign(cur, add(cur, r));
      if (r.current) { cur.current = true; cur.rid = r.rid; }
      if (r.post) cur.post = cur.post
        ? { ...add(cur.post, r.post), seasons: [...new Set([...cur.post.seasons, ...r.post.seasons])].sort() }
        : r.post;
    }
    return [...byId.values()];
  }

  function render() {
    box.innerHTML = "";
    const leagueWide = teamSel.value === ALL;
    const rid = leagueWide ? null : Number(teamSel.value);
    const tag = (r, k) => ({ ...r, rid: Number(k) });
    // One row per player per franchise (tiles use these league-wide too)…
    const perTeam = leagueWide
      ? Object.entries(RH.byRoster).flatMap(([k, rows]) => rows.map((r) => tag(r, k)))
      : (RH.byRoster[rid] || []).map((r) => tag(r, rid));
    // …collapsed to one row per player for the league-wide tables.
    const all = leagueWide ? combinePlayers(perTeam) : perTeam;
    const cols = withLeague(baseCols, leagueWide);
    if (!cols.some((c) => c.t === sort.col)) sort = { col: "Pts", dir: "desc" };
    const lead = cols.findIndex((c) => c.t === "Days"); // columns a tenure line spans
    const pos = posSel.value;
    const keep = (r) =>
      (show === "all" || (show === "current") === r.current) &&
      (pos === "All" || (pos === "FLEX" ? FLEX.has(P(r.id).p) : P(r.id).p === pos));
    const list = all.filter(keep);

    const multi = perTeam.filter((r) => r.stints.length > 1).length;
    const top = [...all].sort((a, b) => b.startPts - a.startPts)[0];
    const tile = (label, val, sub) => h("div", { class: "card tile" }, h("div", { class: "label" }, label), h("div", { class: "val" }, val), sub ? h("div", { class: "sub" }, sub) : null);
    // Best pickup: most regular-season starting points from tenures that began
    // with a waiver claim, free-agent add, or trade (not drafts or commish moves).
    let pickup = null;
    for (const r of perTeam) {
      const got = r.stints.filter((st) => ["waiver", "free_agent", "trade"].includes(st.from?.how));
      const pts = got.reduce((n, st) => n + st.startPts, 0);
      if (got.length && pts > 0 && (!pickup || pts > pickup.pts)) pickup = { r, pts, from: got[0].from };
    }
    const onTeam = (r) => leagueWide ? ` · ${nameOf(r.rid)}` : "";
    box.append(h("div", { class: "grid cols-4", style: "margin-bottom:14px" },
      leagueWide
        ? tile("Players rostered", all.length, `${all.filter((r) => r.current).length} on a roster now`)
        : tile("Players used", all.length, `${all.filter((r) => r.current).length} on the roster now`),
      tile("Tenures", perTeam.reduce((n, r) => n + r.stints.length, 0), `${multi} player${multi === 1 ? "" : "s"} brought back after leaving`),
      top ? tile("Top starter", P(top.id).n, `${fmt(top.startPts, 1)} pts in ${top.starts} starts${leagueWide ? "" : onTeam(top)}`) : null,
      tile("Best pickup", pickup ? P(pickup.r.id).n : "—", pickup
        ? `${fmt(pickup.pts, 1)} pts as a starter · ${stintFrom(pickup.from, true)}, ${fmtDate(pickup.from.ts)}${onTeam(pickup.r)}`
        : "No waiver, free-agent, or trade pickup has started yet")));

    box.append(h("div", { class: "section-title", style: "margin-top:4px" }, "Regular season"));
    const headers = sortHeaders(cols, sort, (next) => { sort = next; render(); });
    const sorted = sortRows(list, cols, sort, (a, b) => b.pts - a.pts);
    const rows = [];
    for (const r of sorted) {
      const meta = P(r.id);
      const key = `${r.rid}:${r.id}`;
      const open = expanded.has(key);
      const days = rowDays(r);
      rows.push(h("tr", { class: "roster-row" + (open ? " open" : "") + (r.current ? " current" : " former"), onclick: () => { open ? expanded.delete(key) : expanded.add(key); render(); }, title: "Show this player's full league history" },
        playerCell(r, open, leagueWide),
        leagueWide ? tenuresCell(r) : null,
        h("td", { class: "tnum muted" }, meta.a == null ? "—" : Math.floor(meta.a)),
        h("td", { class: "la muted" }, stintFrom(r.stints[0].from, true),
          r.stints[0].from?.ts != null ? h("div", { style: "font-size:11.5px;color:var(--faint)" }, fmtDate(r.stints[0].from.ts)) : null),
        h("td", { class: "tnum muted" }, days == null ? "—" : fmt(days)),
        ...usageCells(r, true)));
      if (open) for (const t of careers.get(r.id) || []) rows.push(tenureRow(t, leagueWide ? null : r.rid, r.id, lead));
    }
    if (!rows.length) rows.push(h("tr", {}, h("td", { class: "l muted", colspan: cols.length }, "No players match.")));
    box.append(table(headers, rows, { cls: "standings-tbl roster-tbl" }));
    const seasons = Object.entries(RH.regularSeasonWeeks || {}).map(([sk, n]) => `${sk}: ${n} wk${n === 1 ? "" : "s"}`).join(", ");
    box.append(h("p", { class: "muted", style: "font-size:11.5px;margin-top:8px" },
      `${leagueWide ? "One row per player, totals across every franchise · Bold names are on a roster now (current team shown under the name) · Click a player to see his full transaction history · " : "Bold names are on the roster now · Click a player to see every team he's been on (×2 = two separate tenures here) · "}Regular-season weeks counted (${seasons}) · GS = games started · Bench Pts = points scored while benched · GP = games played (no byes or inactive weeks) · Start PPG = points per start · PPG = points per game played · Days run from the move date (draft day for draft picks) to the drop, trade, or today.`));
    renderPostseason(all, keep, leagueWide);
  }
  render();
  return wrap;
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
  const teamSel = h("select", { class: "team-select", style: "max-width:120px" }, h("option", { value: "none" }, "None"), teamsSorted.map((t) => h("option", { value: t.rosterId }, t.teamName)));
  const box = h("div", { style: "margin-top:14px" });
  let highlight = null;
  seasonSel.addEventListener("change", render);
  teamSel.addEventListener("change", () => { highlight = teamSel.value === "none" ? null : Number(teamSel.value); render(); });
  wrap.append(h("div", { class: "wk-select-row", style: "flex-wrap:wrap" },
    h("div", { class: "wk-select-pair" }, h("span", { class: "muted", style: "font-size:13px" }, "Season"), seasonSel),
    h("div", { class: "wk-select-pair" }, h("span", { class: "muted", style: "font-size:13px" }, "Highlight"), teamSel)));
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
    // Quarterfinal slots include the bye teams as their own boxes, ordered so each
    // pair of slots feeds the semifinal box drawn between them → a proper 4→2→1 bracket
    // laid out on a shared grid so every round lines up with what actually feeds it.
    const qfItems = [];
    (b.semis || []).forEach((s) => [feeder(s.a), feeder(s.b)].forEach((it) => {
      qfItems.push(it.bye ? bByeBox(it.rid, seedOf) : (it.game ? bGameBox(it.game, seedOf) : h("div", { class: "bgame" }, bTeamRow(it.rid, 0, true, seedOf))));
    }));
    const semiItems = (b.semis || []).filter(Boolean).map((s) => bGameBox(s, seedOf));
    const rows = qfItems.length || 1;
    const grid = h("div", { class: "bracket-grid" });
    const place = (el, col, rowStart, rowSpan, center) => {
      el.style.gridColumn = String(col);
      el.style.gridRow = rowSpan > 1 ? `${rowStart} / span ${rowSpan}` : String(rowStart);
      if (center) el.style.alignSelf = "center";
      grid.append(el);
    };
    place(h("div", { class: "mini-title" }, "Quarterfinals"), 1, 1, 1);
    place(h("div", { class: "mini-title" }, "Semifinals"), 3, 1, 1);
    place(h("div", { class: "mini-title" }, "Championship"), 5, 1, 1);
    place(h("div", { class: "mini-title" }, "3rd Place"), 6, 1, 1);
    qfItems.forEach((el, i) => place(el, 1, i + 2, 1));
    for (let p = 0; p < rows / 2; p++) place(h("div", { class: "bconn" }), 2, p * 2 + 2, 2);
    semiItems.forEach((el, i) => place(el, 3, i * 2 + 2, 2, true));
    if (semiItems.length) place(h("div", { class: "bconn wide" }), 4, 2, rows);
    if (b.final) place(bGameBox(b.final, seedOf), 5, 2, rows, true);
    if (b.third) { const third = bGameBox(b.third, seedOf); third.style.marginLeft = "20px"; place(third, 6, 2, rows, true); }
    wrap.append(h("div", { class: "card pad", style: "margin-bottom:8px" }, h("div", { class: "mini-title", style: "margin-bottom:10px" }, "Playoff bracket"), grid));
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
  if (w > l) lead = `You've handled ${nm} more often than not, ${w}–${l} across ${n} meeting${n > 1 ? "s" : ""}`;
  else if (l > w) lead = `${nm} has your number: ${l}–${w} against you in ${n} meeting${n > 1 ? "s" : ""}`;
  else lead = `Nobody's settled this one, dead even at ${w}–${l} over ${n} meeting${n > 1 ? "s" : ""}`;
  let tex;
  if (closest <= 6) tex = ", and it keeps coming down to the final whistle.";
  else if (avgAbs >= 30) tex = ", though it's usually a laugher one way or the other.";
  else if (avgAbs >= 18) tex = ", and neither side shows much mercy.";
  else tex = ", and every one's been a grind.";
  const po = hasPO ? " There's a playoff meeting on the ledger, the kind that gets brought up again at the next draft." : "";
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

/* ---------- live layer: fresh Sleeper reads over the daily bundle ---------- */
const SLEEPER = "https://api.sleeper.app/v1";
let LIVE_DONE = false;
const pName = (pid) => B.players?.[pid]?.n || null;
async function liveSync() {
  if (LIVE_DONE) return;
  const id = B.league?.currentLeagueId;
  if (!id || typeof fetch !== "function") return;
  const lastWeek = Math.min(18, Math.max(2, (Number(B.state?.week) || 1) + 1));
  const weeks = []; for (let w = 1; w <= lastWeek; w++) weeks.push(w);
  try {
    const j = (p) => fetch(SLEEPER + p).then((r) => { if (!r.ok) throw new Error(p + " -> " + r.status); return r.json(); });
    const [users, rosters, ...txByWeek] = await Promise.all([
      j(`/league/${id}/users`),
      j(`/league/${id}/rosters`),
      ...weeks.map((w) => j(`/league/${id}/transactions/${w}`).catch(() => null)),
    ]);

    // team identity — owners rename teams / change avatars mid-season
    const uById = new Map((users || []).map((u) => [u.user_id, u]));
    for (const r of rosters || []) {
      const t = TByR.get(r.roster_id), u = uById.get(r.owner_id);
      if (!t || !u) continue;
      t.teamName = u.metadata?.team_name || u.display_name || t.teamName;
      t.handle = u.display_name || t.handle;
      const av = u.metadata?.avatar || (u.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null);
      if (av) t.avatar = av;
    }

    // transactions — recent feed + per-team "Moves" counts
    const gotTx = txByWeek.some((x) => Array.isArray(x));
    if (gotTx) {
      const moves = new Map(), feed = [];
      txByWeek.forEach((list, i) => {
        if (!Array.isArray(list)) return;
        for (const tx of list) {
          if (tx.status !== "complete") continue;
          for (const rid of tx.roster_ids || []) moves.set(rid, (moves.get(rid) || 0) + 1);
          feed.push({
            type: tx.type, week: weeks[i], created: tx.created, rosterIds: tx.roster_ids || [],
            adds: Object.entries(tx.adds || {}).map(([pid, rid]) => ({ player: pName(pid) || "New player", rosterId: rid })),
            drops: Object.entries(tx.drops || {}).map(([pid, rid]) => ({ player: pName(pid) || "Player", rosterId: rid })),
            faab: tx.settings?.waiver_bid ?? null,
          });
        }
      });
      feed.sort((a, b) => b.created - a.created);
      const cur = B.seasons?.[B.state?.season];
      if (cur?.standings) for (const st of cur.standings) st.moves = moves.get(st.rosterId) ?? 0;
      if (feed.length) B.transactions = feed;
    }

    B.syncedAt = Date.now();
    LIVE_DONE = true;
    TByR = new Map(B.teams.map((t) => [t.rosterId, t]));
    const y = window.scrollY; route(); window.scrollTo(0, y);
    stampFreshness();
  } catch (e) { console.warn("[liveSync]", e && e.message); }
}
function stampFreshness() {
  if (!B.syncedAt) return;
  const foot = $(".foot"); if (!foot) return;
  let tag = $("#freshness");
  if (!tag) { tag = h("span", { id: "freshness", class: "muted", style: "display:block;margin-top:6px;font-size:11.5px" }); foot.append(tag); }
  tag.textContent = "Rosters & activity synced live · " + new Date(B.syncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/* ---------- router ---------- */
const ROUTES = {
  "/": { fn: pageHome, nav: "Home", g: "◆" },
  "/standings": { fn: pageStandings, nav: "Standings", g: "▤" },
  "/schedule": { fn: pageSchedule, nav: "Schedule", g: "▦" },
  "/rosters": { fn: pageRosters, nav: "Rosters", g: "☰", wide: true },
  "/history": { fn: pageHistory, nav: "History", g: "🏆" },
  "/rules": { fn: pageRules, nav: "Rules", g: "§" },
};
const BOTTOM = ["/", "/standings", "/schedule", "/rosters", "/history", "/rules"];
function navigate(path) {
  if (location.pathname !== path) { try { history.pushState(null, "", path); } catch { return; } }
  route();
}
function navClick(path) {
  return (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path);
  };
}
function buildNav() {
  const nav = $("#nav"), bot = $("#botnav"); nav.innerHTML = ""; bot.innerHTML = "";
  for (const [path, r] of Object.entries(ROUTES)) nav.append(h("a", { href: path, "data-path": path, onclick: navClick(path) }, r.nav));
  for (const path of BOTTOM) { const r = ROUTES[path]; bot.append(h("a", { href: path, "data-path": path, onclick: navClick(path) }, h("span", { class: "g" }, r.g), r.nav)); }
}
function route() {
  const path = location.pathname || "/";
  const r = ROUTES[path] || ROUTES["/"];
  const main = $("#main"); main.innerHTML = ""; document.body.classList.toggle("wide", !!r.wide); main.append(r.fn()); window.scrollTo(0, 0);
  document.querySelectorAll("[data-path]").forEach((a) => a.classList.toggle("active", a.getAttribute("data-path") === path));
}
function initTheme() {
  let saved = null; try { saved = localStorage.getItem("rl-theme"); } catch {}
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  $("#themeBtn").textContent = (saved === "light") ? "☾" : "☀";
  $("#themeBtn").addEventListener("click", () => { const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"; document.documentElement.setAttribute("data-theme", next); try { localStorage.setItem("rl-theme", next); } catch {} $("#themeBtn").textContent = next === "light" ? "☾" : "☀"; });
}
async function boot() {
  try { B = window.__BUNDLE__ || await (await fetch("/data/bundle.json")).json(); }
  catch (e) { $("#main").innerHTML = `<div class="callout"><strong>Couldn't load league data</strong>${e.message}</div>`; return; }
  TByR = new Map(B.teams.map((t) => [t.rosterId, t]));
  buildNav(); initTheme();
  const brand = $("#brand"); if (brand) brand.addEventListener("click", navClick("/"));
  window.addEventListener("popstate", route); route();
  liveSync();
}
boot();
