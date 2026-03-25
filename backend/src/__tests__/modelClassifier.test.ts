import { describe, it, expect } from "vitest";
import { classifySession, classifySessionSummary } from "../modelClassifier";
import type { SessionDetail, SessionSummary } from "../sessions";

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

describe("classifySession", () => {
  it("classifies a session with no messages as simple", () => {
    const session = makeSessionDetail({ messages: [] });
    const result = classifySession(session);
    expect(result.complexity).toBe("simple");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("classifies a session with short user messages and no tools as simple", () => {
    const session = makeSessionDetail({
      messages: [
        { id: "1", role: "user", timestamp: "2025-03-20T10:00:00Z", content: "What is 2+2?" },
        { id: "2", role: "assistant", timestamp: "2025-03-20T10:00:01Z", content: "4" },
        { id: "3", role: "user", timestamp: "2025-03-20T10:00:02Z", content: "Thanks!" },
      ],
    });
    const result = classifySession(session);
    expect(result.complexity).toBe("simple");
    expect(result.metrics.avgMessageLength).toBeLessThan(100);
    expect(result.metrics.toolCallsPerMessage).toBe(0);
  });

  it("classifies a session with heavy tool usage as complex", () => {
    const session = makeSessionDetail({
      messages: [
        {
          id: "1",
          role: "user",
          timestamp: "2025-03-20T10:00:00Z",
          content:
            "Please refactor the authentication module to use JWT tokens instead of session cookies. Also add rate limiting and update all the integration tests to work with the new auth flow.",
        },
        {
          id: "2",
          role: "assistant",
          timestamp: "2025-03-20T10:00:01Z",
          content: "Reading auth module...",
          toolName: "read",
        },
        {
          id: "3",
          role: "assistant",
          timestamp: "2025-03-20T10:00:02Z",
          content: "Editing auth module...",
          toolName: "edit",
        },
        {
          id: "4",
          role: "assistant",
          timestamp: "2025-03-20T10:00:03Z",
          content: "Running tests...",
          toolName: "exec",
        },
        {
          id: "5",
          role: "assistant",
          timestamp: "2025-03-20T10:00:04Z",
          content: "Spawning sub-agent...",
          toolName: "sessions_spawn",
        },
      ],
    });
    const result = classifySession(session);
    expect(result.complexity).toBe("complex");
    expect(result.metrics.hasFileOperations).toBe(true);
    expect(result.metrics.hasCodeExecution).toBe(true);
    expect(result.metrics.hasSubAgents).toBe(true);
  });

  it("classifies a moderate session correctly", () => {
    const session = makeSessionDetail({
      messages: [
        {
          id: "1",
          role: "user",
          timestamp: "2025-03-20T10:00:00Z",
          content:
            "Can you check the weather for Tel Aviv and then create a summary of the forecast for the next 3 days?",
        },
        {
          id: "2",
          role: "assistant",
          timestamp: "2025-03-20T10:00:01Z",
          content: "Checking weather...",
          toolName: "exec",
        },
        { id: "3", role: "assistant", timestamp: "2025-03-20T10:00:02Z", content: "Here is the forecast..." },
      ],
    });
    const result = classifySession(session);
    expect(["simple", "moderate"]).toContain(result.complexity);
  });

  it("returns confidence between 0 and 1", () => {
    const session = makeSessionDetail({ messages: [] });
    const result = classifySession(session);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe("classifySessionSummary", () => {
  it("classifies a short cheap session as simple", () => {
    const session = makeSessionSummary({
      messageCount: 3,
      model: "anthropic/claude-haiku-3",
      duration: 2 * 60 * 1000,
    });
    expect(classifySessionSummary(session)).toBe("simple");
  });

  it("classifies a high-message-count session as complex", () => {
    const session = makeSessionSummary({ messageCount: 50 });
    expect(classifySessionSummary(session)).toBe("complex");
  });

  it("classifies a long-duration session as complex", () => {
    const session = makeSessionSummary({ duration: 60 * 60 * 1000 });
    expect(classifySessionSummary(session)).toBe("complex");
  });

  it("classifies a multi-model session as complex", () => {
    const session = makeSessionSummary({
      costByModel: [
        { model: "claude-sonnet", costUsd: 0.03, tokenCount: 3000 },
        { model: "claude-haiku", costUsd: 0.01, tokenCount: 2000 },
      ],
    });
    expect(classifySessionSummary(session)).toBe("complex");
  });

  it("classifies an opus session with moderate messages as moderate", () => {
    const session = makeSessionSummary({
      messageCount: 8,
      model: "anthropic/claude-opus-4-20250514",
    });
    expect(classifySessionSummary(session)).toBe("moderate");
  });
});
