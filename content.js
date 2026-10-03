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
