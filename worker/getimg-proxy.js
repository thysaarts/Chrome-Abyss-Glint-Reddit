/**
 * Cloudflare Worker — getimg.ai proxy for the Glint CMS.
 *
 * The CMS runs in the browser and can't call getimg.ai directly (CORS + the
 * secret key must not live client-side). This tiny proxy holds the key
 * server-side, forwards the generation request, and returns the finished image
 * as a data-URI (fetching getimg's result URL server-side so the browser never
 * hits a second cross-origin request). See worker/README.md to deploy.
 *
 * Env (set in the Cloudflare dashboard → Settings → Variables):
 *   GETIMG_KEY  (secret, required) — your getimg.ai API key.
 *   CMS_TOKEN   (secret, optional) — if set, the CMS must send a matching
 *               x-cms-token header, so a stranger who finds the URL can't burn
 *               your quota.
 */

// browser origins allowed to use the proxy: local dev, the Render URL, and the game's
// custom domain (any chromeabyss.com subdomain, e.g. glint.chromeabyss.com). Additional
// exact origins can be allowed at deploy time via the ALLOW_ORIGINS env var (comma-
// separated), so a new domain never needs a code change.
const ALLOW = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.onrender\.com$/,
  /^https:\/\/([a-z0-9-]+\.)*chromeabyss\.com$/,
];

function corsHeaders(origin, env) {
  const extra = (env && env.ALLOW_ORIGINS ? String(env.ALLOW_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean) : []);
  const ok = origin && (ALLOW.some((re) => re.test(origin)) || extra.includes(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-cms-token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// chunked base64 (btoa chokes on a spread of a large array)
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const h = corsHeaders(origin, env);
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    if (req.method !== "POST") return new Response("POST only", { status: 405, headers: h });
    if (env.CMS_TOKEN && req.headers.get("x-cms-token") !== env.CMS_TOKEN) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...h, "content-type": "application/json" } });
    }
    try {
      const body = await req.json();
      const r = await fetch("https://api.getimg.ai/v2/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.GETIMG_KEY}` },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) return new Response(JSON.stringify(j), { status: r.status, headers: { ...h, "content-type": "application/json" } });
      // normalise to a single data-URI (getimg may return base64 or a URL)
      const d = (j && j.data && j.data[0]) || j || {};
      let dataUri = null;
      if (d.b64 || d.image) {
        dataUri = `data:image/${body.output_format || "webp"};base64,${d.b64 || d.image}`;
      } else if (d.url) {
        const img = await fetch(d.url);
        const ct = img.headers.get("content-type") || "image/webp";
        dataUri = `data:${ct};base64,${toBase64(await img.arrayBuffer())}`;
      }
      return new Response(JSON.stringify({ dataUri, usage: j.usage || null }), { headers: { ...h, "content-type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e && e.message ? e.message : e) }), { status: 500, headers: { ...h, "content-type": "application/json" } });
    }
  },
};
