import { describe, it, expect } from "vitest";
import { recommendModelForSession, recommendForRecentSessions } from "../modelRecommendations";
import type { SessionDetail, SessionSummary } from "../sessions";

function makeSessionDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    id: "test-session",
    agentId: "test-agent",
    profile: "default",
    title: "Test Session",
    status: "completed",
    costUsd: 0.50,
    tokenCount: 50000,
    messageCount: 10,
    model: "anthropic/claude-opus-4-20250514",
    startedAt: "2025-03-20T10:00:00Z",
    lastActivityAt: "2025-03-20T10:30:00Z",
    duration: 30 * 60 * 1000,
    costByModel: [{ model: "anthropic/claude-opus-4-20250514", costUsd: 0.50, tokenCount: 50000 }],
    tokenBreakdown: { input: 30000, output: 20000, cacheRead: 0, cacheWrite: 0 },
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
    costUsd: 0.50,
    tokenCount: 50000,
    messageCount: 5,
    model: "anthropic/claude-opus-4-20250514",
    startedAt: "2025-03-20T10:00:00Z",
    lastActivityAt: new Date().toISOString(), // recent for "active" status
    duration: 10 * 60 * 1000,
    costByModel: [{ model: "anthropic/claude-opus-4-20250514", costUsd: 0.50, tokenCount: 50000 }],
    ...overrides,
  };
}

describe("recommendModelForSession", () => {
  it("recommends cheaper model for simple Opus sessions", () => {
    const session = makeSessionDetail({
      model: "anthropic/claude-opus-4-20250514",
      messages: [
        { id: "1", role: "user", timestamp: "2025-03-20T10:00:00Z", content: "Hi there" },
        { id: "2", role: "assistant", timestamp: "2025-03-20T10:00:01Z", content: "Hello!" },
      ],
    });
    const result = recommendModelForSession(session);
    expect(result.recommendedModel).toBe("claude-haiku");
    expect(result.potentialSavings.costUsd).toBeGreaterThan(0);
    expect(result.potentialSavings.percentage).toBeGreaterThan(0);
  });

  it("recommends Sonnet for moderate Opus sessions", () => {
    const session = makeSessionDetail({
      model: "anthropic/claude-opus-4-20250514",
      messages: [
        {
          id: "1",
          role: "user",
          timestamp: "2025-03-20T10:00:00Z",
          content:
            "Can you analyze the performance metrics from last week and create a summary report with visualizations for the dashboard? Include trends and anomalies.",
        },
        {
          id: "2",
          role: "assistant",
          timestamp: "2025-03-20T10:00:01Z",
          content: "Checking metrics...",
          toolName: "exec",
        },
        {
          id: "3",
          role: "assistant",
          timestamp: "2025-03-20T10:00:02Z",
          content: "Reading data file...",
          toolName: "read",
        },
        { id: "4", role: "assistant", timestamp: "2025-03-20T10:00:03Z", content: "Here's the report..." },
      ],
    });
    const result = recommendModelForSession(session);
    expect(["claude-sonnet", "claude-haiku"]).toContain(result.recommendedModel);
    expect(result.potentialSavings.costUsd).toBeGreaterThan(0);
  });

  it("keeps current model for complex sessions", () => {
    const session = makeSessionDetail({
      model: "anthropic/claude-opus-4-20250514",
      messages: [
        {
          id: "1",
          role: "user",
          timestamp: "2025-03-20T10:00:00Z",
          content:
            "Refactor the entire authentication system from session-based to JWT, update all 15 middleware files, run the integration test suite, and spawn sub-agents for parallel testing across microservices.",
        },
        { id: "2", role: "assistant", timestamp: "2025-03-20T10:00:01Z", content: "Reading...", toolName: "read" },
        { id: "3", role: "assistant", timestamp: "2025-03-20T10:00:02Z", content: "Editing...", toolName: "edit" },
        { id: "4", role: "assistant", timestamp: "2025-03-20T10:00:03Z", content: "Running...", toolName: "exec" },
        {
          id: "5",
          role: "assistant",
          timestamp: "2025-03-20T10:00:04Z",
          content: "Spawning...",
          toolName: "sessions_spawn",
        },
        { id: "6", role: "assistant", timestamp: "2025-03-20T10:00:05Z", content: "Writing...", toolName: "write" },
      ],
    });
    const result = recommendModelForSession(session);
    expect(result.complexity).toBe("complex");
    // Should keep the current model or the same tier
    expect(result.recommendedModel).toContain("opus");
  });

  // --- Edge cases ---

  it("handles zero-cost sessions gracefully", () => {
    const session = makeSessionDetail({
      costUsd: 0,
      tokenCount: 0,
      messages: [
        { id: "1", role: "user", timestamp: "2025-03-20T10:00:00Z", content: "Test" },
      ],
    });
    const result = recommendModelForSession(session);
    expect(result.potentialSavings.costUsd).toBe(0);
    expect(result.potentialSavings.percentage).toBe(0);
  });

  it("handles empty model string", () => {
    const session = makeSessionDetail({ model: "", messages: [] });
    const result = recommendModelForSession(session);
    expect(result.currentModel).toBeDefined();
    expect(result.confidence).toBe(0);
    expect(result.reasons).toContain("Insufficient data to analyze this session");
  });

  it("handles sessions with no messages", () => {
    const session = makeSessionDetail({ messageCount: 0, messages: [] });
    const result = recommendModelForSession(session);
    expect(result.confidence).toBe(0);
  });

  it("handles unknown model names", () => {
    const session = makeSessionDetail({
      model: "some-custom-local-model-v3",
      messages: [
        { id: "1", role: "user", timestamp: "2025-03-20T10:00:00Z", content: "Hello" },
        { id: "2", role: "assistant", timestamp: "2025-03-20T10:00:01Z", content: "Hi!" },
      ],
    });
    const result = recommendModelForSession(session);
    expect(result).toBeDefined();
    expect(result.currentModel).toBe("some-custom-local-model-v3");
    // Should not crash
  });

  it("rounds savings to 4 decimal places", () => {
    const session = makeSessionDetail({
      costUsd: 1.23456789,
      tokenCount: 100000,
      model: "anthropic/claude-opus-4-20250514",
      messages: [
        { id: "1", role: "user", timestamp: "2025-03-20T10:00:00Z", content: "Short question" },
        { id: "2", role: "assistant", timestamp: "2025-03-20T10:00:01Z", content: "Short answer" },
      ],
    });
    const result = recommendModelForSession(session);
    const decimalPlaces = result.potentialSavings.costUsd.toString().split(".")[1]?.length || 0;
    expect(decimalPlaces).toBeLessThanOrEqual(4);
  });
});

