import { Agent, Alert, AlertDetails, AlertRelatedError, CostData, Session, SessionDetail, SessionMessage, Project, ProjectDetail, TimelineMessage } from "./types";
import { DEMO_AGENTS, DEMO_TOTALS, DEMO_MODELS, DEMO_PROJECTS } from "./demo-agents";

const now = new Date();
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();

export const mockAgents: Agent[] = [
  {
    id: "agent-1",
    name: "code-reviewer",
    host: "prod-us-east-1",
    status: "running",
    lastHeartbeat: minutesAgo(0.5),
    costUsd: 4.82,
    tokenCount: 1_240_000,
    errorCount: 0,
  },
  {
    id: "agent-2",
    name: "deploy-bot",
    host: "prod-us-east-1",
    status: "running",
    lastHeartbeat: minutesAgo(1),
    costUsd: 2.15,
    tokenCount: 520_000,
    errorCount: 1,
  },
  {
    id: "agent-3",
    name: "data-pipeline",
    host: "prod-eu-west-1",
    status: "error",
    lastHeartbeat: minutesAgo(12),
    costUsd: 8.43,
    tokenCount: 2_100_000,
    errorCount: 7,
  },
  {
    id: "agent-4",
    name: "customer-support",
    host: "prod-us-west-2",
    status: "stuck",
    lastHeartbeat: minutesAgo(45),
    costUsd: 12.67,
    tokenCount: 3_400_000,
    errorCount: 3,
  },
  {
    id: "agent-5",
    name: "test-runner",
    host: "staging-1",
    status: "paused",
    lastHeartbeat: hoursAgo(2),
    costUsd: 1.03,
    tokenCount: 280_000,
    errorCount: 0,
  },
  {
    id: "agent-6",
    name: "doc-generator",
    host: "prod-us-east-1",
    status: "running",
    lastHeartbeat: minutesAgo(0.2),
    costUsd: 3.21,
    tokenCount: 890_000,
    errorCount: 0,
  },
  {
    id: "agent-7",
    name: "security-scanner",
    host: "prod-eu-west-1",
    status: "stopped",
    lastHeartbeat: hoursAgo(6),
    costUsd: 0.45,
    tokenCount: 120_000,
    errorCount: 0,
  },
  {
    id: "agent-8",
    name: "slack-responder",
    host: "prod-us-west-2",
    status: "running",
    lastHeartbeat: minutesAgo(0.1),
    costUsd: 6.89,
    tokenCount: 1_780_000,
    errorCount: 2,
  },
];

export const mockAlerts: Alert[] = [
  {
    id: "alert-1",
    agentId: "agent-4",
    type: "stuck",
    severity: "critical",
    message: "customer-support has not sent a heartbeat in 45 minutes",
    timestamp: minutesAgo(44),
    acknowledged: false,
  },
  {
    id: "alert-2",
    agentId: "agent-3",
    type: "error",
    severity: "critical",
    message: "data-pipeline encountered 7 errors in the last hour",
    timestamp: minutesAgo(10),
    acknowledged: false,
  },
  {
    id: "alert-3",
    agentId: "agent-4",
    type: "cost_spike",
    severity: "warning",
    message: "customer-support cost increased 340% in the last hour",
    timestamp: hoursAgo(1),
    acknowledged: false,
  },
  {
    id: "alert-4",
    agentId: "agent-8",
    type: "loop_detected",
    severity: "warning",
    message: "slack-responder may be in a retry loop (similar outputs detected)",
    timestamp: minutesAgo(30),
    acknowledged: true,
  },
  {
    id: "alert-5",
    agentId: "agent-2",
    type: "error",
    severity: "info",
    message: "deploy-bot encountered a transient API error (auto-recovered)",
    timestamp: hoursAgo(3),
    acknowledged: true,
  },
];

