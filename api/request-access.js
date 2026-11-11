// POST { email } -> emails an approval link to the admin inbox.
import { sign, isEmail, escapeHtml, siteOrigin, DAY_MS } from "../lib/token.js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tools@complyiv.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "TCPA Explorer <onboarding@resend.dev>";
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(request) {
  let data;
  try { data = await request.json(); } catch { return json({ error: "Bad request." }, 400); }

  // Honeypot: bots fill hidden fields. Pretend success, send nothing.
  if (data.company) return json({ ok: true });

  const email = String(data.email || "").trim().toLowerCase();
  if (!isEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (!process.env.ACCESS_SECRET || !process.env.RESEND_API_KEY) {
    return json({ error: "Access requests are not configured yet. Please try again later." }, 503);
  }

  // Approval link is valid for 7 days, so the admin has time to act on it.
  const t = await sign({ e: email, x: Date.now() + 7 * DAY_MS, t: "req" }, process.env.ACCESS_SECRET);
  const approveUrl = `${siteOrigin(request)}/api/approve?t=${encodeURIComponent(t)}`;
  const country = request.headers.get("x-vercel-ip-country") || "unknown";
  let city = "unknown";
  try { city = decodeURIComponent(request.headers.get("x-vercel-ip-city") || "") || "unknown"; } catch {}
  const when = new Date().toUTCString();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: `Access request: ${email}`,
      text: `${email} requested access to the TCPA Case Explorer.\n\nLocation: ${city}, ${country}\nTime: ${when}\n\nReview and approve (7-day access):\n${approveUrl}\n\nIgnore this email to deny.`,
      html: `<p><strong>${escapeHtml(email)}</strong> requested access to the TCPA Case Explorer.</p>
<p style="color:#555">Location: ${escapeHtml(city)}, ${escapeHtml(country)}<br>Time: ${escapeHtml(when)}</p>
<p><a href="${escapeHtml(approveUrl)}" style="background:#0f7f86;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Review &amp; approve (7 days)</a></p>
<p style="color:#555">Ignore this email to deny. The link expires in 7 days.</p>`,
    }),
  });

  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return json({ error: "Could not send your request. Please try again later." }, 502);
  }
  return json({ ok: true });
}
