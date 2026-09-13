"use strict";

// Talks to the same free endpoints that power the tools on hammadi.dev.
// MV3 grants this page CORS-free access to hammadi.dev via host_permissions.
const API = "https://hammadi.dev/public/v1/run";

const MODES = {
  comments: {
    slug: "export-instagram-comments",
    param: "post_url",
    resultKey: "comments",
    noun: "comments",
    label: "Post or reel URL",
    placeholder: "https://www.instagram.com/reel/...",
    hint: "Paste a public post/reel URL, or open one in this tab.",
    columns: [
      ["author", (r) => r.owner && r.owner.username],
      ["text", (r) => r.text],
      ["likes", (r) => r.like_count],
      ["replies", (r) => r.reply_count],
      ["posted_at", (r) => toIso(r.created_at)],
    ],
  },
  posts: {
    slug: "instagram-posts",
    param: "channel_url",
    resultKey: "posts",
    noun: "posts",
    label: "Instagram profile URL or @handle",
    placeholder: "https://www.instagram.com/nasa/  or  @nasa",
    hint: "Paste a public profile, or open one in this tab.",
    columns: [
      ["url", (r) => r.url],
      ["type", (r) => r.type],
      ["posted_at", (r) => toIso(r.taken_at)],
      ["likes", (r) => r.like_count],
      ["comments", (r) => r.comment_count],
      ["views", (r) => r.view_count],
      ["caption", (r) => r.caption],
      ["author", (r) => r.owner && r.owner.username],
    ],
  },
};

let mode = "comments";
let rows = [];
let handleForName = "instagram";

const $ = (id) => document.getElementById(id);

function toIso(epoch) {
  if (!epoch && epoch !== 0) return "";
  const n = Number(epoch);
  if (!Number.isFinite(n)) return String(epoch);
  // Instagram timestamps are seconds.
  return new Date(n * 1000).toISOString();
}

function applyMode() {
  const m = MODES[mode];
  $("inputLabel").textContent = m.label;
  $("target").placeholder = m.placeholder;
  $("inputHint").textContent = m.hint;
  $("rowNoun").textContent = m.noun;
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("is-on", t.dataset.mode === mode);
  });
  $("result").hidden = true;
  $("status").hidden = true;
}

// Guess mode + prefill from whatever tab the user opened the popup on.
function classify(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    const path = u.pathname;
    if (/^\/(p|reel|reels|tv)\//.test(path)) {
      return { mode: "comments", value: u.origin + path };
    }
    const seg = path.split("/").filter(Boolean);
    const reserved = new Set(["explore", "accounts", "direct", "stories", "about"]);
    if (seg.length >= 1 && !reserved.has(seg[0])) {
      return { mode: "posts", value: "https://www.instagram.com/" + seg[0] + "/" };
    }
  } catch (_) {}
  return null;
}

async function prefillFromTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    const hit = classify(tab.url);
    if (hit) {
      mode = hit.mode;
      applyMode();
      $("target").value = hit.value;
    }
  } catch (_) {
    // activeTab may not be granted until the icon is clicked; harmless.
  }
}

function setStatus(msg, kind) {
  const el = $("status");
  el.hidden = false;
  el.className = "status" + (kind === "err" ? " err" : "");
  el.innerHTML = kind === "run" ? `${escapeHtml(msg)}<div class="bar"><i></i></div>` : escapeHtml(msg);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function nameFromValue(v) {
  const m = String(v).match(/instagram\.com\/([^/?#]+)/) || String(v).match(/@?([\w.]+)/);
  return (m && m[1]) ? m[1].replace(/^@/, "") : "instagram";
}

async function run() {
  const m = MODES[mode];
  const value = $("target").value.trim();
  if (!value) {
    setStatus(`Enter ${mode === "comments" ? "a post or reel URL" : "a profile URL or @handle"}.`, "err");
    return;
  }
  handleForName = nameFromValue(value);
  const count = $("count").value;

  $("run").disabled = true;
  $("result").hidden = true;
  setStatus(mode === "comments" ? "Pulling comments — reels with many comments can take a minute…" : "Pulling posts…", "run");

  const qs = new URLSearchParams({ [m.param]: value, count });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 290000);

  try {
    const res = await fetch(`${API}/${m.slug}?${qs.toString()}`, { signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));

    if (res.status === 429) {
      setStatus((body.detail && body.detail.error) || "Free hourly limit reached — try again later or use the API.", "err");
      return;
    }
    if (!res.ok) {
      const detail = body.detail;
      const msg = (detail && (detail.error || detail)) || body.error || `Lookup failed (${res.status}).`;
      setStatus(typeof msg === "string" ? msg : "That lookup failed.", "err");
      return;
    }

    rows = (body.data && body.data[m.resultKey]) || [];
    if (!rows.length) {
      setStatus("No " + m.noun + " found. The account may be private, or the post has none.", "err");
      return;
    }

    $("status").hidden = true;
    $("rowCount").textContent = rows.length.toLocaleString();
    $("result").hidden = false;

    const remaining = body.quota_remaining;
    $("quota").textContent = Number.isInteger(remaining) ? `${remaining} free lookups left this hour` : "";
  } catch (err) {
    setStatus(err.name === "AbortError" ? "Timed out — try a smaller count." : "Network error — check your connection.", "err");
  } finally {
    clearTimeout(timer);
    $("run").disabled = false;
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
  // BOM so Excel reads UTF-8 (emoji in captions/comments) correctly.
  return "﻿" + header + "\r\n" + lines.join("\r\n");
}

function buildJson() {
  const cols = MODES[mode].columns;
  return JSON.stringify(
    rows.map((r) => Object.fromEntries(cols.map((c) => [c[0], c[1](r) ?? null]))),
    null,
    2
  );
}

function download(text, type, ext) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `instagram-${handleForName}-${mode}-${stamp}.${ext}`;
  chrome.downloads.download({ url, filename: name, saveAs: true }, () => {
    // Revoke a little later so the download has grabbed the blob first.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
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
  $("target").addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });
  $("dlCsv").addEventListener("click", () => download(buildCsv(), "text/csv;charset=utf-8", "csv"));
  $("dlJson").addEventListener("click", () => download(buildJson(), "application/json", "json"));

  applyMode();
  prefillFromTab();
}

if (document.readyState !== "loading") wire();
else document.addEventListener("DOMContentLoaded", wire);
