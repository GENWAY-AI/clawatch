import fs from "fs";
import path from "path";
import readline from "readline";

// ---------- Profiles ----------

export interface Profile {
  id: string;        // "default" or the suffix (e.g. "travel-agent")
  name: string;      // display name: "Default" or "Travel Agent" (title-cased suffix)
  dir: string;       // absolute path
}

export function discoverProfiles(): Profile[] {
  const home = process.env.HOME || require("os").homedir();
  const entries = fs.readdirSync(home, { withFileTypes: true });
  const profiles: Profile[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".openclaw") {
      const dir = path.join(home, entry.name);
      if (fs.existsSync(path.join(dir, "agents"))) {
        profiles.push({ id: "default", name: "Default", dir });
      }
    } else if (entry.name.startsWith(".openclaw-")) {
      const dir = path.join(home, entry.name);
      if (fs.existsSync(path.join(dir, "agents"))) {
        const suffix = entry.name.slice(".openclaw-".length); // e.g. "travel-agent"
        const displayName = suffix
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        profiles.push({ id: suffix, name: displayName, dir });
      }
    }
  }

  // Sort: default first, then alphabetical
  profiles.sort((a, b) => {
    if (a.id === "default") return -1;
    if (b.id === "default") return 1;
    return a.id.localeCompare(b.id);
  });

  return profiles;
}

// ---------- Types ----------

export interface SessionSummary {
  id: string;
  agentId: string;
  profile: string;
  title: string;
  status: "active" | "idle" | "completed";
  costUsd: number;
  tokenCount: number;
  messageCount: number;
  model: string;
  startedAt: string;
  lastActivityAt: string;
  duration: number;
  costByModel: Array<{ model: string; costUsd: number; tokenCount: number }>;
}

export interface SessionDetailMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  timestamp: string;
  content: string;
  toolName?: string;
  toolInput?: string;
  model?: string;
  costUsd?: number;
  tokenCount?: number;
}

export interface SessionDetail extends SessionSummary {
  tokenBreakdown: { input: number; output: number; cacheRead: number; cacheWrite: number };
  messages: SessionDetailMessage[];
}

// ---------- Cache ----------

const sessionCache = new Map<string, { sessions: SessionSummary[]; timestamp: number }>();
const CACHE_TTL_MS = 30_000;

export function invalidateCache() {
  sessionCache.clear();
}

// ---------- Helpers ----------

function resolveOpenclawDir(): string {
  const dir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || "~", ".openclaw");
  return dir.startsWith("~") ? path.join(process.env.HOME || "", dir.slice(1)) : dir;
}

function deriveStatus(lastActivityAt: string): "active" | "idle" | "completed" {
  const elapsed = Date.now() - new Date(lastActivityAt).getTime();
  if (elapsed < 5 * 60_000) return "active";
  if (elapsed < 60 * 60_000) return "idle";
  return "completed";
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function extractTextContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text" && c.text)
      .map((c: any) => c.text)
      .join("\n");
  }
  return "";
}

function extractToolUse(content: any): { name: string; input: string } | null {
  if (!Array.isArray(content)) return null;
  const tool = content.find((c: any) => c.type === "tool_use");
  if (!tool) return null;
  return {
    name: tool.name || "",
    input: truncate(typeof tool.input === "string" ? tool.input : JSON.stringify(tool.input || {}), 500),
  };
}

function isRealUserMessage(text: string): boolean {
  if (!text || text.trim().length < 5) return false;
  const t = text.trim();
  // Skip OpenClaw system delivery / envelope messages
  if (t.startsWith("System:")) return false;
  if (t.startsWith("[Queued messages")) return false;
  if (t.startsWith("[Thread history")) return false;
  if (t.startsWith("[cron:")) return false;
  if (t.startsWith("Conversation info")) return false;
  // Skip heartbeat prompts
  if (t.startsWith("Read HEARTBEAT.md") || t.startsWith("Follow workspace-")) return false;
  // Skip messages that are just JSON metadata blocks
  if (t.startsWith("{") && t.endsWith("}")) return false;
  if (t.startsWith("```json") && t.includes("message_id")) return false;
  // Skip very short messages (likely acks)
  if (t.length < 10) return false;
  return true;
}

