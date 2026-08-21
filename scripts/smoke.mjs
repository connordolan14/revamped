import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{if(m.type()==="error")errs.push(m.text());});
await p.goto("file:///root/revamped/web/standalone.html",{waitUntil:"networkidle"});
await p.waitForTimeout(300);
const navCount = await p.$$eval("#nav a", a=>a.length);
const rows = await p.$$eval("table tbody tr", r=>r.length);
for (const r of ["#/power","#/rosters","#/values","#/history","#/rules"]) { await p.goto("file:///root/revamped/web/standalone.html"+r); await p.waitForTimeout(120); }
await b.close();
console.log("navItems:",navCount,"homeRows:",rows,"errors:",errs.length? errs.join("|"):"none");
