import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { initDb } from "./db";
import { initTelegram } from "./telegram";
import { startAlertChecker } from "./alertChecker";
import routes from "./routes";
import { syncAllData } from "./sync";

const PORT = parseInt(process.env.PORT || "3001", 10);
const API_KEY = process.env.API_KEY || "";

async function main() {
  // Initialize sql.js database (must complete before any DB operations)
  await initDb();

  const app = express();

  app.use(cors());
  app.use(express.json());

  // API key auth middleware (skip if no API_KEY configured)
  if (API_KEY) {
    app.use("/api", (req, res, next) => {
      const key = req.headers["x-clawatch-key"];
      if (key !== API_KEY) {
        res.status(401).json({ error: "Invalid or missing API key" });
        return;
      }
      next();
    });
  }

  app.use("/api", routes);

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Serve embedded dashboard
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  // Init services
  initTelegram();

  // Sync all data from ~/.openclaw JSONL files into DB on startup
  await syncAllData();
  startAlertChecker();

  // Re-sync periodically (every 15s) to keep DB in sync with JSONL
  // Reduced from 60s to match session freshness and keep agents tab in sync
  setInterval(() => syncAllData(), 15_000);

  app.listen(PORT, () => {
    console.log(`[ClaWatch] Backend running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("[ClaWatch] Fatal startup error:", err);
  process.exit(1);
});