// All costs derived from DEMO_TOTALS — single source of truth
export const mockCosts: CostData = {
  totalUsd: +DEMO_TOTALS.allTime.toFixed(2),
  totalTokens: DEMO_TOTALS.tokens.allTime,
  sessionCount: 42,
  byAgent: DEMO_AGENTS.map((a) => ({
    agentId: a.id,
    name: a.name,
    costUsd: a.spend.allTime,
    tokenCount: a.tokens.allTime,
  })),
  byModel: DEMO_MODELS.byModel,
  byProject: DEMO_PROJECTS.map((p, i) => ({
    projectId: p.id,
    name: p.name,
    costUsd: +p.cost.toFixed(2),
    tokenCount: Math.floor(DEMO_TOTALS.tokens.allTime * p.pct),
    sessionCount: 5 + i * 2,
  })),
  daily: (() => {
    // Fixed percentages of MTD spend — no Math.random(), stable on every render
    const pcts = [0.12, 0.15, 0.11, 0.17, 0.14, 0.16, 0.15];
    const sess = [4, 6, 3, 7, 5, 6, 5];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-03-04");
      d.setDate(d.getDate() + i);
      return {
        date: d.toISOString().slice(0, 10),
        costUsd: +(DEMO_TOTALS.mtd * pcts[i]).toFixed(2),
        tokenCount: Math.floor(DEMO_TOTALS.tokens.mtd * pcts[i]),
        sessionCount: sess[i],
      };
    });
  })(),
};

export const mockSessions: Session[] = [
  {
    id: "session-1",
    agentId: "agent-1",
    title: "Build ClaWatch dashboard with real-time alerts",
    status: "active",
    costUsd: 3.47,
    tokenCount: 892_000,
    messageCount: 47,
    model: "claude-sonnet-4-20250514",
    startedAt: minutesAgo(45),
    lastActivityAt: minutesAgo(1),
    duration: 2640,
    projects: [{ id: "project-1", name: "Building ClaWatch" }],
  },
  {
    id: "session-2",
    agentId: "agent-2",
    title: "Fix authentication bug in user login flow",
    status: "completed",
    costUsd: 1.23,
    tokenCount: 340_000,
    messageCount: 22,
    model: "claude-sonnet-4-20250514",
    startedAt: hoursAgo(3),
    lastActivityAt: hoursAgo(2),
    duration: 3600,
    projects: [{ id: "project-2", name: "Bug Fixes Sprint" }],
  },
  {
    id: "session-3",
    agentId: "agent-3",
    title: "Review PR #47 — add retry logic to API calls",
    status: "idle",
    costUsd: 0.87,
    tokenCount: 215_000,
    messageCount: 14,
    model: "claude-haiku-4-20250506",
    startedAt: minutesAgo(90),
    lastActivityAt: minutesAgo(12),
    duration: 4680,
  },
  {
    id: "session-4",
    agentId: "agent-1",
    title: "Implement WebSocket event streaming for agent heartbeats",
    status: "active",
    costUsd: 5.12,
    tokenCount: 1_340_000,
    messageCount: 63,
    model: "claude-sonnet-4-20250514",
    startedAt: hoursAgo(1.5),
    lastActivityAt: minutesAgo(0.5),
    duration: 5400,
    projects: [{ id: "project-1", name: "Building ClaWatch" }, { id: "project-2", name: "Bug Fixes Sprint" }],
  },
  {
    id: "session-5",
    agentId: "agent-2",
    title: "Refactor database schema for multi-tenant support",
    status: "completed",
    costUsd: 2.89,
    tokenCount: 780_000,
    messageCount: 38,
    model: "claude-sonnet-4-20250514",
    startedAt: hoursAgo(5),
    lastActivityAt: hoursAgo(4),
    duration: 3600,
  },
  {
    id: "session-6",
    agentId: "agent-3",
    title: "Debug failing CI pipeline — Jest timeout errors",
    status: "idle",
    costUsd: 0.54,
    tokenCount: 145_000,
    messageCount: 11,
    model: "claude-haiku-4-20250506",
    startedAt: minutesAgo(30),
    lastActivityAt: minutesAgo(8),
    duration: 1320,
  },
  {
    id: "session-7",
    agentId: "agent-1",
    title: "Add Telegram bot notification integration",
    status: "completed",
    costUsd: 1.76,
    tokenCount: 460_000,
    messageCount: 29,
    model: "claude-sonnet-4-20250514",
    startedAt: hoursAgo(8),
    lastActivityAt: hoursAgo(7),
    duration: 3600,
  },
  {
    id: "session-8",
    agentId: "agent-2",
    title: "Write unit tests for cost calculation module",
    status: "active",
    costUsd: 0.92,
    tokenCount: 248_000,
    messageCount: 18,
    model: "claude-haiku-4-20250506",
    startedAt: minutesAgo(15),
    lastActivityAt: minutesAgo(2),
    duration: 780,
  },
  {
    id: "session-9",
    agentId: "agent-3",
    title: "Optimize SQL queries — reduce p95 latency from 800ms to 200ms",
    status: "completed",
    costUsd: 4.31,
    tokenCount: 1_120_000,
    messageCount: 52,
    model: "claude-sonnet-4-20250514",
    startedAt: hoursAgo(12),
    lastActivityAt: hoursAgo(10),
    duration: 7200,
  },
  {
    id: "session-10",
    agentId: "agent-1",
    title: "Set up Docker Compose for local development environment",
    status: "idle",
    costUsd: 0.63,
    tokenCount: 172_000,
    messageCount: 9,
    model: "claude-haiku-4-20250506",
    startedAt: minutesAgo(60),
    lastActivityAt: minutesAgo(20),
    duration: 2400,
  },
];

