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
    // Network
    [/ECONNREFUSED/i, "Connection refused"],
    [/ECONNRESET/i, "Connection lost"],
    [/ETIMEDOUT/i, "Connection timed out"],
    [/ENOTFOUND/i, "Can't reach remote server"],
    [/EADDRINUSE/i, "Port already in use"],
    [/EPERM|EACCES/i, "Permission denied"],
    [/ENOMEM|out of memory|heap|OOM/i, "Out of memory"],
    // HTTP
    [/rate.?limit/i, "API rate limit exceeded"],
    [/401|unauthorized/i, "Authentication failed"],
    [/403|forbidden/i, "Access denied"],
    [/500|internal server error/i, "Remote server error"],
    [/502|bad gateway/i, "Bad gateway"],
    [/503|service unavailable/i, "Service unavailable"],
    [/504|gateway timeout/i, "Gateway timeout"],
    // Code
    [/Cannot read propert/i, "Code bug (null reference)"],
    [/is not a function/i, "Code bug (type error)"],
    [/JSON\.parse|Unexpected token/i, "Malformed data received"],
    [/SQLITE_BUSY/i, "Database locked"],
    [/SQLITE_CORRUPT/i, "Database corruption"],
    // Auth/cert
    [/CERT_|certificate/i, "SSL certificate error"],
    [/token.*expir/i, "Auth token expired"],
    // File/path
    [/ENOENT|no such file/i, "Missing file or directory"],
    [/EISDIR/i, "Invalid file operation"],
    // OpenClaw / gateway specific
    [/[Ss]lack\s*bot\s*token\s*missing/i, "Slack credentials not configured"],
    [/[Rr]etry failed for delivery/i, "Message delivery failing"],
    [/socket.?mode failed/i, "Slack connection failing"],
    [/pong wasn't received|pong.*timeout/i, "Slack connection timing out"],
    [/[Uu]nhandled promise rejection/i, "Unhandled crash"],
    [/allowlist contains unknown/i, "Misconfigured tool settings"],
    [/[Ss]kipping skill path/i, "Skill path issue"],
    [/hostname conflict/i, "Hostname conflict"],
    [/spawn.*ENOENT|command not found/i, "Missing required command"],
    [/killed|SIGKILL|SIGTERM/i, "Process was killed"],
    // Generic (broad — keep last)
    [/timeout/i, "Operation timed out"],
    [/connection refused/i, "Connection refused"],
    [/missing.*config|config.*missing/i, "Missing configuration"],
  ];

  for (const [pattern, summary] of patterns) {
    if (pattern.test(cleaned)) return summary;
  }

  // Smart fallback: interpret the error instead of truncating
  return smartFallback(cleaned);
}

