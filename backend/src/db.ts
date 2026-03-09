import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

// Store DB in ~/.clawatch/ so it persists across npm upgrades
const CLAWATCH_DIR = path.join(os.homedir(), ".clawatch");
if (!fs.existsSync(CLAWATCH_DIR)) {
  fs.mkdirSync(CLAWATCH_DIR, { recursive: true });
}
const DB_PATH = path.join(CLAWATCH_DIR, "clawatch.db");

const db: InstanceType<typeof Database> = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Auto-init tables immediately (before any imports that call db.prepare)
function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'running',
      lastHeartbeat TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      costUsd REAL NOT NULL DEFAULT 0,
      tokenCount INTEGER NOT NULL DEFAULT 0,
      errorCount INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agentId TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (agentId) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_events_agentId ON events(agentId);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_sessions (
      projectId TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      addedAt TEXT NOT NULL,
      PRIMARY KEY (projectId, sessionId),
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);
}

// Run immediately so tables exist before other modules call db.prepare()
initDb();

export { initDb };
export default db;
