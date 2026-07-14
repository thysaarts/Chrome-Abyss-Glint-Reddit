// Serve the built client locally: `npm run build && npm run preview:web`, then
// open http://localhost:4180/game.html — the full game, no Reddit needed.
// The Devvit server endpoints don't exist here, so the Community Daily card and
// the LEADERBOARD tab show their graceful offline fallbacks (by design).
import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname, resolve } from "path";

const ROOT = resolve("dist/client");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };
createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/game.html";
  try {
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(4180, () => console.log("Glint preview → http://localhost:4180/game.html  (splash: /splash.html)"));
