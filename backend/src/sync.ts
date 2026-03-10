import db from "./db";
import { listSessions, invalidateCache, discoverProfiles, SessionSummary } from "./sessions";

// --- Stop words to ignore when extracting keywords ---
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "out", "off", "over",
  "under", "again", "further", "then", "once", "here", "there", "when",
  "where", "why", "how", "all", "both", "each", "few", "more", "most",
  "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "about", "up", "it", "its",
  "this", "that", "these", "those", "i", "me", "my", "we", "our",
  "you", "your", "he", "him", "his", "she", "her", "they", "them",
  "their", "what", "which", "who", "whom", "and", "but", "if", "or",
  "because", "until", "while", "let", "get", "got", "like", "also",
  "new", "one", "two", "now", "well", "way", "use", "make", "see",
  "need", "know", "take", "come", "think", "look", "want", "give",
  "first", "last", "long", "great", "little", "right", "still",
  "session", "untitled", "assistant", "user", "message", "tool",
  "error", "system", "help", "yes", "no", "ok", "hey", "hi", "hello",
  // Platform / infra noise
  "slack", "telegram", "discord", "whatsapp", "webhook", "api", "url",
  "http", "https", "localhost", "port", "server", "client", "app",
  "gmt+2", "gmt+3", "utc", "time", "date", "today", "yesterday",
  "web", "live", "status", "check", "update", "run", "start", "stop",
  "nothing", "something", "everything", "anything",
  "escalated", "play", "test", "debug", "fix", "bug",
  // People names / mentions (should not be projects)
  "gal", "ofek", "anas", "dor", "omri", "yarin", "rotem", "eshchar", "shira", "tisa",
  // Slack user IDs
  "u0afb8d1tfw", "u0aew5d62vd", "u04uus3t5k5", "u0afbfvvc92",
  // Emoji names from markdown
  "whitecheckmark", "checkmark", "fire", "rocket", "clipboard",
  "mag", "warning", "bulb", "sparkles", "tada",
]);

/**
 * Extract meaningful keywords from a session title.
 */
function extractKeywords(title: string): string[] {
  // Remove emoji, markdown, special chars
  const clean = title
    .replace(/[\u{1F600}-\u{1F9FF}]/gu, "")
    .replace(/[*_~`#\[\](){}|<>]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .toLowerCase();

  const words = clean.split(/[\s,;:.!?/\\-]+/).filter(w =>
    w.length > 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w) &&
    !/^[<>@#]+/.test(w) && // Skip mentions/channels
    !/^[\u0590-\u05FF]{1,3}$/.test(w) // Skip very short Hebrew words
  );

  return [...new Set(words)];
}

/**
 * Auto-detect projects by matching session titles against known patterns.
 * Uses pattern-based matching: looks for distinctive multi-word phrases,
 * product names, and identifiable project references.
 */
function autoDetectProjects(sessions: SessionSummary[]): Map<string, { name: string; sessionIds: string[] }> {
  // Known project patterns: [regex, display name]
  // These are detected from session content
  const PROJECT_PATTERNS: Array<[RegExp, string]> = [
    [/cla\s*watch|clawatch|datadog.*agent|observability.*agent|agent.*observability/i, "ClaWatch"],
    [/clawmetry/i, "Clawmetry"],
    [/openclaw/i, "OpenClaw"],
    [/racing.?game|race.*game|game.*race|crossing.*finish/i, "Racing Game"],
    [/weather.*country|weather.*mvp|weather.*app/i, "Weather App"],
    [/linkedin.*connect|connection.*graph|orggraph/i, "LinkedIn Graph"],
    [/lovable.*ai|ai.*assistant.*platform/i, "Lovable for AI"],
    [/landing.*page|hero.*section|hero.*terminal/i, "Landing Pages"],
    [/genygen|genway/i, "Genygen"],
    [/datadog.*openclaw|observability.*platform/i, "ClaWatch"],
    [/flight.*track|טיסה|טיסות/i, "Flight Tracker"],
  ];

  const projects = new Map<string, { name: string; sessionIds: Set<string> }>();

  for (const session of sessions) {
    const title = session.title || "";
    if (title === "Untitled session" || title.length < 5) continue;

    for (const [pattern, projectName] of PROJECT_PATTERNS) {
      if (pattern.test(title)) {
        const projectId = `auto_${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        if (!projects.has(projectId)) {
          projects.set(projectId, { name: projectName, sessionIds: new Set() });
        }
        projects.get(projectId)!.sessionIds.add(session.id);
        break; // First match wins — sessions only belong to one auto-project
      }
    }
  }

  // Convert Sets to arrays and filter out single-session projects
  const result = new Map<string, { name: string; sessionIds: string[] }>();
  for (const [id, project] of projects) {
    if (project.sessionIds.size >= 2) {
      result.set(id, { name: project.name, sessionIds: Array.from(project.sessionIds) });
    }
  }

  return result;
}

