// Background worker: saves files the in-page buttons ask for (content scripts
// can't call chrome.downloads themselves).
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.igxDownload) {
    const { url, filename } = msg.igxDownload;
    chrome.downloads.download({ url, filename }, (id) => reply({ ok: !!id, error: chrome.runtime.lastError && chrome.runtime.lastError.message }));
    return true;
  }
});