function smartFallback(cleaned: string): string {
  // Try "ErrorType: message" format
  const typeMatch = cleaned.match(/^(\w+Error):\s*(.+?)(?:\n|$)/);
  if (typeMatch) {
    const msg = typeMatch[2].trim();
    return msg.length > 50 ? msg.slice(0, 47) + "..." : msg;
  }

  // Look for a verb phrase
  const actionMatch = cleaned.match(/(failed to \w+|cannot \w+|unable to \w+|could not \w+)/i);
  if (actionMatch) {
    return actionMatch[1].charAt(0).toUpperCase() + actionMatch[1].slice(1).toLowerCase();
  }

  // Keyword-based categorization
  const lower = cleaned.toLowerCase();
  if (lower.includes("connect") || lower.includes("socket")) return "Connection issue";
  if (lower.includes("permission") || lower.includes("denied") || lower.includes("access")) return "Permission error";
  if (lower.includes("invalid") || lower.includes("unexpected") || lower.includes("unknown")) return "Invalid data or configuration";
  if (lower.includes("missing") || lower.includes("not found")) return "Missing resource";
  if (lower.includes("failed") || lower.includes("error") || lower.includes("crash")) return "Operation failed";

  // Last resort: first clause only, very short
  const firstLine = cleaned.replace(/\n.*/s, "").trim();
  if (!firstLine || firstLine.length < 5) return "Unknown error";
  const clause = firstLine.split(/[,;(]/)[0].trim();
  return clause.length > 50 ? clause.slice(0, 47) + "..." : clause;
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
  // Read configured limits from settings (set via UI)
  const limitsRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("cost-limits") as { value: string } | undefined;
  const limits = limitsRow ? JSON.parse(limitsRow.value) as { type: string | null; amount: number | null; agentLimits: Record<string, number> } : null;

  const rows = db.prepare(
    `SELECT id, name, costUsd FROM agents`
  ).all() as { id: string; name: string; costUsd: number }[];

  for (const agent of rows) {
    // Determine the actual threshold for this agent:
    // 1. Per-agent configured limit (from UI)
    // 2. Global configured limit (from UI)
    // 3. Environment variable fallback
    const agentLimit = limits?.agentLimits?.[agent.id] ?? limits?.agentLimits?.[agent.name];
    const threshold = agentLimit ?? limits?.amount ?? COST_THRESHOLD_USD;
    const limitType = limits?.type || "monthly";

    if (agent.costUsd < threshold) continue;

    // Only alert once per agent per threshold crossing (check last 1 hour)
    if (recentAlertExists(agent.id, "cost_spike", 3600000)) continue;
    createAndSendAlert(
      agent.id,
      "cost_spike",
      "warning",
      `Agent *${agent.name}* exceeded ${limitType} cost limit — $${agent.costUsd.toFixed(2)} spent (limit: $${threshold})`
    );
  }
}

function checkSpendLimits(): void {
  const limitsRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("cost-limits") as { value: string } | undefined;
  if (!limitsRow) return;
  const limits = JSON.parse(limitsRow.value) as { type: string | null; amount: number | null; agentLimits: Record<string, number> };
  if (!limits.type || !limits.amount) return;

  // Import listSessions dynamically to avoid circular deps
  const { listSessionsSync } = require("./sessions");
  const sessions = listSessionsSync() as { agentId: string; startedAt: string; costUsd: number }[];
  const now = new Date();
  const periodKey = limits.type === "daily" ? now.toISOString().slice(0, 10) : now.toISOString().slice(0, 7);
  const sliceLen = limits.type === "daily" ? 10 : 7;

  // Total spend for period
  const periodSessions = sessions.filter((s) => s.startedAt.slice(0, sliceLen) === periodKey);
  const totalSpend = periodSessions.reduce((sum, s) => sum + s.costUsd, 0);
  const pct = (totalSpend / limits.amount) * 100;
  const periodLabel = limits.type === "daily" ? "today" : "this month";

  // Alert at 80% (warning) — once per period
  if (pct >= 80 && pct < 100) {
    if (!recentAlertExists("_global", "spend_warning", limits.type === "daily" ? 86400000 : 2592000000)) {
      createAndSendAlert("_global", "cost_spike", "warning",
        `Spend alert: $${totalSpend.toFixed(2)} ${periodLabel} — ${pct.toFixed(0)}% of $${limits.amount} ${limits.type} limit`);
    }
  }

  // Alert at 100% (critical) — once per period
  if (pct >= 100) {
    if (!recentAlertExists("_global", "spend_critical", limits.type === "daily" ? 86400000 : 2592000000)) {
      createAndSendAlert("_global", "cost_spike", "critical",
        `Spend limit exceeded: $${totalSpend.toFixed(2)} ${periodLabel} — ${pct.toFixed(0)}% of $${limits.amount} ${limits.type} limit`);
    }
  }

  // Per-agent limits
  const agentSpend: Record<string, number> = {};
  for (const s of periodSessions) {
    agentSpend[s.agentId] = (agentSpend[s.agentId] || 0) + s.costUsd;
  }
  for (const [agentId, agentLimit] of Object.entries(limits.agentLimits)) {
    const spent = agentSpend[agentId] || 0;
    const agentPct = (spent / agentLimit) * 100;
    if (agentPct >= 100 && !recentAlertExists(agentId, "spend_critical", limits.type === "daily" ? 86400000 : 2592000000)) {
      createAndSendAlert(agentId, "cost_spike", "critical",
        `Agent *${agentId}* exceeded ${limits.type} limit: $${spent.toFixed(2)} / $${agentLimit} ${periodLabel}`);
    }
  }
}

export function runAlertChecker(): void {
  try {
    checkStuckAgents();
    checkErrorSpikes();
    checkCostThresholds();
    checkSpendLimits();
  } catch (err) {
    console.error("[AlertChecker] Error:", err);
  }
}

export function startAlertChecker(): NodeJS.Timeout {
  console.log("[AlertChecker] Started (every 30s)");
  return setInterval(runAlertChecker, 30000);
}
