import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import * as fs from "fs";
import * as path from "path";
import db from "./db";
import { listSessions, getSessionDetail, discoverProfiles, SessionSummary } from "./sessions";
import {
  createProject,
  listProjects,
  getProjectDetail,
  addSessionToProject,
  removeSessionFromProject,
  suggestRelatedSessions,
} from "./projects";

const router = Router();

// ---------- Profiles ----------

router.get("/profiles", (_req: Request, res: Response) => {
  const profiles = discoverProfiles();
  res.json({ profiles });
});

// ---------- Version ----------

router.get("/version", (_req: Request, res: Response) => {
  const candidates = [
    path.join(__dirname, "..", "..", "cli", "package.json"),  // dev/source
    path.join(__dirname, "..", "package.json"),               // bundled in CLI
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf-8"));
        if (pkg.version) {
          res.json({ version: pkg.version });
          return;
        }
      }
    } catch {
      // try next
    }
  }
  res.json({ version: "unknown" });
});

// ---------- Agents ----------

router.get("/agents", async (_req: Request, res: Response) => {
  const statusFilter = (_req.query.status as string) || "active";
  const profileFilter = _req.query.profile as string | undefined;
  const agents = db.prepare("SELECT * FROM agents ORDER BY costUsd DESC").all() as any[];

  // Filter by status
  let filtered = statusFilter === "all"
    ? agents
    : agents.filter((a: any) => a.status === statusFilter);

  // Filter by profile: only return agents that have sessions in the selected profile
  if (profileFilter) {
    try {
      const sessions = await listSessions(profileFilter);
      const agentIdsInProfile = new Set(sessions.map((s) => s.agentId));
      filtered = filtered.filter((a: any) => agentIdsInProfile.has(a.id));
    } catch {
      // If profile lookup fails, return unfiltered
    }
  }

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
    const { agentId, from, to, profile } = req.query;

    // Get sessions (cached, authoritative source from JSONL files)
    let sessions = await listSessions(profile as string | undefined);

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

router.get("/alerts", async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 5, 1), 100);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
  const severityParam = req.query.severity as string | undefined;
  const acknowledgedParam = req.query.acknowledged as string | undefined;
  const agentIdParam = req.query.agentId as string | undefined;
  const profileParam = req.query.profile as string | undefined;

  const conditions: string[] = [];
  const params: any[] = [];

  // Profile filter: restrict to agents that belong to this profile
  if (profileParam) {
    const sessions = await listSessions(profileParam);
    const agentIds = [...new Set(sessions.map((s) => s.agentId))];
    if (agentIds.length > 0) {
      conditions.push(`agentId IN (${agentIds.map(() => "?").join(", ")})`);
      params.push(...agentIds);
    } else {
      // No agents in this profile — return empty
      res.json({ alerts: [], total: 0 });
      return;
    }
  }

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

router.post("/alerts/acknowledge-all", async (req: Request, res: Response) => {
  const severityParam = req.query.severity as string | undefined;
  const agentIdParam = req.query.agentId as string | undefined;
  const profileParam = req.query.profile as string | undefined;

  const conditions: string[] = ["acknowledged = 0"];
  const params: any[] = [];

  // Profile filter
  if (profileParam) {
    const sessions = await listSessions(profileParam);
    const agentIds = [...new Set(sessions.map((s) => s.agentId))];
    if (agentIds.length > 0) {
      conditions.push(`agentId IN (${agentIds.map(() => "?").join(", ")})`);
      params.push(...agentIds);
    } else {
      res.json({ ok: true, count: 0 });
      return;
    }
  }

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
    const profileFilter = req.query.profile as string | undefined;
    let sessions = await listSessions(profileFilter);

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
    const profileFilter = req.query.profile as string | undefined;
    const detail = await getSessionDetail(req.params.id as string, profileFilter);
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
