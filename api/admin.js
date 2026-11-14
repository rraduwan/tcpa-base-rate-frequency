// Admin page for one person, reached from the link in the notification email.
// GET  ?t=<admin token>          -> shows the person and the available action
// POST t=<admin token>&action=…  -> approve | revoke | restore
// GETs never change anything, so email link-scanners can't revoke or approve by accident.
import { verify, escapeHtml, siteOrigin } from "../lib/token.js";
import { storeConfigured, getUser, saveUser } from "../lib/store.js";
import { page } from "../lib/page.js";

const STATUS_LABEL = { active: "Has access", pending: "Waiting for approval", revoked: "Access revoked" };
const ACTIONS = {
  pending: [["approve", "Approve access", ""]],
  active: [["revoke", "Revoke access", "danger"]],
  revoked: [["restore", "Restore access", ""]],
};

const invalid = (msg = "This link is invalid or has expired.") => page("Link invalid", `<h2 class="err">${msg}</h2>`, 400);
const fmt = (iso) => (iso ? new Date(iso).toUTCString() : "–");

function view(user, t, note = "") {
  const buttons = (ACTIONS[user.status] || [])
    .map(([a, label, cls]) => `<form method="post" action="/api/admin" style="display:inline">
<input type="hidden" name="t" value="${escapeHtml(t)}"><input type="hidden" name="action" value="${a}">
<button class="btn${cls === "danger" ? " danger" : ""}" type="submit">${label}</button></form>`)
    .join(" ");
  return page("Manage access", `${note}
<h2>${escapeHtml(user.name || user.email)}</h2>
<div class="box">
<strong>Role:</strong> ${escapeHtml(user.role || "–")}<br>
<strong>Email:</strong> ${escapeHtml(user.email)}<br>
<strong>Status:</strong> ${STATUS_LABEL[user.status] || escapeHtml(user.status)}<br>
<strong>First seen:</strong> ${fmt(user.createdAt)}<br>
<strong>Last visit:</strong> ${fmt(user.lastAccess)} · ${user.visits || 0} visit(s)
</div>
<div class="row">${buttons}</div>`);
}

async function load(t) {
  if (!storeConfigured()) return { error: page("Not configured", `<h2 class="err">The user database isn't connected yet.</h2>`, 503) };
  const tok = await verify(t, process.env.ACCESS_SECRET, "adm");
  if (!tok) return { error: invalid() };
  const user = await getUser(tok.e);
  if (!user) return { error: invalid("This person isn't in the database.") };
  return { user };
}

export async function GET(request) {
  const t = new URL(request.url).searchParams.get("t");
  const { user, error } = await load(t);
  return error || view(user, t);
}

export async function POST(request) {
  let form;
  try { form = await request.formData(); } catch { return invalid(); }
  const t = form.get("t");
  const action = form.get("action");
  const { user, error } = await load(t);
  if (error) return error;

  const next = { approve: "active", restore: "active", revoke: "revoked" }[action];
  if (!next) return invalid("Unknown action.");
  user.status = next;
  user[{ approve: "approvedAt", restore: "restoredAt", revoke: "revokedAt" }[action]] = new Date().toISOString();
  await saveUser(user);

  let note = "";
  if (action === "revoke") {
    note = `<p class="ok">&#10003; Access revoked. ${escapeHtml(user.name)} is blocked from now on, even on devices where they were signed in.</p>`;
  } else {
    const site = siteOrigin(request);
    const first = (user.name || "").split(" ")[0];
    const body = `Hi${first ? " " + first : ""},\n\nYou now have access to the TCPA Base Rate Frequency.\n\nGo to ${site} and enter your email (${user.email}) to get in.\n`;
    const mailto = `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent("Your access to the TCPA Base Rate Frequency")}&body=${encodeURIComponent(body)}`;
    note = `<p class="ok">&#10003; Access ${action === "approve" ? "approved" : "restored"}. They can now get in by entering their email.</p>
<p><a class="btn alt" href="${escapeHtml(mailto)}">Let them know by email</a></p>`;
  }
  return view(user, t, note);
}
