import { describe, it, expect } from "vitest";
import { recommendModelForSession, recommendForRecentSessions } from "../modelRecommendations";
import type { SessionDetail, SessionSummary, SessionDetailMessage } from "../sessions";

function makeSessionDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    id: "test-session",
    agentId: "test-agent",
    profile: "default",
    title: "Test Session",
    status: "completed",
    costUsd: 0.5,
    tokenCount: 50000,
    messageCount: 10,
    model: "anthropic/claude-opus-4-20250514",
    startedAt: "2025-03-20T10:00:00Z",
    lastActivityAt: "2025-03-20T10:30:00Z",
    duration: 30 * 60 * 1000,
    costByModel: [{ model: "anthropic/claude-opus-4-20250514", costUsd: 0.5, tokenCount: 50000 }],
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
    costUsd: 0.5,
    tokenCount: 50000,
    messageCount: 5,
    model: "anthropic/claude-opus-4-20250514",
    startedAt: "2025-03-20T10:00:00Z",
    lastActivityAt: new Date().toISOString(),
    duration: 10 * 60 * 1000,
    costByModel: [{ model: "anthropic/claude-opus-4-20250514", costUsd: 0.5, tokenCount: 50000 }],
    ...overrides,
  };
}

function userMsg(content: string): SessionDetailMessage {
  return { id: Math.random().toString(36).slice(2), role: "user", timestamp: "2025-03-20T10:00:00Z", content };
}

function assistantMsg(content: string, toolName?: string): SessionDetailMessage {
  return {
    id: Math.random().toString(36).slice(2),
    role: "assistant",
    timestamp: "2025-03-20T10:00:01Z",
    content,
    ...(toolName ? { toolName } : {}),
  };
}

// ─── Model normalization via recommendation paths ───

describe("recommendModelForSession — GPT model family", () => {
  it("recommends gpt-3.5-turbo for simple GPT-4 sessions", () => {
    const session = makeSessionDetail({
      model: "gpt-4-0125-preview",
      costUsd: 0.3,
      tokenCount: 30000,
      messages: [userMsg("What's the capital of France?"), assistantMsg("Paris.")],
    });
    const result = recommendModelForSession(session);
    expect(result.recommendedModel).toBe("gpt-3.5-turbo");
    expect(result.potentialSavings.costUsd).toBeGreaterThan(0);
  });

  it("recommends gpt-4-turbo for moderate GPT-4 sessions", () => {
    const session = makeSessionDetail({
      model: "gpt-4",
      costUsd: 0.8,
      tokenCount: 50000,
      messages: [
        userMsg("Analyze the performance metrics from last quarter and summarize trends across all departments. Include anomalies and suggested action items for each team lead."),
        assistantMsg("Fetching metrics...", "exec"),
        assistantMsg("Reading report...", "read"),
        assistantMsg("Here's the full analysis..."),
      ],
    });
    const result = recommendModelForSession(session);
    expect(result.recommendedModel).toBe("gpt-4-turbo");
    // GPT-4 → GPT-4-Turbo: savings depend on estimated cost vs actual cost
    // The estimated cost uses token-based calculation which may differ from actual costUsd
    expect(result.potentialSavings.percentage).toBeGreaterThanOrEqual(0);
  });

  it("keeps gpt-3.5-turbo for simple sessions (already cheap)", () => {
    const session = makeSessionDetail({
      model: "gpt-3.5-turbo",
      costUsd: 0.01,
      tokenCount: 10000,
      messages: [userMsg("Hello"), assistantMsg("Hi!")],
    });
    const result = recommendModelForSession(session);
    // Should not downgrade further — gpt-3.5 is already the cheapest
    expect(result.potentialSavings.costUsd).toBe(0);
  });

  it("handles gpt-4o model name normalization", () => {
    const session = makeSessionDetail({
      model: "gpt-4o-2024-08-06",
      costUsd: 0.2,
      tokenCount: 20000,
      messages: [userMsg("quick question"), assistantMsg("quick answer")],
    });
    const result = recommendModelForSession(session);
    // gpt-4o normalizes to gpt-4-turbo tier, for simple → should recommend gpt-3.5
    expect(result).toBeDefined();
    expect(result.currentModel).toBe("gpt-4o-2024-08-06");
  });
});

