import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import db from "./db";
import { listSessions, getSessionDetail, SessionSummary } from "./sessions";
import {
  createProject,
  listProjects,
  getProjectDetail,
  addSessionToProject,
  removeSessionFromProject,
  suggestRelatedSessions,
} from "./projects";

const router = Router();

// ---------- Agents ----------

router.get("/agents", (_req: Request, res: Response) => {
  const statusFilter = (_req.query.status as string) || "active";
  const agents = db.prepare("SELECT * FROM agents ORDER BY costUsd DESC").all() as any[];

  // Filter by status
  const filtered = statusFilter === "all"
    ? agents
    : agents.filter((a: any) => a.status === statusFilter);

  res.json({ agents: filtered });
});

router.get("/agents/:id", (req: Request, res: Response) => {
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(req.params.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const recentEvents = db.prepare(
    "SELECT type, timestamp, data FROM events WHERE agentId = ? ORDER BY timestamp DESC LIMIT 50"
  ).all(req.params.id).map((e: any) => ({
    ...e,
    data: JSON.parse(e.data),
  }));
  res.json({ ...(agent as object), recentEvents });
});

router.post("/agents/:id/pause", (req: Request, res: Response) => {
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(req.params.id) as any;
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  db.prepare("UPDATE agents SET status = 'paused' WHERE id = ?").run(req.params.id);
  res.json({ ...agent, status: "paused" });
});

router.post("/agents/:id/resume", (req: Request, res: Response) => {
  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(req.params.id) as any;
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  db.prepare("UPDATE agents SET status = 'running', lastHeartbeat = ? WHERE id = ?")
    .run(new Date().toISOString(), req.params.id);
  res.json({ ...agent, status: "running", lastHeartbeat: new Date().toISOString() });
});

// ---------- Events (Collection Endpoint) ----------

const upsertAgent = db.prepare(`
  INSERT INTO agents (id, name, host, status, lastHeartbeat, createdAt, costUsd, tokenCount, errorCount)
  VALUES (?, ?, ?, 'running', ?, ?, 0, 0, 0)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    host = excluded.host,
    lastHeartbeat = excluded.lastHeartbeat
`);

const insertEvent = db.prepare(`
  INSERT INTO events (agentId, type, timestamp, data) VALUES (?, ?, ?, ?)
`);

router.post("/events", (req: Request, res: Response) => {
  const { agentId, agentName, host, type, timestamp, data } = req.body;

  if (!agentId || !type) {
    res.status(400).json({ error: "agentId and type are required" });
    return;
  }

  const ts = timestamp || new Date().toISOString();
  const eventData = data || {};

  // Upsert agent
  upsertAgent.run(agentId, agentName || agentId, host || "", ts, ts);

  // Update agent-specific fields based on event type
  if (type === "heartbeat") {
    db.prepare("UPDATE agents SET lastHeartbeat = ?, status = 'running' WHERE id = ? AND status != 'paused'")
      .run(ts, agentId);
  }

  if (type === "error") {
    db.prepare("UPDATE agents SET errorCount = errorCount + 1 WHERE id = ?").run(agentId);
    if (eventData.error) {
      db.prepare("UPDATE agents SET status = 'error' WHERE id = ? AND status != 'paused'")
        .run(agentId);
    }
  }

  if (type === "cost" || eventData.costUsd) {
    const cost = eventData.costUsd || 0;
    const tokens = eventData.tokenCount || 0;
    db.prepare("UPDATE agents SET costUsd = costUsd + ?, tokenCount = tokenCount + ? WHERE id = ?")
      .run(cost, tokens, agentId);
  }

  if (type === "status_change" && eventData.status) {
    db.prepare("UPDATE agents SET status = ? WHERE id = ?").run(eventData.status, agentId);
  }

  // Insert event
  insertEvent.run(agentId, type, ts, JSON.stringify(eventData));

  res.status(201).json({ ok: true });
});

// ---------- Costs ----------

router.get("/costs", async (req: Request, res: Response) => {
  try {
    const { agentId, from, to } = req.query;

    // Get sessions (cached, authoritative source from JSONL files)
    let sessions = await listSessions();

    // Apply filters
    if (agentId) {
      sessions = sessions.filter((s) => s.agentId === agentId);
    }
    if (from) {
      sessions = sessions.filter((s) => s.lastActivityAt >= (from as string));
    }
    if (to) {
      sessions = sessions.filter((s) => s.startedAt <= (to as string));
    }

    // Aggregate by agent
    const agentMap = new Map<string, { agentId: string; name: string; costUsd: number; tokenCount: number }>();
    // Aggregate by model
    const modelMap = new Map<string, { model: string; costUsd: number; tokenCount: number }>();

    for (const session of sessions) {
      // By agent
      const existing = agentMap.get(session.agentId);
      if (existing) {
        existing.costUsd += session.costUsd;
        existing.tokenCount += session.tokenCount;
      } else {
        agentMap.set(session.agentId, {
          agentId: session.agentId,
          name: session.agentId,
          costUsd: session.costUsd,
          tokenCount: session.tokenCount,
        });
      }

      // By model — use costByModel from session summary
      for (const mc of session.costByModel) {
        const em = modelMap.get(mc.model);
        if (em) {
          em.costUsd += mc.costUsd;
          em.tokenCount += mc.tokenCount;
        } else {
          modelMap.set(mc.model, { model: mc.model, costUsd: mc.costUsd, tokenCount: mc.tokenCount });
        }
      }
    }

    const byAgent = Array.from(agentMap.values()).sort((a, b) => b.costUsd - a.costUsd);
    const byModel = Array.from(modelMap.values()).sort((a, b) => b.costUsd - a.costUsd);
    const totalUsd = byAgent.reduce((sum, a) => sum + a.costUsd, 0);

    res.json({ totalUsd, byAgent, byModel });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get costs" });
  }
});

// ---------- Alerts ----------

router.get("/alerts", (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 5, 1), 100);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
  const severityParam = req.query.severity as string | undefined;
  const acknowledgedParam = req.query.acknowledged as string | undefined;
  const agentIdParam = req.query.agentId as string | undefined;

  const conditions: string[] = [];
  const params: any[] = [];

  if (severityParam) {
    const severities = severityParam.split(",").map((s) => s.trim());
    conditions.push(`severity IN (${severities.map(() => "?").join(", ")})`);
    params.push(...severities);
  }

  if (acknowledgedParam === "true") {
    conditions.push("acknowledged = 1");
  } else if (acknowledgedParam === "false") {
    conditions.push("acknowledged = 0");
  }

  if (agentIdParam) {
    conditions.push("agentId = ?");
    params.push(agentIdParam);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM alerts${where}`).get(...params) as any).cnt;

  const alerts = db.prepare(
    `SELECT * FROM alerts${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset).map((a: any) => ({
    ...a,
    acknowledged: Boolean(a.acknowledged),
  }));

  res.json({ alerts, total });
});

