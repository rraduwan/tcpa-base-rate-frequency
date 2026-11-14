// Access list: everyone who has registered, with revoke / restore / approve.
// GET  ?t=<list token>                       -> the table
// GET  (no or bad token)                     -> page with "Email me the link"
// POST action=send                            -> emails the list link to the admin inbox
// POST t=<list token>&email=…&action=revoke|restore|approve -> updates, then back to the list
import { verify, escapeHtml, siteOrigin, listUrl } from "../lib/token.js";
import { storeConfigured, listUsers, getUser, saveUser } from "../lib/store.js";
import { sendMail, ADMIN_EMAIL } from "../lib/mail.js";
import { page } from "../lib/page.js";

const STATUS = {
  active: ["Active", "#1a7f4b", "#e3f4ea"],
  revoked: ["Revoked", "#c23a32", "#fbe6e4"],
  pending: ["Waiting", "#9a6b00", "#fbf0d6"],
};
const ACTION = { active: ["revoke", "Revoke", "danger"], revoked: ["restore", "Restore", ""], pending: ["approve", "Approve", ""] };
const NEXT = { revoke: "revoked", restore: "active", approve: "active" };
const DONE = { revoke: "revoked", restore: "restored", approve: "approved" };

const notConfigured = () => page("Not configured", `<h2 class="err">The user database isn't connected yet.</h2>`, 503);

function askForLink(msg = "") {
  return page("Access list", `<h2>Access list</h2>
${msg}
<p>This page needs the private link from your admin emails. Every "New viewer" email has a <strong>View all viewers</strong> link.</p>
<p>Don't have one handy? We can email a fresh link to <strong>${escapeHtml(ADMIN_EMAIL)}</strong>.</p>
<form method="post" action="/api/viewers"><input type="hidden" name="action" value="send">
<button class="btn" type="submit">Email me the link</button></form>`);
}

const iso = (s) => (s ? escapeHtml(s) : "");

function table(users, t, notice) {
  const counts = { all: users.length, active: 0, revoked: 0, pending: 0 };
  for (const u of users) counts[u.status] = (counts[u.status] || 0) + 1;

  const rows = users.map((u) => {
    const [label, fg, bg] = STATUS[u.status] || [u.status, "#4a5568", "#eef1f6"];
    const act = ACTION[u.status];
    const search = escapeHtml(`${u.name || ""} ${u.role || ""} ${u.email}`.toLowerCase());
    return `<tr data-status="${escapeHtml(u.status)}" data-search="${search}">
<td><strong>${escapeHtml(u.name || "–")}</strong></td>
<td>${escapeHtml(u.role || "–")}</td>
<td class="mono">${escapeHtml(u.email)}</td>
<td><span class="pill" style="color:${fg};background:${bg}">${label}</span></td>
<td class="ts" data-ts="${iso(u.createdAt)}"></td>
<td class="ts" data-ts="${iso(u.lastAccess)}"></td>
<td class="num">${u.visits || 0}</td>
<td>${act ? `<form method="post" action="/api/viewers"><input type="hidden" name="t" value="${escapeHtml(t)}">
<input type="hidden" name="email" value="${escapeHtml(u.email)}"><input type="hidden" name="action" value="${act[0]}">
<button class="sm${act[2] ? " danger" : ""}" type="submit"${act[0] === "revoke" ? ` onclick="return confirm('Revoke access for ${escapeHtml(u.email).replace(/'/g, "")}?')"` : ""}>${act[1]}</button></form>` : ""}</td>
</tr>`;
  }).join("");

  return page("Access list", `<style>
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
.bar input{flex:1;min-width:200px;padding:9px 12px;border:1px solid var(--line);border-radius:6px;font:inherit}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.chip.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
th{background:var(--bg);font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink2)}tr:last-child td{border-bottom:0}
.num{text-align:right;font-variant-numeric:tabular-nums}.pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600}
.sm{border:1px solid var(--teal);background:#fff;color:var(--teal);border-radius:6px;padding:5px 12px;font:600 13px inherit;cursor:pointer}
.sm.danger{border-color:var(--bad);color:var(--bad)}.empty{padding:28px;text-align:center;color:var(--ink2)}
</style>
<h2>Access list</h2>
${notice}
<div class="bar"><input id="q" type="search" placeholder="Search name, role or email…" aria-label="Search">
<div class="chips" role="group" aria-label="Filter by status">
<button class="chip on" data-f="all">All ${counts.all}</button>
<button class="chip" data-f="active">Active ${counts.active}</button>
<button class="chip" data-f="revoked">Revoked ${counts.revoked}</button>
${counts.pending ? `<button class="chip" data-f="pending">Waiting ${counts.pending}</button>` : ""}
</div></div>
<div class="wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Status</th><th>First seen</th><th>Last visit</th><th class="num">Visits</th><th></th></tr></thead>
<tbody id="rows">${rows}</tbody></table>
<div class="empty" id="empty" ${users.length ? "hidden" : ""}>${users.length ? "No one matches." : "No one has registered yet."}</div></div>
<p style="font-size:12.5px;margin-top:14px">Keep this link private: anyone who has it can see this list and revoke people.</p>
<script>
(function(){
  var f="all",q=document.getElementById("q"),rows=[].slice.call(document.querySelectorAll("#rows tr")),empty=document.getElementById("empty");
  document.querySelectorAll(".ts").forEach(function(td){var s=td.getAttribute("data-ts");td.textContent=s?new Date(s).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}):"–";});
  function apply(){var s=q.value.trim().toLowerCase(),n=0;rows.forEach(function(r){var ok=(f==="all"||r.dataset.status===f)&&(!s||r.dataset.search.indexOf(s)>-1);r.hidden=!ok;if(ok)n++;});
    if(rows.length){empty.hidden=n>0;empty.textContent="No one matches.";}}
  q.addEventListener("input",apply);
  document.querySelectorAll(".chip").forEach(function(c){c.addEventListener("click",function(){document.querySelectorAll(".chip").forEach(function(x){x.classList.remove("on")});c.classList.add("on");f=c.dataset.f;apply();});});
})();
</script>`, 200, { wide: true });
}