describe("recommendForRecentSessions", () => {
  it("returns savings summary across multiple sessions", () => {
    const sessions: SessionSummary[] = [
      makeSessionSummary({ id: "s1", model: "anthropic/claude-opus-4-20250514", costUsd: 0.50, tokenCount: 50000, messageCount: 3 }),
      makeSessionSummary({ id: "s2", model: "anthropic/claude-opus-4-20250514", costUsd: 0.30, tokenCount: 30000, messageCount: 4 }),
      makeSessionSummary({ id: "s3", model: "anthropic/claude-haiku-3", costUsd: 0.01, tokenCount: 5000, messageCount: 2 }),
    ];
    const result = recommendForRecentSessions(sessions);
    expect(result.totalSessions).toBe(3);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.potentialTotalSavings).toBeGreaterThanOrEqual(0);
  });

  it("filters out completed sessions", () => {
    const sessions: SessionSummary[] = [
      makeSessionSummary({ id: "s1", status: "completed" }),
      makeSessionSummary({ id: "s2", status: "active" }),
    ];
    const result = recommendForRecentSessions(sessions);
    expect(result.totalSessions).toBe(1); // Only active/idle sessions
  });

  it("respects the limit parameter", () => {
    const sessions: SessionSummary[] = Array.from({ length: 50 }, (_, i) =>
      makeSessionSummary({ id: `s${i}` })
    );
    const result = recommendForRecentSessions(sessions, 5);
    expect(result.totalSessions).toBeLessThanOrEqual(5);
  });

  it("handles empty session list", () => {
    const result = recommendForRecentSessions([]);
    expect(result.totalSessions).toBe(0);
    expect(result.recommendations).toEqual([]);
    expect(result.potentialTotalSavings).toBe(0);
  });

  it("aggregates across different agents", () => {
    const sessions: SessionSummary[] = [
      makeSessionSummary({ id: "s1", agentId: "agent-a", model: "anthropic/claude-opus-4-20250514" }),
      makeSessionSummary({ id: "s2", agentId: "agent-b", model: "anthropic/claude-opus-4-20250514" }),
      makeSessionSummary({ id: "s3", agentId: "agent-c", model: "gpt-4" }),
    ];
    const result = recommendForRecentSessions(sessions);
    // Should include sessions from all agents
    expect(result.totalSessions).toBe(3);
  });
});
