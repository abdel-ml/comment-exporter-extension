"use strict";

// v2: everything runs inside the user's own Instagram tab (their session),
// through chrome.scripting. No third-party server sees the data or the user.
// Requests are paced (about one per second) to stay gentle on the account.

const MODES = {
  comments: {
    noun: "comments",
    label: "Post or reel URL",
    placeholder: "https://www.instagram.com/reel/...",
    hint: "Open a post or reel in an Instagram tab where you are logged in.",
    columns: [
      ["author", (r) => r.author],
      ["text", (r) => r.text],
      ["likes", (r) => r.likes],
      ["replies", (r) => r.replies],
      ["is_reply", (r) => r.is_reply],
      ["posted_at", (r) => toIso(r.created_at)],
      ["profile", (r) => r.author ? `https://www.instagram.com/${r.author}/` : ""],
    ],
  },
  posts: {
    noun: "posts",
    label: "Instagram profile URL or @handle",
    placeholder: "https://www.instagram.com/nasa/  or  @nasa",
    hint: "Open a profile in your Instagram tab, or paste its URL / @handle.",
    columns: [
      ["url", (r) => r.url],
      ["type", (r) => r.type],
      ["posted_at", (r) => toIso(r.taken_at)],
      ["likes", (r) => r.likes],
      ["comments", (r) => r.comments],
      ["views", (r) => r.views],
      ["caption", (r) => r.caption],
    ],
  },
  media: {
    noun: "media files",
    label: "Post or reel URL",
    placeholder: "https://www.instagram.com/p/...",
    hint: "Open a post or reel in your Instagram tab to download its photos & videos.",
    isMedia: true,
  },
};

let mode = "comments";
let rows = [];
let handleForName = "instagram";
let igTabId = null;

const $ = (id) => document.getElementById(id);

function toIso(epoch) {
  if (!epoch && epoch !== 0) return "";
  const n = Number(epoch);
  return Number.isFinite(n) ? new Date(n * 1000).toISOString() : String(epoch);
}

function applyMode() {
  const m = MODES[mode];
  $("inputLabel").textContent = m.label;
  $("target").placeholder = m.placeholder;
  $("inputHint").textContent = m.hint;
  $("rowNoun").textContent = m.noun;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-on", t.dataset.mode === mode));
  $("countRow").hidden = !!m.isMedia;
  $("run").textContent = m.isMedia ? "Get photos & videos" : "Export";
  $("result").hidden = true;
  $("mediaResult").hidden = true;
  $("status").hidden = true;
}

function classify(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    if (/^\/(p|reel|reels|tv)\//.test(u.pathname)) return { mode: "comments", value: u.origin + u.pathname };
    const seg = u.pathname.split("/").filter(Boolean);
    const reserved = new Set(["explore", "accounts", "direct", "stories", "about"]);
    if (seg.length >= 1 && !reserved.has(seg[0])) return { mode: "posts", value: "https://www.instagram.com/" + seg[0] + "/" };
  } catch (_) {}
  return null;
}

// The Instagram tab to work in: the active tab if it is Instagram, else any open one.
async function findInstagramTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && /^https:\/\/www\.instagram\.com\//.test(active.url || "")) return active;
  const tabs = await chrome.tabs.query({ url: "https://www.instagram.com/*" });
  return tabs[0] || null;
}

async function prefillFromTab() {
  try {
    const tab = await findInstagramTab();
    if (!tab) return;
    igTabId = tab.id;
    const hit = classify(tab.url);
    if (hit) {
      mode = hit.mode;
      applyMode();
      $("target").value = hit.value;
    }
  } catch (_) {}
}

