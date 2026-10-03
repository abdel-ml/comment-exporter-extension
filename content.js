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
