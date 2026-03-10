import dotenv from "dotenv";
dotenv.config();

import { initDb } from "./db";
import db from "./db";

async function main() {
  await initDb();

  // Clear existing data
  db.exec("DELETE FROM events; DELETE FROM alerts; DELETE FROM agents;");

  const now = Date.now();
  const min = 60000;
  const hour = 3600000;

  interface Agent {
    id: string;
    name: string;
    host: string;
    status: string;
    costUsd: number;
    tokenCount: number;
    errorCount: number;
    createdHoursAgo: number;
  }

  const agents: Agent[] = [
    {
      id: "agent_code01",
      name: "code-reviewer",
      host: "dev-macbook",
      status: "running",
      costUsd: 4.52,
      tokenCount: 185000,
      errorCount: 1,
      createdHoursAgo: 6,
    },
    {
      id: "agent_deploy02",
      name: "deploy-assistant",
      host: "ci-runner-1",
      status: "running",
      costUsd: 2.18,
      tokenCount: 92000,
      errorCount: 0,
      createdHoursAgo: 3,
    },
    {
      id: "agent_research03",
      name: "research-bot",
      host: "cloud-vm-east",
      status: "error",
      costUsd: 8.73,
      tokenCount: 340000,
      errorCount: 5,
      createdHoursAgo: 12,
    },
    {
      id: "agent_qa04",
      name: "qa-tester",
      host: "dev-macbook",
      status: "paused",
      costUsd: 1.05,
      tokenCount: 41000,
      errorCount: 0,
      createdHoursAgo: 2,
    },
  ];

  const insertAgent = db.prepare(`
    INSERT INTO agents (id, name, host, status, lastHeartbeat, createdAt, costUsd, tokenCount, errorCount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO events (agentId, type, timestamp, data) VALUES (?, ?, ?, ?)
  `);

  const insertAlert = db.prepare(`
    INSERT INTO alerts (id, agentId, type, severity, message, timestamp, acknowledged) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const a of agents) {
      const createdAt = new Date(now - a.createdHoursAgo * hour).toISOString();
      const lastHeartbeat = a.status === "running"
        ? new Date(now - 30000).toISOString() // 30s ago
        : a.status === "error"
          ? new Date(now - 8 * min).toISOString() // 8 min ago (stuck)
          : new Date(now - 45 * min).toISOString(); // paused 45 min ago

      insertAgent.run(a.id, a.name, a.host, a.status, lastHeartbeat, createdAt, a.costUsd, a.tokenCount, a.errorCount);

      // Generate heartbeat events
      for (let i = 0; i < 10; i++) {
        const ts = new Date(now - i * 2 * min).toISOString();
        insertEvent.run(a.id, "heartbeat", ts, JSON.stringify({ message: "alive" }));
      }

      // Generate cost events
      const models = ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"];
      for (let i = 0; i < 5; i++) {
        const ts = new Date(now - i * 30 * min).toISOString();
        const model = models[i % 2];
        const cost = +(Math.random() * 1.5 + 0.1).toFixed(3);
        const tokens = Math.floor(Math.random() * 30000 + 5000);
        insertEvent.run(a.id, "cost", ts, JSON.stringify({ model, costUsd: cost, tokenCount: tokens }));
      }

      // Generate tool_call events
      const tools = ["exec", "file_read", "web_search", "code_edit", "test_run"];
      for (let i = 0; i < 8; i++) {
        const ts = new Date(now - i * 5 * min).toISOString();
        insertEvent.run(a.id, "tool_call", ts, JSON.stringify({
          toolName: tools[i % tools.length],
          message: `Called ${tools[i % tools.length]}`,
        }));
      }

      // Generate error events for error-prone agents
      if (a.errorCount > 0) {
        for (let i = 0; i < a.errorCount; i++) {
          const ts = new Date(now - i * 10 * min).toISOString();
          insertEvent.run(a.id, "error", ts, JSON.stringify({
            error: i === 0 ? "Rate limit exceeded: 429 Too Many Requests" : "Timeout waiting for tool response",
            message: "Agent encountered an error",
          }));
        }
      }
    }

    // Seed some alerts
    insertAlert.run(
      "alert_seed01", "agent_research03", "error", "critical",
      "Error spike detected — 5 errors in the last 1 minute(s)",
      new Date(now - 10 * min).toISOString(), 0
    );
    insertAlert.run(
      "alert_seed02", "agent_research03", "stuck", "critical",
      "Agent research-bot is stuck — no heartbeat for 5 minutes",
      new Date(now - 5 * min).toISOString(), 0
    );
    insertAlert.run(
      "alert_seed03", "agent_code01", "cost_spike", "warning",
      "Agent code-reviewer exceeded cost threshold — $4.52 spent (threshold: $10)",
      new Date(now - 2 * hour).toISOString(), 1
    );
  });

  insertAll();

  console.log("[Seed] Done! Created:");
  console.log(`  - ${agents.length} agents`);
  const eventCount = db.prepare("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
  const alertCount = db.prepare("SELECT COUNT(*) as cnt FROM alerts").get() as { cnt: number };
  console.log(`  - ${eventCount.cnt} events`);
  console.log(`  - ${alertCount.cnt} alerts`);
}

main().catch((err) => {
  console.error("[Seed] Error:", err);
  process.exit(1);
});
