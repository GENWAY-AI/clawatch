import fs from "fs";
import path from "path";
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

// --- Hardcoded pattern overrides ---
// TITLE_PATTERNS: broader, used for title matching (short text, less noise)
// CONTENT_PATTERNS: stricter, used for content sampling (avoids false positives from thinking/tool text)
const TITLE_PATTERNS: Array<[RegExp, string]> = [
  [/cla\s*watch|clawatch|datadog.*agent|observability.*agent|alert.*filter|alert.*pagina|acknowledge.?all.*alert|severity.*filter|dashboard.*alert/i, "ClaWatch"],
  [/clawmetry/i, "Clawmetry"],
  [/racing.?game|race.*game|game.*race|crossing.*finish/i, "Racing Game"],
  [/weather.*country|weather.*mvp|weather.*app/i, "Weather App"],
  [/linkedin.*connect|connection.*graph|orggraph/i, "LinkedIn Graph"],
  [/lovable.*ai|ai.*assistant.*platform/i, "Lovable for AI"],
  [/landing.*page|hero.*section|hero.*terminal/i, "Landing Pages"],
  [/genygen|genway/i, "Genygen"],
  [/datadog.*openclaw|observability.*platform/i, "ClaWatch"],
  [/flight.*track|טיסה|טיסות/i, "Flight Tracker"],
];

// Content patterns: only exact product/feature names, no loose keyword combos
const CONTENT_PATTERNS: Array<[RegExp, string]> = [
  [/clawatch|cla\s*watch/i, "ClaWatch"],
  [/clawmetry/i, "Clawmetry"],
  [/racing.?game/i, "Racing Game"],
  [/weather.*country|weather.*mvp/i, "Weather App"],
  [/linkedin.*graph|orggraph/i, "LinkedIn Graph"],
  [/lovable.*ai/i, "Lovable for AI"],
  [/genygen/i, "Genygen"],
  [/flight.?tracker/i, "Flight Tracker"],
];

// --- Union-Find for clustering ---
class UnionFind {
  private parent: Map<number, number> = new Map();
  private rank: Map<number, number> = new Map();

  find(x: number): number {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: number, y: number): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;
    const rankX = this.rank.get(rx)!;
    const rankY = this.rank.get(ry)!;
    if (rankX < rankY) {
      this.parent.set(rx, ry);
    } else if (rankX > rankY) {
      this.parent.set(ry, rx);
    } else {
      this.parent.set(ry, rx);
      this.rank.set(rx, rankX + 1);
    }
  }
}

/**
 * Count pattern matches in a session's JSONL content.
 * Returns the count of matches for a given pattern, sampling up to maxBytes.
 * Requires multiple hits to avoid false positives from tool calls / infra noise.
 */
