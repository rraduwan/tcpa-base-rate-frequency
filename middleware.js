// Vercel Routing Middleware: runs before every request and blocks the
// explorer unless the visitor holds a valid, unexpired 7-day access pass.
import { verify, getCookie, COOKIE_NAME } from "./lib/token.js";

const PUBLIC_PATHS = [/^\/login(\.html)?$/, /^\/api\//];

export default async function middleware(request) {
  const url = new URL(request.url);
  if (PUBLIC_PATHS.some((re) => re.test(url.pathname))) return; // let it through

  const token = getCookie(request.headers.get("cookie"), COOKIE_NAME);
  const pass = await verify(token, process.env.ACCESS_SECRET, "acc");
  if (pass) return; // valid pass: serve the page

  // No/expired pass (or ACCESS_SECRET missing): fail closed.
  const login = new URL("/login.html", url);
  if (token) login.searchParams.set("expired", "1");
  return Response.redirect(login, 302);
}
