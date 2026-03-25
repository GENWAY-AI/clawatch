import { describe, it, expect } from "vitest";
import { classifySession, classifySessionSummary } from "../modelClassifier";
import type { SessionDetail, SessionSummary, SessionDetailMessage } from "../sessions";

function makeSessionDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    id: "test-session",
    agentId: "test-agent",
    profile: "default",
    title: "Test Session",
    status: "completed",
    costUsd: 0.05,
    tokenCount: 5000,
    messageCount: 10,
    model: "anthropic/claude-sonnet-4-20250514",
    startedAt: "2025-03-20T10:00:00Z",
    lastActivityAt: "2025-03-20T10:30:00Z",
    duration: 30 * 60 * 1000,
    costByModel: [{ model: "anthropic/claude-sonnet-4-20250514", costUsd: 0.05, tokenCount: 5000 }],
    tokenBreakdown: { input: 3000, output: 2000, cacheRead: 0, cacheWrite: 0 },
    messages: [],
    ...overrides,
  };
}

function makeSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "test-session",
    agentId: "test-agent",
    profile: "default",
    title: "Test Session",
    status: "active",
    costUsd: 0.05,
    tokenCount: 5000,
    messageCount: 5,
    model: "anthropic/claude-sonnet-4-20250514",
    startedAt: "2025-03-20T10:00:00Z",
    lastActivityAt: "2025-03-20T10:30:00Z",
    duration: 10 * 60 * 1000,
    costByModel: [{ model: "anthropic/claude-sonnet-4-20250514", costUsd: 0.05, tokenCount: 5000 }],
    ...overrides,
  };
}

// Helper to make messages concisely
function userMsg(content: string, id?: string): SessionDetailMessage {
  return { id: id || Math.random().toString(36).slice(2), role: "user", timestamp: "2025-03-20T10:00:00Z", content };
}

function assistantMsg(content: string, toolName?: string, id?: string): SessionDetailMessage {
  return {
    id: id || Math.random().toString(36).slice(2),
    role: "assistant",
    timestamp: "2025-03-20T10:00:01Z",
    content,
    ...(toolName ? { toolName } : {}),
  };
}

describe("classifySession — complexity boundary thresholds", () => {
  it("scores messages at exactly 100 chars as short (0 points)", () => {
    // 99 chars — should be < 100 boundary
    const shortContent = "x".repeat(99);
    const session = makeSessionDetail({
      messages: [userMsg(shortContent), assistantMsg("ok")],
    });
    const result = classifySession(session);
    expect(result.metrics.avgMessageLength).toBeLessThan(100);
    expect(result.reasons).toContain("Short, simple messages");
  });

  it("scores messages at exactly 100 chars as moderate (1.5 points)", () => {
    const content = "x".repeat(100);
    const session = makeSessionDetail({
      messages: [userMsg(content), assistantMsg("ok")],
    });
    const result = classifySession(session);
    expect(result.metrics.avgMessageLength).toBe(100);
    // 100 is NOT < 100, so it should go to the else if branch (100 < 300)
    expect(result.reasons).toContain("Moderate message length");
  });

  it("scores messages at exactly 300 chars as detailed (3 points)", () => {
    const content = "x".repeat(300);
    const session = makeSessionDetail({
      messages: [userMsg(content), assistantMsg("ok")],
    });
    const result = classifySession(session);
    expect(result.metrics.avgMessageLength).toBe(300);
    // 300 is NOT < 300, so hits the else branch
    expect(result.reasons).toContain("Detailed, complex messages");
  });

  it("scores toolCallsPerMessage at exactly 0.3 as moderate tool usage", () => {
    // Need exactly 0.3 ratio: 3 tool calls out of 10 assistant messages
    const messages: SessionDetailMessage[] = [
      userMsg("do something"),
      assistantMsg("Reading...", "read"),
      assistantMsg("Editing...", "edit"),
      assistantMsg("Running...", "exec"),
      assistantMsg("thinking 1"),
      assistantMsg("thinking 2"),
      assistantMsg("thinking 3"),
      assistantMsg("thinking 4"),
      assistantMsg("thinking 5"),
      assistantMsg("thinking 6"),
      assistantMsg("thinking 7"),
    ];
    const session = makeSessionDetail({ messages });
    const result = classifySession(session);
    expect(result.metrics.toolCallsPerMessage).toBeCloseTo(0.3, 1);
    expect(result.reasons).toContain("Moderate tool usage");
  });

  it("scores toolCallsPerMessage at exactly 1.0 as heavy tool usage", () => {
    // Every assistant message has a tool call
    const messages: SessionDetailMessage[] = [
      userMsg("do everything"),
      assistantMsg("Reading...", "read"),
      assistantMsg("Writing...", "write"),
      assistantMsg("Executing...", "exec"),
    ];
    const session = makeSessionDetail({ messages });
    const result = classifySession(session);
    expect(result.metrics.toolCallsPerMessage).toBe(1.0);
    expect(result.reasons).toContain("Heavy tool usage");
  });
});

