import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import db from "./db";

const router = Router();

// ---------- Agents ----------

router.get("/agents", (_req: Request, res: Response) => {
  const agents = db.prepare("SELECT * FROM agents ORDER BY lastHeartbeat DESC").all();
  res.json({ agents });
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

router.get("/alerts", (_req: Request, res: Response) => {
  const alerts = db.prepare(
    "SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 100"
  ).all().map((a: any) => ({
    ...a,
    acknowledged: Boolean(a.acknowledged),
  }));
  res.json({ alerts });
});

router.post("/alerts/:id/acknowledge", (req: Request, res: Response) => {
  const result = db.prepare("UPDATE alerts SET acknowledged = 1 WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
