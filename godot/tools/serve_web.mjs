#!/usr/bin/env node
/* Local static + /api/playtest_events proxy (mirrors Vercel rewrite). */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
const port = Number(process.argv[3] || 8765);
const dest = "https://ywwguestvujaoimlqznq.supabase.co/rest/v1/playtest_events";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  if (u.pathname === "/api/playtest_events") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const headers = {};
    for (const k of ["apikey", "authorization", "prefer", "content-type", "accept"]) {
      if (req.headers[k]) headers[k] = req.headers[k];
    }
    try {
      const r = await fetch(dest, { method: "POST", headers, body });
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, { "content-type": r.headers.get("content-type") || "application/json" });
      res.end(buf);
    } catch (e) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(String(e && e.message || e));
    }
    return;
  }
  let file = path.join(root, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  });
});
server.listen(port, "127.0.0.1", () => {
  console.log("Serving", root, "on http://127.0.0.1:" + port);
});