router.post("/alerts/acknowledge-all", (req: Request, res: Response) => {
  const severityParam = req.query.severity as string | undefined;
  const agentIdParam = req.query.agentId as string | undefined;

  const conditions: string[] = ["acknowledged = 0"];
  const params: any[] = [];

  if (severityParam) {
    const severities = severityParam.split(",").map((s) => s.trim());
    conditions.push(`severity IN (${severities.map(() => "?").join(", ")})`);
    params.push(...severities);
  }

  if (agentIdParam) {
    conditions.push("agentId = ?");
    params.push(agentIdParam);
  }

  const where = ` WHERE ${conditions.join(" AND ")}`;
  const result = db.prepare(`UPDATE alerts SET acknowledged = 1${where}`).run(...params);

  res.json({ ok: true, count: result.changes });
});

router.post("/alerts/:id/acknowledge", (req: Request, res: Response) => {
  const result = db.prepare("UPDATE alerts SET acknowledged = 1 WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json({ ok: true });
});

// --- Alert summary generation helpers ---

function isMeaningfulError(error: string): boolean {
  const cleaned = stripLogPrefix(error).trim();
  // Filter out JSON fragments, single chars, pure punctuation, etc.
  if (cleaned.length < 5) return false;
  if (/^[{}\[\],;:."'\s]+$/.test(cleaned)) return false;
  if (/^\w+:\s*\d+[,}]?$/.test(cleaned)) return false; // "key: 123"
  return true;
}

function generateErrorSummary(relatedErrors: { error: string; timestamp: string }[], agentName: string): { summary: string; description: string } {
  if (relatedErrors.length === 0) {
    return { summary: "Errors detected", description: `${agentName} encountered errors recently.` };
  }

  // Group errors by message, filtering out meaningless fragments
  const groups = new Map<string, { count: number; latest: string }>();
  for (const e of relatedErrors) {
    const key = e.error;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      if (e.timestamp > existing.latest) existing.latest = e.timestamp;
    } else {
      groups.set(key, { count: 1, latest: e.timestamp });
    }
  }

  // Find the most frequent *meaningful* error
  let topError = "";
  let topCount = 0;
  for (const [msg, info] of groups) {
    if (info.count > topCount && isMeaningfulError(msg)) {
      topError = msg;
      topCount = info.count;
    }
  }

  // If no meaningful error found, fall back to any error
  if (!topError) {
    for (const [msg, info] of groups) {
      if (info.count > topCount) { topError = msg; topCount = info.count; }
    }
  }

  // Pattern-match the top error for a human-readable summary
  const summary = humanizeError(topError, agentName);
  const uniqueCount = groups.size;
  const totalCount = relatedErrors.length;

  let description: string;
  if (uniqueCount === 1) {
    description = `${agentName} hit the same error ${totalCount} time${totalCount > 1 ? "s" : ""} recently: "${cleanErrorForDisplay(topError)}". This usually means the agent is stuck retrying a failing operation.`;
  } else {
    description = `${agentName} encountered ${totalCount} errors (${uniqueCount} unique) recently. The most common one (${topCount}×) is: "${cleanErrorForDisplay(topError)}".`;
  }

  return { summary, description };
}

// Strip common log prefixes: timestamps, log levels, bracketed tags
function stripLogPrefix(error: string): string {
  let cleaned = error;
  // Strip ISO/custom timestamps at start: "2026-03-10T11:40:54.880+02:00 " or "[2026-03-10 ...]"
  cleaned = cleaned.replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[\d.+:ZT-]*\s*/g, "");
  // Strip bracketed tags: [tools], [ERROR], [warn], etc.
  cleaned = cleaned.replace(/^\[[\w.-]+\]\s*/g, "");
  // Strip again (sometimes multiple tags)
  cleaned = cleaned.replace(/^\[[\w.-]+\]\s*/g, "");
  // Strip log levels
  cleaned = cleaned.replace(/^(ERROR|WARN|INFO|DEBUG|FATAL|TRACE)[:\s]+/i, "");
  return cleaned.trim();
}

