"use strict";
// In-page UI: a floating "Export comments" button on Instagram posts/reels and
// YouTube videos. It opens the extension panel (popup.html) right on the page.
(function () {
  if (window.__igxButton) return;
  window.__igxButton = true;

  const supported = () => /instagram\.com\/(p|reel|reels|tv)\//.test(location.href)
    || /instagram\.com\/[^/?#]+\/?$/.test(location.href) && !/instagram\.com\/(explore|direct|accounts|stories)\b/.test(location.href)
    || /youtube\.com\/(watch|shorts\/)/.test(location.href);

  const btn = document.createElement("button");
  btn.id = "igx-fab";
  btn.type = "button";
  const ICON = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14\"/></svg>";
  btn.innerHTML = '<span class="igx-ic">' + ICON + '</span><span class="igx-tx">Export comments</span>';
  const panel = document.createElement("div");
  panel.id = "igx-panel";
  panel.innerHTML = '<button type="button" id="igx-close" aria-label="Close">×</button>';
  let frame = null;

  function label() {
    const isProfile = /instagram\.com\/[^/?#]+\/?$/.test(location.href) && !/\/(p|reel|reels|tv)\//.test(location.href);
    btn.querySelector(".igx-tx").textContent = isProfile ? "Export posts" : "Export comments";
  }
  if (/instagram\.com$/.test(location.hostname)) document.documentElement.classList.add("igx-ig");
  let wantMode = "";
  function toggle(open, mode) {
    const show = open ?? !panel.classList.contains("igx-open");
    if (show) {
      if (frame) frame.remove();
      frame = document.createElement("iframe");
      frame.src = chrome.runtime.getURL("popup.html") + "?inpage=1" + (mode || wantMode ? "&mode=" + (mode || wantMode) : "");
      frame.title = "Comment Exporter";
      panel.appendChild(frame);
    }
    panel.classList.toggle("igx-open", show);
    btn.classList.toggle("igx-hide", show);
  }
  btn.addEventListener("click", () => toggle(true));
  panel.querySelector("#igx-close").addEventListener("click", () => toggle(false));

  // Profile pages: a real button in the header, next to Follow / Message.
  function isProfile() {
    return /instagram\.com$/.test(location.hostname) && /^\/[^/]+\/?$/.test(location.pathname)
      && !/^\/(explore|direct|accounts|stories|reels)\/?$/.test(location.pathname);
  }
  function placeInline() {
    if (!isProfile() || document.querySelector(".igx-inline")) return;
    const header = document.querySelector("header");
    if (!header) return;
    const anchor = [...header.querySelectorAll("button, a, div[role=button]")]
      .find((b) => /^(Message|Follow|Following|Edit profile|Follow back)/i.test((b.textContent || "").trim()));
    const row = anchor && anchor.closest("div[class]") && anchor.parentElement && anchor.parentElement.parentElement;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "igx-inline";
    b.innerHTML = ICON + "<span>Export profile</span>";
    b.title = "Export this profile's posts, followers or following";
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggle(true, "posts"); });
    if (row && row.parentElement) {
      const wrap = document.createElement("div");
      wrap.className = "igx-inline-wrap";
      wrap.appendChild(b);
      row.parentElement.insertBefore(wrap, row.nextSibling);
    } else {
      header.appendChild(b);
    }
  }
  // "Suggested for you" on a profile: an Export button next to "See all".
  function placeSuggested() {
    if (!isProfile() || document.querySelector(".igx-sugg")) return;
    const title = [...document.querySelectorAll("main span, main h2, main div")]
      .find((e) => e.childElementCount === 0 && /^Suggested for you$/i.test((e.textContent || "").trim()));
    if (!title) return;
    const seeAll = [...document.querySelectorAll("main a, main span, main div[role=button]")]
      .find((e) => e.childElementCount === 0 && /^See all$/i.test((e.textContent || "").trim()));
    const b = document.createElement("button");
    b.type = "button";
    b.className = "igx-inline igx-sugg";
    b.innerHTML = ICON + "<span>Export all suggested</span>";
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggle(true, "suggested"); });
    const host = seeAll ? seeAll.parentElement : title.parentElement;
    if (seeAll) { b.style.marginRight = "12px"; host.insertBefore(b, seeAll); }
    else host.appendChild(b);
  }
  function sync() {
    const on = supported();
    btn.style.display = on ? "" : "none";
    if (!on) toggle(false);
    label();
    wantMode = isProfile() ? "posts" : "";
    if (!isProfile()) document.querySelectorAll(".igx-inline-wrap, .igx-inline").forEach((e) => e.remove());
    else { placeInline(); placeSuggested(); }
  }
  function mount() {
    if (!document.body) return setTimeout(mount, 300);
    document.body.appendChild(btn);
    document.body.appendChild(panel);
    sync();
  }
  mount();
  // Both sites are single-page apps: watch for URL changes.
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) { last = location.href; document.querySelectorAll(".igx-inline-wrap, .igx-inline").forEach((e) => e.remove()); sync(); }
    else if (isProfile()) { placeInline(); placeSuggested(); }
  }, 800);
})();

