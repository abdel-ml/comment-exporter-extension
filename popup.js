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
  likers: {
    noun: "likers",
    label: "Post or reel URL",
    placeholder: "https://www.instagram.com/p/...",
    hint: "Open a post or reel in your Instagram tab. Instagram shows up to ~100 likers per post.",
    columns: [
      ["username", (r) => r.username],
      ["full_name", (r) => r.full_name],
      ["verified", (r) => r.verified],
      ["private", (r) => r.private],
      ["profile", (r) => r.username ? `https://www.instagram.com/${r.username}/` : ""],
    ],
  },
  followers: {
    noun: "followers",
    label: "Instagram profile URL or @handle",
    placeholder: "@nasa",
    hint: "Instagram shows only ~50 followers of other accounts; your own account's list is complete.",
    columns: [
      ["username", (r) => r.username],
      ["full_name", (r) => r.full_name],
      ["verified", (r) => r.verified],
      ["private", (r) => r.private],
      ["profile", (r) => r.username ? `https://www.instagram.com/${r.username}/` : ""],
    ],
  },
  following: {
    noun: "accounts",
    label: "Instagram profile URL or @handle",
    placeholder: "@nasa",
    hint: "Public profiles, or private ones you follow.",
    columns: [
      ["username", (r) => r.username],
      ["full_name", (r) => r.full_name],
      ["verified", (r) => r.verified],
      ["private", (r) => r.private],
      ["profile", (r) => r.username ? `https://www.instagram.com/${r.username}/` : ""],
    ],
  },
  suggested: {
    noun: "suggested accounts",
    label: "Instagram profile URL or @handle",
    placeholder: "@nasa",
    hint: "Accounts Instagram suggests as similar to this profile.",
    columns: [
      ["username", (r) => r.username],
      ["full_name", (r) => r.full_name],
      ["verified", (r) => r.verified],
      ["private", (r) => r.private],
      ["profile", (r) => r.username ? `https://www.instagram.com/${r.username}/` : ""],
    ],
  },
  ytsearch: {
    noun: "videos",
    label: "YouTube search",
    placeholder: "https://www.youtube.com/results?search_query=...",
    hint: "Open a YouTube search in your tab, or type what to search.",
    columns: [
      ["title", (r) => r.title], ["channel", (r) => r.channel], ["views", (r) => r.views], ["published", (r) => r.published],
      ["duration", (r) => r.duration], ["url", (r) => r.url], ["channel_url", (r) => r.channel_url], ["description", (r) => r.description],
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
let site = "instagram"; // or "youtube"
const SITE_RE = { instagram: /^https:\/\/www\.instagram\.com\//, youtube: /^https:\/\/(www|m)\.youtube\.com\// };

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
  $("modeSel").value = mode;
  $("countRow").hidden = !!m.isMedia;
  $("run").textContent = m.isMedia ? "Get photos & videos" : "Export";
  $("result").hidden = true;
  $("mediaResult").hidden = true;
  $("status").hidden = true;
  if ($("ai")) $("ai").hidden = true;
  if ($("gw")) $("gw").hidden = true;
  if ($("ins")) $("ins").hidden = true;
}

function classify(url) {
  try {
    const u = new URL(url);
    if (/(^|\.)youtube\.com$/.test(u.hostname) && u.pathname === "/results") {
      return { mode: "ytsearch", value: u.href, site: "youtube" };
    }
    if (/(^|\.)youtube\.com$/.test(u.hostname) && (u.pathname === "/watch" || u.pathname.startsWith("/shorts/"))) {
      return { mode: "comments", value: u.href, site: "youtube" };
    }
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    if (/^\/(p|reel|reels|tv)\//.test(u.pathname)) return { mode: "comments", value: u.origin + u.pathname };
    const seg = u.pathname.split("/").filter(Boolean);
    const reserved = new Set(["explore", "accounts", "direct", "stories", "about"]);
    if (seg.length >= 1 && !reserved.has(seg[0])) return { mode: "posts", value: "https://www.instagram.com/" + seg[0] + "/" };
  } catch (_) {}
  return null;
}

// The Instagram tab to work in: the active tab if it is Instagram, else any open one.
async function findInstagramTab(want) {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  for (const k of want ? [want] : ["instagram", "youtube"]) {
    if (active && SITE_RE[k].test(active.url || "")) return active;
  }
  const tabs = await chrome.tabs.query({ url: want === "youtube" ? ["https://www.youtube.com/*"] : ["https://www.instagram.com/*"] });
  return tabs[0] || null;
}

function setSite(s) {
  site = s;
  for (const o of $("modeSel").options) o.hidden = s === "youtube" ? !["comments", "ytsearch"].includes(o.value) : o.value === "ytsearch";
  if (s === "youtube") {
    if (!["comments", "ytsearch"].includes(mode)) mode = "comments";
    MODES.comments.placeholder = "https://www.youtube.com/watch?v=...";
    MODES.comments.label = "YouTube video or Short";
    MODES.comments.hint = "Open the video in a YouTube tab.";
  }
}

async function prefillFromTab(keepMode) {
  try {
    const tab = await findInstagramTab();
    if (!tab) return;
    igTabId = tab.id;
    const hit = classify(tab.url);
    if (!hit) return;
    if (keepMode) {
      // Same page, other export: reuse the URL when it fits the chosen mode.
      const postLike = ["comments", "likers", "media"].includes(mode), profLike = ["posts", "followers", "following", "suggested"].includes(mode);
      if ((postLike && /\/(p|reel|reels|tv)\//.test(hit.value)) || (profLike && hit.mode === "posts") || (mode === hit.mode)) $("target").value = hit.value;
      else if (profLike && /instagram\.com/.test(tab.url)) {
        const owner = document.querySelector("#target").value;
        if (!owner) $("target").value = "";
      }
      return;
    }
    {
      setSite(hit.site || "instagram");
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
  const isYt = mode === "ytsearch" || /youtube\.com|youtu\.be/.test(value);
  setSite(isYt ? "youtube" : "instagram");
  const tab = await findInstagramTab(site);
  if (!tab) {
    setStatus(isYt ? "Open the video in a YouTube tab, then try again." : "Open instagram.com in a tab and log in, then try again.", "err");
    return;
  }
  const ytTarget = mode === "ytsearch" && !/^https?:/.test(value)
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(value)}` : value;
  if (isYt && tab.url !== ytTarget && tab.url.split("&")[0] !== ytTarget.split("&")[0]) {
    await chrome.tabs.update(tab.id, { url: ytTarget });
    await new Promise((r) => setTimeout(r, 4000));
  }
  igTabId = tab.id;
  handleForName = nameFromValue(value);
  const count = Number($("count").value) || 500;
  if (!(await allowExport())) return;

  $("run").disabled = true;
  $("result").hidden = true;
  $("mediaResult").hidden = true;
  setStatus("Starting in your Instagram tab…", "run");
  try {
    const [res] = await chrome.scripting.executeScript(site === "youtube"
      ? (mode === "ytsearch" ? { target: { tabId: igTabId }, func: ytxSearch, args: [count] }
                             : { target: { tabId: igTabId }, func: ytxComments, args: [count] })
      : { target: { tabId: igTabId }, func: igxScrape, args: [mode, value, count] });
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
    if (rows.length) markUsed();
    if (!rows.length) {
      setStatus("No " + m.noun + " found. The account may be private, or the post has none.", "err");
      return;
    }
    $("status").hidden = true;
    if (m.isMedia) renderMedia(rows);
    else {
      $("rowCount").textContent = rows.length.toLocaleString();
      $("result").hidden = false;
      $("ai").hidden = mode !== "comments";
      $("gw").hidden = mode !== "comments";
      if (mode === "comments") renderInsights(); else $("ins").hidden = true;
      gwOwner = out.owner || "";
      $("gwRes").hidden = true;
      if (mode === "comments") gwUpdatePool();
      suggestions = {}; $("aiList").innerHTML = ""; $("aiAns").hidden = true;
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

    if (mode === "likers") {
      const code = codeOf(value);
      if (!code) return { error: "That doesn't look like a post or reel link." };
      const d = await api(`/api/v1/media/${shortcodeToPk(code)}/likers/`);
      const rows = (d.users || []).slice(0, limit).map((u) => ({ username: u.username, full_name: u.full_name,
        verified: !!u.is_verified, private: !!u.is_private }));
      return { rows, owner: code };
    }

    if (mode === "suggested") {
      const m = String(value).match(/instagram\.com\/([^/?#]+)/) || String(value).match(/@?([\w.]+)/);
      const username = m && m[1].replace(/^@/, "");
      if (!username) return { error: "Enter a profile URL or @handle." };
      const found = await api(`/web/search/topsearch/?query=${encodeURIComponent(username)}&context=blended`);
      const hit = (found.users || []).map((x) => x.user).find((u) => (u.username || "").toLowerCase() === username.toLowerCase());
      if (!hit) return { error: "Profile not found." };
      const d = await api(`/api/v1/discover/chaining/?target_id=${hit.pk || hit.id}`);
      const rows = (d.users || []).slice(0, limit).map((u) => ({ username: u.username, full_name: u.full_name,
        verified: !!u.is_verified, private: !!u.is_private }));
      return { rows, owner: username + "-suggested" };
    }

    if (mode === "followers" || mode === "following") {
      const m = String(value).match(/instagram\.com\/([^/?#]+)/) || String(value).match(/@?([\w.]+)/);
      const username = m && m[1].replace(/^@/, "");
      if (!username) return { error: "Enter a profile URL or @handle." };
      const found = await api(`/web/search/topsearch/?query=${encodeURIComponent(username)}&context=blended`);
      const hit = (found.users || []).map((x) => x.user).find((u) => (u.username || "").toLowerCase() === username.toLowerCase());
      if (!hit) return { error: "Profile not found." };
      const uid = hit.pk || hit.id;
      const rows = [];
      let maxId = null, guard = 0;
      do {
        const q = `count=50` + (mode === "followers" ? "&search_surface=follow_list_page" : "") + (maxId ? `&max_id=${encodeURIComponent(maxId)}` : "");
        const d = await api(`/api/v1/friendships/${uid}/${mode}/?${q}`);
        for (const u of d.users || []) rows.push({ username: u.username, full_name: u.full_name, verified: !!u.is_verified, private: !!u.is_private });
        progress(rows.length, limit, `${rows.length.toLocaleString()} ${mode === "followers" ? "followers" : "accounts"}…`);
        maxId = d.next_max_id || null;
        if (maxId) await pace();
      } while (maxId && rows.length < limit && ++guard < 400);
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

// --- Comment insights (local, no API key) ------------------------------------
const POS_W = /\b(love|loved|lovely|amazing|awesome|beautiful|gorgeous|great|perfect|best|cute|obsessed|wow|incredible|fantastic|nice|good|stunning|fire|queen|yes|need|want|thank|thanks|excellent|happy|favorite|favourite|adorable|wonderful|bonito|bonita|hermoso|hermosa|me encanta|encanta|precioso|genial|gracias|lindo|linda|belle|beau|magnifique|super|j'adore|merci|top|lindo|maravilhoso|amei|obrigad[oa]|perfeito|incrível|schön|toll|liebe|danke|bellissim[oa]|grazie|harika|güzel|bayıldım)\b/gi;
const NEG_W = /\b(hate|bad|worst|ugly|terrible|awful|scam|fake|disappointed|disappointing|overpriced|expensive|broke|broken|never|boring|trash|horrible|sad|cringe|gross|no|not|don't|dont|stop|wrong|poor|refund|malo|mala|feo|fea|caro|estafa|horrible|nul|nulle|cher|arnaque|décevant|ruim|caro|horrível|schlecht|teuer|brutto|costoso|kötü|pahalı)\b/gi;
const POS_E = /[😍❤️🥰😘💕💖💗💯🔥👏🙌✨😊😁🤩💪👍😻💜💙💚🧡🤍💛🫶]/gu;
const NEG_E = /[😡🤬👎🤮😒💔😤🙄😞😢😭🤢]/gu;
const STOP = new Set("the a an and or but to of in on for with is are was it this that i you he she we they my your me so be at as do not just have has had what when how all can its from will would there their them our out up get got like very really more one too also about here then than some any been did does am im dont amp que de la el en y los las un una por para con es lo le les des et du je tu il elle pas est o os as da do e um uma não com para mas ich du und der die das ist nicht ein eine il la di che e per non".split(" "));
function sentimentOf(t) {
  const p = (t.match(POS_W) || []).length + (t.match(POS_E) || []).length;
  const n = (t.match(NEG_W) || []).length * 1.2 + (t.match(NEG_E) || []).length * 1.5;
  return p > n ? "positive" : n > p ? "negative" : "neutral";
}
function renderInsights() {
  const texts = rows.map((r) => String(r.text || "")).filter((t) => t.trim());
  if (!texts.length) { $("ins").hidden = true; return; }
  const c = { positive: 0, neutral: 0, negative: 0 };
  const words = {}, emo = {};
  let questions = 0, buyers = 0;
  for (const t of texts) {
    c[sentimentOf(t)]++;
    if (t.includes("?")) questions++;
    if (/price|how much|link|where (can|do|to) (i )?(buy|get)|cu[aá]nto|precio|d[oó]nde|prix|combien|quanto|preço|ship|env[ií]o/i.test(t)) buyers++;
    for (const w of t.toLowerCase().replace(/@[\w.]+/g, " ").match(/[\p{L}']{3,}/gu) || []) if (!STOP.has(w)) words[w] = (words[w] || 0) + 1;
    for (const e of t.match(/\p{Extended_Pictographic}/gu) || []) emo[e] = (emo[e] || 0) + 1;
  }
  const tot = texts.length, pct = (k) => Math.round((c[k] * 100) / tot);
  $("insPos").style.width = pct("positive") + "%"; $("insNeu").style.width = pct("neutral") + "%"; $("insNeg").style.width = pct("negative") + "%";
  $("insPct").innerHTML = `<b style="color:#16a34a">${pct("positive")}% positive</b> · ${pct("neutral")}% neutral · <b style="color:#dc2626">${pct("negative")}% negative</b>`;
  $("insKpi").innerHTML = `<div><b>${tot.toLocaleString()}</b>comments</div><div><b>${questions.toLocaleString()}</b>questions</div><div><b>${buyers.toLocaleString()}</b>want to buy</div>`;
  const top = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 24);
  const max = top.length ? top[0][1] : 1;
  $("insCloud").innerHTML = top.sort(() => Math.random() - 0.5)
    .map(([w, n]) => `<span title="${n}×" style="font-size:${11 + Math.round((n / max) * 15)}px">${escapeHtml(w)}</span>`).join("");
  $("insEmo").innerHTML = Object.entries(emo).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([e, n]) => `<span>${e}<small>×${n}</small></span>`).join("");
  $("ins").hidden = false;
}

// --- Giveaway picker (fair: crypto random) ----------------------------------
let gwOwner = "";
function gwEntries() {
  const tags = Number($("gwTags").value), kw = $("gwKw").value.trim().toLowerCase();
  const unique = $("gwUnique").checked, exclOwner = $("gwOwner").checked;
  const seen = new Set(), out = [];
  for (const r of rows) {
    const u = (r.author || "").toLowerCase(), t = r.text || "";
    if (!u) continue;
    if (exclOwner && gwOwner && u === gwOwner.toLowerCase()) continue;
    // Tagging yourself or the post owner doesn't count as tagging a friend.
    if (tags && new Set((t.match(/@[\w.]{2,30}/g) || []).map((m) => m.slice(1).toLowerCase().replace(/\.$/, ""))
      .filter((m) => m !== u && m !== (gwOwner || "").toLowerCase())).size < tags) continue;
    if (kw && !t.toLowerCase().includes(kw)) continue;
    if (unique) { if (seen.has(u)) continue; seen.add(u); }
    out.push(r);
  }
  return out;
}
function gwUpdatePool() {
  const n = gwEntries().length;
  $("gwPool").textContent = `${n.toLocaleString()} eligible ${n === 1 ? "entry" : "entries"} out of ${rows.length.toLocaleString()} comments.`;
}
function randInt(max) {
  const a = new Uint32Array(1);
  const lim = Math.floor(0xffffffff / max) * max;
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % max;
}
async function gwPick() {
  const pool = gwEntries().slice();
  const want = Math.min(Number($("gwN").value), pool.length);
  if (!want) { $("gwPool").textContent = "No eligible entries with these rules."; return; }
  $("gwGo").disabled = true;
  $("gwRes").hidden = true;
  const roll = $("gwRoll");
  roll.hidden = false;
  for (let i = 0; i < 22; i++) {           // a short shuffle animation
    roll.textContent = "@" + (pool[randInt(pool.length)].author || "");
    await new Promise((r) => setTimeout(r, 40 + i * 6));
  }
  const winners = [];
  for (let i = 0; i < want; i++) winners.push(pool.splice(randInt(pool.length), 1)[0]);
  roll.hidden = true;
  const stamp = new Date().toLocaleString();
  const res = $("gwRes");
  res.innerHTML = winners.map((w, i) => `<div class="gw-win"><b>${want > 1 ? "#" + (i + 1) + " " : "🏆 "}@${escapeHtml(w.author)}</b>`
    + `<p>“${escapeHtml((w.text || "").slice(0, 160))}”</p><p><a target="_blank" href="https://www.instagram.com/${encodeURIComponent(w.author)}/">Open profile →</a></p></div>`).join("")
    + `<p class="gw-pool">Drawn at random from ${gwEntries().length.toLocaleString()} eligible entries · ${escapeHtml(stamp)}</p>`
    + `<div class="gw-acts"><button id="gwAgain" class="btn ghost" type="button">Draw again</button><button id="gwCopy" class="btn ghost" type="button">Copy result</button>`
    + `<button id="gwCard" class="btn" type="button">Save winner card</button></div>`;
  res.hidden = false;
  $("gwGo").disabled = false;
  $("gwAgain").addEventListener("click", gwPick);
  $("gwCopy").addEventListener("click", (e) => {
    navigator.clipboard.writeText(`🎉 Giveaway winner${want > 1 ? "s" : ""}: ${winners.map((w) => "@" + w.author).join(", ")}\n`
      + `Picked at random from ${gwEntries().length} eligible comments with Comment Exporter (hammadi.dev/extension).`);
    e.target.textContent = "Copied ✓";
  });
  $("gwCard").addEventListener("click", () => gwCardPng(winners, stamp));
}
function gwCardPng(winners, stamp) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1080;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, "#f58529"); grad.addColorStop(0.55, "#dd2a7b"); grad.addColorStop(1, "#8134af");
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = "#fff"; g.textAlign = "center";
  g.font = "bold 64px -apple-system, Segoe UI, Roboto, sans-serif";
  g.fillText(winners.length > 1 ? "Giveaway winners" : "Giveaway winner", 540, 250);
  g.font = "bold 76px -apple-system, Segoe UI, Roboto, sans-serif";
  winners.slice(0, 5).forEach((w, i) => g.fillText("@" + w.author, 540, 420 + i * 110));
  g.font = "32px -apple-system, Segoe UI, Roboto, sans-serif";
  g.fillText(`Picked at random from ${gwEntries().length.toLocaleString()} eligible comments`, 540, 900);
  g.font = "26px -apple-system, Segoe UI, Roboto, sans-serif";
  g.fillText(`${stamp} · hammadi.dev/extension`, 540, 950);
  c.toBlob((b) => {
    const url = URL.createObjectURL(b);
    chrome.downloads.download({ url, filename: `giveaway-winner-${handleForName}.png`, saveAs: true }, () => setTimeout(() => URL.revokeObjectURL(url), 60000));
  }, "image/png");
}

// --- AI replies & chat (user's own OpenAI / Claude key, stored locally) -------
const AI_DEFAULT = { openai: "gpt-4o-mini", anthropic: "claude-haiku-4-5-20251001" };
let ai = { prov: "openai", key: "", model: "", voice: "" };
let suggestions = {};

async function aiLoad() {
  try { ai = { ...ai, ...((await chrome.storage.local.get("igxAi")).igxAi || {}) }; } catch (_) {}
  $("aiProv").value = ai.prov; $("aiKey").value = ai.key; $("aiModel").value = ai.model; $("aiVoice").value = ai.voice;
}
async function aiSave() {
  ai = { prov: $("aiProv").value, key: $("aiKey").value.trim(), model: $("aiModel").value.trim(), voice: $("aiVoice").value.trim() };
  await chrome.storage.local.set({ igxAi: ai });
  $("aiCfg").hidden = true;
}
async function llm(system, user, maxTokens = 1200) {
  return llmChat(system, [{ role: "user", content: user }], maxTokens);
}
async function llmChat(system, messages, maxTokens = 1200) {
  if (!ai.key) { $("aiCfg").hidden = false; $("ai").hidden = false; throw new Error("Add your OpenAI or Claude API key first (⚙ API key)."); }
  const model = ai.model || AI_DEFAULT[ai.prov];
  if (ai.prov === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ai.key, "anthropic-version": "2023-06-01",
                 "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || `Claude error ${r.status}`);
    return (d.content || []).map((c) => c.text || "").join("");
  }
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ai.key}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || `OpenAI error ${r.status}`);
  return d.choices[0].message.content || "";
}
function pickComments(n) {
  // Questions and buying intent first, then the most-liked comments.
  const score = (r) => (/\?/.test(r.text || "") ? 3 : 0) + (/price|how much|link|where|buy|ship|cu[aá]nto|precio|prix|combien/i.test(r.text || "") ? 4 : 0)
    + Math.log10(1 + (parseInt(String(r.likes).replace(/\D/g, ""), 10) || 0));
  return rows.map((r, i) => ({ ...r, i })).filter((r) => (r.text || "").trim() && !r.is_reply)
    .sort((a, b) => score(b) - score(a)).slice(0, n);
}
async function aiSuggest() {
  const btn = $("aiSuggest");
  btn.disabled = true; btn.textContent = "Writing replies…";
  try {
    const picks = pickComments(15);
    const sys = "You write short, warm, human replies to social media comments on behalf of the account owner. "
      + "Answer questions helpfully, thank compliments, handle complaints calmly. Max 1-2 sentences, match the comment's language, "
      + "no hashtags. " + (ai.voice ? `About the account: ${ai.voice}.` : "")
      + " Return ONLY JSON: [{\"i\": <index>, \"reply\": \"...\"}].";
    const user = JSON.stringify(picks.map((p) => ({ i: p.i, author: p.author, comment: p.text })));
    const out = await llm(sys, user);
    const arr = JSON.parse((out.match(/\[[\s\S]*\]/) || ["[]"])[0]);
    const list = $("aiList");
    list.innerHTML = "";
    for (const it of arr) {
      const r = rows[it.i];
      if (!r) continue;
      suggestions[it.i] = it.reply;
      const el = document.createElement("div");
      el.className = "ai-item";
      el.innerHTML = `<div class="c"><b>@${escapeHtml(r.author || "")}</b>: ${escapeHtml((r.text || "").slice(0, 160))}</div>`
        + `<div class="r">↳ ${escapeHtml(it.reply)}</div><div class="row"><button class="link cp">Copy reply</button>`
        + (r.author ? `<a class="link" target="_blank" href="https://www.instagram.com/${encodeURIComponent(r.author)}/">Profile</a>` : "") + `</div>`;
      el.querySelector(".cp").addEventListener("click", (e) => { navigator.clipboard.writeText(it.reply); e.target.textContent = "Copied ✓"; });
      list.appendChild(el);
    }
    if (!arr.length) list.textContent = "No replies came back, try again.";
  } catch (e) {
    $("aiList").textContent = e.message || String(e);
  } finally {
    btn.disabled = false; btn.textContent = "Suggest replies to top comments";
  }
}
async function aiAsk() {
  const q = $("aiQ").value.trim();
  if (!q) return;
  const box = $("aiAns");
  box.hidden = false; box.textContent = "Thinking…";
  try {
    const sample = rows.filter((r) => (r.text || "").trim()).slice(0, 400)
      .map((r) => `- (${r.likes || 0} likes) ${String(r.text).replace(/\s+/g, " ").slice(0, 200)}`).join("\n");
    box.textContent = await llm("You analyse social media comments for the account owner. Be concrete and short; quote examples.",
      `Comments (${rows.length} total, up to 400 shown):\n${sample}\n\nQuestion: ${q}`, 900);
  } catch (e) {
    box.textContent = e.message || String(e);
  }
}

// --- Sentiment colors on the page (content.js does the painting) -------------
let colored = false;
async function toggleColor() {
  const tab = await findInstagramTab();
  if (!tab) { setStatus("Open an Instagram post/reel or a YouTube video first.", "err"); return; }
  colored = !colored;
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { igxColor: colored });
    $("colorBtn").textContent = colored ? "✓ Colors on (click to remove)" : "🎨 Color comments on the page";
    $("colorRes").hidden = !colored;
    if (colored && r) $("colorRes").textContent = `${r.total} comments colored so far: ${r.positive} positive · ${r.negative} negative · ${r.buyers} buyers. Scroll the comments, new ones get colored too.`;
  } catch (_) {
    colored = false;
    setStatus("Reload the Instagram/YouTube page once, then try again.", "err");
  }
}

// --- AI chat about the open page ----------------------------------------------
let chatCtx = null, chatUrl = "", chatMsgs = [];
function chatAdd(cls, text) {
  const d = document.createElement("div");
  d.className = cls; d.textContent = text;
  $("chatLog").appendChild(d); $("chatLog").scrollTop = $("chatLog").scrollHeight;
  return d;
}
async function chatContext() {
  const tab = await findInstagramTab();
  if (!tab) throw new Error("Open an Instagram profile or reel, or a YouTube video, in a tab first.");
  if (chatCtx && chatUrl === tab.url) return chatCtx;
  const yt = /youtube\.com/.test(tab.url);
  const [res] = await chrome.scripting.executeScript(yt
    ? { target: { tabId: tab.id }, func: ytxComments, args: [120] }
    : { target: { tabId: tab.id }, func: igxContext, args: [tab.url] });
  const out = res && res.result;
  if (!out || out.error) throw new Error((out && out.error) || "Couldn't read this page.");
  if (yt) {
    const title = tab.title.replace(/ - YouTube$/, "");
    out.kind = "youtube video"; out.summary = { title, url: tab.url, channel: out.owner,
      comments: (out.rows || []).slice(0, 120).map((r) => `(${r.likes} likes) ${String(r.text).slice(0, 200)}`) };
  }
  chatCtx = out; chatUrl = tab.url; chatMsgs = [];
  return out;
}
async function chatAsk() {
  const q = $("chatQ").value.trim();
  if (!q) return;
  $("chatQ").value = "";
  chatAdd("msg-u", q);
  const wait = chatAdd("msg-a ctx", chatCtx ? "Thinking…" : "Reading the page in your tab…");
  try {
    const ctx = await chatContext();
    if (!chatMsgs.length) wait.textContent = `Read ${ctx.kind}: ${ctx.label || ""}`;
    else wait.remove();
    const system = "You are a sharp social media analyst helping a brand or creator. Use ONLY the page data below; quote numbers "
      + "and real comments; be concrete and brief (max ~180 words); give a clear verdict when asked for a fit or a decision; "
      + "say what's missing if the data can't answer. " + (ai.voice ? `The user: ${ai.voice}. ` : "")
      + "\n\nPAGE DATA (" + ctx.kind + "):\n" + JSON.stringify(ctx.summary).slice(0, 14000);
    chatMsgs.push({ role: "user", content: q });
    const ans = await llmChat(system, chatMsgs.slice(-10), 900);
    chatMsgs.push({ role: "assistant", content: ans });
    chatAdd("msg-a", ans);
  } catch (e) {
    wait.textContent = e.message || String(e);
  }
}

// Runs in the Instagram tab: everything the chat needs about a profile or a post.
async function igxContext(url) {
  const APP_ID = "936619743392459";
  const csrf = (document.cookie.match(/(?:^|; )csrftoken=([^;]+)/) || [])[1] || "";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function api(path) {
    const r = await fetch("https://www.instagram.com" + path, { credentials: "include",
      headers: { "x-ig-app-id": APP_ID, "x-csrftoken": csrf, "x-requested-with": "XMLHttpRequest", "x-asbd-id": "129477" } });
    if (!r.ok) throw new Error("Instagram returned " + r.status);
    return r.json();
  }
  const pk = (code) => { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"; let n = 0n;
    for (const ch of code.slice(0, 11)) n = n * 64n + BigInt(A.indexOf(ch)); return n.toString(); };
  const post = (it) => ({ type: it.product_type === "clips" ? "reel" : it.media_type === 8 ? "carousel" : it.media_type === 2 ? "video" : "photo",
    date: it.taken_at ? new Date(it.taken_at * 1000).toISOString().slice(0, 10) : "", likes: it.like_count, comments: it.comment_count,
    views: it.play_count || it.view_count || null, caption: ((it.caption && it.caption.text) || "").slice(0, 300) });
  try {
    if (!/(?:^|; )ds_user_id=/.test(document.cookie)) return { error: "Log in to Instagram in this tab first." };
    const code = (url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/) || [])[1];
    if (code) {
      const it = ((await api(`/api/v1/media/${pk(code)}/info/`)).items || [])[0];
      if (!it) return { error: "Post not found." };
      const c = await api(`/api/v1/media/${pk(code)}/comments/?can_support_threading=true&permalink_enabled=false`);
      let comments = (c.comments || []).map((x) => `(${x.comment_like_count || 0} likes) @${x.user && x.user.username}: ${(x.text || "").slice(0, 200)}`);
      if (c.next_min_id) { await sleep(700); const c2 = await api(`/api/v1/media/${pk(code)}/comments/?can_support_threading=true&min_id=${encodeURIComponent(c.next_min_id)}`);
        comments = comments.concat((c2.comments || []).map((x) => `(${x.comment_like_count || 0} likes) @${x.user && x.user.username}: ${(x.text || "").slice(0, 200)}`)); }
      return { kind: "Instagram post/reel", label: "@" + (it.user && it.user.username), summary: { url, owner: it.user && it.user.username, ...post(it), comments: comments.slice(0, 120) } };
    }
    const username = (url.match(/instagram\.com\/([^/?#]+)/) || [])[1];
    if (!username) return { error: "Open a profile, post or reel." };
    const found = await api(`/web/search/topsearch/?query=${encodeURIComponent(username)}&context=blended`);
    const hit = (found.users || []).map((x) => x.user).find((u) => (u.username || "").toLowerCase() === username.toLowerCase());
    if (!hit) return { error: "Profile not found." };
    let info = {};
    try { info = (await api(`/api/v1/users/${hit.pk || hit.id}/info/`)).user || {}; } catch (_) {}
    const codes = [...new Set([...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')]
      .map((a) => (a.getAttribute("href").match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/) || [])[1]).filter(Boolean))].slice(0, 9);
    const posts = [];
    for (const cd of codes) { try { const it = ((await api(`/api/v1/media/${pk(cd)}/info/`)).items || [])[0]; if (it) posts.push(post(it)); } catch (_) {} await sleep(600); }
    const followers = info.follower_count || hit.follower_count || null;
    const avgEng = posts.length && followers ? (posts.reduce((a, p) => a + (p.likes || 0) + (p.comments || 0), 0) / posts.length / followers * 100).toFixed(2) + "%" : null;
    return { kind: "Instagram profile", label: "@" + username, summary: { username, full_name: info.full_name || hit.full_name, bio: info.biography || "",
      category: info.category || info.category_name || "", followers, following: info.following_count, posts_total: info.media_count,
      verified: !!(info.is_verified || hit.is_verified), business: !!info.is_business, website: info.external_url || "",
      avg_engagement_recent: avgEng, recent_posts: posts } };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}

// --- Account: 1 free export, then Pro ($3/month) ----------------------------
// Only the licence check talks to hammadi.dev; scraped data never leaves the tab.
const HD = "https://hammadi.dev";
let acct = null;
let token = "";
let authMode = "signup";

async function hd(path, opts = {}) {
  // Session token kept by the extension (sign-up/login happen in the panel); the
  // hammadi.dev cookie still works as a fallback for people logged in on the site.
  if (!token) { try { token = (await chrome.storage.local.get("igxToken")).igxToken || ""; } catch (_) {} }
  const headers = { ...(opts.headers || {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
  return fetch(`${HD}${path}`, { ...opts, headers, credentials: "include" });
}

async function loadAccount() {
  const el = $("acct");
  try { acct = await (await hd("/public/v1/ext/status")).json(); } catch (_) { acct = null; }
  if (!acct) { el.textContent = "Can't reach hammadi.dev right now."; return; }
  $("authBox").hidden = true;
  if (!acct.logged_in) {
    el.innerHTML = `<span><b>1 free export</b> with a free account</span><button class="pro" id="showAuth">Create account</button>`;
    document.getElementById("showAuth").addEventListener("click", () => { $("authBox").hidden = !$("authBox").hidden; $("authEmail").focus(); });
    return;
  }
  const out = `<button class="link" id="logout" title="Log out" style="font-size:11px;color:#999">log out</button>`;
  if (acct.pro) el.innerHTML = `<span>✓ <b>Pro</b> · unlimited · ${escapeHtml(acct.email)}</span>${out}`;
  else if (acct.free_left > 0) el.innerHTML = `<span><b>${acct.free_left} free export</b> left</span><button class="pro" id="goPro">Go Pro · $3/mo</button>`;
  else el.innerHTML = `<span>Free export used</span><button class="pro" id="goPro">Unlimited · $3/month</button>`;
  const b = document.getElementById("goPro");
  if (b) b.addEventListener("click", goPro);
  const lo = document.getElementById("logout");
  if (lo) lo.addEventListener("click", async () => { token = ""; await chrome.storage.local.remove("igxToken"); loadAccount(); });
}

function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll(".auth-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.a === m));
  $("authGo").textContent = m === "signup" ? "Create account & get 1 free export" : "Log in";
  $("authPw").autocomplete = m === "signup" ? "new-password" : "current-password";
  $("authErr").hidden = true;
}

async function doAuth(e) {
  e.preventDefault();
  const email = $("authEmail").value.trim(), password = $("authPw").value;
  $("authGo").disabled = true; $("authErr").hidden = true;
  try {
    let body;
    if (authMode === "signup") {
      const base = (email.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 18) || "user";
      body = { email, password, username: base + Math.floor(100 + Math.random() * 900) };
    } else {
      body = { identifier: email, password };
    }
    const r = await fetch(`${HD}/auth/${authMode}`, { method: "POST", credentials: "include",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.token) throw new Error((typeof d.detail === "string" && d.detail) || (d.detail && d.detail[0] && d.detail[0].msg) || "Couldn't sign you in.");
    token = d.token;
    await chrome.storage.local.set({ igxToken: token });
    await loadAccount();
  } catch (err) {
    $("authErr").textContent = err.message || String(err); $("authErr").hidden = false;
  } finally {
    $("authGo").disabled = false;
  }
}

async function goPro() {
  try {
    const r = await hd("/public/v1/ext/checkout", { method: "POST" });
    const d = await r.json();
    if (d.url) chrome.tabs.create({ url: d.url });   // straight to Stripe checkout
    else setStatus((d.detail && d.detail.error) || "Log in first.", "err");
  } catch (_) {
    setStatus("Can't reach hammadi.dev right now.", "err");
  }
}

// Before an export: logged in and (Pro or a free export left)? The free export
// is only spent after an export succeeds (markUsed), so a failure costs nothing.
async function allowExport() {
  await loadAccount();
  if (!acct) { setStatus("Can't reach hammadi.dev right now.", "err"); return false; }
  if (!acct.logged_in) {
    setStatus("Create a free account above to get your free export (takes 5 seconds).", "err");
    $("authBox").hidden = false; $("authEmail").focus();
    return false;
  }
  if (acct.pro || acct.free_left > 0) return true;
  setStatus("Your free export is used. Go Pro for unlimited exports: $3/month.", "err");
  return false;
}

async function markUsed() {
  try { await hd("/public/v1/ext/use", { method: "POST" }); } catch (_) {}
  loadAccount();
}

// --- Wire up ---------------------------------------------------------------

function wire() {
  const qp = new URLSearchParams(location.search);
  if (qp.get("inpage")) document.documentElement.classList.add("inpage");
  if (qp.get("mode") && MODES[qp.get("mode")]) { mode = qp.get("mode"); }
  $("modeSel").addEventListener("change", () => {
    mode = $("modeSel").value;
    if (mode === "ytsearch") setSite("youtube");
    else if (site === "youtube" && mode !== "comments") setSite("instagram");
    $("target").value = "";
    applyMode();
    prefillFromTab(true);
  });
  $("run").addEventListener("click", run);
  $("target").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  $("dlCsv").addEventListener("click", () => download(buildCsv(), "text/csv;charset=utf-8", "csv"));
  $("dlJson").addEventListener("click", () => download(buildJson(), "application/json", "json"));
  $("dlAllMedia").addEventListener("click", () => rows.forEach((item, i) => downloadMedia(item, i)));
  ["gwTags", "gwKw", "gwUnique", "gwOwner"].forEach((id) => $(id).addEventListener(id === "gwKw" ? "input" : "change", gwUpdatePool));
  $("gwGo").addEventListener("click", gwPick);
  document.querySelectorAll(".auth-tabs button").forEach((b) => b.addEventListener("click", () => setAuthMode(b.dataset.a)));
  $("authBox").addEventListener("submit", doAuth);
  $("colorBtn").addEventListener("click", toggleColor);
  $("chatAsk").addEventListener("click", chatAsk);
  $("chatQ").addEventListener("keydown", (e) => { if (e.key === "Enter") chatAsk(); });
  $("chatCfg").addEventListener("click", () => { $("ai").hidden = false; $("aiCfg").hidden = false; $("ai").scrollIntoView({ behavior: "smooth" }); });
  $("aiCfgBtn").addEventListener("click", () => { $("aiCfg").hidden = !$("aiCfg").hidden; });
  $("aiSave").addEventListener("click", aiSave);
  $("aiSuggest").addEventListener("click", aiSuggest);
  $("aiAsk").addEventListener("click", aiAsk);
  $("aiQ").addEventListener("keydown", (e) => { if (e.key === "Enter") aiAsk(); });
  aiLoad();
  applyMode();
  prefillFromTab();
  loadAccount();
}

if (document.readyState !== "loading") wire();
else document.addEventListener("DOMContentLoaded", wire);
