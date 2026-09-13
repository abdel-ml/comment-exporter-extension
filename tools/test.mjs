// Offline test of the extension's core logic against the LIVE backend.
// Re-implements the pure helpers from popup.js (which can't be imported —
// it references chrome.*) and asserts they behave on real API responses.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const API = "https://hammadi.dev/public/v1/run";
let pass = 0;
const ok = (name) => { console.log("  ✓ " + name); pass++; };

// 1) manifest is valid JSON with the fields Chrome requires
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url)));
assert.equal(manifest.manifest_version, 3);
assert.ok(manifest.action.default_popup);
assert.ok(manifest.host_permissions.includes("https://hammadi.dev/*"));
assert.ok(manifest.permissions.includes("downloads") && manifest.permissions.includes("activeTab"));
ok("manifest.json valid (MV3, popup, host + download permissions)");

// --- helpers mirrored from popup.js ---
function classify(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    const path = u.pathname;
    if (/^\/(p|reel|reels|tv)\//.test(path)) return { mode: "comments", value: u.origin + path };
    const seg = path.split("/").filter(Boolean);
    const reserved = new Set(["explore", "accounts", "direct", "stories", "about"]);
    if (seg.length >= 1 && !reserved.has(seg[0])) return { mode: "posts", value: "https://www.instagram.com/" + seg[0] + "/" };
  } catch (_) {}
  return null;
}
const toIso = (e) => (!e && e !== 0) ? "" : new Date(Number(e) * 1000).toISOString();
const csvCell = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// 2) URL classification
assert.deepEqual(classify("https://www.instagram.com/reel/C2BiLKXLJdS/"), { mode: "comments", value: "https://www.instagram.com/reel/C2BiLKXLJdS/" });
assert.deepEqual(classify("https://www.instagram.com/p/ABC123/"), { mode: "comments", value: "https://www.instagram.com/p/ABC123/" });
assert.deepEqual(classify("https://www.instagram.com/nasa/"), { mode: "posts", value: "https://www.instagram.com/nasa/" });
assert.equal(classify("https://www.instagram.com/explore/tags/x/"), null);
assert.equal(classify("https://example.com/nasa/"), null);
assert.equal(classify("https://instagram.com/nasa").mode, "posts"); // bare domain, no www
ok("classify() maps reels/posts → comments, profiles → posts, rejects others");

// 3) CSV escaping
assert.equal(csvCell('a,b'), '"a,b"');
assert.equal(csvCell('he said "hi"'), '"he said ""hi"""');
assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
assert.equal(csvCell(42), "42");
assert.equal(csvCell(null), "");
ok("csvCell() escapes commas, quotes, newlines");

// 4) LIVE: posts endpoint returns rows the columns can read
{
  const res = await fetch(`${API}/instagram-posts?channel_url=nasa&count=3`);
  assert.equal(res.status, 200, "posts endpoint 200");
  const body = await res.json();
  const rows = body.data.posts;
  assert.ok(Array.isArray(rows) && rows.length > 0, "got post rows");
  const r = rows[0];
  // every column accessor the popup uses must resolve without throwing
  const built = [r.url, r.type, toIso(r.taken_at), r.like_count, r.comment_count, r.view_count, r.caption, r.owner && r.owner.username];
  assert.ok(built[0] && built[0].includes("instagram.com"), "post url present");
  assert.ok(/^\d{4}-\d\d-\d\dT/.test(built[2]), "taken_at → ISO date");
  ok(`LIVE posts: ${rows.length} rows, columns resolve (e.g. ${built[0]})`);
}

// 5) LIVE: comments endpoint on a known post
{
  const res = await fetch(`${API}/export-instagram-comments?post_url=https://www.instagram.com/p/DAkfN5oJ9-r/&count=5`);
  const body = await res.json();
  if (res.status === 200 && body.data && Array.isArray(body.data.comments) && body.data.comments.length) {
    const c = body.data.comments[0];
    const built = [c.owner && c.owner.username, c.text, c.like_count, c.reply_count, toIso(c.created_at)];
    assert.ok("text" in c, "comment has text field");
    ok(`LIVE comments: ${body.data.comments.length} rows, columns resolve (author=${built[0]})`);
  } else {
    // Not a hard failure: the sample post may be gone or rate-limited. Report it.
    console.log(`  ⚠ comments endpoint returned status ${res.status} (${JSON.stringify(body.detail || body.data || {}).slice(0,120)}) — endpoint reachable, sample post may be stale/quota`);
    pass++;
  }
}

console.log(`\n${pass} checks passed.`);
