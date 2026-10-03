// Background worker: saves files the in-page buttons ask for (content scripts
// can't call chrome.downloads themselves).
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.igxDownload) {
    const { url, filename } = msg.igxDownload;
    chrome.downloads.download({ url, filename }, (id) => reply({ ok: !!id, error: chrome.runtime.lastError && chrome.runtime.lastError.message }));
    return true;
  }
});

// AI draft for DMs, with the key the user saved in the panel (never sent to us).
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || !msg.igxAiDraft) return;
  (async () => {
    const ai = (await chrome.storage.local.get("igxAi")).igxAi || {};
    if (!ai.key) return reply({ error: "Add your OpenAI or Claude key in the Comment Exporter panel (⚙ API key) first." });
    const system = "You write the next reply in an Instagram DM conversation for the account owner. Short (1-3 sentences), warm, "
      + "helpful, same language as the other person, no hashtags. Reply with the message text only. " + (ai.voice ? `About the account: ${ai.voice}.` : "");
    const user = "Conversation (latest last):\n" + (msg.igxAiDraft.conversation || "");
    try {
      let text = "";
      if (ai.prov === "anthropic") {
        const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
          headers: { "content-type": "application/json", "x-api-key": ai.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model: ai.model || "claude-haiku-4-5-20251001", max_tokens: 300, system, messages: [{ role: "user", content: user }] }) });
        const d = await r.json(); if (!r.ok) throw new Error((d.error && d.error.message) || "Claude error");
        text = (d.content || []).map((c) => c.text || "").join("");
      } else {
        const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${ai.key}` },
          body: JSON.stringify({ model: ai.model || "gpt-4o-mini", messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
        const d = await r.json(); if (!r.ok) throw new Error((d.error && d.error.message) || "OpenAI error");
        text = d.choices[0].message.content || "";
      }
      reply({ text: text.trim() });
    } catch (e) { reply({ error: e.message || String(e) }); }
  })();
  return true;
});
