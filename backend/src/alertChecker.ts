import { v4 as uuid } from "uuid";
import db from "./db";
import { sendAlert } from "./telegram";

const STUCK_TIMEOUT_MS = parseInt(process.env.STUCK_TIMEOUT_MS || "300000", 10);
const ERROR_SPIKE_THRESHOLD = parseInt(process.env.ERROR_SPIKE_THRESHOLD || "3", 10);
const ERROR_SPIKE_WINDOW_MS = parseInt(process.env.ERROR_SPIKE_WINDOW_MS || "60000", 10);
const COST_THRESHOLD_USD = parseFloat(process.env.COST_THRESHOLD_USD || "10");

const insertAlert = db.prepare(`
  INSERT INTO alerts (id, agentId, type, severity, message, timestamp, acknowledged)
  VALUES (?, ?, ?, ?, ?, ?, 0)
`);

const updateAgentStatus = db.prepare(`UPDATE agents SET status = ? WHERE id = ?`);

function recentAlertExists(agentId: string, type: string, withinMs: number): boolean {
  const since = new Date(Date.now() - withinMs).toISOString();
  const row = db.prepare(
    `SELECT COUNT(*) as cnt FROM alerts WHERE agentId = ? AND type = ? AND timestamp > ?`
  ).get(agentId, type, since) as { cnt: number };
  return row.cnt > 0;
}

function createAndSendAlert(agentId: string, type: string, severity: string, message: string) {
  const alert = {
    id: `alert_${uuid().slice(0, 8)}`,
    agentId,
    type,
    severity,
    message,
    timestamp: new Date().toISOString(),
  };
  insertAlert.run(alert.id, alert.agentId, alert.type, alert.severity, alert.message, alert.timestamp);
  sendAlert(alert);
}

function checkStuckAgents(): void {
  const cutoff = new Date(Date.now() - STUCK_TIMEOUT_MS).toISOString();
  const stuck = db.prepare(
    `SELECT id, name FROM agents WHERE status = 'running' AND lastHeartbeat < ?`
  ).all(cutoff) as { id: string; name: string }[];

  for (const agent of stuck) {
    if (recentAlertExists(agent.id, "stuck", STUCK_TIMEOUT_MS)) continue;
    updateAgentStatus.run("stuck", agent.id);
    createAndSendAlert(
      agent.id,
      "stuck",
      "critical",
      `Agent *${agent.name}* is stuck — no heartbeat for ${Math.round(STUCK_TIMEOUT_MS / 60000)} minutes`
    );
  }
}

function summarizeErrors(errors: { error: string }[]): string {
  if (errors.length === 0) return "Unknown error";

  // Count occurrences of each error message
  const counts = new Map<string, number>();
  for (const e of errors) {
    const msg = e.error || "Unknown error";
    counts.set(msg, (counts.get(msg) || 0) + 1);
  }

  // Get the most common error
  let topError = "";
  let topCount = 0;
  for (const [msg, cnt] of counts) {
    if (cnt > topCount) { topError = msg; topCount = cnt; }
  }

  // Extract a clean, short summary from the error message
  return extractErrorSummary(topError);
}

// Strip common log prefixes: timestamps, log levels, bracketed tags
function stripLogPrefix(error: string): string {
  let cleaned = error;
  cleaned = cleaned.replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[\d.+:ZT-]*\s*/g, "");
  cleaned = cleaned.replace(/^\[[\w.-]+\]\s*/g, "");
  cleaned = cleaned.replace(/^\[[\w.-]+\]\s*/g, "");
  cleaned = cleaned.replace(/^(ERROR|WARN|INFO|DEBUG|FATAL|TRACE)[:\s]+/i, "");
  return cleaned.trim();
}

