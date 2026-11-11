// GET  ?t=<request token> -> confirmation page (a GET never approves, so
//                             email link-scanners can't approve by accident)
// POST t=<request token>  -> issues a 7-day access link for that email
import { sign, verify, escapeHtml, siteOrigin, DAY_MS, ACCESS_DAYS } from "../lib/token.js";
import { page } from "../lib/page.js";

const invalid = () =>
  page("Link invalid", `<h2 class="err">This approval link is invalid or has expired.</h2>
<p>Ask the person to request access again.</p>`, 400);

export async function GET(request) {
  const t = new URL(request.url).searchParams.get("t");
  const req = await verify(t, process.env.ACCESS_SECRET, "req");
  if (!req) return invalid();
  return page("Approve access", `<h2>Approve access?</h2>
<p><strong>${escapeHtml(req.e)}</strong> asked to view the TCPA Case Explorer.</p>
<p>Approving gives them <strong>${ACCESS_DAYS} days</strong> of access. It ends automatically after that.</p>
<form method="post" action="/api/approve"><input type="hidden" name="t" value="${escapeHtml(t)}">
<button class="btn" type="submit">Approve for ${ACCESS_DAYS} days</button></form>`);
}

export async function POST(request) {
  let t = null;
  try { t = (await request.formData()).get("t"); } catch {}
  const req = await verify(t, process.env.ACCESS_SECRET, "req");
  if (!req) return invalid();

  const expires = Date.now() + ACCESS_DAYS * DAY_MS;
  const acc = await sign({ e: req.e, x: expires, t: "acc" }, process.env.ACCESS_SECRET);
  const link = `${siteOrigin(request)}/api/enter?t=${encodeURIComponent(acc)}`;
  const until = new Date(expires).toUTCString();

  const subject = "Your access to the TCPA Case Explorer";
  const body = `Hi,\n\nYou now have ${ACCESS_DAYS}-day access to the TCPA Case Explorer.\n\nOpen this link to get in (valid until ${until}):\n${link}\n\nPlease keep this link to yourself; it was issued to ${req.e}.\n`;
  const mailto = `mailto:${encodeURIComponent(req.e)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return page("Access approved", `<h2>Approved &#10003;</h2>
<p><strong>${escapeHtml(req.e)}</strong> has access until <strong>${escapeHtml(until)}</strong>.</p>
<p>Send them their personal access link:</p>
<div class="row" style="margin-bottom:14px">
  <a class="btn" href="${escapeHtml(mailto)}">Email access link</a>
  <button class="btn alt" type="button" id="copy">Copy link</button>
</div>
<div class="box mono" id="link">${escapeHtml(link)}</div>
<p style="font-size:13px">The link stops working after ${ACCESS_DAYS} days. To cut everyone off early, change <code>ACCESS_SECRET</code> in Vercel and redeploy.</p>
<script>document.getElementById("copy").onclick=function(){var b=this;navigator.clipboard.writeText(document.getElementById("link").textContent).then(function(){b.textContent="Copied"})}</script>`);
}