// --- Sentiment colors on the page ------------------------------------------
// The panel asks for it ("Color comments"); every visible comment gets a
// green / grey / red edge and 🛒 / ❓ tags, and new ones are colored as you scroll.
(function () {
  const POS = /\b(love|loved|amazing|awesome|beautiful|gorgeous|great|perfect|best|cute|obsessed|wow|incredible|fantastic|nice|good|stunning|fire|queen|thank|thanks|excellent|happy|favorite|favourite|adorable|wonderful|bonito|bonita|hermos[oa]|me encanta|precios[oa]|genial|gracias|lind[oa]|magnifique|super|j'adore|merci|maravilhos[oa]|amei|perfeito|schön|toll|bellissim[oa]|harika|güzel)\b/i;
  const NEG = /\b(hate|bad|worst|ugly|terrible|awful|scam|fake|disappointed|overpriced|expensive|broken|boring|trash|horrible|cringe|gross|refund|poor|malo|feo|caro|estafa|nul|arnaque|décevant|ruim|horrível|schlecht|teuer|kötü|pahalı)\b/i;
  const POS_E = /[😍❤🥰😘💕💖💗💯🔥👏🙌✨😊😁🤩💪👍😻💜💙💚🧡🤍💛🫶]/u, NEG_E = /[😡🤬👎🤮😒💔😤🙄😞😢😭🤢]/u;
  const BUY = /\b(price|how much|cost|link|where (can|do|to) (i |we )?(buy|get|order|find)|i (want|need) (this|it|one)|take my money|ship|shipping|deliver|available|in stock|restock|discount|code|cu[aá]nto|precio|d[oó]nde|lo quiero|prix|combien|o[uù] acheter|quanto|onde compr|wie viel|wo kaufen)\b/i;
  let on = false, obs = null;
  const COL = { positive: "#16a34a", neutral: "#a1a1aa", negative: "#dc2626" };
  function classify(t) {
    const p = (POS.test(t) ? 1 : 0) + (POS_E.test(t) ? 1 : 0), n = (NEG.test(t) ? 1.2 : 0) + (NEG_E.test(t) ? 1.5 : 0);
    return p > n ? "positive" : n > p ? "negative" : "neutral";
  }
  function targets() {
    if (/youtube\.com$/.test(location.hostname)) return [...document.querySelectorAll("#content-text")].map((el) => ({ text: el, box: el.closest("#body") || el.parentElement }));
    // Instagram: every comment block has a "Reply" button; climb from it to the
    // block (the child of the long comments list) and take its comment text span.
    const out = [], seen = new Set();
    const replies = [...document.querySelectorAll("span, div[role='button']")]
      .filter((x) => x.childElementCount === 0 && /^(Reply|Responder|Répondre|Antworten|Rispondi|Yanıtla)$/.test((x.textContent || "").trim()));
    for (const r of replies) {
      let blk = r;
      while (blk.parentElement && blk.parentElement.childElementCount < 6) blk = blk.parentElement;
      if (!blk || seen.has(blk)) continue;
      seen.add(blk);
      const spans = [...blk.querySelectorAll("span[dir='auto']")].filter((x) => !x.closest("a")
        && !/^(Reply|See translation|View replies.*|Hide replies|\d+[smhdw]|\d+ likes?|Edited|•)$/i.test((x.textContent || "").trim()));
      const t = spans.sort((a, b) => (b.textContent || "").length - (a.textContent || "").length)[0];
      if (t && (t.textContent || "").trim()) out.push({ text: t, box: blk });
    }
    return out;
  }
  function paint() {
    let n = 0, c = { positive: 0, neutral: 0, negative: 0 }, buyers = 0;
    for (const { text, box } of targets()) {
      if (!box || box.dataset.igxS) continue;
      const t = text.textContent || "";
      const s = classify(t);
      box.dataset.igxS = s;
      box.style.boxShadow = `inset 4px 0 0 ${COL[s]}`;
      box.style.background = s === "positive" ? "rgba(22,163,74,.07)" : s === "negative" ? "rgba(220,38,38,.08)" : "";
      box.style.borderRadius = "8px";
      const tags = [];
      if (BUY.test(t)) { tags.push("🛒 Buyer"); buyers++; }
      if (t.includes("?")) tags.push("❓ Question");
      tags.push(s === "positive" ? "😊 Positive" : s === "negative" ? "😠 Negative" : "😐 Neutral");
      const tg = document.createElement("span");
      tg.className = "igx-tags";
      tg.innerHTML = tags.map((x) => `<i class="igx-tag igx-${x.includes("Buyer") ? "buy" : x.includes("Question") ? "q" : s}">${x}</i>`).join("");
      text.parentElement.insertBefore(tg, text.nextSibling);
      c[s]++; n++;
    }
    return { n, c, buyers };
  }
  function start() {
    on = true;
    const r = paint();
    if (!obs) {
      obs = new MutationObserver(() => { if (on) paint(); });
      obs.observe(document.body, { childList: true, subtree: true });
    }
    return r;
  }
  function stop() {
    on = false;
    document.querySelectorAll("[data-igx-s]").forEach((b) => { b.style.boxShadow = ""; b.style.background = ""; delete b.dataset.igxS; });
    document.querySelectorAll(".igx-tags").forEach((t) => t.remove());
  }
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg && msg.igxColor !== undefined) {
      if (msg.igxColor) {
        start();
        const all = [...document.querySelectorAll("[data-igx-s]")].map((b) => b.dataset.igxS);
        reply({ ok: true, total: all.length, positive: all.filter((x) => x === "positive").length,
                negative: all.filter((x) => x === "negative").length, buyers: document.querySelectorAll(".igx-buy").length });
      } else { stop(); reply({ ok: true }); }
    }
  });
})();

