// ClaWatch dashboard server: Next.js standalone + API reverse proxy
// This replaces the default server.js to proxy /api/* to the backend
const http = require("http");
const path = require("path");

const PORT = parseInt(process.env.PORT || "3456", 10);
const BACKEND_PORT = process.env.BACKEND_PORT || "3001";
const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

// Load Next.js app directly (don't require server.js — it starts its own listener)
const NextServer = require("next/dist/server/next-server").default;
const conf = require("./.next/required-server-files.json");

const nextApp = new NextServer({
  hostname: HOSTNAME,
  port: PORT,
  dir: __dirname,
  dev: false,
  customServer: true,
  conf: conf.config,
});

const handler = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const server = http.createServer((req, res) => {
    // Proxy /api/* and /health to backend
    if (req.url && (req.url.startsWith("/api/") || req.url === "/health")) {
      const options = {
        hostname: "127.0.0.1",
        port: BACKEND_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${BACKEND_PORT}` },
      };

      const proxy = http.request(options, (proxyRes) => {
        // Add CORS headers
        res.writeHead(proxyRes.statusCode || 502, {
          ...proxyRes.headers,
          "access-control-allow-origin": "*",
        });
        proxyRes.pipe(res);
      });

      proxy.on("error", () => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Backend not ready" }));
      });

      req.pipe(proxy);
      return;
    }

    // Everything else → Next.js
    handler(req, res);
  });

  server.listen(PORT, HOSTNAME, () => {
    console.log(`▲ Next.js 16 + API proxy`);
    console.log(`✓ Ready on http://localhost:${PORT}`);
  });
});
