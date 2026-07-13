# getimg.ai proxy (Cloudflare Worker)

A ~50-line proxy so the browser CMS can generate theme/music illustrations via
getimg.ai. The API key lives here (server-side), never in the app bundle or the
browser.

## Deploy (dashboard, ~10 min — no tooling needed)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it (e.g. `glint-getimg`), **Deploy**, then **Edit code**.
3. Replace the starter code with the contents of `getimg-proxy.js`, **Deploy**.
4. Worker → **Settings → Variables and Secrets** → add:
   - `GETIMG_KEY` = your getimg.ai API key (mark as **Secret**). **Required.**
   - `CMS_TOKEN` = any passphrase (optional). If set, the CMS must send the same
     value — stops a stranger who finds the URL from spending your quota.
5. Copy the Worker URL (e.g. `https://glint-getimg.<you>.workers.dev`).
6. In the CMS → **Settings**, paste that URL into **getimg proxy URL** (and the
   `CMS_TOKEN` passphrase if you set one).

## Redeploying after a code change

The Worker runs whatever is pasted into the dashboard — it does **not** auto-update
from this repo. After editing `getimg-proxy.js` (e.g. to allow a new origin):
Cloudflare dashboard → your Worker → **Edit code** → paste the new file → **Deploy**.

## Notes

- Allowed browser origins are `localhost`, `127.0.0.1`, `*.onrender.com`, and any
  `*.chromeabyss.com` subdomain (the game's custom domain). To allow another origin
  without a code change, add an **`ALLOW_ORIGINS`** variable (comma-separated exact
  origins, e.g. `https://cms.example.com`) under the Worker's Variables.
- The proxy returns the image as a data-URI; the CMS then commits it as a file
  and points the thumbnail at it.
- getimg.ai is the ONLY source for these illustrations — there is no procedural
  fallback. If the key expires or the request is blocked, the CMS shows the exact
  error at the auto-generate button (and logs it to the console).
