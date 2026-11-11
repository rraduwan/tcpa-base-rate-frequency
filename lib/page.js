// Minimal shared HTML shell for the server-rendered pages.
export function page(title, inner, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title}</title>
<style>
:root{--navy:#0e2340;--ink:#0f1a2b;--ink2:#4a5568;--line:#d9dee7;--bg:#f3f5f8;--teal:#0f7f86;--bad:#c23a32}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;max-width:520px;width:100%;overflow:hidden}
.head{background:var(--navy);color:#e9eef6;padding:18px 24px}.head h1{margin:0;font:600 20px Georgia,serif}
.head p{margin:4px 0 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#a9b8cf}
.body{padding:24px}h2{margin:0 0 8px;font-size:18px}p{color:var(--ink2);margin:0 0 14px}
code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all}
.btn{display:inline-block;background:var(--teal);color:#fff;border:0;border-radius:6px;padding:10px 18px;font:600 15px inherit;
cursor:pointer;text-decoration:none}.btn.alt{background:#fff;color:var(--teal);border:1px solid var(--teal)}
.box{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin:0 0 14px}
.err{color:var(--bad)}.row{display:flex;gap:10px;flex-wrap:wrap}
</style></head><body><div class="card"><div class="head"><h1>TCPA Case Explorer</h1><p>Restricted prototype</p></div>
<div class="body">${inner}</div></div></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
