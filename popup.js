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
      const postLike = ["comments", "likers", "media"].includes(mode), profLike = ["posts", "followers", "following"].includes(mode);
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
  if (!ai.key) { $("aiCfg").hidden = false; throw new Error("Add your OpenAI or Claude API key first (⚙ API key)."); }
  const model = ai.model || AI_DEFAULT[ai.prov];
  if (ai.prov === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ai.key, "anthropic-version": "2023-06-01",
                 "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || `Claude error ${r.status}`);
    return (d.content || []).map((c) => c.text || "").join("");
  }
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ai.key}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
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

// --- Account: 1 free export, then Pro ($3/month) ----------------------------
// Only the licence check talks to hammadi.dev; scraped data never leaves the tab.
const HD = "https://hammadi.dev";
let acct = null;

async function loadAccount() {
  const el = $("acct");
  try {
    const r = await fetch(`${HD}/public/v1/ext/status`, { credentials: "include" });
    acct = await r.json();
  } catch (_) {
    acct = null;
  }
  if (!acct) { el.textContent = "Can't reach hammadi.dev right now."; return; }
  if (!acct.logged_in) {
    el.innerHTML = `<span>Log in to get <b>1 free export</b></span><a href="${HD}/login?next=/extension" target="_blank" rel="noopener">Log in / sign up →</a>`;
  } else if (acct.pro) {
    el.innerHTML = `<span>✓ <b>Pro</b> · unlimited exports</span><span>${escapeHtml(acct.email)}</span>`;
  } else if (acct.free_left > 0) {
    el.innerHTML = `<span><b>${acct.free_left} free export</b> left</span><button class="pro" id="goPro">Go Pro · $3/mo</button>`;
  } else {
    el.innerHTML = `<span>Free export used</span><button class="pro" id="goPro">Unlimited · $3/month</button>`;
  }
  const b = document.getElementById("goPro");
  if (b) b.addEventListener("click", goPro);
}

async function goPro() {
  try {
    const r = await fetch(`${HD}/public/v1/ext/checkout`, { method: "POST", credentials: "include" });
    const d = await r.json();
    if (d.url) chrome.tabs.create({ url: d.url });
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
    setStatus("Log in to hammadi.dev first: your first export is free.", "err");
    chrome.tabs.create({ url: `${HD}/login?next=/extension` });
    return false;
  }
  if (acct.pro || acct.free_left > 0) return true;
  setStatus("Your free export is used. Go Pro for unlimited exports: $3/month.", "err");
  return false;
}

async function markUsed() {
  try { await fetch(`${HD}/public/v1/ext/use`, { method: "POST", credentials: "include" }); } catch (_) {}
  loadAccount();
}

// --- Wire up ---------------------------------------------------------------

function wire() {
  if (new URLSearchParams(location.search).get("inpage")) document.documentElement.classList.add("inpage");
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
