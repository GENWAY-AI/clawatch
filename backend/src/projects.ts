import { v4 as uuid } from "uuid";
import db from "./db";
import { listSessions, getSessionDetail, SessionSummary } from "./sessions";

// ---------- Types ----------

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListItem extends Project {
  sessionCount: number;
  totalCostUsd: number;
}

export interface ProjectDetail extends Project {
  stats: {
    totalCostUsd: number;
    totalTokens: number;
    totalMessages: number;
    sessionCount: number;
    dateRange: { from: string; to: string };
  };
  agentBreakdown: Array<{
    agentId: string;
    costUsd: number;
    tokenCount: number;
    messageCount: number;
    percentage: number;
  }>;
  sessions: SessionSummary[];
  timeline: Array<{
    sessionId: string;
    agentId: string;
    id: string;
    role: "user" | "assistant" | "tool" | "system";
    timestamp: string;
    content: string;
    toolName?: string;
    model?: string;
    costUsd?: number;
  }>;
}

// ---------- CRUD ----------

export function createProject(name: string, description = ""): Project {
  const id = `proj_${uuid().slice(0, 8)}`;
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO projects (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, description, now, now);
  return { id, name, description, createdAt: now, updatedAt: now };
}

export function listProjects(): ProjectListItem[] {
  const rows = db.prepare(`
    SELECT p.*, 
      COUNT(ps.sessionId) as sessionCount
    FROM projects p
    LEFT JOIN project_sessions ps ON p.id = ps.projectId
    GROUP BY p.id
    ORDER BY p.updatedAt DESC
  `).all() as any[];

  // We need to calculate costs from session data
  const sessionCosts = new Map<string, number>();

  for (const row of rows) {
    const sessionIds = db.prepare(
      "SELECT sessionId FROM project_sessions WHERE projectId = ?"
    ).all(row.id) as { sessionId: string }[];

    let totalCost = 0;
    // We'll get costs from cached session list
    try {
      const allSessions = listSessionsSync();
      for (const { sessionId } of sessionIds) {
        const s = allSessions.find((s: any) => s.id === sessionId);
        if (s) totalCost += s.costUsd;
      }
    } catch {
      // If session list fails, cost stays 0
    }

    sessionCosts.set(row.id, totalCost);
  }

  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    sessionCount: r.sessionCount,
    totalCostUsd: sessionCosts.get(r.id) || 0,
  }));
}

// Sync wrapper for listSessions (cached)
let cachedSessionList: SessionSummary[] = [];
let cacheTime = 0;

function listSessionsSync(): SessionSummary[] {
  // Return cached if fresh (30s)
  if (Date.now() - cacheTime < 30000 && cachedSessionList.length > 0) {
    return cachedSessionList;
  }
  // Trigger async refresh
  listSessions().then((s) => {
    cachedSessionList = s;
    cacheTime = Date.now();
  });
  return cachedSessionList;
}

// Pre-warm cache
listSessions().then((s) => {
  cachedSessionList = s;
  cacheTime = Date.now();
});

export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
  if (!project) return null;

  const sessionIds = db.prepare(
    "SELECT sessionId FROM project_sessions WHERE projectId = ?"
  ).all(projectId) as { sessionId: string }[];

  // Get full session details
  const sessions: SessionSummary[] = [];
  const allMessages: ProjectDetail["timeline"] = [];
  const agentMap = new Map<string, { costUsd: number; tokenCount: number; messageCount: number }>();

  let totalCost = 0;
  let totalTokens = 0;
  let totalMessages = 0;
  let earliest = "";
  let latest = "";

  for (const { sessionId } of sessionIds) {
    try {
      const detail = await getSessionDetail(sessionId);
      if (!detail) continue;

      // Add summary
      sessions.push({
        id: detail.id,
        agentId: detail.agentId,
        profile: detail.profile,
        title: detail.title,
        status: detail.status,
        costUsd: detail.costUsd,
        tokenCount: detail.tokenCount,
        messageCount: detail.messageCount,
        model: detail.model,
        startedAt: detail.startedAt,
        lastActivityAt: detail.lastActivityAt,
        duration: detail.duration,
        costByModel: detail.costByModel,
      });

      // Aggregate stats
      totalCost += detail.costUsd;
      totalTokens += detail.tokenCount;
      totalMessages += detail.messageCount;

      if (!earliest || detail.startedAt < earliest) earliest = detail.startedAt;
      if (!latest || detail.lastActivityAt > latest) latest = detail.lastActivityAt;

      // Agent breakdown
      const existing = agentMap.get(detail.agentId) || { costUsd: 0, tokenCount: 0, messageCount: 0 };
      existing.costUsd += detail.costUsd;
      existing.tokenCount += detail.tokenCount;
      existing.messageCount += detail.messageCount;
      agentMap.set(detail.agentId, existing);

      // Collect messages for unified timeline
      for (const msg of detail.messages) {
        allMessages.push({
          sessionId: detail.id,
          agentId: detail.agentId,
          id: msg.id,
          role: msg.role,
          timestamp: msg.timestamp,
          content: msg.content,
          toolName: msg.toolName,
          model: msg.model,
          costUsd: msg.costUsd,
        });
      }
    } catch (err) {
      console.error(`[Projects] Error loading session ${sessionId}:`, err);
    }
  }

  // Sort timeline chronologically, limit to 200
  allMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const timeline = allMessages.slice(0, 200);

  // Build agent breakdown with percentages
  const agentBreakdown = Array.from(agentMap.entries()).map(([agentId, data]) => ({
    agentId,
    costUsd: data.costUsd,
    tokenCount: data.tokenCount,
    messageCount: data.messageCount,
    percentage: totalCost > 0 ? Math.round((data.costUsd / totalCost) * 1000) / 10 : 0,
  })).sort((a, b) => b.costUsd - a.costUsd);

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    stats: {
      totalCostUsd: totalCost,
      totalTokens: totalTokens,
      totalMessages: totalMessages,
      sessionCount: sessions.length,
      dateRange: { from: earliest, to: latest },
    },
    agentBreakdown,
    sessions,
    timeline,
  };
}

