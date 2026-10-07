// Instagram Comment & Reels Exporter — popup.
//
// Two jobs, nothing else:
//   • Comments  — every comment & reply of a post or reel.
//   • Reels     — every reel of a profile, with views/likes/comments.
// The scraping runs INSIDE the user's own logged-in Instagram tab (injected via
// chrome.scripting), so the user's own session is used and no server sees the
// data. When an export finishes, the CSV downloads automatically.

const $ = (id) => document.getElementById(id);

let mode = "comments";
let rows = [];
let igTabId = null;
let handleForName = "export";

// --- Usage log → Telegram ----------------------------------------------------
// Each export sends one line to the owner's Telegram ("User a3f9 exported
// comments of <url> → 18 rows in 12.9s") to track issues. Users are identified
// only by a random per-install id. TG_LOG is the bot token and chat id, encoded;
// set it with: node tools/set-telegram.mjs <bot_token> <chat_id>
const TG_LOG = "wUzMxYTO1cjNxw3cYFDZ4skQ0UjYwckZ2p2YntEcQdUWZBzZhl2UEJjefZUQBpDMyMjN5gTNzMDO";

function installId() {
  try {
    let id = localStorage.getItem("igxInstallId");
    if (!id) {
      id = Math.random().toString(36).slice(2, 8);
      localStorage.setItem("igxInstallId", id);
    }
    return id;
  } catch (_) {
    return "unknown";
  }
}

function tgLog(text) {
  if (!TG_LOG) return;
  try {
    const [token, chat] = atob(TG_LOG.split("").reverse().join("")).split("|");
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      body: new URLSearchParams({ chat_id: chat, text, disable_web_page_preview: "true" }),
    }).catch(() => {});
  } catch (_) {
    /* logging must never break an export */
  }
}

const MODES = {
  comments: {
    inputLabel: "Post or reel URL",
    placeholder: "https://www.instagram.com/reel/...",
    hint: "Open a post or reel in an Instagram tab where you are logged in.",
    noun: "comments",
    columns: [
      ["author", (r) => r.author],
      ["text", (r) => r.text],
      ["likes", (r) => r.likes],
      ["replies", (r) => r.replies],
      ["is_reply", (r) => (r.is_reply ? "yes" : "no")],
      ["created_at", (r) => toIso(r.created_at)],
    ],
  },
  reels: {
    inputLabel: "Profile URL or @handle",
    placeholder: "https://www.instagram.com/username/  or  @username",
    hint: "The profile you want the reels from — it opens in your Instagram tab.",
    noun: "reels",
    columns: [
      ["url", (r) => r.url],
      ["views", (r) => r.views],
      ["likes", (r) => r.likes],
      ["comments", (r) => r.comments],
      ["taken_at", (r) => toIso(r.taken_at)],
      ["caption", (r) => r.caption],
    ],
  },
};

function toIso(epoch) {
  return epoch ? new Date(epoch * 1000).toISOString() : "";
}

function setStatus(msg, kind) {
  const el = $("status");
  el.hidden = false;
  el.className = "status" + (kind ? " " + kind : "");
  el.textContent = msg;
}