export const mockProjects: Project[] = DEMO_PROJECTS.map((p, i) => ({
  id: p.id,
  name: p.name,
  description: [
    "Full-stack AI observability platform with real-time monitoring, session tracking, and cost analytics",
    "Automated customer support with AI-powered ticket routing and response generation",
    "Lead scoring, pipeline automation, and CRM integration powered by AI agents",
    "Automated PR reviews with code quality analysis, security scanning, and style enforcement",
    "AI-driven documentation generation from code, APIs, and architecture diagrams",
    "Slack bot integration for team notifications, standup automation, and workflow triggers",
  ][i],
  createdAt: hoursAgo(48 + i * 24),
  updatedAt: minutesAgo(5 + i * 15),
  sessionCount: 3 + i,
  totalCostUsd: +p.cost.toFixed(2),
}));

function buildMockTimeline(): TimelineMessage[] {
  const messages: TimelineMessage[] = [];
  let idx = 0;
  const m = (sessionId: string, agentId: string, role: TimelineMessage["role"], minsAgo: number, content: string, extra?: Partial<TimelineMessage>) => {
    idx++;
    messages.push({ sessionId, agentId, id: `tl-${idx}`, role, timestamp: minutesAgo(minsAgo), content, ...extra });
  };

  // Interleaved timeline across 3 agents working on "Building ClaWatch"
  m("session-1", "agent-1", "user", 120, "Build the ClaWatch dashboard with real-time alerts and agent monitoring. Use Next.js 15 + shadcn/ui.");
  m("session-1", "agent-1", "assistant", 119, "I'll build the ClaWatch dashboard. Let me start by setting up the project structure and examining existing code.", { model: "claude-sonnet-4-20250514", costUsd: 0.04 });
  m("session-3", "agent-3", "user", 118, "Review the initial project setup and suggest architectural improvements for the monitoring system.");
  m("session-1", "agent-1", "tool", 117, "src/\n  app/\n    dashboard/\n      page.tsx\n    layout.tsx\n  components/\n    ui/\n  lib/\n    types.ts\n    api.ts", { toolName: "read" });
  m("session-3", "agent-3", "assistant", 116, "Looking at the project structure. I'll review the architecture and suggest improvements for scalability.", { model: "claude-haiku-4-20250506", costUsd: 0.01 });
  m("session-1", "agent-1", "assistant", 115, "Project structure looks good. I'll create the type definitions for agents, sessions, alerts, and cost data.", { model: "claude-sonnet-4-20250514", costUsd: 0.06 });
  m("session-8", "agent-2", "user", 114, "Write comprehensive unit tests for the cost calculation module including edge cases.");
  m("session-1", "agent-1", "tool", 113, "File written: src/lib/types.ts (78 lines)", { toolName: "write" });
  m("session-8", "agent-2", "assistant", 112, "I'll write thorough unit tests for cost calculations. Let me first examine the module.", { model: "claude-haiku-4-20250506", costUsd: 0.02 });
  m("session-3", "agent-3", "tool", 111, 'export interface Agent {\n  id: string;\n  name: string;\n  status: AgentStatus;\n  ...', { toolName: "read" });
  m("session-3", "agent-3", "assistant", 110, "The type definitions look solid. I'd suggest adding a `duration` field to Session for better analytics. Also, the cost tracking should support per-model breakdown.", { model: "claude-haiku-4-20250506", costUsd: 0.02 });
  m("session-1", "agent-1", "assistant", 108, "Good point from the review. I'll add duration tracking and per-model cost breakdown. Now creating the mock data layer.", { model: "claude-sonnet-4-20250514", costUsd: 0.05 });
  m("session-8", "agent-2", "tool", 107, "export function calculateCost(tokens: number, model: string): number { ... }", { toolName: "read" });
  m("session-1", "agent-1", "tool", 105, "File written: src/lib/mock-data.ts (280 lines)", { toolName: "write" });
  m("session-8", "agent-2", "assistant", 104, "Found the cost module. I'll test standard pricing, cache discount calculations, multi-model sessions, and zero-token edge cases.", { model: "claude-haiku-4-20250506", costUsd: 0.03 });
  m("session-1", "agent-1", "system", 103, "Context window: 45% utilized (90K/200K tokens)");
  m("session-8", "agent-2", "tool", 102, "File written: src/__tests__/cost-calculation.test.ts (156 lines)", { toolName: "write" });
  m("session-1", "agent-1", "assistant", 100, "Mock data created. Now building the dashboard page with agent cards, alert banners, and cost overview.", { model: "claude-sonnet-4-20250514", costUsd: 0.12 });
  m("session-3", "agent-3", "user", 98, "Can you also review the API layer and check for error handling gaps?");
  m("session-1", "agent-1", "tool", 95, "File written: src/app/dashboard/page.tsx (320 lines)", { toolName: "write" });
  m("session-8", "agent-2", "assistant", 94, "All 12 test cases pass. Found one edge case where negative token counts could cause issues — adding a guard.", { model: "claude-haiku-4-20250506", costUsd: 0.02 });
  m("session-3", "agent-3", "assistant", 92, "Reviewing API layer. The fetchJson wrapper needs better error handling — currently swallows network errors. I'll suggest adding retry logic and timeout handling.", { model: "claude-haiku-4-20250506", costUsd: 0.03 });
  m("session-8", "agent-2", "tool", 90, "$ npm test -- --watchAll=false\n\nTest Suites: 1 passed, 1 total\nTests: 14 passed, 14 total\nTime: 2.834s", { toolName: "exec" });
  m("session-1", "agent-1", "assistant", 88, "Dashboard page done. Adding real-time polling with 5-second intervals and the tabbed interface for Agents/Sessions views.", { model: "claude-sonnet-4-20250514", costUsd: 0.08 });
  m("session-1", "agent-1", "tool", 85, "$ npm run build\n\n ✓ Compiled successfully\n ✓ Generating static pages (5/5)\n\nBuild completed in 8.2s", { toolName: "exec" });
  m("session-3", "agent-3", "assistant", 83, "Here's my review summary:\n1. Add retry logic to fetchJson (3 retries with exponential backoff)\n2. Add request timeout (30s default)\n3. The mock fallback pattern is good but should log errors to a monitoring service\n4. Consider adding request deduplication for concurrent calls", { model: "claude-haiku-4-20250506", costUsd: 0.04 });
  m("session-1", "agent-1", "user", 80, "Add session detail view with message timeline, cost breakdown by model, and token analysis.");
  m("session-1", "agent-1", "assistant", 78, "I'll build the session detail page with a full message timeline. Each message type will have distinct visual treatment.", { model: "claude-sonnet-4-20250514", costUsd: 0.09 });
  m("session-1", "agent-1", "tool", 75, "File written: src/app/dashboard/sessions/[id]/page.tsx (340 lines)", { toolName: "write" });
  m("session-8", "agent-2", "assistant", 72, "All tests passing. Adding integration tests for the API mock fallback pattern now.", { model: "claude-haiku-4-20250506", costUsd: 0.02 });
  m("session-1", "agent-1", "assistant", 70, "Session detail page complete with:\n- Message timeline with user/assistant/tool/system styling\n- Cost breakdown by model with progress bars\n- Token breakdown (input/output/cache read/cache write)\n- Collapsible tool outputs", { model: "claude-sonnet-4-20250514", costUsd: 0.06 });
  m("session-1", "agent-1", "system", 68, "Context window: 72% utilized (144K/200K tokens)");
  m("session-1", "agent-1", "tool", 65, "$ npm run build\n\n ✓ Compiled successfully\n ✓ Generating static pages (7/7)\n\nBuild completed in 9.1s", { toolName: "exec" });
  m("session-1", "agent-1", "assistant", 60, "Build passes. The ClaWatch dashboard is fully functional with real-time monitoring, session tracking, and cost analytics.", { model: "claude-sonnet-4-20250514", costUsd: 0.04 });

  return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

const mockTimeline = buildMockTimeline();

// Generate project details from DEMO_PROJECTS
export const mockProjectDetails: Record<string, ProjectDetail> = Object.fromEntries(
  DEMO_PROJECTS.map((proj, pi) => {
    const cost = +proj.cost.toFixed(2);
    const tokens = Math.floor(DEMO_TOTALS.tokens.allTime * proj.pct);
    // Assign 2-3 agents per project (rotating through DEMO_AGENTS)
    const projAgents = [
      DEMO_AGENTS[pi % 8],
      DEMO_AGENTS[(pi + 1) % 8],
      DEMO_AGENTS[(pi + 3) % 8],
    ];
    const agentPcts = [0.50, 0.30, 0.20];

    return [proj.id, {
      id: proj.id,
      name: proj.name,
      description: mockProjects[pi]?.description || proj.name,
      stats: {
        totalCostUsd: cost,
        totalTokens: tokens,
        totalMessages: 40 + pi * 20,
        sessionCount: 3 + pi,
        dateRange: { from: hoursAgo(48 + pi * 24), to: minutesAgo(5 + pi * 15) },
      },
      agentBreakdown: projAgents.map((a, ai) => ({
        agentId: a.id,
        costUsd: +(cost * agentPcts[ai]).toFixed(2),
        tokenCount: Math.floor(tokens * agentPcts[ai]),
        messageCount: Math.floor((40 + pi * 20) * agentPcts[ai]),
        percentage: agentPcts[ai] * 100,
      })),
      sessions: mockSessions.filter((_, si) => si % DEMO_PROJECTS.length === pi).slice(0, 3),
      timeline: pi === 0 ? mockTimeline : [],
    }];
  })
);function buildMockMessages(sessionId: string): SessionMessage[] {
  const base = [
    {
      id: `${sessionId}-msg-1`,
      role: "user" as const,
      timestamp: minutesAgo(44),
      content: "Build the ClaWatch dashboard with real-time alert monitoring. Use Next.js 15 with shadcn/ui components.",
    },
    {
      id: `${sessionId}-msg-2`,
      role: "assistant" as const,
      timestamp: minutesAgo(43),
      content: "I'll build the ClaWatch dashboard. Let me start by examining the project structure and existing code.",
      model: "claude-sonnet-4-20250514",
      costUsd: 0.03,
      tokenCount: 12_400,
    },
    {
      id: `${sessionId}-msg-3`,
      role: "tool" as const,
      timestamp: minutesAgo(43),
      content: "src/\n  app/\n    dashboard/\n      page.tsx\n    layout.tsx\n    page.tsx\n  components/\n    ui/\n  lib/\n    types.ts\n    api.ts\n    mock-data.ts",
      toolName: "read",
      toolInput: '{"path": "src/"}',
    },
    {
      id: `${sessionId}-msg-4`,
      role: "assistant" as const,
      timestamp: minutesAgo(42),
      content: "I can see the project structure. Let me read the existing types and API files to understand the data model.",
      model: "claude-sonnet-4-20250514",
      costUsd: 0.02,
      tokenCount: 8_200,
    },
    {
      id: `${sessionId}-msg-5`,
      role: "tool" as const,
      timestamp: minutesAgo(42),
      content: 'export type AgentStatus = "running" | "paused" | "stopped" | "error" | "stuck";\n\nexport interface Agent {\n  id: string;\n  name: string;\n  ...',
      toolName: "read",
      toolInput: '{"path": "src/lib/types.ts"}',
    },
    {
      id: `${sessionId}-msg-6`,
      role: "assistant" as const,
      timestamp: minutesAgo(40),
      content: "Now I'll create the dashboard page with agent cards, alert banners, and cost overview panels. I'll use the existing shadcn/ui components.",
      model: "claude-sonnet-4-20250514",
      costUsd: 0.08,
      tokenCount: 34_600,
    },
    {
      id: `${sessionId}-msg-7`,
      role: "tool" as const,
      timestamp: minutesAgo(39),
      content: "File written: src/app/dashboard/page.tsx (358 lines)",
      toolName: "write",
      toolInput: '{"path": "src/app/dashboard/page.tsx", "content": "..."}',
    },
    {
      id: `${sessionId}-msg-8`,
      role: "tool" as const,
      timestamp: minutesAgo(38),
      content: "$ npm run build\n\n ✓ Compiled successfully\n ✓ Collecting page data\n ✓ Generating static pages (5/5)\n ✓ Collecting build traces\n\nRoute (app)                 Size     First Load JS\n├ ○ /                       5.2 kB   92.1 kB\n└ ○ /dashboard              12.4 kB  99.3 kB",
      toolName: "exec",
      toolInput: '{"command": "npm run build"}',
    },
    {
      id: `${sessionId}-msg-9`,
      role: "assistant" as const,
      timestamp: minutesAgo(37),
      content: "The build succeeded. Let me now add the real-time polling mechanism and alert notification sounds.",
      model: "claude-sonnet-4-20250514",
      costUsd: 0.04,
      tokenCount: 15_800,
    },
    {
      id: `${sessionId}-msg-10`,
      role: "tool" as const,
      timestamp: minutesAgo(36),
      content: "Lines 49-64 edited in src/app/dashboard/page.tsx",
      toolName: "edit",
      toolInput: '{"path": "src/app/dashboard/page.tsx", "old_string": "...", "new_string": "..."}',
    },
    {
      id: `${sessionId}-msg-11`,
      role: "user" as const,
      timestamp: minutesAgo(35),
      content: "Can you also add a cost breakdown by model? Show it as horizontal progress bars.",
    },
    {
      id: `${sessionId}-msg-12`,
      role: "assistant" as const,
      timestamp: minutesAgo(34),
      content: "Sure! I'll add a cost breakdown section with progress bars for each model. Let me update the dashboard.",
      model: "claude-sonnet-4-20250514",
      costUsd: 0.06,
      tokenCount: 24_200,
    },
    {
      id: `${sessionId}-msg-13`,
      role: "tool" as const,
      timestamp: minutesAgo(33),
      content: "Lines 254-305 edited in src/app/dashboard/page.tsx",
      toolName: "edit",
      toolInput: '{"path": "src/app/dashboard/page.tsx", "old_string": "...", "new_string": "..."}',
    },
    {
      id: `${sessionId}-msg-14`,
      role: "system" as const,
      timestamp: minutesAgo(32),
      content: "Context window: 78% utilized (156K/200K tokens)",
    },
    {
      id: `${sessionId}-msg-15`,
      role: "assistant" as const,
      timestamp: minutesAgo(31),
      content: "I've added the cost breakdown panels. The dashboard now shows:\n\n1. **Agent cards** with status, cost, tokens, errors, and heartbeat\n2. **Alert banner** for critical/warning alerts\n3. **Cost by Agent** — horizontal progress bars\n4. **Cost by Model** — horizontal progress bars\n\nThe data refreshes every 5 seconds via polling.",
      model: "claude-sonnet-4-20250514",
      costUsd: 0.05,
      tokenCount: 18_900,
    },
    {
      id: `${sessionId}-msg-16`,
      role: "tool" as const,
      timestamp: minutesAgo(30),
      content: '{"results": [{"title": "shadcn/ui Tabs Component", "url": "https://ui.shadcn.com/docs/components/tabs"}]}',
      toolName: "web_search",
      toolInput: '{"query": "shadcn ui tabs component usage"}',
    },
    {
      id: `${sessionId}-msg-17`,
      role: "assistant" as const,
      timestamp: minutesAgo(28),
      content: "Let me add a tabbed interface for Agents and Sessions views. I'll implement the tabs using a simple state-based approach.",
      model: "claude-sonnet-4-20250514",
      costUsd: 0.11,
      tokenCount: 45_200,
    },
    {
      id: `${sessionId}-msg-18`,
      role: "tool" as const,
      timestamp: minutesAgo(27),
      content: "$ npm run build\n\n ✓ Compiled successfully\n ✓ Linting and checking validity of types\n ✓ Generating static pages (5/5)\n\nBuild completed in 8.2s",
      toolName: "exec",
      toolInput: '{"command": "npm run build"}',
    },
    {
      id: `${sessionId}-msg-19`,
      role: "assistant" as const,
      timestamp: minutesAgo(25),
      content: "Build passes. The dashboard now has Agents and Sessions tabs with full filtering and sorting. All existing functionality is preserved.",
      model: "claude-sonnet-4-20250514",
      costUsd: 0.03,
      tokenCount: 11_600,
    },
    {
      id: `${sessionId}-msg-20`,
      role: "tool" as const,
      timestamp: minutesAgo(24),
      content: "$ npm test -- --watchAll=false\n\nTest Suites: 3 passed, 3 total\nTests:       12 passed, 12 total\nTime:        4.231s",
      toolName: "exec",
      toolInput: '{"command": "npm test -- --watchAll=false"}',
    },
  ];
  return base;
}

export const mockSessionDetails: Record<string, SessionDetail> = {};

for (const session of mockSessions) {
  mockSessionDetails[session.id] = {
    ...session,
    costByModel: session.model.includes("sonnet")
      ? [
          { model: "claude-sonnet-4-20250514", costUsd: session.costUsd * 0.82, tokenCount: Math.floor(session.tokenCount * 0.75) },
          { model: "claude-haiku-4-20250506", costUsd: session.costUsd * 0.18, tokenCount: Math.floor(session.tokenCount * 0.25) },
        ]
      : [
          { model: "claude-haiku-4-20250506", costUsd: session.costUsd * 0.65, tokenCount: Math.floor(session.tokenCount * 0.6) },
          { model: "claude-sonnet-4-20250514", costUsd: session.costUsd * 0.35, tokenCount: Math.floor(session.tokenCount * 0.4) },
        ],
    tokenBreakdown: {
      input: Math.floor(session.tokenCount * 0.35),
      output: Math.floor(session.tokenCount * 0.30),
      cacheRead: Math.floor(session.tokenCount * 0.25),
      cacheWrite: Math.floor(session.tokenCount * 0.10),
    },
    messages: buildMockMessages(session.id),
  };
}

export const mockAlertDetails: Record<string, AlertDetails> = {
  "alert-1": {
    alert: mockAlerts[0],
    agent: { id: "agent-4", name: "customer-support", status: "stuck" },
    relatedErrors: [],
    context: { lastHeartbeat: minutesAgo(45), stuckDurationMinutes: 45, agentStatus: "stuck" },
  },
  "alert-2": {
    alert: mockAlerts[1],
    agent: { id: "agent-3", name: "data-pipeline", status: "error" },
    relatedErrors: [
      { timestamp: minutesAgo(12), error: "TypeError: Cannot read properties of undefined (reading 'map')" },
      { timestamp: minutesAgo(11), error: "ECONNREFUSED: Connection refused to database at 127.0.0.1:5432" },
      { timestamp: minutesAgo(11), error: "ECONNREFUSED: Connection refused to database at 127.0.0.1:5432" },
      { timestamp: minutesAgo(10), error: "Unhandled promise rejection: Query timeout after 30000ms" },
      { timestamp: minutesAgo(10), error: "FATAL: too many connections for role \"app_user\"" },
    ],
  },
  "alert-3": {
    alert: mockAlerts[2],
    agent: { id: "agent-4", name: "customer-support", status: "running" },
    relatedErrors: [],
    context: { currentCostUsd: 12.67, thresholdUsd: 10, overage: 2.67 },
  },
  "alert-4": {
    alert: mockAlerts[3],
    agent: { id: "agent-8", name: "slack-responder", status: "running" },
    relatedErrors: [
      { timestamp: minutesAgo(32), error: "Detected 5 consecutive similar outputs — possible retry loop" },
      { timestamp: minutesAgo(31), error: "Output similarity score: 0.94 (threshold: 0.85)" },
    ],
  },
  "alert-5": {
    alert: mockAlerts[4],
    agent: { id: "agent-2", name: "deploy-bot", status: "running" },
    relatedErrors: [
      { timestamp: hoursAgo(3), error: "API returned 503 Service Unavailable — auto-retried successfully" },
    ],
  },
};
