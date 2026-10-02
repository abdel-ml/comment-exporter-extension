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