function humanizeError(error: string, agentName: string): string {
  // Preprocess: strip log timestamps/tags to get the actual error content
  const cleanedError = stripLogPrefix(error);
  const patterns: [RegExp, string][] = [
    [/ECONNREFUSED.*:(\d+)/i, `${agentName} can't connect (connection refused)`],
    [/ECONNREFUSED/i, `${agentName} can't connect to a service`],
    [/ECONNRESET/i, `${agentName} lost connection (reset by remote)`],
    [/ETIMEDOUT/i, `${agentName} connection timed out`],
    [/ENOTFOUND/i, `${agentName} can't resolve hostname (DNS failure)`],
    [/rate.?limit/i, `${agentName} hit API rate limit`],
    [/401|unauthorized/i, `${agentName} authentication failed`],
    [/403|forbidden/i, `${agentName} access denied`],
    [/404|not found/i, `${agentName} requested a missing resource`],
    [/500|internal server error/i, `Remote server error for ${agentName}`],
    [/502|bad gateway/i, `Bad gateway for ${agentName}`],
    [/503|service unavailable/i, `Service unavailable for ${agentName}`],
    [/timeout/i, `${agentName} operation timed out`],
    [/SQLITE_BUSY/i, `${agentName} database is locked`],
    [/Cannot read propert/i, `${agentName} hit a null reference bug`],
    [/is not a function/i, `${agentName} hit a type error`],
    [/JSON\.parse|Unexpected token/i, `${agentName} received invalid data`],
    [/token.*expir/i, `${agentName} auth token expired`],
    [/CERT_|certificate/i, `${agentName} SSL certificate error`],
    [/ENOMEM|out of memory/i, `${agentName} ran out of memory`],
  ];

  for (const [pattern, summary] of patterns) {
    if (pattern.test(cleanedError)) return summary;
  }

  // Fallback: extract error type + short message from cleaned error
  const typeMatch = cleanedError.match(/^(\w+Error):\s*(.+?)(?:\n|$)/);
  if (typeMatch) {
    const shortMsg = typeMatch[2].trim();
    return shortMsg.length > 60 ? `${agentName}: ${shortMsg.slice(0, 57)}...` : `${agentName}: ${shortMsg}`;
  }

  // Use cleaned error (without timestamps/tags) for display
  const clean = cleanedError.replace(/\n.*/s, "").trim();
  if (!clean || clean.length < 3) {
    return `${agentName} encountered errors`;
  }
  return clean.length > 60 ? `${agentName}: ${clean.slice(0, 57)}...` : `${agentName}: ${clean}`;
}