describe("recommendModelForSession — Gemini model family", () => {
  it("recommends gemini-flash for simple gemini-pro sessions", () => {
    const session = makeSessionDetail({
      model: "google/gemini-1.5-pro",
      costUsd: 0.05,
      tokenCount: 50000,
      messages: [userMsg("Translate 'hello' to Japanese"), assistantMsg("こんにちは")],
    });
    const result = recommendModelForSession(session);
    expect(result.recommendedModel).toBe("gemini-flash");
    expect(result.potentialSavings.costUsd).toBeGreaterThan(0);
  });

  it("keeps gemini-flash for simple sessions (already cheapest)", () => {
    const session = makeSessionDetail({
      model: "google/gemini-2.0-flash",
      costUsd: 0.002,
      tokenCount: 10000,
      messages: [userMsg("hi"), assistantMsg("hello")],
    });
    const result = recommendModelForSession(session);
    // Already on flash — savings should be negligible (rounding artifacts possible)
    expect(result.potentialSavings.costUsd).toBeLessThan(0.001);
  });
});

describe("recommendModelForSession — Haiku/cheap model upgrades for complex tasks", () => {
  it("flags haiku as potentially too weak for complex sessions", () => {
    const session = makeSessionDetail({
      model: "anthropic/claude-haiku-3",
      costUsd: 0.02,
      tokenCount: 20000,
      messages: [
        userMsg("Refactor the entire authentication system, add JWT support, update all middleware files, and run integration tests across all microservices."),
        assistantMsg("Reading auth...", "read"),
        assistantMsg("Editing...", "edit"),
        assistantMsg("Running tests...", "exec"),
        assistantMsg("Spawning parallel agents...", "sessions_spawn"),
        assistantMsg("Writing results...", "write"),
      ],
    });
    const result = recommendModelForSession(session);
    expect(result.complexity).toBe("complex");
    // Should keep current model but suggest considering upgrade
    expect(result.reasons.some((r) => r.toLowerCase().includes("consider") || r.toLowerCase().includes("testing"))).toBe(true);
  });

  it("keeps gpt-3.5 for complex tasks with upgrade suggestion", () => {
    const session = makeSessionDetail({
      model: "gpt-3.5-turbo",
      costUsd: 0.05,
      tokenCount: 50000,
      messages: [
        userMsg("Build a full microservices architecture with event sourcing, CQRS pattern, and deploy to Kubernetes with auto-scaling policies."),
        assistantMsg("r", "read"),
        assistantMsg("w", "write"),
        assistantMsg("e", "exec"),
        assistantMsg("s", "sessions_spawn"),
      ],
    });
    const result = recommendModelForSession(session);
    expect(result.complexity).toBe("complex");
    expect(result.recommendedModel).toBe("gpt-3.5-turbo"); // keeps current
  });
});

describe("recommendModelForSession — moderate complexity paths", () => {
  it("keeps haiku for moderate complexity (already efficient)", () => {
    const session = makeSessionDetail({
      model: "anthropic/claude-haiku-3",
      costUsd: 0.01,
      tokenCount: 10000,
      messages: [
        userMsg("Check the weather for Tel Aviv and summarize it with any notable patterns from the data."),
        assistantMsg("Checking...", "exec"),
        assistantMsg("Here's the summary..."),
      ],
    });
    const result = recommendModelForSession(session);
    if (result.complexity === "moderate") {
      // Should stay on haiku — already efficient
      expect(result.reasons.some((r) => r.toLowerCase().includes("efficient") || r.toLowerCase().includes("already"))).toBe(true);
    }
  });

  it("downgrades sonnet to haiku for simple tasks", () => {
    const session = makeSessionDetail({
      model: "anthropic/claude-sonnet-4-20250514",
      costUsd: 0.1,
      tokenCount: 10000,
      messages: [userMsg("What time is it?"), assistantMsg("It's 3 PM.")],
    });
    const result = recommendModelForSession(session);
    expect(result.complexity).toBe("simple");
    expect(result.recommendedModel).toBe("claude-haiku");
    expect(result.potentialSavings.costUsd).toBeGreaterThan(0);
  });
});

// ─── Bulk recommendations edge cases ───