function extractBestTitle(userMessages: string[]): string {
  // Try each user message to find a real human message
  for (const msg of userMessages) {
    // Split into lines, filter out metadata/system lines
    const lines = msg.split("\n").filter(l => {
      const lt = l.trim();
      if (!lt || lt.length < 10) return false;
      if (lt.startsWith("System:")) return false;
      if (lt.startsWith("```")) return false;
      if (lt.startsWith("Conversation info")) return false;
      if (lt.startsWith("[Queued")) return false;
      if (lt.startsWith("[Thread")) return false;
      if (lt.startsWith("[cron:")) return false;
      if (lt.startsWith("Sender (")) return false;
      if (lt.startsWith("Chat history")) return false;
      if (lt.startsWith("Follow workspace-")) return false;
      if (lt.startsWith("Read HEARTBEAT")) return false;
      if (lt.startsWith("{") && lt.endsWith("}")) return false;
      if (lt.startsWith('"') && lt.includes('":')) return false; // JSON key-value
      if (lt.startsWith("Current time:")) return false;
      if (lt.startsWith("When reading HEARTBEAT")) return false;
      if (lt.startsWith("Return your summary")) return false;
      if (lt.startsWith("[Slack ")) return false;
      if (/^at \d+%/.test(lt)) return false;
      return true;
    });
    if (lines.length > 0) {
      // Remove Slack @mentions from the start
      const clean = lines[0].replace(/^<@[A-Z0-9]+>\s*/g, "").trim();
      if (clean.length >= 10) {
        return truncate(clean, 80);
      }
    }
  }
  return "Untitled session";
}

// ---------- Parse a single JSONL file ----------

async function parseSessionFile(
  filePath: string,
  agentId: string,
  collectMessages: boolean,
  profileId: string = "default"
): Promise<{ summary: SessionSummary; detail?: Omit<SessionDetail, keyof SessionSummary> } | null> {
  const sessionId = path.basename(filePath, ".jsonl");

  let firstTimestamp = "";
  let lastTimestamp = "";
  let title = "";
  const userMessageTexts: string[] = [];
  let costUsd = 0;
  let tokenCount = 0;
  let messageCount = 0;
  let model = "";

  // Detail-only accumulators
  const costByModel = new Map<string, { costUsd: number; tokenCount: number }>();
  const tokenBreakdown = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const messages: SessionDetailMessage[] = [];

  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // skip malformed lines
    }

    const ts = parsed.timestamp || "";
    if (ts) {
      if (!firstTimestamp) firstTimestamp = ts;
      lastTimestamp = ts;
    }

    if (parsed.type === "model_change" && parsed.modelId) {
      model = parsed.modelId;
    }

    if (parsed.type === "message" && parsed.message) {
      const msg = parsed.message;
      messageCount++;

      // Track model
      if (msg.model) model = msg.model;

      // Track cost/tokens
      if (msg.usage) {
        const u = msg.usage;
        const msgCost = u.cost?.total || 0;
        const msgTokens = u.totalTokens || 0;
        costUsd += msgCost;
        tokenCount += msgTokens;

        // Always track cost by model (needed for /api/costs breakdown)
        const modelKey = msg.model || "unknown";
        const existing = costByModel.get(modelKey) || { costUsd: 0, tokenCount: 0 };
        existing.costUsd += msgCost;
        existing.tokenCount += msgTokens;
        costByModel.set(modelKey, existing);

        if (collectMessages) {
          tokenBreakdown.input += u.input || 0;
          tokenBreakdown.output += u.output || 0;
          tokenBreakdown.cacheRead += u.cacheRead || 0;
          tokenBreakdown.cacheWrite += u.cacheWrite || 0;
        }
      }

      // Collect user messages for title extraction (first 5 only)
      if (msg.role === "user" && userMessageTexts.length < 5) {
        const text = extractTextContent(msg.content);
        if (text) userMessageTexts.push(text);
      }

      // Collect messages for detail view
      if (collectMessages) {
        const role: SessionDetailMessage["role"] =
          msg.role === "toolResult" ? "tool" : msg.role === "user" ? "user" : "assistant";

        const text = extractTextContent(msg.content);
        const toolUse = msg.role === "assistant" ? extractToolUse(msg.content) : null;

        const detailMsg: SessionDetailMessage = {
          id: parsed.id || `msg-${messageCount}`,
          role,
          timestamp: ts,
          content: truncate(text, 500),
        };

        if (msg.role === "toolResult" && parsed.toolName) {
          detailMsg.toolName = parsed.toolName;
        }
        if (msg.role === "toolResult" && msg.toolName) {
          detailMsg.toolName = msg.toolName;
        }
        if (toolUse) {
          detailMsg.toolName = toolUse.name;
          detailMsg.toolInput = toolUse.input;
        }
        if (msg.model) detailMsg.model = msg.model;
        if (msg.usage?.cost?.total) detailMsg.costUsd = msg.usage.cost.total;
        if (msg.usage?.totalTokens) detailMsg.tokenCount = msg.usage.totalTokens;

        messages.push(detailMsg);
      }
    }
  }

  if (!firstTimestamp) return null;

  const costByModelArray = Array.from(costByModel.entries()).map(([m, v]) => ({
    model: m,
    costUsd: v.costUsd,
    tokenCount: v.tokenCount,
  }));

  const summary: SessionSummary = {
    id: sessionId,
    agentId,
    profile: profileId,
    title: extractBestTitle(userMessageTexts),
    status: deriveStatus(lastTimestamp),
    costUsd,
    tokenCount,
    messageCount,
    model,
    startedAt: firstTimestamp,
    lastActivityAt: lastTimestamp,
    duration: new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime(),
    costByModel: costByModelArray,
  };

  if (!collectMessages) return { summary };

  return {
    summary,
    detail: {
      tokenBreakdown,
      messages,
    },
  };
}