function cleanErrorForDisplay(error: string): string {
  // Strip log prefixes and stack trace, keep just the meaningful error
  const cleaned = stripLogPrefix(error.split("\n")[0].trim());
  return cleaned.length > 120 ? cleaned.slice(0, 117) + "..." : cleaned;
}

function generateStuckSummary(agentName: string, durationMinutes: number): { summary: string; description: string } {
  return {
    summary: `${agentName} stopped responding`,
    description: `${agentName} hasn't sent a heartbeat in ${durationMinutes} minutes. The agent may have crashed, frozen, or lost its connection. It needs to be restarted or investigated.`,
  };
}

function generateCostSummary(agentName: string, currentCost: number, threshold: number): { summary: string; description: string } {
  const overage = currentCost - threshold;
  return {
    summary: `${agentName} spending exceeded $${threshold}`,
    description: `${agentName} has spent $${currentCost.toFixed(2)}, which is $${overage.toFixed(2)} over the $${threshold.toFixed(2)} threshold. This could mean the agent is running longer than expected or processing more data than usual.`,
  };
}

router.get("/alerts/:id/details", (req: Request, res: Response) => {
  const alert = db.prepare("SELECT * FROM alerts WHERE id = ?").get(req.params.id) as any;
  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  alert.acknowledged = Boolean(alert.acknowledged);

  // Get agent info
  const agent = db.prepare("SELECT id, name, status, lastHeartbeat, costUsd FROM agents WHERE id = ?")
    .get(alert.agentId) as any;

  const agentName = agent?.name || alert.agentId;
  let relatedErrors: any[] = [];
  let context: any = {};
  let summary = "";
  let description = "";

  if (alert.type === "error") {
    // Error spike: get the actual error events within the spike window before the alert
    const ERROR_SPIKE_WINDOW_MS = parseInt(process.env.ERROR_SPIKE_WINDOW_MS || "60000", 10);
    const windowStart = new Date(new Date(alert.timestamp).getTime() - ERROR_SPIKE_WINDOW_MS).toISOString();
    relatedErrors = db.prepare(`
      SELECT type, timestamp, data FROM events
      WHERE agentId = ? AND type = 'error' AND timestamp > ? AND timestamp <= ?
      ORDER BY timestamp DESC
    `).all(alert.agentId, windowStart, alert.timestamp).map((e: any) => {
      const parsed = JSON.parse(e.data);
      return {
        timestamp: e.timestamp,
        error: parsed.error || parsed.message || "Unknown error",
        raw: parsed,
      };
    });

    const gen = generateErrorSummary(relatedErrors, agentName);
    summary = gen.summary;
    description = gen.description;
  } else if (alert.type === "stuck") {
    // Stuck agent: show how long it's been stuck and last heartbeat
    if (agent) {
      const stuckSince = new Date(agent.lastHeartbeat);
      const stuckDurationMs = new Date(alert.timestamp).getTime() - stuckSince.getTime();
      const stuckMinutes = Math.round(stuckDurationMs / 60000);
      context = {
        lastHeartbeat: agent.lastHeartbeat,
        stuckDurationMs,
        stuckDurationMinutes: stuckMinutes,
        agentStatus: agent.status,
      };
      const gen = generateStuckSummary(agentName, stuckMinutes);
      summary = gen.summary;
      description = gen.description;
    }
  } else if (alert.type === "cost_spike") {
    // Cost threshold: show current spend and threshold
    const COST_THRESHOLD_USD = parseFloat(process.env.COST_THRESHOLD_USD || "10");
    context = {
      currentCostUsd: agent?.costUsd || 0,
      thresholdUsd: COST_THRESHOLD_USD,
      overage: (agent?.costUsd || 0) - COST_THRESHOLD_USD,
    };
    const gen = generateCostSummary(agentName, agent?.costUsd || 0, COST_THRESHOLD_USD);
    summary = gen.summary;
    description = gen.description;
  }

  res.json({
    alert,
    agent: agent ? { id: agent.id, name: agent.name, status: agent.status } : null,
    relatedErrors,
    context,
    title: summary,
    description,
  });
});