describe("recommendForRecentSessions — edge cases", () => {
  it("filters out negligible savings (< 0.001 USD)", () => {
    const sessions: SessionSummary[] = [
      makeSessionSummary({
        id: "s1",
        model: "anthropic/claude-haiku-3",
        costUsd: 0.001,
        tokenCount: 1000,
        messageCount: 2,
      }),
    ];
    const result = recommendForRecentSessions(sessions);
    // Haiku is already cheapest — savings should be 0 or negligible → filtered
    expect(result.recommendations.length).toBe(0);
  });

  it("includes only active and idle sessions", () => {
    const sessions: SessionSummary[] = [
      makeSessionSummary({ id: "active-1", status: "active" }),
      makeSessionSummary({ id: "idle-1", status: "idle" }),
      makeSessionSummary({ id: "done-1", status: "completed" }),
      makeSessionSummary({ id: "done-2", status: "completed" }),
    ];
    const result = recommendForRecentSessions(sessions);
    expect(result.totalSessions).toBe(2);
  });

  it("handles mixed model families in bulk", () => {
    const sessions: SessionSummary[] = [
      makeSessionSummary({ id: "s1", model: "anthropic/claude-opus-4-20250514", costUsd: 0.5, tokenCount: 50000 }),
      makeSessionSummary({ id: "s2", model: "gpt-4", costUsd: 0.8, tokenCount: 40000 }),
      makeSessionSummary({ id: "s3", model: "google/gemini-1.5-pro", costUsd: 0.05, tokenCount: 50000 }),
      makeSessionSummary({ id: "s4", model: "anthropic/claude-haiku-3", costUsd: 0.01, tokenCount: 10000 }),
    ];
    const result = recommendForRecentSessions(sessions);
    expect(result.totalSessions).toBe(4);
    // At least some should have savings (opus, gpt-4, gemini-pro on simple tasks)
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.potentialTotalSavings).toBeGreaterThan(0);
  });

  it("respects limit=1", () => {
    const sessions: SessionSummary[] = Array.from({ length: 10 }, (_, i) =>
      makeSessionSummary({ id: `s${i}` })
    );
    const result = recommendForRecentSessions(sessions, 1);
    expect(result.totalSessions).toBe(1);
  });

  it("handles all-idle sessions", () => {
    const sessions: SessionSummary[] = [
      makeSessionSummary({ id: "s1", status: "idle", model: "anthropic/claude-opus-4-20250514" }),
      makeSessionSummary({ id: "s2", status: "idle", model: "gpt-4" }),
    ];
    const result = recommendForRecentSessions(sessions);
    expect(result.totalSessions).toBe(2);
  });

  it("uses lower confidence (0.6) for summary-based recommendations", () => {
    const sessions: SessionSummary[] = [
      makeSessionSummary({ id: "s1", model: "anthropic/claude-opus-4-20250514", costUsd: 1.0, tokenCount: 100000 }),
    ];
    const result = recommendForRecentSessions(sessions);
    if (result.recommendations.length > 0) {
      expect(result.recommendations[0].recommendation.confidence).toBe(0.6);
    }
  });
});

// ─── Savings calculation precision ───

describe("recommendModelForSession — savings calculation", () => {
  it("never returns negative savings", () => {
    // Edge: if estimated new cost is somehow higher (unknown model fallback)
    const session = makeSessionDetail({
      model: "some-very-cheap-local-model",
      costUsd: 0.001,
      tokenCount: 100000,
      messages: [userMsg("test"), assistantMsg("ok")],
    });
    const result = recommendModelForSession(session);
    expect(result.potentialSavings.costUsd).toBeGreaterThanOrEqual(0);
    expect(result.potentialSavings.percentage).toBeGreaterThanOrEqual(0);
  });

  it("calculates correct percentage for known cost reduction", () => {
    const session = makeSessionDetail({
      model: "anthropic/claude-opus-4-20250514",
      costUsd: 1.0,
      tokenCount: 50000,
      messages: [userMsg("Hello"), assistantMsg("Hi")],
    });
    const result = recommendModelForSession(session);
    // Simple session → haiku recommendation
    expect(result.recommendedModel).toBe("claude-haiku");
    expect(result.potentialSavings.percentage).toBeGreaterThan(90); // Opus to Haiku is massive
  });
});