// --- Giveaway reveal on the page ---------------------------------------------
// After the panel draws a winner: the comments scroll fast with flashing colors,
// slow down, and stop on the winner's comment with a golden spotlight + confetti.
(function () {
  const COLORS = ["#f58529", "#dd2a7b", "#8134af", "#16a34a", "#2563eb", "#eab308"];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function scroller() {
    if (/youtube\.com$/.test(location.hostname)) return document.scrollingElement;
    const els = [...document.querySelectorAll("div")].filter((e) => e.scrollHeight > e.clientHeight + 80
      && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.clientHeight > 200);
    return els.find((e) => e.querySelector("span[dir='auto']")) || document.scrollingElement;
  }
  function blocks() {
    if (/youtube\.com$/.test(location.hostname)) return [...document.querySelectorAll("ytd-comment-thread-renderer, ytd-comment-view-model")];
    const out = new Set();
    for (const r of document.querySelectorAll("span, div[role='button']")) {
      if (r.childElementCount === 0 && /^(Reply|Responder|Répondre|Antworten|Rispondi|Yanıtla)$/.test((r.textContent || "").trim())) {
        let b = r;
        while (b.parentElement && b.parentElement.childElementCount < 6) b = b.parentElement;
        out.add(b);
      }
    }
    return [...out];
  }
  function userOf(b) {
    // the avatar link comes first and has no text: take the first link that does
    const sel = /youtube/.test(location.hostname) ? "#author-text" : "a[href^='/']";
    const t = [...b.querySelectorAll(sel)].map((a) => (a.textContent || "").trim()).find((x) => x);
    return (t || "").replace(/^@/, "").toLowerCase();
  }
  function loadMore() {
    const btn = [...document.querySelectorAll("svg[aria-label], button")].find((e) =>
      /Load more comments|View more comments/i.test(e.getAttribute("aria-label") || e.textContent || ""));
    if (btn) (btn.closest("button,[role=button]") || btn).click();
  }
  function confetti(x, y) {
    for (let i = 0; i < 90; i++) {
      const p = document.createElement("i");
      p.className = "igx-confetti";
      p.style.cssText = `left:${x}px;top:${y}px;background:${COLORS[i % COLORS.length]};`
        + `--dx:${(Math.random() - 0.5) * 520}px;--dy:${-140 - Math.random() * 320}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * 0.15}s`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 2600);
    }
  }
  async function reveal(winner) {
    const sc = scroller();
    const want = (winner || "").toLowerCase().replace(/^@/, "");
    let speed = 40, found = null;
    // spin: scroll down flashing random comments, then slow down
    for (let step = 0; step < 70 && !found; step++) {
      const bs = blocks();
      bs.forEach((b) => { b.style.transition = "background .12s, box-shadow .12s"; b.style.background = ""; b.style.boxShadow = ""; });
      const pick = bs[Math.floor(Math.random() * bs.length)];
      if (pick) { const c = COLORS[step % COLORS.length]; pick.style.background = c + "22"; pick.style.boxShadow = `inset 4px 0 0 ${c}`; }
      if (step > 25) found = bs.find((b) => userOf(b) === want);
      if (!found) { sc.scrollTop += 90; await sleep(speed); speed = Math.min(260, speed * 1.045); }
    }
    // keep scrolling until the winner's comment is loaded (it may be further down)
    for (let i = 0; i < 160 && !found; i++) {
      sc.scrollTop += 400; if (i % 3 === 0) loadMore();
      await sleep(350); found = blocks().find((b) => userOf(b) === want);
    }
    blocks().forEach((b) => { b.style.background = ""; b.style.boxShadow = ""; });
    if (!found) return false;
    found.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(700);
    found.classList.add("igx-winner");
    const badge = document.createElement("div");
    badge.className = "igx-winner-badge";
    badge.textContent = "🏆 WINNER";
    found.prepend(badge);
    const r = found.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + 20);
    return true;
  }
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg && msg.igxReveal) { reveal(msg.igxReveal).then((ok) => reply({ ok })); return true; }
  });
})();