// ---------- Sessions (from JSONL files) ----------

router.get("/sessions", async (req: Request, res: Response) => {
  try {
    let sessions = await listSessions();

    // Filter by agentId
    const { agentId, status, sort, limit } = req.query;
    if (agentId) {
      sessions = sessions.filter((s) => s.agentId === agentId);
    }

    // Filter by status — default to "active" if not specified
    const statusFilter = (status as string) || "active";
    if (statusFilter !== "all") {
      const statuses = statusFilter.split(",");
      sessions = sessions.filter((s) => statuses.includes(s.status));
    }

    // Sort
    if (sort === "cost") {
      sessions.sort((a, b) => b.costUsd - a.costUsd);
    } else if (sort === "tokens") {
      sessions.sort((a, b) => b.tokenCount - a.tokenCount);
    }
    // default: already sorted by lastActivityAt DESC

    // Limit
    const limitStr = Array.isArray(limit) ? limit[0] : limit;
    const max = Math.min(parseInt(limitStr as string, 10) || 50, 500);
    sessions = sessions.slice(0, max);

    res.json({ sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list sessions" });
  }
});

router.get("/sessions/:id", async (req: Request, res: Response) => {
  try {
    const detail = await getSessionDetail(req.params.id as string);
    if (!detail) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get session detail" });
  }
});

// ---------- Session Suggestions ----------

router.get("/sessions/:id/suggestions", async (req: Request, res: Response) => {
  try {
    const suggestions = await suggestRelatedSessions(req.params.id as string);
    res.json({ suggestions });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get suggestions" });
  }
});

// ---------- Projects ----------

router.post("/projects", (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const project = createProject(name, description);
  res.status(201).json(project);
});

router.get("/projects", (_req: Request, res: Response) => {
  const projects = listProjects();
  res.json({ projects });
});

router.get("/projects/:id", async (req: Request, res: Response) => {
  try {
    const detail = await getProjectDetail(req.params.id as string);
    if (!detail) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get project detail" });
  }
});

router.post("/projects/:id/sessions", (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  const ok = addSessionToProject(req.params.id as string, sessionId);
  if (!ok) {
    res.status(400).json({ error: "Failed to add session" });
    return;
  }
  res.json({ ok: true });
});

router.delete("/projects/:id/sessions/:sessionId", (req: Request, res: Response) => {
  const ok = removeSessionFromProject(req.params.id as string, req.params.sessionId as string);
  if (!ok) {
    res.status(404).json({ error: "Session not found in project" });
    return;
  }
  res.json({ ok: true });
});

export default router;