export async function GET(request) {
  if (!storeConfigured() || !process.env.ACCESS_SECRET) return notConfigured();
  const params = new URL(request.url).searchParams;
  const t = params.get("t");
  if (!(await verify(t, process.env.ACCESS_SECRET, "list"))) {
    return askForLink(t ? `<p class="err">That link is invalid or has expired.</p>` : "");
  }
  const done = params.get("done"), who = params.get("who");
  const notice = done && who && Object.values(DONE).includes(done)
    ? `<p class="ok">&#10003; ${escapeHtml(who)} ${escapeHtml(done)}.</p>` : "";
  try {
    return table(await listUsers(), t, notice);
  } catch (err) {
    console.error("list error", err);
    return page("Error", `<h2 class="err">Couldn't load the list. Please refresh in a moment.</h2>`, 500);
  }
}

export async function POST(request) {
  if (!storeConfigured() || !process.env.ACCESS_SECRET) return notConfigured();
  let form;
  try { form = await request.formData(); } catch { return askForLink(); }
  const action = form.get("action");

  if (action === "send") {
    const link = await listUrl(siteOrigin(request), process.env.ACCESS_SECRET);
    const ok = await sendMail({
      to: ADMIN_EMAIL,
      subject: "Your TCPA Base Rate Frequency access list link",
      text: `Here's your private link to the access list:\n${link}\n\nKeep it private: anyone with it can see the list and revoke people.`,
      html: `<p>Here's your private link to the access list:</p>
<p><a href="${escapeHtml(link)}" style="background:#0f7f86;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Open access list</a></p>
<p style="color:#555;font-size:13px">Keep it private: anyone with it can see the list and revoke people.</p>`,
    });
    return askForLink(ok
      ? `<p class="ok">&#10003; Sent. Check ${escapeHtml(ADMIN_EMAIL)} (and spam).</p>`
      : `<p class="err">Couldn't send the email. Check the Resend key in Vercel.</p>`);
  }

  const t = form.get("t");
  if (!(await verify(t, process.env.ACCESS_SECRET, "list"))) return askForLink(`<p class="err">That link is invalid or has expired.</p>`);
  const next = NEXT[action];
  const email = String(form.get("email") || "").toLowerCase();
  const user = next && email ? await getUser(email) : null;
  if (!user) return page("Not found", `<h2 class="err">That person or action wasn't found.</h2>`, 400);

  user.status = next;
  user[{ approve: "approvedAt", restore: "restoredAt", revoke: "revokedAt" }[action]] = new Date().toISOString();
  await saveUser(user);

  const back = new URL("/api/viewers", siteOrigin(request));
  back.searchParams.set("t", t);
  back.searchParams.set("done", DONE[action]);
  back.searchParams.set("who", user.name || user.email);
  return new Response(null, { status: 303, headers: { Location: back.toString(), "Cache-Control": "no-store" } });
}
