// @ts-ignore — sql.js ships without declaration files; types are inferred at runtime
import initSqlJs from "sql.js";
import path from "path";
import os from "os";
import fs from "fs";

// Store DB in ~/.clawatch/ so it persists across npm upgrades
const CLAWATCH_DIR = path.join(os.homedir(), ".clawatch");
if (!fs.existsSync(CLAWATCH_DIR)) {
  fs.mkdirSync(CLAWATCH_DIR, { recursive: true });
}
const DB_PATH = path.join(CLAWATCH_DIR, "clawatch.db");

let sqlDb: any = null;
let _inTransaction = false;

function requireDb(): any {
  if (!sqlDb) throw new Error("Database not initialized — call initDb() first");
  return sqlDb;
}

function persistDb(): void {
  if (!sqlDb) return;
  fs.writeFileSync(DB_PATH, Buffer.from(sqlDb.export()));
}

/**
 * PreparedStatement mimics better-sqlite3's prepared statement API
 * using sql.js under the hood. Statements are lazy — they only touch
 * the database when run/get/all is called, not at creation time.
 */
class PreparedStatement {
  constructor(private readonly sql: string) {}

  run(...params: any[]): { changes: number } {
    const db = requireDb();
    if (params.length > 0) {
      db.run(this.sql, params);
    } else {
      db.run(this.sql);
    }
    const changes = db.getRowsModified();
    if (!_inTransaction) persistDb();
    return { changes };
  }

  get(...params: any[]): any {
    const db = requireDb();
    const stmt = db.prepare(this.sql);
    try {
      if (params.length > 0) stmt.bind(params);
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params: any[]): any[] {
    const db = requireDb();
    const stmt = db.prepare(this.sql);
    try {
      if (params.length > 0) stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }
}

/**
 * Database wrapper providing a better-sqlite3-compatible API
 * backed by sql.js (pure WASM SQLite — no native compilation needed).
 *
 * Why: better-sqlite3 requires native C++ compilation (node-gyp, make, gcc).
 * This fails on locked-down environments like Synology NAS. sql.js runs
 * everywhere Node.js runs with zero native dependencies.
 */
const db = {
  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(sql);
  },

  exec(sql: string): void {
    requireDb().exec(sql);
    if (!_inTransaction) persistDb();
  },

  pragma(pragma: string): void {
    try {
      requireDb().exec(`PRAGMA ${pragma}`);
    } catch {
      // Some pragmas (e.g. journal_mode=WAL) are not supported in WASM — ignore gracefully
    }
  },

  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
    return (...args: any[]) => {
      const db = requireDb();
      db.exec("BEGIN");
      _inTransaction = true;
      try {
        const result = fn(...args);
        db.exec("COMMIT");
        _inTransaction = false;
        persistDb();
        return result;
      } catch (err) {
        _inTransaction = false;
        try { db.exec("ROLLBACK"); } catch { /* best effort */ }
        throw err;
      }
    };
  },
};

/**
 * Initialize the sql.js database. Must be called (and awaited) before
 * any DB operations. Loads existing data from disk or creates a new DB.
 */
async function initDb(): Promise<void> {
  const SQL = await initSqlJs();

  // Load existing DB file or create a new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  // Enable foreign keys (WAL mode is not applicable for sql.js — it uses
  // in-memory storage with manual persist to disk)
  sqlDb.exec("PRAGMA foreign_keys = ON");

  // Create tables
  sqlDb.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);

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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  persistDb();
  console.log("[DB] sql.js initialized (pure WASM SQLite — no native deps)");
}

export { initDb };
export default db;
