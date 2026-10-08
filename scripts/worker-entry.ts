import { analyze, status, EngineEnv } from "../lib/analysis-server";
import { assets } from "../.sites-runtime/assets";
export default {
  async fetch(request: Request, env: EngineEnv) {
    const url = new URL(request.url);
    if (url.pathname === "/api/analyze-crop")
      return request.method === "GET" ? status(env) : analyze(request, env);
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const key = path === "/" ? "/index.html" : path;
    const entry = assets[key] || assets[key + "/index.html"];
    if (!entry) return new Response("Not found", { status: 404 });
    const [mime, base64] = entry;
    const bytes =
      request.method === "HEAD"
        ? null
        : Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new Response(bytes, {
      headers: {
        "Content-Type": mime,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Cache-Control": key.startsWith("/_next/static/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      },
    });
  },
};
