import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { initDb } from "./db";
import { initTelegram } from "./telegram";
import { startAlertChecker } from "./alertChecker";
import routes from "./routes";

const PORT = parseInt(process.env.PORT || "3001", 10);
const API_KEY = process.env.API_KEY || "";

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

// Init
initDb();
initTelegram();
startAlertChecker();

app.listen(PORT, () => {
  console.log(`[ClaWatch] Backend running on http://localhost:${PORT}`);
});
