// Signed, self-expiring tokens (HMAC-SHA256). No database needed.
// Token = base64url(JSON payload) + "." + base64url(signature)
// Payload: { e: email, x: expiry (ms since epoch), t: "req" | "acc" }

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
