"use strict";
// YouTube comment exporter. Like igxScrape, each runs INSIDE the
// user's own tab (injected by the popup) and must be self-contained.

// YouTube: replays what the watch page does when you scroll the comments
// (youtubei "next" continuations), with the page's own API key and client.
async function ytxComments(limit) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const progress = (n, total, text) => { try { chrome.runtime.sendMessage({ igxProgress: { n, total, text } }); } catch (_) {} };
  try {
    const html = await (await fetch(location.href, { credentials: "include" })).text();
    const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
    const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1] || "2.20260101.00.00";
    const dataTxt = (html.match(/var ytInitialData = (\{.*?\});<\/script>/s) || [])[1];
    if (!key || !dataTxt) return { error: "Open a YouTube video (or Short) in this tab first." };
    const initial = JSON.parse(dataTxt);
    const context = { client: { clientName: "WEB", clientVersion: ver, hl: "en" } };
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";

    // Find the comments section's first continuation token anywhere in the page data.
    function findToken(obj) {
      let found = null;
      (function walk(o, inComments) {
        if (found || !o || typeof o !== "object") return;
        if (o.sectionIdentifier === "comment-item-section" || o.panelIdentifier === "engagement-panel-comments-section"
            || o.targetId === "engagement-panel-comments-section") inComments = true;
        const c = o.continuationItemRenderer;
        if (inComments && c) {
          found = (c.continuationEndpoint && c.continuationEndpoint.continuationCommand && c.continuationEndpoint.continuationCommand.token)
            || (c.button && c.button.buttonRenderer && c.button.buttonRenderer.command && c.button.buttonRenderer.command.continuationCommand
                && c.button.buttonRenderer.command.continuationCommand.token);
          if (found) return;
        }
        for (const k in o) walk(o[k], inComments);
      })(obj, false);
      return found;
    }
    let token = findToken(initial);
    if (!token) return { error: "Comments are turned off for this video, or YouTube hasn't loaded them." };

    const rows = [];
    const seen = new Set();
    let total = limit;
    let guard = 0;
    while (token && rows.length < limit && guard++ < 400) {
      const r = await fetch(`/youtubei/v1/next?key=${key}&prettyPrint=false`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ context, continuation: token }),
      });
      if (!r.ok) throw new Error("YouTube returned " + r.status);
      const d = await r.json();
      // New layout: comment data lives in entity mutations.
      for (const m of ((d.frameworkUpdates || {}).entityBatchUpdate || {}).mutations || []) {
        const p = m.payload && m.payload.commentEntityPayload;
        if (!p || !p.properties) continue;
        const id = p.properties.commentId;
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push({ author: (p.author && p.author.displayName || "").replace(/^@/, ""), text: (p.properties.content || {}).content || "",
                    likes: (p.toolbar || {}).likeCountNotliked || "0", replies: (p.toolbar || {}).replyCount || "0",
                    is_reply: (p.properties.replyLevel || 0) > 0, created_at: p.properties.publishedTime || "" });
      }
      // Older layout: commentRenderer objects.
      (function walk(o) {
        if (!o || typeof o !== "object") return;
        const c = o.commentRenderer;
        if (c && !seen.has(c.commentId)) {
          seen.add(c.commentId);
          rows.push({ author: ((c.authorText || {}).simpleText || "").replace(/^@/, ""),
                      text: ((c.contentText || {}).runs || []).map((x) => x.text).join(""),
                      likes: (c.voteCount || {}).simpleText || "0", replies: c.replyCount || 0, is_reply: false,
                      created_at: ((c.publishedTimeText || {}).runs || [{}])[0].text || "" });
        }
        for (const k in o) if (k !== "commentRenderer") walk(o[k]);
      })(d.onResponseReceivedEndpoints);
      // Header of the first page carries the total count.
      const countTxt = JSON.stringify(d).match(/"countText":\{"runs":\[\{"text":"([\d,.]+)"/);
      if (countTxt) total = Math.min(limit, parseInt(countTxt[1].replace(/[,.]/g, ""), 10) || limit);
      // Next page: the last top-level continuation in the endpoint that carries comment threads.
      token = null;
      for (const ep of d.onResponseReceivedEndpoints || []) {
        const items = ((ep.reloadContinuationItemsCommand || ep.appendContinuationItemsAction) || {}).continuationItems || [];
        const last = items[items.length - 1];
        const c = last && last.continuationItemRenderer;
        const t = c && ((c.continuationEndpoint && c.continuationEndpoint.continuationCommand && c.continuationEndpoint.continuationCommand.token)
          || (c.button && c.button.buttonRenderer && c.button.buttonRenderer.command && c.button.buttonRenderer.command.continuationCommand
              && c.button.buttonRenderer.command.continuationCommand.token));
        if (t && items.some((x) => x.commentThreadRenderer)) token = t;
      }
      progress(rows.length, total, `${rows.length.toLocaleString()} of ~${total.toLocaleString()} comments…`);
      if (token) await sleep(600 + Math.random() * 500);
    }
    const owner = (html.match(/"ownerChannelName":"([^"]+)"/) || [])[1] || title.replace(/ - YouTube$/, "");
    return { rows: rows.slice(0, limit), owner: owner.replace(/[^\w.-]+/g, "-").slice(0, 40) };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}
