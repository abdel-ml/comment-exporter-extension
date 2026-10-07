// Writes the encoded Telegram bot token + chat id into popup.js (TG_LOG).
// usage: node tools/set-telegram.mjs <bot_token> <chat_id>
import { readFileSync, writeFileSync } from "node:fs";
const [token, chat] = process.argv.slice(2);
if (!token || !chat) { console.error("usage: node tools/set-telegram.mjs <bot_token> <chat_id>"); process.exit(1); }
const enc = Buffer.from(`${token}|${chat}`).toString("base64").split("").reverse().join("");
const p = new URL("../popup.js", import.meta.url);
const src = readFileSync(p, "utf8").replace(/const TG_LOG = ".*";/, `const TG_LOG = "${enc}";`);
writeFileSync(p, src);
const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST", body: new URLSearchParams({ chat_id: chat, text: "✅ Comment Exporter logging connected" }),
});
console.log("popup.js updated; test message:", r.status, (await r.json()).ok ? "sent" : "FAILED");