// --- "Download reel" button under the post/reel action bar -------------------
(function () {
  if (!/instagram\.com$/.test(location.hostname)) return;
  const ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>';
  const pk = (code) => { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"; let n = 0n;
    for (const ch of code.slice(0, 11)) n = n * 64n + BigInt(A.indexOf(ch)); return n.toString(); };
  function codeNow() { return (location.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/) || [])[1]; }
  async function download(btn) {
    const code = codeNow();
    if (!code) return;
    const label = btn.querySelector("span");
    btn.classList.add("busy");
    label.textContent = "Preparing…";
    try {
      const csrf = (document.cookie.match(/(?:^|; )csrftoken=([^;]+)/) || [])[1] || "";
      const r = await fetch(`/api/v1/media/${pk(code)}/info/`, { credentials: "include",
        headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": csrf, "x-requested-with": "XMLHttpRequest" } });
      const it = ((await r.json()).items || [])[0];
      if (!it) throw new Error("not found");
      const owner = (it.user && it.user.username) || "instagram";
      const parts = it.carousel_media || [it];
      let i = 0;
      for (const p of parts) {
        const v = (p.video_versions || [])[0], img = ((p.image_versions2 || {}).candidates || [])[0];
        const url = v ? v.url : img && img.url;
        if (!url) continue;
        i++;
        await chrome.runtime.sendMessage({ igxDownload: { url, filename: `instagram-${owner}-${code}${parts.length > 1 ? "-" + i : ""}.${v ? "mp4" : "jpg"}` } });
      }
      label.textContent = i > 1 ? `Downloaded ${i} files ✓` : "Downloaded ✓";
    } catch (_) {
      label.textContent = "Couldn't download, log in to Instagram";
    }
    setTimeout(() => { label.textContent = btn.classList.contains("igx-dl-icon") ? "" : btn.dataset.label; btn.classList.remove("busy"); }, 3000);
  }
  function place() {
    const code = codeNow();
    const old = document.querySelector(".igx-dl-wrap");
    if (!code) { if (old) old.remove(); return; }
    if (old && old.dataset.code === code) return;
    if (old) old.remove();
    // The post's own action row: the block holding Like AND Comment (not the sidebar).
    let bar = null;
    for (const s of document.querySelectorAll("svg[aria-label='Like'], svg[aria-label='Unlike']")) {
      if (!s.getBoundingClientRect().width) continue;
      let e = s.parentElement;
      for (let i = 0; i < 8 && e; i++, e = e.parentElement) {
        if (e.querySelector("svg[aria-label='Comment']") && e.querySelector("svg[aria-label='Share'], svg[aria-label='Share Post'], svg[aria-label='Save']")) { bar = e; break; }
      }
      if (bar) break;
    }
    if (!bar) return;
    const isVideo = /\/(reel|reels|tv)\//.test(location.pathname) || !!document.querySelector("video");
    // A native-looking icon next to Like / Comment / Share (tooltip shows what it does).
    const share = bar.querySelector("svg[aria-label='Share'], svg[aria-label='Share Post']");
    const shareBtn = share && (share.closest("[role=button], button") || share.parentElement);
    const b = document.createElement("span");
    b.className = "igx-dl-wrap igx-dl-icon";
    b.dataset.code = code;
    b.dataset.label = isVideo ? "Download reel" : "Download photos";
    b.title = b.dataset.label;
    b.setAttribute("role", "button");
    b.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Download"><path d="M12 3.5v12m0 0-5-5m5 5 5-5M4.5 20.5h15"/></svg><span class="igx-dl-tip"></span>';
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); download(b); });
    if (shareBtn && shareBtn.parentElement) shareBtn.insertAdjacentElement("afterend", b);
    else bar.insertAdjacentElement("afterend", b);
  }
  setInterval(place, 1000);
})();