function nameFromValue(v) {
  const code = (String(v).match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/) || [])[1];
  if (code) return code;
  const u = (String(v).match(/instagram\.com\/([^/?#]+)/) || String(v).match(/@?([\w.]+)/) || [])[1];
  return (u || "export").replace(/^@/, "");
}

function applyMode() {
  mode = $("modeSel").value;
  const m = MODES[mode];
  $("inputLabel").textContent = m.inputLabel;
  $("target").placeholder = m.placeholder;
  $("inputHint").textContent = m.hint;
}

async function findInstagramTab() {
  const tabs = await chrome.tabs.query({});
  const isIg = (t) => /:\/\/(www\.)?instagram\.com\//.test(t.url || "");
  return tabs.find((t) => t.active && isIg(t)) || tabs.find(isIg) || null;
}

function waitForComplete(tabId) {
  return new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(done);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(done);
    setTimeout(resolve, 20000);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prefillFromTab() {
  try {
    const tab = await findInstagramTab();
    if (!tab || !tab.active) return;
    const url = tab.url || "";
    if (/\/(p|reel|reels|tv)\//.test(url)) {
      $("modeSel").value = "comments";
      $("target").value = url;
    } else {
      const u = (url.match(/instagram\.com\/([^/?#]+)\/?(?:[?#]|$)/) || [])[1];
      if (u && !/^(p|reel|reels|explore|direct|stories|accounts)$/.test(u)) {
        $("modeSel").value = "reels";
        $("target").value = "@" + u;
      }
    }
    applyMode();
  } catch (_) {
    /* ignore */
  }
}

async function run() {
  mode = $("modeSel").value;
  const value = $("target").value.trim();
  if (!value) {
    setStatus(`Enter ${mode === "reels" ? "a profile URL or @handle" : "a post or reel URL"}.`, "err");
    return;
  }
  const tab = await findInstagramTab();
  if (!tab) {
    setStatus("Open instagram.com in a tab and log in, then try again.", "err");
    return;
  }
  igTabId = tab.id;
  handleForName = nameFromValue(value);
  const count = Number($("count").value) || 500;

  $("run").disabled = true;
  $("result").hidden = true;
  setStatus("Starting in your Instagram tab…", "run");
  const started = Date.now();
  let outcome = "❌ no result";
  try {
    let [res] = await chrome.scripting.executeScript({
      target: { tabId: igTabId },
      func: igxScrape,
      args: [mode, value, count],
    });
    let out = res && res.result;
    if (out && out.navigate) {
      setStatus("Opening the profile in your Instagram tab…", "run");
      await chrome.tabs.update(igTabId, { url: out.navigate });
      await waitForComplete(igTabId);
      await sleep(3000);
      [res] = await chrome.scripting.executeScript({
        target: { tabId: igTabId },
        func: igxScrape,
        args: [mode, value, count],
      });
      out = res && res.result;
    }
    if (!out || out.error) {
      outcome = "❌ " + ((out && out.error) || "That export failed.");
      setStatus((out && out.error) || "That export failed.", "err");
      return;
    }
    rows = out.rows || [];
    if (out.owner) handleForName = out.owner;
    if (!rows.length) {
      outcome = "⚠️ 0 rows";
      setStatus(`No ${MODES[mode].noun} found. The account may be private, or the post has none.`, "err");
      return;
    }
    outcome = `✅ ${rows.length.toLocaleString()} rows`;
    autoDownload();
    $("rowCount").textContent = rows.length.toLocaleString();
    $("rowNoun").textContent = MODES[mode].noun;
    $("result").hidden = false;
    setStatus(`✅ ${rows.length.toLocaleString()} ${MODES[mode].noun} exported — CSV downloaded.`, "ok");
  } catch (err) {
    outcome = "❌ " + (err && err.message ? err.message : err);
    setStatus("Could not run in the Instagram tab: " + (err && err.message ? err.message : err), "err");
  } finally {
    $("run").disabled = false;
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    tgLog(`User ${installId()} (v${chrome.runtime.getManifest().version}) exported ${mode} of ${value} (limit ${count}) → ${outcome} in ${secs}s`);
  }
}

// ---------------------------------------------------------------------------
// Runs INSIDE the Instagram tab (same origin as the site, so the user's own
// session is used). Must be fully self-contained — no outside references.
// ---------------------------------------------------------------------------
async function igxScrape(mode, value, limit) {
  const APP_ID = "936619743392459";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pace = () => sleep(800 + Math.random() * 700);
  const progress = (n, total, text) => {
    try { chrome.runtime.sendMessage({ igxProgress: { n, total, text } }); } catch (_) {}
  };
  const csrf = (document.cookie.match(/(?:^|; )csrftoken=([^;]+)/) || [])[1] || "";
  if (!/(?:^|; )ds_user_id=/.test(document.cookie)) {
    return { error: "You're not logged in to Instagram in this tab. Log in, then try again." };
  }
  async function api(path) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch("https://www.instagram.com" + path, {
        credentials: "include",
        headers: { "x-ig-app-id": APP_ID, "x-csrftoken": csrf, "x-requested-with": "XMLHttpRequest", "x-asbd-id": "129477" },
      });
      if (r.status === 429) { await sleep(15000 * (attempt + 1)); continue; }
      if (r.status === 401 || r.status === 403) throw new Error("Instagram refused the request (" + r.status + "). Make sure you are logged in.");
      if (!r.ok) throw new Error("Instagram returned " + r.status);
      return r.json();
    }
    throw new Error("Instagram is rate-limiting this account. Wait a few minutes and try again.");
  }
  function shortcodeToPk(code) {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let n = 0n;
    for (const ch of code.slice(0, 11)) n = n * 64n + BigInt(A.indexOf(ch));
    return n.toString();
  }
  const codeOf = (v) => (String(v).match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/) || [])[1];

  try {
    if (mode === "comments") {
      const code = codeOf(value);
      if (!code) return { error: "That doesn't look like a post or reel link." };
      const pk = shortcodeToPk(code);
      const info = await api(`/api/v1/media/${pk}/info/`);
      const item = (info.items || [])[0] || {};
      const total = Math.min(limit, item.comment_count || limit);
      const rows = [];
      // Instagram's comment cursor eventually cycles back to pages it already
      // served, so dedupe by comment id and stop once a page brings nothing new.
      const seenIds = new Set();
      const seenCursors = new Set();
      let minId = null, stale = 0;
      do {
        let fresh = 0;
        const q = `can_support_threading=true&permalink_enabled=false` + (minId ? `&min_id=${encodeURIComponent(minId)}` : "");
        const page = await api(`/api/v1/media/${pk}/comments/?${q}`);
        for (const c of page.comments || []) {
          if (seenIds.has(String(c.pk))) continue;
          seenIds.add(String(c.pk));
          fresh++;
          rows.push({ author: c.user && c.user.username, text: c.text, likes: c.comment_like_count, replies: c.child_comment_count || 0,
                      is_reply: false, created_at: c.created_at });
          if (c.child_comment_count && rows.length < limit) {
            let maxId = null, guard = 0;
            do {
              const rp = await api(`/api/v1/media/${pk}/comments/${c.pk}/child_comments/` + (maxId ? `?max_id=${encodeURIComponent(maxId)}` : ""));
              for (const r of rp.child_comments || []) {
                if (seenIds.has(String(r.pk))) continue;
                seenIds.add(String(r.pk));
                rows.push({ author: r.user && r.user.username, text: r.text, likes: r.comment_like_count, replies: 0,
                            is_reply: true, created_at: r.created_at });
              }
              maxId = rp.has_more_tail_child_comments ? rp.next_max_child_cursor : null;
              await pace();
            } while (maxId && ++guard < 20 && rows.length < limit);
          }
          if (rows.length >= limit) break;
        }
        const shown = Math.max(total, rows.length);
        progress(rows.length, shown, `${rows.length.toLocaleString()} of ~${shown.toLocaleString()} comments…`);
        stale = fresh ? 0 : stale + 1;
        minId = page.has_more_headload_comments || page.next_min_id ? page.next_min_id : null;
        // Stop after two pages in a row with nothing new, a repeated cursor, or
        // once we hold as many comments as the post says it has.
        if (stale >= 2 || (minId && seenCursors.has(minId)) || (item.comment_count && seenIds.size >= item.comment_count)) minId = null;
        if (minId) seenCursors.add(minId);
        if (minId) await pace();
      } while (minId && rows.length < limit);
      return { rows: rows.slice(0, limit), owner: item.user && item.user.username };
    }

    if (mode === "reels") {
      const m = String(value).match(/instagram\.com\/([^/?#]+)/) || String(value).match(/@?([\w.]+)/);
      const username = m && m[1].replace(/^@/, "");
      if (!username) return { error: "Enter a profile URL or @handle." };
      // Instagram's web app no longer serves a reels feed API, so read the
      // profile's reels grid like a person would: scroll it, collect reel links,
      // then fetch each reel's stats (the media-info endpoint still works).
      const want = `/${username.toLowerCase()}/reels`;
      const here = location.pathname.toLowerCase().replace(/\/+$/, "");
      if (!here.startsWith(want)) return { navigate: `https://www.instagram.com/${username}/reels/` };
      const codes = [];
      const seen = new Set();
      let idle = 0;
      while (codes.length < limit && idle < 6) {
        const before = codes.length;
        for (const a of document.querySelectorAll('a[href*="/reel/"]')) {
          const c = codeOf(a.getAttribute("href"));
          if (c && !seen.has(c)) { seen.add(c); codes.push(c); }
        }
        progress(Math.min(codes.length, limit), limit, `Found ${Math.min(codes.length, limit).toLocaleString()} reels on the profile…`);
        idle = codes.length === before ? idle + 1 : 0;
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(1300);
      }
      window.scrollTo(0, 0);
      const pick = codes.slice(0, limit);
      const total = pick.length;
      const rows = [];
      // Fetch reel stats 3 at a time (one pause per batch) — ~3x faster than
      // one by one, and still gentle enough that Instagram doesn't throttle.
      const t0 = Date.now();
      let stop = false;
      for (let i = 0; i < pick.length && !stop; i += 3) {
        const got = await Promise.all(pick.slice(i, i + 3).map(async (code) => {
          try {
            const info = await api(`/api/v1/media/${shortcodeToPk(code)}/info/`);
            return (info.items || [])[0] || null;
          } catch (e) {
            if (/rate-limiting/.test(e.message)) stop = true;
            return null;
          }
        }));
        for (const it of got) if (it) rows.push({
          url: `https://www.instagram.com/reel/${it.code}/`,
          views: it.play_count || it.view_count || "", likes: it.like_count, comments: it.comment_count,
          taken_at: it.taken_at, caption: it.caption && it.caption.text,
        });
        if (stop && !rows.length) throw new Error("Instagram is rate-limiting this account. Wait a few minutes and try again.");
        const done = Math.min(i + 3, total);
        const left = Math.round(((Date.now() - t0) / done) * (total - done) / 1000);
        progress(rows.length, total, `${rows.length.toLocaleString()} of ${total.toLocaleString()} reels…` + (left > 0 ? ` about ${left < 60 ? left + "s" : Math.ceil(left / 60) + " min"} left` : ""));
        await pace();
      }
      return { rows: rows.slice(0, limit), owner: username };
    }

    return { error: "Unknown export type." };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}

// --- CSV + download --------------------------------------------------------

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCsv() {
  const cols = MODES[mode].columns;
  const header = cols.map((c) => c[0]).join(",");
  const lines = rows.map((r) => cols.map((c) => csvCell(c[1](r))).join(","));
  return "﻿" + header + "\r\n" + lines.join("\r\n");
}

function autoDownload() {
  const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  chrome.downloads.download(
    { url, filename: `instagram-${handleForName}-${mode}-${stamp}.csv`, saveAs: false },
    () => setTimeout(() => URL.revokeObjectURL(url), 60000)
  );
}

// --- Wiring ----------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.igxProgress && msg.igxProgress.text) setStatus(msg.igxProgress.text, "run");
});

document.addEventListener("DOMContentLoaded", () => {
  $("modeSel").addEventListener("change", applyMode);
  $("run").addEventListener("click", run);
  $("dlAgain").addEventListener("click", () => { if (rows.length) autoDownload(); });
  applyMode();
  prefillFromTab();
});
