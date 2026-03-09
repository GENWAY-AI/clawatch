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
    createAndSendAlert(
      row.agentId,
      "error",
      "critical",
      `Error spike detected — ${row.cnt} errors in the last ${Math.round(ERROR_SPIKE_WINDOW_MS / 60000)} minute(s)`
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