export function addSessionToProject(projectId: string, sessionId: string): boolean {
  try {
    db.prepare(
      "INSERT OR IGNORE INTO project_sessions (projectId, sessionId, addedAt) VALUES (?, ?, ?)"
    ).run(projectId, sessionId, new Date().toISOString());
    db.prepare("UPDATE projects SET updatedAt = ? WHERE id = ?").run(new Date().toISOString(), projectId);
    return true;
  } catch {
    return false;
  }
}

export function removeSessionFromProject(projectId: string, sessionId: string): boolean {
  const result = db.prepare(
    "DELETE FROM project_sessions WHERE projectId = ? AND sessionId = ?"
  ).run(projectId, sessionId);
  if (result.changes > 0) {
    db.prepare("UPDATE projects SET updatedAt = ? WHERE id = ?").run(new Date().toISOString(), projectId);
    return true;
  }
  return false;
}

// ---------- Session tagging (many-to-many) ----------

export function setSessionProjects(sessionId: string, projectIds: string[]): void {
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("DELETE FROM project_sessions WHERE sessionId = ?").run(sessionId);
    const insert = db.prepare(
      "INSERT OR IGNORE INTO project_sessions (projectId, sessionId, addedAt) VALUES (?, ?, ?)"
    );
    for (const projectId of projectIds) {
      insert.run(projectId, sessionId, now);
    }
    // Update updatedAt for affected projects
    const update = db.prepare("UPDATE projects SET updatedAt = ? WHERE id = ?");
    for (const projectId of projectIds) {
      update.run(now, projectId);
    }
  })();
}

export function getSessionProjects(sessionId: string): Project[] {
  return db.prepare(`
    SELECT p.id, p.name, p.description, p.createdAt, p.updatedAt
    FROM projects p
    JOIN project_sessions ps ON p.id = ps.projectId
    WHERE ps.sessionId = ?
    ORDER BY p.name
  `).all(sessionId) as Project[];
}

export function bulkGetSessionProjects(sessionIds: string[]): Map<string, Array<{ id: string; name: string }>> {
  const result = new Map<string, Array<{ id: string; name: string }>>();
  if (sessionIds.length === 0) return result;

  // Query all project tags for the given session IDs
  const placeholders = sessionIds.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT ps.sessionId, p.id, p.name
    FROM project_sessions ps
    JOIN projects p ON p.id = ps.projectId
    WHERE ps.sessionId IN (${placeholders})
    ORDER BY p.name
  `).all(...sessionIds) as Array<{ sessionId: string; id: string; name: string }>;

  for (const row of rows) {
    if (!result.has(row.sessionId)) {
      result.set(row.sessionId, []);
    }
    result.get(row.sessionId)!.push({ id: row.id, name: row.name });
  }

  return result;
}

export async function suggestRelatedSessions(sessionId: string): Promise<SessionSummary[]> {
  const allSessions = await listSessions();
  const target = allSessions.find((s) => s.id === sessionId);
  if (!target) return [];

  const targetStart = new Date(target.startedAt).getTime();
  const targetEnd = new Date(target.lastActivityAt).getTime();
  const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

  // Find sessions that already belong to same projects as this session
  const existingProjectSessions = new Set<string>();
  const projects = db.prepare(
    "SELECT projectId FROM project_sessions WHERE sessionId = ?"
  ).all(sessionId) as { projectId: string }[];
  for (const { projectId } of projects) {
    const linked = db.prepare(
      "SELECT sessionId FROM project_sessions WHERE projectId = ?"
    ).all(projectId) as { sessionId: string }[];
    for (const { sessionId: sid } of linked) {
      existingProjectSessions.add(sid);
    }
  }

  // Find overlapping sessions
  const suggestions = allSessions
    .filter((s) => {
      if (s.id === sessionId) return false;
      if (existingProjectSessions.has(s.id)) return false;

      const sStart = new Date(s.startedAt).getTime();
      const sEnd = new Date(s.lastActivityAt).getTime();

      // Check if sessions overlap within window
      return sStart <= targetEnd + WINDOW_MS && sEnd >= targetStart - WINDOW_MS;
    })
    .map((s) => {
      // Score by time overlap
      const sStart = new Date(s.startedAt).getTime();
      const sEnd = new Date(s.lastActivityAt).getTime();
      const overlapStart = Math.max(targetStart, sStart);
      const overlapEnd = Math.min(targetEnd, sEnd);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      return { ...s, _score: overlap };
    })
    .sort((a, b) => (b as any)._score - (a as any)._score)
    .slice(0, 10)
    .map(({ _score, ...s }) => s);

  return suggestions;
}
