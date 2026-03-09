// ClaWatch dashboard server: Next.js standalone + API reverse proxy
// This replaces the default server.js to proxy /api/* to the backend
const http = require("http");
const path = require("path");

const PORT = parseInt(process.env.PORT || "3456", 10);
const BACKEND_PORT = process.env.BACKEND_PORT || "3001";
const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

// Load Next.js request handler
process.env.PORT = String(PORT);
process.env.HOSTNAME = HOSTNAME;
const nextHandler = require("./server.js");

// Wait a tick for Next.js to initialize, then wrap with proxy
setImmediate(() => {
  // Next.js standalone creates its own server on PORT.
  // We need to intercept before that. Instead, let's create a proxy
  // that runs on PORT and forwards to Next.js on an internal port.
});

// Actually, simpler: just start the default server.js which handles Next.js,
// but we need to patch the request handling to proxy /api/*.
// Since server.js creates its own http server, we can't easily wrap it.
//
// Simplest reliable approach: use http-proxy-like manual proxying
// by replacing this file as the entry point.

// Dynamically load the Next.js app
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
