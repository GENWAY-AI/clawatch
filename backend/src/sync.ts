import db from "./db";
import { listSessions, invalidateCache } from "./sessions";

/**
 * Full sync: scan all JSONL files from ~/.openclaw and populate the DB.
 * Called on backend startup to prefill data.
 */
export async function syncAllData(): Promise<void> {
  console.log("[Sync] Scanning OpenClaw data...");
  const start = Date.now();

  try {
    // Force fresh read from JSONL files
    invalidateCache();
    const sessions = await listSessions();
    const totalCost = sessions.reduce((s, x) => s + x.costUsd, 0);
    console.log(`[Sync] Sessions loaded: ${sessions.length}, total cost: $${totalCost.toFixed(2)}`);

    // Aggregate agent data from sessions
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

    // Upsert agents into DB
    const upsert = db.prepare(`
      INSERT INTO agents (id, name, host, status, lastHeartbeat, createdAt, costUsd, tokenCount, errorCount)
      VALUES (?, ?, 'local', ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        lastHeartbeat = excluded.lastHeartbeat,
        costUsd = excluded.costUsd,
        tokenCount = excluded.tokenCount
    `);

    const upsertMany = db.transaction((agents: any[]) => {
      for (const agent of agents) {
        upsert.run(
          agent.id,
          agent.name,
          agent.status,
          agent.lastHeartbeat,
          agent.createdAt,
          agent.costUsd,
          agent.tokenCount
        );
      }
    });

    const agents = Array.from(agentMap.values());
    upsertMany(agents);

    const elapsed = Date.now() - start;
    const topAgents = agents.sort((a, b) => b.costUsd - a.costUsd).slice(0, 5);
    console.log(`[Sync] Done — ${agents.length} agents, ${sessions.length} sessions in ${elapsed}ms`);
    for (const a of topAgents) {
      console.log(`[Sync]   ${a.name}: $${a.costUsd.toFixed(2)}, ${a.tokenCount} tokens, ${a.sessionCount} sessions`);
    }
  } catch (err) {
    console.error("[Sync] Error during initial scan:", err);
  }
}
