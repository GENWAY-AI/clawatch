/**
 * Single source of truth for demo data
 * All mock data derives from these agents to ensure consistency
 */

export interface DemoAgent {
  id: string;
  name: string;
  host: string;
  status: "running" | "paused" | "stopped" | "error" | "stuck";
  spend: {
    today: number;
    mtd: number;
    allTime: number;
  };
  tokens: {
    today: number;
    mtd: number;
    allTime: number;
  };
  errorCount: number;
  lastHeartbeatMinutesAgo: number;
}

export const DEMO_AGENTS: DemoAgent[] = [
  {
    id: "agent-1",
    name: "code-reviewer",
    host: "prod-us-east-1",
    status: "running",
    spend: { today: 24.82, mtd: 128.50, allTime: 364.00 },
    tokens: { today: 620_000, mtd: 3_200_000, allTime: 9_100_000 },
    errorCount: 0,
    lastHeartbeatMinutesAgo: 0.5,
  },
  {
    id: "agent-2",
    name: "deploy-bot",
    host: "prod-us-east-1",
    status: "running",
    spend: { today: 12.15, mtd: 64.20, allTime: 238.00 },
    tokens: { today: 320_000, mtd: 1_600_000, allTime: 5_950_000 },
    errorCount: 1,
    lastHeartbeatMinutesAgo: 1,
  },
  {
    id: "agent-3",
    name: "data-pipeline",
    host: "prod-eu-west-1",
    status: "error",
    spend: { today: 18.43, mtd: 108.80, allTime: 410.00 },
    tokens: { today: 490_000, mtd: 2_720_000, allTime: 10_250_000 },
    errorCount: 7,
    lastHeartbeatMinutesAgo: 12,
  },
  {
    id: "agent-4",
    name: "customer-support",
    host: "prod-us-west-2",
    status: "stuck",
    spend: { today: 22.67, mtd: 118.30, allTime: 353.00 },
    tokens: { today: 570_000, mtd: 2_960_000, allTime: 8_825_000 },
    errorCount: 3,
    lastHeartbeatMinutesAgo: 45,
  },
  {
    id: "agent-5",
    name: "test-runner",
    host: "staging-1",
    status: "paused",
    spend: { today: 1.03, mtd: 6.40, allTime: 22.00 },
    tokens: { today: 28_000, mtd: 160_000, allTime: 550_000 },
    errorCount: 0,
    lastHeartbeatMinutesAgo: 120,
  },
  {
    id: "agent-6",
    name: "doc-generator",
    host: "prod-us-east-1",
    status: "running",
    spend: { today: 8.21, mtd: 47.50, allTime: 170.00 },
    tokens: { today: 220_000, mtd: 1_190_000, allTime: 4_250_000 },
    errorCount: 0,
    lastHeartbeatMinutesAgo: 0.2,
  },
  {
    id: "agent-7",
    name: "security-scanner",
    host: "prod-eu-west-1",
    status: "stopped",
    spend: { today: 0.45, mtd: 3.20, allTime: 14.00 },
    tokens: { today: 12_000, mtd: 80_000, allTime: 350_000 },
    errorCount: 0,
    lastHeartbeatMinutesAgo: 360,
  },
  {
    id: "agent-8",
    name: "slack-responder",
    host: "prod-us-west-2",
    status: "running",
    spend: { today: 16.89, mtd: 86.40, allTime: 271.57 },
    tokens: { today: 445_000, mtd: 2_160_000, allTime: 6_775_000 },
    errorCount: 2,
    lastHeartbeatMinutesAgo: 0.1,
  },
];

// Calculated totals
export const DEMO_TOTALS = {
  today: DEMO_AGENTS.reduce((sum, a) => sum + a.spend.today, 0),
  mtd: DEMO_AGENTS.reduce((sum, a) => sum + a.spend.mtd, 0),
  allTime: DEMO_AGENTS.reduce((sum, a) => sum + a.spend.allTime, 0),
  tokens: {
    today: DEMO_AGENTS.reduce((sum, a) => sum + a.tokens.today, 0),
    mtd: DEMO_AGENTS.reduce((sum, a) => sum + a.tokens.mtd, 0),
    allTime: DEMO_AGENTS.reduce((sum, a) => sum + a.tokens.allTime, 0),
  },
};

// Projects — costs sum to allTime total
// Projects sum to $1,842.00
export const DEMO_PROJECTS = [
  { id: "proj-1", name: "ClaWatch", cost: 300.00 },
  { id: "proj-2", name: "Customer Support Bot", cost: 342.00 },
  { id: "proj-3", name: "Sales Pipeline Automation", cost: 285.00 },
  { id: "proj-4", name: "Code Review Assistant", cost: 320.00 },
  { id: "proj-5", name: "Documentation Generator", cost: 380.00 },
  { id: "proj-6", name: "Slack Integration", cost: 215.57 },
].map(p => ({ ...p, pct: p.cost / DEMO_TOTALS.allTime }));

// Model distribution (claude-sonnet: 65%, haiku: 25%, gpt-4o: 10%)
export const DEMO_MODELS = {
  byModel: [
    { model: "claude-sonnet-4-20250514", costUsd: +(DEMO_TOTALS.allTime * 0.65).toFixed(2) },
    { model: "claude-haiku-4-20250506", costUsd: +(DEMO_TOTALS.allTime * 0.25).toFixed(2) },
    { model: "gpt-4o", costUsd: +(DEMO_TOTALS.allTime * 0.10).toFixed(2) },
  ],
};
