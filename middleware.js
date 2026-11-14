// Vercel Routing Middleware: runs before every request and blocks the
// explorer unless the visitor holds a valid, unexpired 7-day pass whose
// owner hasn't been revoked.
import { verify, getCookie, COOKIE_NAME, clearPassCookie } from "./lib/token.js";
import { storeConfigured, getUser } from "./lib/store.js";

const PUBLIC_PATHS = [/^\/login(\.html)?$/, /^\/api\//];

function toLogin(url, reason, clear) {
  const login = new URL("/login.html", url);
  if (reason) login.searchParams.set(reason, "1");
  const headers = new Headers({ Location: login.toString(), "Cache-Control": "no-store" });
  if (clear) headers.append("Set-Cookie", clearPassCookie);
  return new Response(null, { status: 302, headers });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (PUBLIC_PATHS.some((re) => re.test(url.pathname))) return; // let it through

  const token = getCookie(request.headers.get("cookie"), COOKIE_NAME);
  const pass = await verify(token, process.env.ACCESS_SECRET, "acc");
  // No/expired pass (or ACCESS_SECRET missing): fail closed.
  if (!pass) return toLogin(url, token ? "expired" : "", Boolean(token));

  // Revocation check, so revoking works right away, not just after the 7 days.
  if (storeConfigured()) {
    try {
      const user = await getUser(pass.e);
      if (user && user.status !== "active") return toLogin(url, "revoked", true);
    } catch (err) {
      // Database hiccup: keep serving holders of a genuine pass rather than locking everyone out.
      console.error("revocation check failed", err);
    }
  }
  // valid pass: serve the page
}
