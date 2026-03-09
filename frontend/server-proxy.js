// Custom server that wraps Next.js standalone + proxies /api/* to backend
const http = require("http");
const { parse } = require("url");
const next = require("next");
const path = require("path");

const PORT = parseInt(process.env.PORT || "3456", 10);
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const backendUrl = new URL(BACKEND_URL);

// Next.js standalone handler
const app = next({ dir: __dirname, dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const parsed = parse(req.url || "/", true);

    // Proxy /api/* and /health to backend
    if (parsed.pathname?.startsWith("/api/") || parsed.pathname === "/health") {
      const proxyOptions = {
        hostname: backendUrl.hostname,
        port: backendUrl.port,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${backendUrl.hostname}:${backendUrl.port}`,
        },
      };

      const proxyReq = http.request(proxyOptions, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on("error", (err) => {
        console.error("[proxy] Backend unreachable:", err.message);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Backend unreachable" }));
      });

      req.pipe(proxyReq);
      return;
    }

    // Everything else → Next.js
    handle(req, res, parsed);
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`▲ Next.js + API proxy on http://localhost:${PORT}`);
    console.log(`  API proxied to ${BACKEND_URL}`);
  });
});
