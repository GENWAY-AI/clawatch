import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import * as fs from "fs";
import * as path from "path";
import db from "./db";
import { listSessions, getSessionDetail, discoverProfiles, SessionSummary } from "./sessions";
import { syncAllData, getLastSyncTime } from "./sync";
import {
  createProject,
  listProjects,
  getProjectDetail,
  addSessionToProject,
  removeSessionFromProject,
  suggestRelatedSessions,
  setSessionProjects,
  getSessionProjects,
  bulkGetSessionProjects,
} from "./projects";

const router = Router();

// ---------- Shared prepared statements ----------
const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const upsertSetting = db.prepare(
  "INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt"
);

// ---------- Profiles ----------

router.get("/profiles", (_req: Request, res: Response) => {
  const profiles = discoverProfiles();
  res.json({ profiles });
});

// ---------- Version ----------

router.get("/version", (_req: Request, res: Response) => {
  const candidates = [
    path.join(__dirname, "..", "..", "cli", "package.json"),  // dev/source (repo root)
    path.join(__dirname, "..", "..", "package.json"),          // installed npm package (backend/dist -> package root)
    path.join(__dirname, "..", "package.json"),               // fallback (backend's own)
    path.join(__dirname, "..", "..", "..", "cli", "package.json"), // Docker: /app/backend/dist -> /app/cli/package.json
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
  // Trigger sync if last sync was >10s ago (keeps agents fresh with sessions)
  if (Date.now() - getLastSyncTime() > 10_000) {
    try { await syncAllData(); } catch { /* non-fatal */ }
  }

  const statusFilter = (_req.query.status as string) || "active";
  const profileFilter = _req.query.profile as string | undefined;
  const agents = db.prepare("SELECT * FROM agents ORDER BY costUsd DESC").all() as any[];

  // Filter by status
  let filtered = statusFilter === "all"
    ? agents
    : agents.filter((a: any) => a.status === statusFilter);

  // Filter by profile: only return agents that have sessions in the selected profile
  let sessions: SessionSummary[] = [];
  try {
    sessions = await listSessions(profileFilter);
  } catch { /* ignore */ }

  if (profileFilter) {
    const agentIdsInProfile = new Set(sessions.map((s) => s.agentId));
    filtered = filtered.filter((a: any) => agentIdsInProfile.has(a.id));
  }

  // Enrich with spend data
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);
  const limitsRow = getSetting?.get("cost-limits") as { value: string } | undefined;
  const limits = limitsRow ? JSON.parse(limitsRow.value) : { type: null, amount: null, agentLimits: {} };

  const enriched = filtered.map((a: any) => {
    const agentSessions = sessions.filter((s) => s.agentId === a.id);
    const todaySpend = agentSessions.filter((s) => s.startedAt.slice(0, 10) === todayStr).reduce((sum, s) => sum + s.costUsd, 0);
    const mtdSpend = agentSessions.filter((s) => s.startedAt.slice(0, 7) === monthStr).reduce((sum, s) => sum + s.costUsd, 0);
    const agentLimit = limits.agentLimits?.[a.id] ?? limits.amount;
    const limitType = limits.type;
    const currentSpend = limitType === "daily" ? todaySpend : limitType === "monthly" ? mtdSpend : null;
    const usagePercent = agentLimit && currentSpend !== null ? (currentSpend / agentLimit) * 100 : null;

    return {
      ...a,
      todaySpend: +todaySpend.toFixed(2),
      mtdSpend: +mtdSpend.toFixed(2),
      limit: agentLimit ?? null,
      limitType,
      usagePercent: usagePercent !== null ? +usagePercent.toFixed(1) : null,
      overLimit: usagePercent !== null && usagePercent >= 100,
    };
  });

  res.json({ agents: enriched, limits });
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

  // Generate a plain-English description — no raw error text, no counts (frontend shows ×N)
  const description = generatePlainDescription(summary, agentName, topError);

  return { summary, description };
}

function generatePlainDescription(title: string, agentName: string, _topError: string): string {
  // Map known titles/patterns to plain-English impact descriptions
  if (/can't connect|connection refused/i.test(title))
    return `${agentName} is unable to reach a service it depends on. This may prevent it from completing its tasks until the service is back online.`;
  if (/can't reach|DNS failure/i.test(title))
    return `${agentName} can't look up a server address. The remote service may be down or there could be a network issue.`;
  if (/connection lost|connection reset/i.test(title))
    return `${agentName} keeps losing its connection to an external service. This usually means the remote server is unstable or overloaded.`;
  if (/timed out/i.test(title))
    return `${agentName} waited too long for a response. The target service may be slow or unresponsive.`;
  if (/rate limit/i.test(title))
    return `${agentName} is making too many API calls and being throttled. It needs to slow down or wait before retrying.`;
  if (/authentication failed|auth token expired/i.test(title))
    return `${agentName} can't authenticate with an external service. Its credentials may need to be refreshed or reconfigured.`;
  if (/access denied|permission/i.test(title))
    return `${agentName} tried to do something it doesn't have permission for. Check its access rights.`;
  if (/Slack credentials not configured/i.test(title))
    return `${agentName} can't send messages to Slack because the bot token isn't set up. Configure the Slack integration to fix this.`;
  if (/message delivery failing/i.test(title))
    return `${agentName} is failing to deliver messages. This may be caused by missing credentials or a service outage.`;
  if (/Slack connection/i.test(title))
    return `${agentName} is having trouble staying connected to Slack. The connection keeps dropping or timing out.`;
  if (/crashed|unhandled/i.test(title))
    return `${agentName} crashed unexpectedly. It may need to be restarted or the underlying bug needs to be fixed.`;
  if (/misconfigured tool|configuration error/i.test(title))
    return `${agentName} has a configuration issue that may cause some features to not work correctly. Review its settings.`;
  if (/skill path/i.test(title))
    return `${agentName} has a skill that points to an invalid location. The skill may not load correctly.`;
  if (/can't find a required file|missing file/i.test(title))
    return `${agentName} is looking for a file that doesn't exist. A dependency may be missing or a path may be wrong.`;
  if (/invalid file operation/i.test(title))
    return `${agentName} tried to read a directory as a file. There may be a path configuration issue.`;
  if (/missing required command/i.test(title))
    return `${agentName} needs a system command that isn't installed. Install the missing dependency.`;
  if (/process was killed/i.test(title))
    return `${agentName} was forcefully stopped. This could be due to resource limits or a manual intervention.`;
  if (/code bug|null reference|type error/i.test(title))
    return `${agentName} hit a bug in its code. This is likely a software issue that needs a fix.`;
  if (/malformed data|invalid data/i.test(title))
    return `${agentName} received data it couldn't understand. The data source may have changed format.`;
  if (/database/i.test(title))
    return `${agentName} is having trouble accessing its database. It may be locked by another process or corrupted.`;
  if (/hostname conflict/i.test(title))
    return `${agentName} detected a network naming conflict. Multiple services may be competing for the same name.`;
  if (/spending exceeded/i.test(title))
    return `${agentName} has gone over its budget. Consider reviewing its usage or adjusting the threshold.`;

  // Generic fallback — still meaningful
  return `${agentName} ran into a problem that may affect its ability to work properly. Check the technical details for more information.`;
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
    // Network errors
    [/ECONNREFUSED/i, `${agentName} can't connect to a service`],
    [/ECONNRESET/i, `${agentName} lost connection unexpectedly`],
    [/ETIMEDOUT/i, `${agentName} connection timed out`],
    [/ENOTFOUND/i, `${agentName} can't reach a remote server`],
    [/EADDRINUSE/i, `${agentName} port already in use`],
    [/EPERM|EACCES/i, `${agentName} permission denied`],
    [/ENOMEM|out of memory/i, `${agentName} ran out of memory`],
    // HTTP errors
    [/rate.?limit/i, `${agentName} hit API rate limit`],
    [/401|unauthorized/i, `${agentName} authentication failed`],
    [/403|forbidden/i, `${agentName} access denied`],
    [/500|internal server error/i, `Remote server error for ${agentName}`],
    [/502|bad gateway/i, `Bad gateway error for ${agentName}`],
    [/503|service unavailable/i, `Service unavailable for ${agentName}`],
    [/504|gateway timeout/i, `Gateway timeout for ${agentName}`],
    // Code errors
    [/Cannot read propert/i, `${agentName} hit a code bug (null reference)`],
    [/is not a function/i, `${agentName} hit a code bug (type error)`],
    [/JSON\.parse|Unexpected token/i, `${agentName} received malformed data`],
    [/SQLITE_BUSY/i, `${agentName} database is locked`],
    [/SQLITE_CORRUPT/i, `${agentName} database corruption detected`],
    // Auth/cert
    [/token.*expir/i, `${agentName} auth token expired`],
    [/CERT_|certificate/i, `${agentName} SSL certificate error`],
    // File/path errors
    [/ENOENT|no such file/i, `${agentName} can't find a required file`],
    [/EISDIR/i, `${agentName} invalid file operation`],
    [/spawn.*ENOENT|command not found/i, `${agentName} missing required command`],
    [/killed|SIGKILL|SIGTERM/i, `${agentName} process was killed`],
    // OpenClaw / gateway specific
    [/[Ss]lack\s*bot\s*token\s*missing/i, `${agentName} Slack credentials not configured`],
    [/[Rr]etry failed for delivery/i, `${agentName} message delivery failing`],
    [/delivery.*failed|failed.*delivery/i, `${agentName} message delivery failing`],
    [/socket.?mode failed/i, `${agentName} Slack connection failing`],
    [/pong wasn't received|pong.*timeout/i, `${agentName} Slack connection timing out`],
    [/[Uu]nhandled promise rejection/i, `${agentName} crashed (unhandled error)`],
    [/allowlist contains unknown/i, `${agentName} has misconfigured tool settings`],
    [/[Ss]kipping skill path/i, `${agentName} has a skill path issue`],
    [/hostname conflict/i, `${agentName} network hostname conflict`],
    // Generic patterns (broad — keep last)
    [/timeout/i, `${agentName} operation timed out`],
    [/connection refused/i, `${agentName} can't connect to a service`],
    [/connection reset/i, `${agentName} lost connection`],
    [/missing.*config|config.*missing/i, `${agentName} missing configuration`],
    [/crash|fatal|panic/i, `${agentName} crashed`],
  ];

  for (const [pattern, summary] of patterns) {
    if (pattern.test(cleanedError)) return summary;
  }

  // Smart fallback: interpret the error instead of truncating

  // Try "ErrorType: message" format
  const typeMatch = cleanedError.match(/^(\w+Error):\s*(.+?)(?:\n|$)/);
  if (typeMatch) {
    const shortMsg = typeMatch[2].trim();
    return shortMsg.length > 50 ? `${agentName}: ${shortMsg.slice(0, 47)}...` : `${agentName}: ${shortMsg}`;
  }

  // Look for a verb phrase
  const actionMatch = cleanedError.match(/(failed to \w+|cannot \w+|unable to \w+|could not \w+)/i);
  if (actionMatch) {
    return `${agentName} ${actionMatch[1].toLowerCase()}`;
  }

  // Keyword-based categorization — produce a real summary, not a truncation
  const lower = cleanedError.toLowerCase();
  if (lower.includes("connect") || lower.includes("socket")) return `${agentName} connection issue`;
  if (lower.includes("timeout") || lower.includes("timed out")) return `${agentName} operation timed out`;
  if (lower.includes("permission") || lower.includes("denied") || lower.includes("access")) return `${agentName} permission error`;
  if (lower.includes("invalid") || lower.includes("unexpected") || lower.includes("unknown")) return `${agentName} configuration error`;
  if (lower.includes("missing") || lower.includes("not found")) return `${agentName} missing resource`;
  if (lower.includes("failed") || lower.includes("error") || lower.includes("crash")) return `${agentName} operation failed`;

  // Last resort: first clause only, very short
  const clean = cleanedError.replace(/\n.*/s, "").trim();
  if (!clean || clean.length < 5) {
    return `${agentName} encountered errors`;
  }
  const clause = clean.split(/[,;(]/)[0].trim();
  return clause.length > 40 ? `${agentName} error` : `${agentName}: ${clause}`;
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
    const profileFilter = req.query.profile as string | undefined;
    let sessions = await listSessions(profileFilter);

    // Filter by agentId
    const { agentId, status, sort, limit, offset } = req.query;
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

    // Total count (after filtering, before pagination)
    const total = sessions.length;

    // Pagination
    const limitVal = Math.min(Math.max(parseInt(limit as string, 10) || 20, 1), 500);
    const offsetVal = Math.max(parseInt(offset as string, 10) || 0, 0);
    sessions = sessions.slice(offsetVal, offsetVal + limitVal);

    // Attach project tags to each session
    const sessionIds = sessions.map((s) => s.id);
    const projectTags = bulkGetSessionProjects(sessionIds);
    const sessionsWithProjects = sessions.map((s) => ({
      ...s,
      projects: projectTags.get(s.id) || [],
    }));

    res.json({ sessions: sessionsWithProjects, total });
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

// ---------- Session Project Tags ----------

router.put("/sessions/:id/projects", (req: Request, res: Response) => {
  const { projectIds } = req.body;
  if (!Array.isArray(projectIds)) {
    res.status(400).json({ error: "projectIds must be an array" });
    return;
  }
  setSessionProjects(req.params.id as string, projectIds);
  res.json({ ok: true });
});

router.delete("/sessions/:id/projects/:projectId", (req: Request, res: Response) => {
  const ok = removeSessionFromProject(req.params.projectId as string, req.params.id as string);
  if (!ok) {
    res.status(404).json({ error: "Project tag not found on session" });
    return;
  }
  res.json({ ok: true });
});

router.get("/sessions/:id/projects", (req: Request, res: Response) => {
  const projects = getSessionProjects(req.params.id as string);
  res.json({ projects });
});

// ---------- Analytics ----------

router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const profile = req.query.profile as string | undefined;
    const groupBy = (req.query.groupBy as string) || "day";
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    let sessions = await listSessions(profile);

    // For hourly view, default to last 3 days if no from specified
    let effectiveFrom = from;
    if (groupBy === "hour" && !from) {
      const threeDaysAgo = new Date();
      threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
      effectiveFrom = threeDaysAgo.toISOString();
    }

    // Filter by date range using startedAt
    if (effectiveFrom) sessions = sessions.filter((s) => s.startedAt >= effectiveFrom!);
    if (to) sessions = sessions.filter((s) => s.startedAt <= to);

    // Get project tags for all sessions
    const sessionIds = sessions.map((s) => s.id);
    const projectTags = bulkGetSessionProjects(sessionIds);

    // Helper: get bucket date key for a session
    function getBucketKey(dateStr: string): string {
      const d = new Date(dateStr);
      if (groupBy === "hour") {
        return d.toISOString().slice(0, 13) + ":00"; // "2026-03-10T14:00"
      }
      if (groupBy === "week") {
        // ISO week starts on Monday
        const day = d.getUTCDay();
        const diff = (day === 0 ? -6 : 1) - day; // adjust to Monday
        const monday = new Date(d);
        monday.setUTCDate(monday.getUTCDate() + diff);
        return monday.toISOString().slice(0, 10);
      }
      return d.toISOString().slice(0, 10);
    }

    // Helper: generate all date keys between min and max
    function generateAllKeys(minDate: string, maxDate: string): string[] {
      const keys: string[] = [];
      const current = new Date(minDate);
      const end = new Date(maxDate);
      while (current <= end) {
        if (groupBy === "hour") {
          keys.push(current.toISOString().slice(0, 13) + ":00");
          current.setUTCHours(current.getUTCHours() + 1);
        } else if (groupBy === "week") {
          keys.push(current.toISOString().slice(0, 10));
          current.setUTCDate(current.getUTCDate() + 7);
        } else {
          keys.push(current.toISOString().slice(0, 10));
          current.setUTCDate(current.getUTCDate() + 1);
        }
      }
      return keys;
    }

    // Aggregate into buckets
    type Bucket = { costUsd: number; tokenCount: number; sessionCount: number };
    const totalMap = new Map<string, Bucket>();
    const agentMap = new Map<string, Map<string, Bucket>>();
    const projectMap = new Map<string, { name: string; buckets: Map<string, Bucket> }>();

    for (const s of sessions) {
      const key = getBucketKey(s.startedAt);

      // Total
      const tb = totalMap.get(key) || { costUsd: 0, tokenCount: 0, sessionCount: 0 };
      tb.costUsd += s.costUsd;
      tb.tokenCount += s.tokenCount;
      tb.sessionCount += 1;
      totalMap.set(key, tb);

      // By agent
      if (!agentMap.has(s.agentId)) agentMap.set(s.agentId, new Map());
      const ab = agentMap.get(s.agentId)!.get(key) || { costUsd: 0, tokenCount: 0, sessionCount: 0 };
      ab.costUsd += s.costUsd;
      ab.tokenCount += s.tokenCount;
      ab.sessionCount += 1;
      agentMap.get(s.agentId)!.set(key, ab);

      // By project (session can belong to multiple projects)
      const projects = projectTags.get(s.id) || [];
      for (const p of projects) {
        if (!projectMap.has(p.id)) projectMap.set(p.id, { name: p.name, buckets: new Map() });
        const pb = projectMap.get(p.id)!.buckets.get(key) || { costUsd: 0, tokenCount: 0, sessionCount: 0 };
        pb.costUsd += s.costUsd;
        pb.tokenCount += s.tokenCount;
        pb.sessionCount += 1;
        projectMap.get(p.id)!.buckets.set(key, pb);
      }
    }

    // Determine date range for zero-filling
    const allKeys = [...totalMap.keys()].sort();
    let rangeStart = effectiveFrom ? getBucketKey(effectiveFrom) : (from ? getBucketKey(from) : allKeys[0]);
    let rangeEnd = to ? getBucketKey(to) : allKeys[allKeys.length - 1];
    // For hourly view, always extend to current time so chart isn't cut off
    if (groupBy === "hour" && !to) {
      const nowKey = getBucketKey(new Date().toISOString());
      if (!rangeEnd || nowKey > rangeEnd) rangeEnd = nowKey;
    }
    if (!rangeStart || !rangeEnd) {
      res.json({ buckets: [], byAgent: [], byProject: [] });
      return;
    }

    const allDates = generateAllKeys(rangeStart, rangeEnd);
    const zeroBucket = { costUsd: 0, tokenCount: 0, sessionCount: 0 };

    // Build response with zero-filled buckets
    const buckets = allDates.map((date) => ({
      date,
      ...(totalMap.get(date) || zeroBucket),
    }));

    const byAgent = [...agentMap.entries()].map(([agentId, bMap]) => ({
      agentId,
      name: agentId,
      buckets: allDates.map((date) => ({
        date,
        ...(bMap.get(date) || zeroBucket),
      })),
    }));

    const byProject = [...projectMap.entries()].map(([projectId, { name, buckets: bMap }]) => ({
      projectId,
      name,
      buckets: allDates.map((date) => ({
        date,
        ...(bMap.get(date) || zeroBucket),
      })),
    }));

    // Include cost limits for chart reference lines
    const limitsRow2 = getSetting.get("cost-limits") as { value: string } | undefined;
    const costLimits = limitsRow2 ? JSON.parse(limitsRow2.value) : null;

    res.json({ buckets, byAgent, byProject, limits: costLimits });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get analytics" });
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

router.get("/projects", async (_req: Request, res: Response) => {
  const profileParam = _req.query.profile as string | undefined;
  let projects = listProjects();

  // Filter projects to only include those with sessions in the selected profile
  if (profileParam) {
    const sessions = await listSessions(profileParam);
    const profileSessionIds = new Set(sessions.map((s) => s.id));
    projects = projects.filter((p: any) => {
      const projectSessionIds = db.prepare(
        "SELECT sessionId FROM project_sessions WHERE projectId = ?"
      ).all(p.id) as { sessionId: string }[];
      return projectSessionIds.some((ps) => profileSessionIds.has(ps.sessionId));
    });
  }

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

// ---------- Settings ----------

router.get("/settings/cost-limits", (_req: Request, res: Response) => {
  const row = getSetting.get("cost-limits") as { value: string } | undefined;
  if (!row) {
    res.json({ type: null, amount: null, agentLimits: {} });
    return;
  }
  res.json(JSON.parse(row.value));
});

router.put("/settings/cost-limits", (req: Request, res: Response) => {
  const { type, amount, agentLimits } = req.body;
  if (type && !["daily", "monthly"].includes(type)) {
    res.status(400).json({ error: "type must be 'daily' or 'monthly'" });
    return;
  }
  const config = {
    type: type || null,
    amount: typeof amount === "number" ? amount : null,
    agentLimits: agentLimits || {},
  };
  upsertSetting.run("cost-limits", JSON.stringify(config), new Date().toISOString());
  res.json({ ok: true, ...config });
});

// ---------- Spend ----------

router.get("/spend", async (req: Request, res: Response) => {
  try {
    const profile = req.query.profile as string | undefined;
    const sessions = await listSessions(profile);
    const now = new Date();

    // Today's spend (UTC day)
    const todayStr = now.toISOString().slice(0, 10);
    const todaySessions = sessions.filter((s) => s.startedAt.slice(0, 10) === todayStr);
    const todaySpend = todaySessions.reduce((sum, s) => sum + s.costUsd, 0);

    // MTD spend (current month)
    const monthStr = now.toISOString().slice(0, 7); // "2026-03"
    const mtdSessions = sessions.filter((s) => s.startedAt.slice(0, 7) === monthStr);
    const mtdSpend = mtdSessions.reduce((sum, s) => sum + s.costUsd, 0);

    // All-time spend
    const allTimeSpend = sessions.reduce((sum, s) => sum + s.costUsd, 0);

    // Per-agent breakdown for today and MTD
    const byAgent: Record<string, { today: number; mtd: number }> = {};
    for (const s of sessions) {
      if (!byAgent[s.agentId]) byAgent[s.agentId] = { today: 0, mtd: 0 };
      if (s.startedAt.slice(0, 10) === todayStr) byAgent[s.agentId].today += s.costUsd;
      if (s.startedAt.slice(0, 7) === monthStr) byAgent[s.agentId].mtd += s.costUsd;
    }

    // Get cost limits
    const limitsRow = getSetting.get("cost-limits") as { value: string } | undefined;
    const limits = limitsRow ? JSON.parse(limitsRow.value) : { type: null, amount: null, agentLimits: {} };

    // Calculate usage percentage
    let usagePercent: number | null = null;
    if (limits.type && limits.amount) {
      const currentSpend = limits.type === "daily" ? todaySpend : mtdSpend;
      usagePercent = (currentSpend / limits.amount) * 100;
    }

    res.json({
      today: +todaySpend.toFixed(2),
      mtd: +mtdSpend.toFixed(2),
      allTime: +allTimeSpend.toFixed(2),
      byAgent,
      limits,
      usagePercent: usagePercent !== null ? +usagePercent.toFixed(1) : null,
      periodLabel: limits.type === "daily" ? "Daily" : limits.type === "monthly" ? "Monthly" : null,
      currentSpend: limits.type === "daily" ? +todaySpend.toFixed(2) : limits.type === "monthly" ? +mtdSpend.toFixed(2) : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get spend data" });
  }
});

export default router;