// --- Highlight comments matching the panel's search ---------------------------
(function () {
  let q = "";
  function apply() {
    document.querySelectorAll(".igx-hit").forEach((e) => e.classList.remove("igx-hit"));
    if (!q || (Array.isArray(q) && !q.length)) return;
    const spans = /youtube\.com$/.test(location.hostname) ? document.querySelectorAll("#content-text")
      : document.querySelectorAll("ul span[dir='auto'], div span[dir='auto']");
    let first = null;
    for (const s of spans) {
      if (s.childElementCount > 3) continue;
      const t = (s.textContent || "").toLowerCase();
      const hit = Array.isArray(q) ? q.some((x) => x && t.startsWith(x.slice(0, 40))) : t.includes(q);
      if (t.length > 1 && hit) { s.classList.add("igx-hit"); if (!first) first = s; }
    }
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  let obs = null;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.igxSearch !== undefined) {
      q = Array.isArray(msg.igxSearch) ? msg.igxSearch : String(msg.igxSearch || "").toLowerCase();
      apply();
      if (!obs) { obs = new MutationObserver(() => { if (q) { clearTimeout(obs.t); obs.t = setTimeout(apply, 300); } }); obs.observe(document.body, { childList: true, subtree: true }); }
    }
  });
})();

// --- Video controls on reels/posts: speed, -5s/+5s, loop ----------------------
(function () {
  if (!/instagram\.com$/.test(location.hostname)) return;
  const SPEEDS = [1, 1.25, 1.5, 2, 0.5];
  const bar = document.createElement("div");
  bar.className = "igx-vc";
  bar.innerHTML = '<button data-a="back" title="Back 5s">−5s</button><button data-a="speed" title="Speed">1×</button>'
    + '<button data-a="fwd" title="Forward 5s">+5s</button><button data-a="loop" title="Loop">🔁</button>';
  let vid = null;
  function mostVisible() {
    let best = null, area = 0;
    for (const v of document.querySelectorAll("video")) {
      const r = v.getBoundingClientRect();
      const a = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (a > area && r.width > 150) { area = a; best = v; }
    }
    return best;
  }
  function sync() {
    if (!document.body.contains(bar)) document.body.appendChild(bar);
    vid = mostVisible();
    if (!vid) { bar.style.display = "none"; return; }
    const r = vid.getBoundingClientRect();
    bar.style.display = "flex";
    bar.style.top = Math.max(8, r.top + 10) + "px";
    bar.style.left = (r.left + r.width / 2) + "px";
    bar.querySelector('[data-a="speed"]').textContent = (vid.playbackRate || 1) + "×";
    bar.querySelector('[data-a="loop"]').classList.toggle("on", !!vid.loop && vid.dataset.igxLoop === "1");
  }
  bar.addEventListener("click", (e) => {
    const a = e.target.closest("button") && e.target.closest("button").dataset.a;
    if (!a || !vid) return;
    e.preventDefault(); e.stopPropagation();
    if (a === "speed") vid.playbackRate = SPEEDS[(SPEEDS.indexOf(vid.playbackRate) + 1) % SPEEDS.length] || 1;
    if (a === "back") vid.currentTime = Math.max(0, vid.currentTime - 5);
    if (a === "fwd") vid.currentTime = Math.min(vid.duration || 1e9, vid.currentTime + 5);
    if (a === "loop") { const on = vid.dataset.igxLoop !== "1"; vid.dataset.igxLoop = on ? "1" : "0"; vid.loop = on; }
    sync();
  }, true);
  setInterval(sync, 700);
  addEventListener("scroll", sync, { passive: true });
})();

