// Generates Chrome Web Store graphic assets as standalone HTML sized exactly
// to spec, which you then render to PNG with headless Chrome (see README).
//   - 3 screenshots  1280x800
//   - small promo    440x280
//   - marquee promo  1400x560
// No emoji in the rendered text: headless Chrome has no emoji font and would
// draw tofu boxes. Symbols used (heart, arrows) are from normal fonts.
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = new URL("../store/screenshots/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const accent = "#d62976";

const base = `*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
  h1 .g{background:linear-gradient(120deg,#22d3ee,#7c5cff);-webkit-background-clip:text;background-clip:text;color:transparent}`;

// ---- shared popup mock ----
const popupCss = `
  .pop{width:400px;flex:0 0 400px;border-radius:22px;overflow:hidden;background:#16181c;
    border:1px solid #2f3336;box-shadow:0 40px 90px -30px rgba(0,0,0,.9)}
  .hd{display:flex;align-items:center;gap:12px;padding:18px 20px;background:linear-gradient(135deg,#962fbf,#d62976);color:#fff}
  .logo{width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,.2);display:grid;place-items:center;font-weight:800;font-size:16px}
  .hd h2{font-size:17px}.hd .s{font-size:12px;opacity:.85;margin-top:2px}
  .tabs{display:flex;border-bottom:1px solid #2f3336}
  .tab{flex:1;text-align:center;padding:14px 0;font-weight:700;font-size:15px;color:#8b98a5}
  .tab.on{color:${accent};box-shadow:inset 0 -2px 0 ${accent}}
  .bd{padding:20px}
  .lbl{font-size:13px;font-weight:700;margin-bottom:7px;color:#e8ecf5}
  .inp{border:1px solid #2f3336;border-radius:9px;padding:12px 13px;font-size:14px;color:#e7e9ea;background:#1e2126;margin-bottom:16px}
  .ok{color:#34d399;font-size:14px;font-weight:600;margin-bottom:10px}.ok b{font-size:20px}
  .tblwrap{border:1px solid #2f3336;border-radius:10px;overflow:hidden;background:#1e2126;margin-bottom:14px}
  .tr{display:flex;gap:10px;padding:9px 12px;border-bottom:1px solid #2f3336;font-size:12px}
  .tr:last-child{border-bottom:0}
  .u{font-weight:700;color:#e8ecf5;width:120px;flex:0 0 120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tx{color:#b7c0cf;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .lk{color:#8b98a5;white-space:nowrap}
  .dl{display:flex;gap:8px}
  .dl .b1{flex:1;background:${accent};color:#fff;text-align:center;padding:11px;border-radius:9px;font-weight:700;font-size:14px}
  .dl .b2{background:#16181c;color:${accent};border:1px solid ${accent};padding:11px 16px;border-radius:9px;font-weight:700;font-size:14px}
  .go{background:${accent};color:#fff;text-align:center;padding:13px;border-radius:9px;font-weight:800;font-size:16px;margin-top:8px}
  .chk{list-style:none}
  .chk li{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #2f3336;font-size:14px;color:#cfd6e2}
  .chk li:last-child{border-bottom:0}.chk .i{color:#34d399;font-weight:800;font-size:16px}
  .ft{padding:12px 20px;border-top:1px solid #2f3336;font-size:12px;color:#8b98a5}`;

const popup = (c, p, body) => `<div class="pop">
  <div class="hd"><div class="logo">IG</div><div><h2>Instagram Exporter</h2><div class="s">Comments &amp; posts &rarr; CSV / JSON</div></div></div>
  <div class="tabs"><div class="tab ${c}">Comments</div><div class="tab ${p}">Posts</div></div>
  <div class="bd">${body}</div>
  <div class="ft">18 free lookups left this hour &middot; Get the API for more</div>
</div>`;

const slide = (title, sub, popupHtml) => `<!doctype html><html><head><meta charset="utf-8"><style>${base}
  html,body{width:1280px;height:800px;overflow:hidden}
  .stage{width:1280px;height:800px;display:flex;align-items:center;gap:64px;padding:0 88px;
    background:radial-gradient(900px 600px at 12% -10%,#241a3f 0,#0a0c12 55%);color:#e8ecf5}
  .left{flex:1;max-width:560px}
  .badge{display:inline-block;font-size:14px;font-weight:800;letter-spacing:.12em;color:#22d3ee;
    background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.28);padding:8px 16px;border-radius:999px;margin-bottom:22px}
  h1{font-size:52px;line-height:1.08;letter-spacing:-.02em;font-weight:830}
  p.sub{font-size:22px;color:#97a1b8;margin-top:20px;line-height:1.5}
  .brand{margin-top:34px;font-size:17px;color:#7c8598;font-weight:600}.brand b{color:#e8ecf5}
  ${popupCss}
</style></head><body><div class="stage">
  <div class="left"><span class="badge">FREE CHROME EXTENSION</span><h1>${title}</h1>
    <p class="sub">${sub}</p>
    <div class="brand">Powered by <b>hammadi.dev</b> &middot; No login &middot; Public data only</div></div>
  ${popupHtml}
</div></body></html>`;

const comments = [
  ["@sarah.makes", "This is exactly what I needed", "42"],
  ["@devon_r", "Count me in for the giveaway!", "8"],
  ["@thefoodiehub", "Saved. Trying this tonight", "15"],
  ["@mia.codes", "Underrated tip, thank you", "3"],
];
const s1 = popup("on", "", `
  <div class="lbl">Post or reel URL</div><div class="inp">instagram.com/reel/DcOX3hWFiey/</div>
  <div class="ok"><b>1,204</b> comments ready</div>
  <div class="tblwrap">${comments.map(r => `<div class="tr"><span class="u">${r[0]}</span><span class="tx">${r[1]}</span><span class="lk">&hearts; ${r[2]}</span></div>`).join("")}</div>
  <div class="dl"><div class="b1">Download CSV</div><div class="b2">JSON</div></div>`);

const posts = [["Reel","Dec 2","84.2k","612k views"],["Photo","Nov 28","51.9k",""],["Carousel","Nov 24","63.1k",""],["Reel","Nov 20","120k","1.1M views"]];
const s2 = popup("", "on", `
  <div class="lbl">Instagram profile URL or @handle</div><div class="inp">@nasa</div>
  <div class="ok"><b>100</b> posts ready</div>
  <div class="tblwrap"><div class="tr"><span class="u">Type</span><span class="tx">Date &middot; Likes &middot; Views</span></div>
  ${posts.map(p => `<div class="tr"><span class="u">${p[0]}</span><span class="tx">${p[1]} &middot; &hearts; ${p[2]}${p[3] ? " &middot; " + p[3] : ""}</span></div>`).join("")}</div>
  <div class="dl"><div class="b1">Download CSV</div><div class="b2">JSON</div></div>`);

const s3 = popup("on", "", `
  <ul class="chk">
    <li><span class="i">&check;</span><span>Every comment &mdash; past the 20-comment cutoff other tools hit</span></li>
    <li><span class="i">&check;</span><span>Whole profiles: likes, comments, views, captions</span></li>
    <li><span class="i">&check;</span><span>CSV for Excel &amp; Sheets, or JSON for code</span></li>
    <li><span class="i">&check;</span><span>No Instagram login, no sign-up</span></li>
    <li><span class="i">&check;</span><span>They're never notified you looked</span></li>
  </ul><div class="go">Export</div>`);

const tile = (w, h, h1size, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${base}
  html,body{width:${w}px;height:${h}px;overflow:hidden}
  .t{width:${w}px;height:${h}px;display:flex;flex-direction:column;justify-content:center;gap:14px;
    padding:0 ${Math.round(w*0.09)}px;color:#fff;
    background:linear-gradient(120deg,#4f5bd5 0%,#962fbf 42%,#d62976 72%,#fa7e1e 100%)}
  .lg{display:flex;align-items:center;gap:14px;margin-bottom:6px}
  .lg .b{width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.22);display:grid;place-items:center;font-weight:800;font-size:22px}
  .lg .n{font-weight:700;font-size:18px;opacity:.95}
  h1{font-size:${h1size}px;line-height:1.05;letter-spacing:-.02em;font-weight:830;max-width:88%}
  p{font-size:${Math.round(h1size*0.5)}px;opacity:.94;font-weight:500;max-width:80%}
</style></head><body><div class="t">
  <div class="lg"><div class="b">IG</div><div class="n">hammadi.dev</div></div>
  ${body}
</div></body></html>`;

const small = tile(440, 280, 30, `<h1>Instagram Comment &amp; Post Exporter</h1><p>Export to CSV in one click</p>`);
const marquee = tile(1400, 560, 68, `<h1>Export all Instagram comments &amp; posts to CSV</h1><p>One click, in your browser. No login, no sign-up. Powered by hammadi.dev</p>`);

const files = {
  "s1-comments.html": slide("Export <span class='g'>every comment</span> to CSV",
    "Pull the full comment thread of any public post or reel &mdash; author, text, likes and replies &mdash; then download it as a spreadsheet in one click.", s1),
  "s2-posts.html": slide("Export a whole <span class='g'>profile's posts</span>",
    "Every post on a public profile &mdash; URL, date, likes, comments, views and caption &mdash; as CSV or JSON. Perfect for competitor and content research.", s2),
  "s3-why.html": slide("No login. <span class='g'>Public data only.</span>",
    "It reads the same public data the page shows a logged-out visitor. Nothing to sign into, and only two permissions.", s3),
  "promo-small-440x280.html": small,
  "promo-marquee-1400x560.html": marquee,
};
for (const [name, htmlStr] of Object.entries(files)) {
  writeFileSync(new URL(name, OUT), htmlStr);
  console.log("wrote store/screenshots/" + name);
}