function countPatternInContent(sessionId: string, agentId: string, pattern: RegExp, maxBytes = 32768): number {
  const profiles = discoverProfiles();
  for (const profile of profiles) {
    // Also check topic sessions (sessionId-topic-*.jsonl)
    const sessionsDir = path.join(profile.dir, "agents", agentId, "sessions");
    if (!fs.existsSync(sessionsDir)) continue;

    const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) continue;

    try {
      const stat = fs.statSync(filePath);
      const fd = fs.openSync(filePath, "r");
      let content = "";

      // Read from the beginning
      const headSize = Math.min(stat.size, maxBytes);
      const headBuf = Buffer.alloc(headSize);
      fs.readSync(fd, headBuf, 0, headSize, 0);
      content += headBuf.toString("utf-8");

      // Also read from the end if file is larger (catches late project references)
      if (stat.size > maxBytes * 2) {
        const tailSize = Math.min(stat.size - maxBytes, maxBytes);
        const tailBuf = Buffer.alloc(tailSize);
        fs.readSync(fd, tailBuf, 0, tailSize, stat.size - tailSize);
        content += tailBuf.toString("utf-8");
      }

      fs.closeSync(fd);
      const matches = content.match(new RegExp(pattern.source, "gi"));
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

// Minimum pattern hits in content to count as a project match.
// Prevents false positives from single mentions in tool calls or quoted text.
const CONTENT_MATCH_THRESHOLD = 3;

/**
 * Auto-detect projects using:
 * 1. Hardcoded pattern matching (first pass — checks title + content sample)
 * 2. Keyword-based Jaccard clustering (second pass, everything else)
 */
function autoDetectProjects(sessions: SessionSummary[]): Map<string, { name: string; sessionIds: string[] }> {
  const result = new Map<string, { name: string; sessionIds: string[] }>();
  const patternMatched = new Set<string>(); // session IDs matched by patterns

  // --- Pass 1: Hardcoded patterns (title first, then content sample) ---
  const patternProjects = new Map<string, { name: string; sessionIds: Set<string> }>();

  for (const session of sessions) {
    const title = session.title || "";

    // Try title match first (fast path, broader patterns OK for short text)
    let matched = false;
    if (title !== "Untitled session" && title.length >= 5) {
      for (const [pattern, projectName] of TITLE_PATTERNS) {
        if (pattern.test(title)) {
          const projectId = `auto_${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
          if (!patternProjects.has(projectId)) {
            patternProjects.set(projectId, { name: projectName, sessionIds: new Set() });
          }
          patternProjects.get(projectId)!.sessionIds.add(session.id);
          patternMatched.add(session.id);
          matched = true;
          break;
        }
      }
    }

    // If title didn't match, check content with stricter patterns
    // Requires 3+ hits to avoid false positives from tool calls / infra noise
    if (!matched) {
      for (const [pattern, projectName] of CONTENT_PATTERNS) {
        const hits = countPatternInContent(session.id, session.agentId, pattern);
        if (hits >= CONTENT_MATCH_THRESHOLD) {
          const projectId = `auto_${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
          if (!patternProjects.has(projectId)) {
            patternProjects.set(projectId, { name: projectName, sessionIds: new Set() });
          }
          patternProjects.get(projectId)!.sessionIds.add(session.id);
          patternMatched.add(session.id);
          break;
        }
      }
    }
  }

  // Allow single-session pattern matches too (they'll grow via co-occurrence)
  for (const [id, project] of patternProjects) {
    result.set(id, { name: project.name, sessionIds: Array.from(project.sessionIds) });
  }

  // --- Pass 1.5: Deep content scan for unmatched sessions ---
  // Some sessions have project references deeper in the file (beyond the initial 32KB sample).
  // For sessions that didn't match yet, do a larger scan sampling both the beginning and end of the file.
  for (const session of sessions) {
    if (patternMatched.has(session.id)) continue;

    for (const [pattern, projectName] of CONTENT_PATTERNS) {
      // Scan larger portion: first 32KB + last 32KB (catches late references)
      const hits = countPatternInContent(session.id, session.agentId, pattern, 65536);
      if (hits >= CONTENT_MATCH_THRESHOLD) {
        const projectId = `auto_${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        if (!result.has(projectId)) {
          result.set(projectId, { name: projectName, sessionIds: [] });
        }
        result.get(projectId)!.sessionIds.push(session.id);
        patternMatched.add(session.id);
        break;
      }
    }
  }

  // --- Pass 2: Keyword clustering for remaining sessions ---
  // Build keyword sets and inverted index
  const sessionKeywords: Map<number, Set<string>> = new Map();
  const sessionIndexToId: string[] = [];
  const invertedIndex: Map<string, number[]> = new Map();

  for (const session of sessions) {
    // Skip sessions already matched by patterns
    if (patternMatched.has(session.id)) continue;

    const title = session.title || "";
    if (title === "Untitled session" || title.length < 5) continue;

    const keywords = extractKeywords(title);
    // Need at least 2 keywords for meaningful clustering
    if (keywords.length < 2) continue;

    const idx = sessionIndexToId.length;
    sessionIndexToId.push(session.id);
    const keywordSet = new Set(keywords);
    sessionKeywords.set(idx, keywordSet);

    for (const kw of keywordSet) {
      if (!invertedIndex.has(kw)) {
        invertedIndex.set(kw, []);
      }
      invertedIndex.get(kw)!.push(idx);
    }
  }

  // Build similarity graph using inverted index (avoids O(n²))
  const JACCARD_THRESHOLD = 0.25;
  const uf = new UnionFind();
  const compared = new Set<string>();

  for (const [, indices] of invertedIndex) {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = indices[i];
        const b = indices[j];
        const pairKey = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (compared.has(pairKey)) continue;
        compared.add(pairKey);

        const setA = sessionKeywords.get(a)!;
        const setB = sessionKeywords.get(b)!;

        // Jaccard similarity
        let intersection = 0;
        for (const kw of setA) {
          if (setB.has(kw)) intersection++;
        }
        const union = setA.size + setB.size - intersection;
        const jaccard = union > 0 ? intersection / union : 0;

        if (jaccard >= JACCARD_THRESHOLD) {
          uf.union(a, b);
        }
      }
    }
  }

  // Collect clusters
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < sessionIndexToId.length; i++) {
    if (!sessionKeywords.has(i)) continue;
    const root = uf.find(i);
    if (!clusters.has(root)) {
      clusters.set(root, []);
    }
    clusters.get(root)!.push(i);
  }

  // Create projects from clusters (min size 2)
  for (const [, members] of clusters) {
    if (members.length < 2) continue;

    // Count keyword frequencies across the cluster
    const kwFreq = new Map<string, number>();
    for (const idx of members) {
      for (const kw of sessionKeywords.get(idx)!) {
        kwFreq.set(kw, (kwFreq.get(kw) || 0) + 1);
      }
    }

    // Top 2-3 keywords by frequency
    const topKw = Array.from(kwFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([kw]) => kw);

    const projectId = `auto_${topKw.join("_")}`;
    const projectName = topKw.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const sessionIds = members.map((idx) => sessionIndexToId[idx]);

    // Merge with any existing result entry
    if (result.has(projectId)) {
      const existing = result.get(projectId)!;
      const existingSet = new Set(existing.sessionIds);
      for (const sid of sessionIds) {
        existingSet.add(sid);
      }
      existing.sessionIds = Array.from(existingSet);
    } else {
      result.set(projectId, { name: projectName, sessionIds });
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

    // Build set of sessions with manual (non-auto) project assignments
    const manuallyTagged = new Set<string>();
    const allManualRows = db.prepare(`
      SELECT DISTINCT sessionId FROM project_sessions
      WHERE projectId NOT LIKE 'auto_%'
    `).all() as { sessionId: string }[];
    for (const row of allManualRows) {
      manuallyTagged.add(row.sessionId);
    }

    db.transaction(() => {
      // Clear all auto-project session associations first (fresh re-match)
      // This ensures stale matches from previous runs are removed
      db.prepare("DELETE FROM project_sessions WHERE projectId LIKE 'auto_%'").run();

      for (const [projectId, project] of detectedProjects) {
        const nowStr = new Date().toISOString();
        upsertProject.run(projectId, project.name, nowStr, nowStr);
        for (const sessionId of project.sessionIds) {
          // Skip sessions that are manually tagged (unless they already have this auto-project)
          if (manuallyTagged.has(sessionId)) continue;
          upsertProjectSession.run(projectId, sessionId, nowStr);
        }
      }
    })();

    // Clean up stale auto-projects that are no longer detected
    const staleAutoProjects = db.prepare(
      "SELECT id FROM projects WHERE id LIKE 'auto_%'"
    ).all() as { id: string }[];
    let removedCount = 0;
    db.transaction(() => {
      for (const { id } of staleAutoProjects) {
        if (!detectedProjects.has(id)) {
          db.prepare("DELETE FROM project_sessions WHERE projectId = ?").run(id);
          db.prepare("DELETE FROM projects WHERE id = ?").run(id);
          removedCount++;
        }
      }
    })();
    if (removedCount > 0) {
      console.log(`[Sync] Cleaned up ${removedCount} stale auto-project(s)`);
    }

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