// --- Quick DM replies: saved replies + AI draft (user's own key) --------------
(function () {
  if (!/instagram\.com$/.test(location.hostname)) return;
  const DEFAULTS = ["Thanks so much! 💕", "Here's the link: ", "Yes, we ship worldwide! 🌍", "Let me check and get back to you shortly."];
  function composer() { return document.querySelector("div[contenteditable='true'][role='textbox']"); }
  function insert(text) {
    const c = composer();
    if (!c) return;
    c.focus();
    document.execCommand("insertText", false, text);
  }
  function lastMessages() {
    const rows = [...document.querySelectorAll("div[role='row']")].slice(-12);
    return rows.map((r) => (r.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").slice(-2500);
  }
  async function build(box) {
    const st = await chrome.storage.local.get("igxReplies");
    const replies = st.igxReplies || DEFAULTS;
    box.innerHTML = replies.map((r, i) => `<button data-i="${i}" title="${r.replace(/"/g, "&quot;")}">${r.length > 22 ? r.slice(0, 22) + "…" : r}</button>`).join("")
      + '<button data-a="ai" class="ai">✨ AI draft</button><button data-a="edit" class="ed" title="Edit saved replies">✎</button>';
    box.onclick = async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      e.preventDefault();
      if (b.dataset.i !== undefined) insert(replies[+b.dataset.i]);
      if (b.dataset.a === "edit") {
        const v = prompt("Saved replies, one per line:", replies.join("\n"));
        if (v !== null) { await chrome.storage.local.set({ igxReplies: v.split("\n").map((x) => x.trim()).filter(Boolean) }); build(box); }
      }
      if (b.dataset.a === "ai") {
        b.textContent = "✨ writing…";
        const res = await chrome.runtime.sendMessage({ igxAiDraft: { conversation: lastMessages() } }).catch(() => null);
        b.textContent = "✨ AI draft";
        if (res && res.text) insert(res.text);
        else alert((res && res.error) || "Add your OpenAI or Claude key in the Comment Exporter panel (⚙ API key) first.");
      }
    };
  }
  function place() {
    if (!/\/direct\/t\//.test(location.pathname)) { document.querySelectorAll(".igx-qr").forEach((e) => e.remove()); return; }
    const c = composer();
    if (!c || document.querySelector(".igx-qr")) return;
    const host = c.closest("form") || c.parentElement.parentElement;
    const box = document.createElement("div");
    box.className = "igx-qr";
    host.parentElement.insertBefore(box, host);
    build(box);
  }
  setInterval(place, 1000);
})();