/**
 * Full sync: scan all JSONL files from ~/.openclaw and populate the DB.
 * Called on backend startup to prefill data.
 */
export async function syncAllData(): Promise<void> {
  const profiles = discoverProfiles();
  console.log(`[Sync] Scanning OpenClaw data across ${profiles.length} profile(s): ${profiles.map(p => p.id).join(", ") || "default"}...`);
  const start = Date.now();

  try {
    // Force fresh read from JSONL files (scans all profiles)
    invalidateCache();
    const sessions = await listSessions();
    const totalCost = sessions.reduce((s, x) => s + x.costUsd, 0);
    console.log(`[Sync] Sessions loaded: ${sessions.length}, total cost: $${totalCost.toFixed(2)}`);

    // --- Sync agents ---
    const agentMap = new Map<string, {
      id: string;
      name: string;
      costUsd: number;
      tokenCount: number;
      sessionCount: number;
      lastHeartbeat: string;
      createdAt: string;
      status: string;
    }>();

    const now = Date.now();
    const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;

    for (const session of sessions) {
      const existing = agentMap.get(session.agentId);
      if (!existing) {
        agentMap.set(session.agentId, {
          id: session.agentId,
          name: session.agentId,
          costUsd: session.costUsd,
          tokenCount: session.tokenCount,
          sessionCount: 1,
          lastHeartbeat: session.lastActivityAt,
          createdAt: session.startedAt,
          status: (now - new Date(session.lastActivityAt).getTime() < ACTIVE_THRESHOLD_MS) ? "active" : "idle",
        });
      } else {
        existing.costUsd += session.costUsd;
        existing.tokenCount += session.tokenCount;
        existing.sessionCount += 1;
        if (session.lastActivityAt > existing.lastHeartbeat) {
          existing.lastHeartbeat = session.lastActivityAt;
        }
        if (session.startedAt < existing.createdAt) {
          existing.createdAt = session.startedAt;
        }
        if (now - new Date(session.lastActivityAt).getTime() < ACTIVE_THRESHOLD_MS) {
          existing.status = "active";
        }
      }
    }

    const upsertAgent = db.prepare(`
      INSERT INTO agents (id, name, host, status, lastHeartbeat, createdAt, costUsd, tokenCount, errorCount)
      VALUES (?, ?, 'local', ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        lastHeartbeat = excluded.lastHeartbeat,
        costUsd = excluded.costUsd,
        tokenCount = excluded.tokenCount
    `);

    const agents = Array.from(agentMap.values());
    db.transaction(() => {
      for (const agent of agents) {
        upsertAgent.run(
          agent.id, agent.name, agent.status,
          agent.lastHeartbeat, agent.createdAt,
          agent.costUsd, agent.tokenCount
        );
      }
    })();

    // --- Auto-detect projects ---
    const detectedProjects = autoDetectProjects(sessions);

    const upsertProject = db.prepare(`
      INSERT INTO projects (id, name, description, createdAt, updatedAt)
      VALUES (?, ?, 'Auto-detected from session activity', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        updatedAt = excluded.updatedAt
    `);
    const upsertProjectSession = db.prepare(`
      INSERT OR IGNORE INTO project_sessions (projectId, sessionId, addedAt)
      VALUES (?, ?, ?)
    `);

    db.transaction(() => {
      for (const [projectId, project] of detectedProjects) {
        const nowStr = new Date().toISOString();
        upsertProject.run(projectId, project.name, nowStr, nowStr);
        for (const sessionId of project.sessionIds) {
          upsertProjectSession.run(projectId, sessionId, nowStr);
        }
      }
    })();

    const elapsed = Date.now() - start;
    const topAgents = agents.sort((a, b) => b.costUsd - a.costUsd).slice(0, 5);
    console.log(`[Sync] Done — ${agents.length} agents, ${sessions.length} sessions, ${detectedProjects.size} projects in ${elapsed}ms`);
    for (const a of topAgents) {
      console.log(`[Sync]   ${a.name}: $${a.costUsd.toFixed(2)}, ${a.tokenCount} tokens, ${a.sessionCount} sessions`);
    }
    for (const [id, p] of detectedProjects) {
      console.log(`[Sync]   Project "${p.name}": ${p.sessionIds.length} sessions`);
    }
  } catch (err) {
    console.error("[Sync] Error during initial scan:", err);
  }
}
