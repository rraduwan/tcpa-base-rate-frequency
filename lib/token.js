// Signed, self-expiring tokens (HMAC-SHA256). No database needed.
// Token = base64url(JSON payload) + "." + base64url(signature)
// Payload: { e: email, x: expiry (ms since epoch), t: "acc" (visitor pass) | "adm" (admin link) }

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

const hmacKey = (secret) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ACCESS_DAYS = 7;
export const COOKIE_NAME = "tcpa_access";
export const EMAIL_COOKIE = "tcpa_email"; // remembers the email (not secret) so returning visitors don't retype it

// Set-Cookie values for a fresh 7-day pass plus the remembered email.
export async function passCookies(email, secret) {
  const t = await sign({ e: email, x: Date.now() + ACCESS_DAYS * DAY_MS, t: "acc" }, secret);
  return [
    `${COOKIE_NAME}=${encodeURIComponent(t)}; Max-Age=${ACCESS_DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    `${EMAIL_COOKIE}=${encodeURIComponent(email)}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`,
  ];
}

export const clearPassCookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;

// Long-lived signed link that lets the admin manage one person (revoke/restore/approve).
// Long-lived signed link to the full access list (shared in every admin email).
export const listToken = (secret) => sign({ e: "*", x: Date.now() + 365 * DAY_MS, t: "list" }, secret);
export const listUrl = async (origin, secret) => `${origin}/api/viewers?t=${encodeURIComponent(await listToken(secret))}`;

export const adminToken = (email, secret) => sign({ e: email, x: Date.now() + 365 * DAY_MS, t: "adm" }, secret);

export async function sign(payload, secret) {
  if (!secret) throw new Error("ACCESS_SECRET is not set");
  const body = toB64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${toB64url(sig)}`;
}

// Returns the payload if the token is genuine, of the expected type and not expired; otherwise null.
export async function verify(token, secret, type, now = Date.now()) {
  if (!token || !secret || typeof token !== "string") return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(fromB64url(body)));
    if (p.t !== type || typeof p.x !== "number" || p.x <= now || typeof p.e !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

export function getCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const isEmail = (s) =>
  typeof s === "string" && s.length <= 254 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(s);

export const siteOrigin = (request) => process.env.SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