// ---------- Public API ----------

async function listSessionsForDir(dir: string, profileId: string): Promise<SessionSummary[]> {
  const agentsDir = path.join(dir, "agents");
  if (!fs.existsSync(agentsDir)) return [];

  const agentNames = fs.readdirSync(agentsDir).filter((name) => {
    const sessionsPath = path.join(agentsDir, name, "sessions");
    return fs.existsSync(sessionsPath) && fs.statSync(sessionsPath).isDirectory();
  });

  const allSessions: SessionSummary[] = [];

  for (const agentName of agentNames) {
    const sessionsDir = path.join(agentsDir, agentName, "sessions");
    const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));

    const results = await Promise.all(
      files.map((f) => parseSessionFile(path.join(sessionsDir, f), agentName, false, profileId))
    );

    for (const result of results) {
      if (result) allSessions.push(result.summary);
    }
  }

  return allSessions;
}

export async function listSessions(profile?: string): Promise<SessionSummary[]> {
  const cacheKey = profile || "__all__";
  const now = Date.now();
  const cached = sessionCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.sessions;
  }

  let allSessions: SessionSummary[] = [];

  if (profile) {
    // Scan only the specified profile
    const profiles = discoverProfiles();
    const p = profiles.find((pr) => pr.id === profile);
    if (p) {
      allSessions = await listSessionsForDir(p.dir, p.id);
    } else {
      // Fallback: try resolveOpenclawDir for backward compat
      const dir = resolveOpenclawDir();
      allSessions = await listSessionsForDir(dir, "default");
    }
  } else {
    // Scan ALL profiles
    const profiles = discoverProfiles();
    if (profiles.length === 0) {
      // Fallback: single default dir
      const dir = resolveOpenclawDir();
      allSessions = await listSessionsForDir(dir, "default");
    } else {
      for (const p of profiles) {
        const sessions = await listSessionsForDir(p.dir, p.id);
        allSessions.push(...sessions);
      }
    }
  }

  // Sort by lastActivityAt DESC
  allSessions.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

  sessionCache.set(cacheKey, { sessions: allSessions, timestamp: now });

  return allSessions;
}

export async function getSessionDetail(sessionId: string, profile?: string): Promise<SessionDetail | null> {
  const profiles = profile
    ? discoverProfiles().filter((p) => p.id === profile)
    : discoverProfiles();

  // Fallback if no profiles discovered
  const dirs = profiles.length > 0
    ? profiles
    : [{ id: "default", name: "Default", dir: resolveOpenclawDir() }];

  for (const p of dirs) {
    const agentsDir = path.join(p.dir, "agents");
    if (!fs.existsSync(agentsDir)) continue;

    const agentNames = fs.readdirSync(agentsDir);

    for (const agentName of agentNames) {
      const filePath = path.join(agentsDir, agentName, "sessions", `${sessionId}.jsonl`);
      if (!fs.existsSync(filePath)) continue;

      const result = await parseSessionFile(filePath, agentName, true, p.id);
      if (!result || !result.detail) return null;

      return { ...result.summary, ...result.detail };
    }
  }

  return null;
}
