"use strict";
// Runs in the page's own world (MAIN) at document_start. Instagram's profile
// grid loads posts through its own /graphql/query calls; we read the post stats
// (likes, comments, date) out of those responses so "Top posts" and the creator
// score need zero extra requests. Nothing is sent anywhere: the stats go to our
// content script via window.postMessage.
(function () {
  if (window.__igxHook) return;
  window.__igxHook = true;
  function scan(text) {
    if (!text || text.indexOf('"like_count"') < 0 && text.indexOf('"follower_count"') < 0) return;
    let data;
    try { data = JSON.parse(text); } catch (_) { return; }
    const posts = [], users = [];
    (function walk(o, depth) {
      if (!o || typeof o !== "object" || depth > 40) return;
      if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
      if (o.code && typeof o.like_count === "number" && o.taken_at) {
        const img = ((o.image_versions2 || {}).candidates || [])[0];
        posts.push({ code: o.code, owner: o.user && o.user.username || o.owner && o.owner.username, likes: o.like_count,
          comments: o.comment_count || 0, views: o.play_count || o.ig_play_count || o.view_count || null, taken_at: o.taken_at,
          type: o.product_type === "clips" ? "reel" : o.media_type === 8 ? "carousel" : o.media_type === 2 ? "video" : "photo",
          thumb: img && img.url, caption: o.caption && o.caption.text ? String(o.caption.text).slice(0, 140) : "" });
      }
      if (o.username && typeof o.follower_count === "number") users.push({ username: o.username, followers: o.follower_count, posts: o.media_count });
      for (const k in o) if (o[k] && typeof o[k] === "object") walk(o[k], depth + 1);
    })(data, 0);
    if (posts.length || users.length) window.postMessage({ __igx: "stats", posts, users }, location.origin);
  }
  const isGql = (u) => /\/graphql\/query|\/api\/graphql|\/api\/v1\/(clips|feed)\//.test(String(u || ""));
  const ofetch = window.fetch;
  window.fetch = function (input, init) {
    const p = ofetch.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input && input.url;
      if (isGql(url)) p.then((r) => r.clone().text()).then(scan).catch(() => {});
    } catch (_) {}
    return p;
  };
  const oopen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url) {
    if (isGql(url)) this.addEventListener("load", function () { try { scan(this.responseText); } catch (_) {} });
    return oopen.apply(this, arguments);
  };
})();