function extractErrorSummary(error: string): string {
  // Strip log timestamps/tags first
  const cleaned = stripLogPrefix(error);

  // Common patterns → human-readable summaries
  const patterns: [RegExp, string][] = [
    [/ECONNREFUSED/i, "Connection refused"],
    [/ECONNRESET/i, "Connection was reset"],
    [/ETIMEDOUT/i, "Connection timed out"],
    [/ENOTFOUND/i, "Host not found (DNS failure)"],
    [/EADDRINUSE/i, "Port already in use"],
    [/EPERM|EACCES/i, "Permission denied"],
    [/ENOMEM/i, "Out of memory"],
    [/rate.?limit/i, "API rate limit exceeded"],
    [/401|unauthorized/i, "Authentication failed"],
    [/403|forbidden/i, "Access forbidden"],
    [/404|not found/i, "Resource not found"],
    [/500|internal server error/i, "Internal server error"],
    [/502|bad gateway/i, "Bad gateway"],
    [/503|service unavailable/i, "Service unavailable"],
    [/504|gateway timeout/i, "Gateway timeout"],
    [/timeout/i, "Operation timed out"],
    [/SQLITE_BUSY/i, "Database is locked"],
    [/SQLITE_CORRUPT/i, "Database corruption detected"],
    [/Cannot read propert(y|ies) of (undefined|null)/i, "Null reference error"],
    [/is not a function/i, "Type error (calling non-function)"],
    [/JSON\.parse|Unexpected token/i, "Invalid JSON response"],
    [/CERT_|certificate/i, "SSL certificate error"],
    [/token.*expir/i, "Authentication token expired"],
    [/out of.?range|overflow/i, "Value out of range"],
  ];

  for (const [pattern, summary] of patterns) {
    if (pattern.test(cleaned)) return summary;
  }

  // Fallback: extract the error type and first meaningful part from cleaned string
  const typeMatch = cleaned.match(/^(\w+Error):\s*(.+?)(?:\n|$)/);
  if (typeMatch) {
    const msg = typeMatch[2].trim();
    return msg.length > 80 ? msg.slice(0, 77) + "..." : msg;
  }

  // Just clean up and truncate
  const firstLine = cleaned.replace(/\n.*/s, "").trim();
  if (!firstLine || firstLine.length < 3) return "Unknown error";
  return firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;
}

function checkErrorSpikes(): void {
  const since = new Date(Date.now() - ERROR_SPIKE_WINDOW_MS).toISOString();
  const rows = db.prepare(`
    SELECT agentId, COUNT(*) as cnt
    FROM events
    WHERE type = 'error' AND timestamp > ?
    GROUP BY agentId
    HAVING cnt >= ?
  `).all(since, ERROR_SPIKE_THRESHOLD) as { agentId: string; cnt: number }[];

  for (const row of rows) {
    if (recentAlertExists(row.agentId, "error", ERROR_SPIKE_WINDOW_MS)) continue;

    // Fetch actual error messages to generate a specific title
    const errors = db.prepare(`
      SELECT data FROM events
      WHERE agentId = ? AND type = 'error' AND timestamp > ?
      ORDER BY timestamp DESC
    `).all(row.agentId, since).map((e: any) => {
      const parsed = JSON.parse(e.data);
      return { error: parsed.error || parsed.message || "Unknown error" };
    });

    const agent = db.prepare("SELECT name FROM agents WHERE id = ?").get(row.agentId) as { name: string } | undefined;
    const agentName = agent?.name || row.agentId;
    const errorSummary = summarizeErrors(errors);

    createAndSendAlert(
      row.agentId,
      "error",
      "critical",
      `${agentName}: ${errorSummary} (${row.cnt}× in ${Math.round(ERROR_SPIKE_WINDOW_MS / 60000)}min)`
    );
  }
}

function checkCostThresholds(): void {
  const rows = db.prepare(
    `SELECT id, name, costUsd FROM agents WHERE costUsd >= ?`
  ).all(COST_THRESHOLD_USD) as { id: string; name: string; costUsd: number }[];

  for (const agent of rows) {
    // Only alert once per agent per threshold crossing (check last 1 hour)
    if (recentAlertExists(agent.id, "cost_spike", 3600000)) continue;
    createAndSendAlert(
      agent.id,
      "cost_spike",
      "warning",
      `Agent *${agent.name}* exceeded cost threshold — $${agent.costUsd.toFixed(2)} spent (threshold: $${COST_THRESHOLD_USD})`
    );
  }
}

export function runAlertChecker(): void {
  try {
    checkStuckAgents();
    checkErrorSpikes();
    checkCostThresholds();
  } catch (err) {
    console.error("[AlertChecker] Error:", err);
  }
}

export function startAlertChecker(): NodeJS.Timeout {
  console.log("[AlertChecker] Started (every 30s)");
  return setInterval(runAlertChecker, 30000);
}
