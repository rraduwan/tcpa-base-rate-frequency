// POST { email, name?, role? }
//   Known, active email      -> fresh 7-day pass, straight in (no form again)
//   Known, revoked email     -> refused
//   Known, pending email     -> still waiting (approve-first mode only)
//   New email, no details    -> { status: "details" } so the page asks for name + role once
//   New email with details   -> saved; instant access (default) or pending (REQUIRE_APPROVAL=true);
//                               admin gets an email with a manage link (revoke / approve)
import { isEmail, escapeHtml, siteOrigin, passCookies, adminToken, listUrl } from "../lib/token.js";
import { storeConfigured, getUser, saveUser } from "../lib/store.js";
import { sendMail, ADMIN_EMAIL } from "../lib/mail.js";

const requireApproval = () => String(process.env.REQUIRE_APPROVAL || "").toLowerCase() === "true";
const clean = (v) => String(v || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 100);

function json(obj, status = 200, cookies = []) {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify(obj), { status, headers });
}

async function notifyAdmin(request, user, kind) {
  const link = `${siteOrigin(request)}/api/admin?t=${encodeURIComponent(await adminToken(user.email, process.env.ACCESS_SECRET))}`;
  const all = await listUrl(siteOrigin(request), process.env.ACCESS_SECRET);
  const country = request.headers.get("x-vercel-ip-country") || "unknown";
  let city = "unknown";
  try { city = decodeURIComponent(request.headers.get("x-vercel-ip-city") || "") || "unknown"; } catch {}
  const pending = kind === "pending";
  const headline = pending ? "is requesting access to" : "just got access to";
  const button = pending ? "Review &amp; approve" : "Manage / revoke access";
  const rows = [["Name", user.name], ["Role", user.role], ["Email", user.email], ["Location", `${city}, ${country}`], ["Time", new Date().toUTCString()]];
  return sendMail({
    to: ADMIN_EMAIL,
    subject: `${pending ? "Access request" : "New viewer"}: ${user.name} (${user.role}) – ${user.email}`,
    text: `${user.name} ${headline} the TCPA Base Rate Frequency.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${pending ? "Review and approve" : "Revoke access any time"}:\n${link}\n\nView all viewers:\n${all}\n`,
    html: `<p><strong>${escapeHtml(user.name)}</strong> ${headline} the TCPA Base Rate Frequency.</p>
<table style="border-collapse:collapse;margin:0 0 14px">${rows.map(([k, v]) => `<tr><td style="color:#555;padding:2px 14px 2px 0">${k}</td><td>${escapeHtml(v)}</td></tr>`).join("")}</table>
<p><a href="${escapeHtml(link)}" style="background:${pending ? "#0f7f86" : "#c23a32"};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${button}</a>
&nbsp; <a href="${escapeHtml(all)}" style="color:#0f7f86;font-weight:600">View all viewers &rarr;</a></p>
<p style="color:#555;font-size:13px">${pending ? "Ignore this email to deny." : "They can keep coming back with just their email until you revoke them."}</p>`,
  });
}

export async function POST(request) {
  let data;
  try { data = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (data.company) return json({ status: "details" }); // honeypot: bots get nowhere

  const email = String(data.email || "").trim().toLowerCase();
  if (!isEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (!process.env.ACCESS_SECRET || !storeConfigured()) {
    return json({ error: "Access is not configured yet. Please try again later." }, 503);
  }

  try {
    const user = await getUser(email);

    if (user) {
      if (user.status === "revoked") {
        return json({ error: `Your access has been removed. Contact ${ADMIN_EMAIL} if you think this is a mistake.` }, 403);
      }
      if (user.status === "pending") {
        return json({ status: "pending", message: "Your request is still waiting for approval. Try again once you've heard back." }, 202);
      }
      user.lastAccess = new Date().toISOString();
      user.visits = (user.visits || 0) + 1;
      await saveUser(user);
      return json({ status: "ok", name: user.name }, 200, await passCookies(email, process.env.ACCESS_SECRET));
    }

    // New visitor: collect name + role once.
    const name = clean(data.name);
    const role = clean(data.role);
    if (!name || !role) return json({ status: "details" });

    const now = new Date().toISOString();
    const newUser = { email, name, role, status: requireApproval() ? "pending" : "active", createdAt: now, lastAccess: now, visits: 1 };

    if (newUser.status === "pending") {
      if (!(await notifyAdmin(request, newUser, "pending"))) {
        return json({ error: "Could not send your request. Please try again later." }, 502);
      }
      await saveUser(newUser);
      return json({ status: "pending", message: "Request sent. You'll be able to get in with just your email once it's approved." }, 202);
    }

    await saveUser(newUser);
    await notifyAdmin(request, newUser, "new"); // a mail failure doesn't block the visitor
    return json({ status: "ok", name }, 200, await passCookies(email, process.env.ACCESS_SECRET));
  } catch (err) {
    console.error("access error", err);
    return json({ error: "Something went wrong. Please try again in a moment." }, 500);
  }
}
