// Tiny user store on Upstash Redis (REST API, no dependencies).
// Works with the env vars the Vercel ↔ Upstash integration adds.
// One record per email:  user:<email> -> JSON
//   { email, name, role, status: "active" | "pending" | "revoked",
//     createdAt, lastAccess, visits }

const baseUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeConfigured = () => Boolean(baseUrl() && token());

async function cmd(...args) {
  const res = await fetch(baseUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`store error ${res.status}: ${data.error || "unknown"}`);
  return data.result;
}

const key = (email) => `user:${String(email).toLowerCase()}`;

export async function getUser(email) {
  const raw = await cmd("GET", key(email));
  return raw ? JSON.parse(raw) : null;
}

// Every registered person, newest first.
export async function listUsers() {
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await cmd("SCAN", cursor, "MATCH", "user:*", "COUNT", "200");
    cursor = String(next);
    keys.push(...batch);
  } while (cursor !== "0" && keys.length < 10000);
  if (!keys.length) return [];
  const users = [];
  for (let i = 0; i < keys.length; i += 200) {
    const vals = await cmd("MGET", ...keys.slice(i, i + 200));
    for (const v of vals) if (v) { try { users.push(JSON.parse(v)); } catch {} }
  }
  return users.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function saveUser(user) {
  await cmd("SET", key(user.email), JSON.stringify(user));
  return user;
}
