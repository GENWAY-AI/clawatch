import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import db from "./db";
import { listSessions, getSessionDetail } from "./sessions";
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

router.get("/costs", (req: Request, res: Response) => {
  const { agentId, from, to } = req.query;

  let agentFilter = "";
  const params: any[] = [];

  if (agentId) {
    agentFilter = " WHERE agentId = ?";
    params.push(agentId);
  }

  // By agent
  const byAgent = db.prepare(`
    SELECT a.id as agentId, a.name, a.costUsd, a.tokenCount
    FROM agents a ${agentId ? "WHERE a.id = ?" : ""}
    ORDER BY a.costUsd DESC
  `).all(...(agentId ? [agentId] : [])) as any[];

  // By model — query events with cost data
  let modelQuery = `
    SELECT json_extract(data, '$.model') as model,
           SUM(json_extract(data, '$.costUsd')) as costUsd,
           SUM(json_extract(data, '$.tokenCount')) as tokenCount
    FROM events
    WHERE type = 'cost'
  `;
  const modelParams: any[] = [];

  if (agentId) {
    modelQuery += " AND agentId = ?";
    modelParams.push(agentId);
  }
  if (from) {
    modelQuery += " AND timestamp >= ?";
    modelParams.push(from);
  }
  if (to) {
    modelQuery += " AND timestamp <= ?";
    modelParams.push(to);
  }
  modelQuery += " GROUP BY model";

  const byModel = db.prepare(modelQuery).all(...modelParams) as any[];

  const totalUsd = byAgent.reduce((sum: number, a: any) => sum + (a.costUsd || 0), 0);

  res.json({ totalUsd, byAgent, byModel });
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
