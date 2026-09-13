# Instagram Comment & Post Exporter — Chrome Extension

A one-click Chrome/Edge extension that exports **all comments from any public
Instagram post or reel**, or **all posts from a public profile**, to **CSV** or
**JSON**. It's a thin front end over the free tools at
[hammadi.dev](https://hammadi.dev) — the same scraping backend that powers the
[Instagram Scraper API](https://hammadi.dev/rapidapi).

## Features

- **Auto-detect** — open the popup on an Instagram post, reel or profile and the
  URL is filled in and the right mode selected for you.
- **Two modes**
  - *Comments* — full comment thread of a post/reel (text, author, likes,
    replies, timestamp), scrolled past the usual 20-comment cutoff.
  - *Posts* — a profile's grid (URL, type, date, likes, comments, views,
    caption, author).
- **Export** — CSV (Excel-ready, UTF-8 BOM so emoji survive) or JSON.
- **No Instagram login.** Only public accounts are readable; the account you
  look up is never notified.

## Install (unpacked, for now)

1. Download / clone this folder.
2. Go to `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Pin the icon, open any Instagram post or profile, and click it.

Works in Chrome, Edge, Brave and any Chromium browser. (Not yet on the Web
Store — see below.)

## How it works

The popup calls the free public endpoints on `hammadi.dev`:

| Mode     | Endpoint                                             |
|----------|------------------------------------------------------|
| Comments | `GET /public/v1/run/export-instagram-comments`       |
| Posts    | `GET /public/v1/run/instagram-posts`                 |

MV3 grants the popup CORS-free access to `hammadi.dev` via `host_permissions`,
so no proxy or key is needed. The extension asks for only two permissions:
`activeTab` (to read the current tab's URL for auto-fill) and `downloads` (to
save the export file).

## Limits

The free backend caps each lookup at **100 rows** and **20 lookups/hour per IP**
— plenty for one-off exports. For unlimited volume, whole-catalogue pulls and
JSON in your own code, use the [API](https://hammadi.dev/rapidapi).

## Development

```bash
node tools/make-icons.mjs   # regenerate the gradient PNG icons
node tools/test.mjs         # validate manifest + logic against the LIVE backend
node --check popup.js       # syntax check
```

`tools/test.mjs` hits the real endpoints, so it doubles as a smoke test that the
backend is up and the response shapes still match the export columns.

## Publishing to the Chrome Web Store (later)

1. Zip the folder (excluding `tools/` and `.git/`).
2. Pay the one-time $5 developer registration.
3. Upload at the [Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   fill in listing + privacy (it collects no personal data), and submit.

## License

MIT — see [LICENSE](LICENSE).
