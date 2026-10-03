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
    const d = document.createElement("button");
    d.type = "button";
    d.className = "igx-inline igx-dlall";
    d.innerHTML = ICON + "<span>Download all</span>";
    d.title = "Download every post, reel, story and highlight of this profile";
    d.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggle(true, "dlprofile"); });
    if (row && row.parentElement) {
      const wrap = document.createElement("div");
      wrap.className = "igx-inline-wrap";
      wrap.appendChild(b);
      wrap.appendChild(d);
      row.parentElement.insertBefore(wrap, row.nextSibling);
    } else {
      header.appendChild(b); header.appendChild(d);
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
  // YouTube videos: a "Transcript" pill above the Export button.
  function placeTranscript() {
    const on = /youtube\.com\/(watch|shorts\/)/.test(location.href);
    let t = document.getElementById("igx-tr");
    if (!on) { if (t) t.remove(); return; }
    if (t) return;
    t = document.createElement("button");
    t.id = "igx-tr"; t.type = "button";
    t.innerHTML = '<span class="igx-tx">📝 Transcript</span>';
    t.addEventListener("click", () => toggle(true, "yttranscript"));
    document.body.appendChild(t);
  }
  function sync() {
    placeTranscript();
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

// --- Highlight comments matching the panel's search, with next/prev nav --------
(function () {
  let q = "", hits = [], cur = -1;
  function report() {
    try { chrome.runtime.sendMessage({ igxSearchCount: { total: hits.length, index: cur } }); } catch (_) {}
  }
  function focus(i) {
    if (!hits.length) return;
    cur = (i + hits.length) % hits.length;
    hits.forEach((e, k) => e.classList.toggle("igx-hit-cur", k === cur));
    hits[cur].scrollIntoView({ behavior: "smooth", block: "center" });
    report();
  }
  function apply(keepCur) {
    const prev = keepCur && hits[cur];
    document.querySelectorAll(".igx-hit, .igx-hit-cur").forEach((e) => e.classList.remove("igx-hit", "igx-hit-cur"));
    hits = [];
    if (!q || (Array.isArray(q) && !q.length)) { cur = -1; report(); return; }
    const spans = /youtube\.com$/.test(location.hostname) ? document.querySelectorAll("#content-text")
      : document.querySelectorAll("ul span[dir='auto'], div span[dir='auto']");
    for (const s of spans) {
      if (s.childElementCount > 3) continue;
      const t = (s.textContent || "").toLowerCase();
      const hit = Array.isArray(q) ? q.some((x) => x && t.startsWith(x.slice(0, 40))) : t.includes(q);
      if (t.length > 1 && hit) s.classList.add("igx-hit"), hits.push(s);
    }
    const keep = prev ? hits.indexOf(prev) : -1;
    if (hits.length) focus(keep >= 0 ? keep : 0); else { cur = -1; report(); }
  }
  let obs = null;
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.igxSearch !== undefined) {
      q = Array.isArray(msg.igxSearch) ? msg.igxSearch : String(msg.igxSearch || "").toLowerCase();
      cur = -1;
      apply();
      if (!obs) { obs = new MutationObserver(() => { if (q) { clearTimeout(obs.t); obs.t = setTimeout(() => apply(true), 300); } }); obs.observe(document.body, { childList: true, subtree: true }); }
    } else if (msg.igxSearchNav) {
      focus(cur + (msg.igxSearchNav === "prev" ? -1 : 1));
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

// --- Top posts (sort the grid) + creator score card ---------------------------
(function () {
  if (!/instagram\.com$/.test(location.hostname)) return;
  const posts = new Map(), users = new Map();
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.__igx !== "stats") return;
    for (const p of e.data.posts || []) if (!posts.has(p.code) || p.views) posts.set(p.code, { ...(posts.get(p.code) || {}), ...p });
    for (const u of e.data.users || []) users.set(u.username.toLowerCase(), u);
    if (modal && modal.isConnected) render();
  });
  const profileUser = () => {
    const m = location.pathname.match(/^\/([^/]+)\/?(?:reels\/?)?$/);
    return m && !/^(explore|direct|accounts|stories|reels|p|reel)$/.test(m[1]) ? m[1] : null;
  };
  const parseNum = (s) => {
    const m = String(s || "").replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
    if (!m) return null;
    return Math.round(parseFloat(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1));
  };
  function followersOf(user) {
    const u = users.get(user.toLowerCase());
    if (u && u.followers) return u.followers;
    const a = [...document.querySelectorAll("header a, header span, header li")].find((e) => /followers$/i.test((e.textContent || "").trim()));
    if (a) { const t = a.querySelector("span[title]"); return parseNum(t ? t.getAttribute("title") : a.textContent); }
    const meta = document.querySelector('meta[property="og:description"], meta[name="description"]');
    return meta ? parseNum((meta.content.match(/([\d.,]+[KMB]?)\s+Followers/i) || [])[1]) : null;
  }
  const fmt = (n) => n == null ? "–" : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : String(Math.round(n));
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

  let modal = null, sortBy = "likes", loading = false;
  function stats(user) {
    const list = [...posts.values()].filter((p) => !p.owner || p.owner.toLowerCase() === user.toLowerCase());
    const f = followersOf(user);
    const likes = list.map((p) => p.likes), comments = list.map((p) => p.comments);
    const avgL = likes.reduce((a, b) => a + b, 0) / (likes.length || 1), avgC = comments.reduce((a, b) => a + b, 0) / (comments.length || 1);
    const er = f ? (avgL + avgC) / f : null;
    const times = list.map((p) => p.taken_at).sort((a, b) => b - a);
    const weeks = times.length > 1 ? (times[0] - times[times.length - 1]) / 604800 : 0;
    const perWeek = weeks > 0 ? (times.length - 1) / weeks : null;
    // Rule-of-thumb sponsored-post price: ~$10 per 1K followers at a 2% engagement rate, scaled by engagement.
    const price = f ? (f / 1000) * 10 * Math.min(2.5, Math.max(0.4, (er || 0.02) / 0.02)) : null;
    const medL = median(likes);
    return { list, f, avgL, avgC, er, perWeek, price, medL };
  }
  function grade(er) {
    if (er == null) return ["–", "#999"];
    if (er >= 0.06) return ["Excellent", "#16a34a"]; if (er >= 0.03) return ["Very good", "#22c55e"];
    if (er >= 0.01) return ["Average", "#eab308"]; return ["Low", "#ef4444"];
  }
  function render() {
    const user = profileUser();
    if (!user) return;
    const s = stats(user);
    const key = { likes: (p) => p.likes, comments: (p) => p.comments, views: (p) => p.views || 0, engagement: (p) => p.likes + p.comments * 3, newest: (p) => p.taken_at }[sortBy];
    const sorted = [...s.list].sort((a, b) => key(b) - key(a));
    const [g, gc] = grade(s.er);
    modal.querySelector(".igx-tp-body").innerHTML = `
      <div class="igx-score">
        <div><b>${fmt(s.f)}</b><span>followers</span></div>
        <div><b style="color:${gc}">${s.er == null ? "–" : (s.er * 100).toFixed(2) + "%"}</b><span>engagement · ${g}</span></div>
        <div><b>${fmt(s.avgL)}</b><span>avg likes</span></div>
        <div><b>${fmt(s.avgC)}</b><span>avg comments</span></div>
        <div><b>${s.perWeek == null ? "–" : s.perWeek.toFixed(1)}</b><span>posts / week</span></div>
        <div class="price"><b>${s.price == null ? "–" : "$" + fmt(s.price * 0.7) + "–$" + fmt(s.price * 1.3)}</b><span>est. price per post</span></div>
      </div>
      <p class="igx-tp-note">Based on the ${s.list.length} latest posts loaded${loading ? " (loading more…)" : ""}. 🔥 = more than 3× the usual likes (viral).</p>
      <div class="igx-tp-grid">${sorted.map((p, i) => `
        <a href="/${p.type === "reel" ? "reel" : "p"}/${p.code}/" target="_blank" class="igx-tp-card">
          <div class="th" style="background-image:url('${(p.thumb || "").replace(/'/g, "%27")}')"><span class="rk">#${i + 1}</span>${p.likes > 3 * s.medL && s.list.length > 5 ? '<span class="fire">🔥</span>' : ""}<span class="ty">${p.type}</span></div>
          <div class="st">❤️ ${fmt(p.likes)} · 💬 ${fmt(p.comments)}${p.views ? " · ▶ " + fmt(p.views) : ""}</div>
          <div class="dt">${new Date(p.taken_at * 1000).toLocaleDateString()}</div>
        </a>`).join("")}</div>`;
  }
  async function loadMore(n) {
    loading = true; render();
    const y = scrollY;
    for (let i = 0; i < n; i++) { window.scrollTo(0, document.body.scrollHeight); await new Promise((r) => setTimeout(r, 1500)); }
    window.scrollTo(0, y);
    loading = false; render();
  }
  function open() {
    if (modal) modal.remove();
    modal = document.createElement("div");
    modal.className = "igx-tp";
    modal.innerHTML = `<div class="igx-tp-box"><div class="igx-tp-hd"><b>📊 @${profileUser()} · Top posts & creator score</b>
      <select class="igx-tp-sort"><option value="likes">Most liked</option><option value="comments">Most commented</option><option value="engagement">Best engagement</option><option value="views">Most viewed (reels)</option><option value="newest">Newest</option></select>
      <button class="igx-tp-more">Load 24 more</button><button class="igx-tp-x" aria-label="Close">×</button></div><div class="igx-tp-body"></div></div>`;
    modal.addEventListener("click", (e) => { if (e.target === modal || e.target.closest(".igx-tp-x")) modal.remove(); });
    modal.querySelector(".igx-tp-sort").value = sortBy;
    modal.querySelector(".igx-tp-sort").addEventListener("change", (e) => { sortBy = e.target.value; render(); });
    modal.querySelector(".igx-tp-more").addEventListener("click", () => loadMore(3));
    document.body.appendChild(modal);
    render();
    if (stats(profileUser()).list.length < 24) loadMore(2);
  }
  function place() {
    const user = profileUser();
    if (!user) return;
    const anchor = document.querySelector(".igx-dlall");
    if (!anchor || document.querySelector(".igx-top")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "igx-inline igx-top";
    b.innerHTML = "<span>📊 Top posts & score</span>";
    b.title = "Sort this profile's posts by likes, comments or views, and see its engagement rate and estimated price per post";
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); open(); });
    anchor.insertAdjacentElement("afterend", b);
  }
  setInterval(place, 1000);
})();
