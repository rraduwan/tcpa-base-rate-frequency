// GET ?t=<access token> -> stores the 7-day pass in a secure cookie and opens the explorer.
import { verify, COOKIE_NAME } from "../lib/token.js";
import { page } from "../lib/page.js";

export async function GET(request) {
  const t = new URL(request.url).searchParams.get("t");
  const pass = await verify(t, process.env.ACCESS_SECRET, "acc");
  if (!pass) {
    return page("Access expired", `<h2 class="err">This access link is invalid or has expired.</h2>
<p>Access lasts 7 days. You can request access again.</p>
<a class="btn" href="/login.html">Request access</a>`, 403);
  }
  const maxAge = Math.floor((pass.x - Date.now()) / 1000);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Cache-Control": "no-store",
      "Set-Cookie": `${COOKIE_NAME}=${encodeURIComponent(t)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}