function setStatus(msg, kind, pct) {
  const el = $("status");
  el.hidden = false;
  el.className = "status" + (kind === "err" ? " err" : "");
  el.innerHTML = kind === "run"
    ? `${escapeHtml(msg)}<div class="bar"><i style="${pct != null ? `animation:none;width:${pct}%` : ""}"></i></div>`
    : escapeHtml(msg);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function nameFromValue(v) {
  const m = String(v).match(/instagram\.com\/([^/?#]+)/) || String(v).match(/@?([\w.]+)/);
  return (m && m[1]) ? m[1].replace(/^@/, "") : "instagram";
}

// Progress messages from the script running in the Instagram tab.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.igxProgress) {
    const p = msg.igxProgress;
    setStatus(`${p.text}`, "run", p.total ? Math.min(99, Math.round((p.n / p.total) * 100)) : null);
  }
});

async function run() {
  const m = MODES[mode];
  const value = $("target").value.trim();
  if (!value) {
    setStatus(`Enter ${mode === "posts" ? "a profile URL or @handle" : "a post or reel URL"}.`, "err");
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
  $("mediaResult").hidden = true;
  setStatus("Starting in your Instagram tab…", "run");
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: igTabId },
      func: igxScrape,
      args: [mode, value, count],
    });
    let out = res && res.result;
    if (out && out.navigate) {
      setStatus("Opening the profile in your Instagram tab…", "run");
      await chrome.tabs.update(igTabId, { url: out.navigate });
      await new Promise((resolve) => {
        const done = (id, info) => { if (id === igTabId && info.status === "complete") { chrome.tabs.onUpdated.removeListener(done); resolve(); } };
        chrome.tabs.onUpdated.addListener(done);
        setTimeout(resolve, 20000);
      });
      await new Promise((r) => setTimeout(r, 3000));
      const [res2] = await chrome.scripting.executeScript({ target: { tabId: igTabId }, func: igxScrape, args: [mode, value, count] });
      out = res2 && res2.result;
    }
    if (!out || out.error) {
      setStatus((out && out.error) || "That export failed.", "err");
      return;
    }
    rows = out.rows || [];
    if (out.owner) handleForName = out.owner;
    if (!rows.length) {
      setStatus("No " + m.noun + " found. The account may be private, or the post has none.", "err");
      return;
    }
    $("status").hidden = true;
    if (m.isMedia) renderMedia(rows);
    else {
      $("rowCount").textContent = rows.length.toLocaleString();
      $("result").hidden = false;
      if (out.note) setStatus(out.note);
    }
  } catch (err) {
    setStatus("Could not run in the Instagram tab: " + (err && err.message ? err.message : err), "err");
  } finally {
    $("run").disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Runs INSIDE the Instagram tab (content-script world, same origin as the
// site, so the user's own session is used). Must be self-contained.
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
      let minId = null;
      do {
        const q = `can_support_threading=true&permalink_enabled=false` + (minId ? `&min_id=${encodeURIComponent(minId)}` : "");
        const page = await api(`/api/v1/media/${pk}/comments/?${q}`);
        for (const c of page.comments || []) {
          rows.push({ author: c.user && c.user.username, text: c.text, likes: c.comment_like_count, replies: c.child_comment_count || 0,
                      is_reply: false, created_at: c.created_at });
          if (c.child_comment_count && rows.length < limit) {
            let maxId = null, guard = 0;
            do {
              const rp = await api(`/api/v1/media/${pk}/comments/${c.pk}/child_comments/` + (maxId ? `?max_id=${encodeURIComponent(maxId)}` : ""));
              for (const r of rp.child_comments || []) {
                rows.push({ author: r.user && r.user.username, text: r.text, likes: r.comment_like_count, replies: 0,
                            is_reply: true, created_at: r.created_at });
              }
              maxId = rp.has_more_tail_child_comments ? rp.next_max_child_cursor : null;
              await pace();
            } while (maxId && ++guard < 20 && rows.length < limit);
          }
          if (rows.length >= limit) break;
        }
        progress(rows.length, total, `${rows.length.toLocaleString()} of ~${total.toLocaleString()} comments…`);
        minId = page.has_more_headload_comments || page.next_min_id ? page.next_min_id : null;
        if (minId) await pace();
      } while (minId && rows.length < limit);
      return { rows: rows.slice(0, limit), owner: item.user && item.user.username };
    }

    if (mode === "posts") {
      const m = String(value).match(/instagram\.com\/([^/?#]+)/) || String(value).match(/@?([\w.]+)/);
      const username = m && m[1].replace(/^@/, "");
      if (!username) return { error: "Enter a profile URL or @handle." };
      // Instagram's web app no longer serves the feed API, so read the profile
      // grid like a person would: scroll it, collect post links, then fetch each
      // post's stats (the post-info endpoint still works for web sessions).
      const onProfile = location.pathname.toLowerCase().replace(/\/+$/, "").split("/")[1] === username.toLowerCase();
      if (!onProfile) return { navigate: `https://www.instagram.com/${username}/` };
      const codes = [];
      const seen = new Set();
      let idle = 0;
      while (codes.length < limit && idle < 5) {
        const before = codes.length;
        for (const a of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
          const c = codeOf(a.getAttribute("href"));
          if (c && !seen.has(c)) { seen.add(c); codes.push(c); }
        }
        progress(Math.min(codes.length, limit), limit, `Found ${Math.min(codes.length, limit).toLocaleString()} posts on the profile…`);
        idle = codes.length === before ? idle + 1 : 0;
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(1300);
      }
      window.scrollTo(0, 0);
      const pick = codes.slice(0, limit);
      const total = pick.length;
      const rows = [];
      for (const code of pick) {
        try {
          const info = await api(`/api/v1/media/${shortcodeToPk(code)}/info/`);
          const it = (info.items || [])[0];
          if (it) rows.push({
            url: `https://www.instagram.com/${it.product_type === "clips" ? "reel" : "p"}/${it.code}/`,
            type: it.product_type === "clips" ? "reel" : it.media_type === 8 ? "carousel" : it.media_type === 2 ? "video" : "photo",
            taken_at: it.taken_at, likes: it.like_count, comments: it.comment_count,
            views: it.play_count || it.view_count || "", caption: it.caption && it.caption.text,
          });
        } catch (e) {
          if (/rate-limiting/.test(e.message)) { if (rows.length) break; throw e; }
        }
        progress(rows.length, total, `${rows.length.toLocaleString()} of ${total.toLocaleString()} posts…`);
        await pace();
      }
      return { rows: rows.slice(0, limit), owner: username };
    }

    // media
    const code = codeOf(value);
    if (!code) return { error: "That doesn't look like a post or reel link." };
    const info = await api(`/api/v1/media/${shortcodeToPk(code)}/info/`);
    const item = (info.items || [])[0];
    if (!item) return { error: "Post not found." };
    const parts = item.carousel_media || [item];
    const rows = parts.map((p) => {
      const video = (p.video_versions || [])[0];
      const img = ((p.image_versions2 || {}).candidates || [])[0];
      return { is_video: !!video, url: video ? video.url : img && img.url, thumb: img && img.url };
    }).filter((x) => x.url);
    return { rows, owner: item.user && item.user.username };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}

// --- Export builders -------------------------------------------------------

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

function buildJson() {
  const cols = MODES[mode].columns;
  return JSON.stringify(rows.map((r) => Object.fromEntries(cols.map((c) => [c[0], c[1](r) ?? null]))), null, 2);
}

function download(text, type, ext) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  chrome.downloads.download({ url, filename: `instagram-${handleForName}-${mode}-${stamp}.${ext}`, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}

// --- Media -----------------------------------------------------------------

function downloadMedia(item, i) {
  if (!item || !item.url) return;
  chrome.downloads.download({ url: item.url, filename: `instagram-${handleForName}-${i + 1}.${item.is_video ? "mp4" : "jpg"}` });
}

function renderMedia(items) {
  const list = $("mediaList");
  list.innerHTML = "";
  items.forEach((item, i) => {
    const cell = document.createElement("div");
    cell.className = "mcell";
    cell.innerHTML =
      `<div class="mthumb">` + (item.thumb ? `<img loading="lazy" src="${escapeHtml(item.thumb)}" alt="">` : "") +
      `<span class="mbadge">${item.is_video ? "▶ video" : "photo"}</span></div>` +
      `<button class="btn mdl">Download ${item.is_video ? "video" : "photo"}</button>`;
    cell.querySelector(".mdl").addEventListener("click", () => downloadMedia(item, i));
    list.appendChild(cell);
  });
  $("mediaCount").textContent = items.length.toLocaleString();
  $("mediaNoun").textContent = items.length === 1 ? "file" : "files";
  $("dlAllMedia").hidden = items.length < 2;
  $("mediaResult").hidden = false;
}

// --- Wire up ---------------------------------------------------------------

function wire() {
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      if (t.dataset.mode === mode) return;
      mode = t.dataset.mode;
      $("target").value = "";
      applyMode();
    });
  });
  $("run").addEventListener("click", run);
  $("target").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  $("dlCsv").addEventListener("click", () => download(buildCsv(), "text/csv;charset=utf-8", "csv"));
  $("dlJson").addEventListener("click", () => download(buildJson(), "application/json", "json"));
  $("dlAllMedia").addEventListener("click", () => rows.forEach((item, i) => downloadMedia(item, i)));
  applyMode();
  prefillFromTab();
}

if (document.readyState !== "loading") wire();
else document.addEventListener("DOMContentLoaded", wire);