describe("classifySession — advanced feature detection", () => {
  it("detects subagents tool as sub-agent orchestration", () => {
    const session = makeSessionDetail({
      messages: [
        userMsg("Check agents"),
        assistantMsg("Listing...", "subagents"),
      ],
    });
    const result = classifySession(session);
    expect(result.metrics.hasSubAgents).toBe(true);
    expect(result.reasons).toContain("Uses sub-agent orchestration");
  });

  it("detects case-sensitive tool names (Read/Write/Edit)", () => {
    const session = makeSessionDetail({
      messages: [
        userMsg("fix this file"),
        assistantMsg("Reading...", "Read"),
        assistantMsg("Writing...", "Write"),
        assistantMsg("Editing...", "Edit"),
      ],
    });
    const result = classifySession(session);
    expect(result.metrics.hasFileOperations).toBe(true);
  });

  it("does not flag file ops for unrelated tool names", () => {
    const session = makeSessionDetail({
      messages: [
        userMsg("search the web"),
        assistantMsg("Searching...", "web_search"),
        assistantMsg("Fetching...", "web_fetch"),
      ],
    });
    const result = classifySession(session);
    expect(result.metrics.hasFileOperations).toBe(false);
    expect(result.metrics.hasCodeExecution).toBe(false);
    expect(result.metrics.hasSubAgents).toBe(false);
  });

  it("handles messages with null/undefined content gracefully", () => {
    const session = makeSessionDetail({
      messages: [
        { id: "1", role: "user", timestamp: "2025-03-20T10:00:00Z", content: undefined as any },
        { id: "2", role: "user", timestamp: "2025-03-20T10:00:01Z", content: null as any },
        userMsg("hello"),
      ],
    });
    // Should not throw
    const result = classifySession(session);
    expect(result).toBeDefined();
    expect(result.complexity).toBeDefined();
  });
});

describe("classifySession — confidence boundaries", () => {
  it("caps confidence at 0.95 for extremely complex sessions", () => {
    const session = makeSessionDetail({
      messages: [
        userMsg("x".repeat(500)), // 3 points for detailed messages
        assistantMsg("r", "read"),
        assistantMsg("w", "write"),
        assistantMsg("e", "edit"),
        assistantMsg("x", "exec"),
        assistantMsg("s", "sessions_spawn"),
      ],
    });
    const result = classifySession(session);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it("returns high confidence for very simple sessions (score 0)", () => {
    const session = makeSessionDetail({
      messages: [
        userMsg("hi"),
        assistantMsg("hello"),
      ],
    });
    const result = classifySession(session);
    expect(result.complexity).toBe("simple");
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});

describe("classifySessionSummary — edge cases", () => {
  it("classifies GPT-4 model as moderate even with few messages", () => {
    const session = makeSessionSummary({
      messageCount: 4,
      model: "gpt-4-0125-preview",
      duration: 5 * 60 * 1000,
    });
    expect(classifySessionSummary(session)).toBe("moderate");
  });

  it("classifies Gemini model with low messages as simple", () => {
    const session = makeSessionSummary({
      messageCount: 3,
      model: "google/gemini-2.5-flash",
      duration: 2 * 60 * 1000,
    });
    expect(classifySessionSummary(session)).toBe("simple");
  });

  it("prioritizes multiple models over message count for complexity", () => {
    const session = makeSessionSummary({
      messageCount: 2, // low count
      duration: 1 * 60 * 1000, // short
      model: "claude-haiku",
      costByModel: [
        { model: "claude-haiku", costUsd: 0.01, tokenCount: 1000 },
        { model: "claude-sonnet", costUsd: 0.03, tokenCount: 3000 },
      ],
    });
    // Multi-model → complex, despite low message count
    expect(classifySessionSummary(session)).toBe("complex");
  });

  it("classifies exactly 20 messages as moderate (boundary)", () => {
    const session = makeSessionSummary({
      messageCount: 20,
      model: "claude-haiku",
      duration: 10 * 60 * 1000,
    });
    // 20 is NOT > 20, so not complex via message count
    // But > 5, so moderate
    expect(classifySessionSummary(session)).toBe("moderate");
  });

  it("classifies exactly 21 messages as complex (boundary)", () => {
    const session = makeSessionSummary({
      messageCount: 21,
      model: "claude-haiku",
      duration: 10 * 60 * 1000,
    });
    expect(classifySessionSummary(session)).toBe("complex");
  });

  it("classifies exactly 30min duration as not complex (boundary)", () => {
    const session = makeSessionSummary({
      messageCount: 3,
      model: "claude-haiku",
      duration: 30 * 60 * 1000, // exactly 30 min
    });
    // 30 * 60 * 1000 is NOT > 30 * 60 * 1000
    expect(classifySessionSummary(session)).toBe("simple");
  });

  it("classifies 31min duration as complex (boundary)", () => {
    const session = makeSessionSummary({
      messageCount: 3,
      model: "claude-haiku",
      duration: 31 * 60 * 1000,
    });
    expect(classifySessionSummary(session)).toBe("complex");
  });
});
