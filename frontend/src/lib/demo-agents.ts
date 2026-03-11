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
    spend: { today: 24.82, mtd: 168.50, allTime: 482.30 },
    tokens: { today: 620_000, mtd: 4_200_000, allTime: 12_050_000 },
    errorCount: 0,
    lastHeartbeatMinutesAgo: 0.5,
  },
  {
    id: "agent-2",
    name: "deploy-bot",
    host: "prod-us-east-1",
    status: "running",
    spend: { today: 12.15, mtd: 85.20, allTime: 315.40 },
    tokens: { today: 320_000, mtd: 2_130_000, allTime: 7_880_000 },
    errorCount: 1,
    lastHeartbeatMinutesAgo: 1,
  },
  {
    id: "agent-3",
    name: "data-pipeline",
    host: "prod-eu-west-1",
    status: "error",
    spend: { today: 18.43, mtd: 142.80, allTime: 543.20 },
    tokens: { today: 490_000, mtd: 3_570_000, allTime: 13_580_000 },
    errorCount: 7,
    lastHeartbeatMinutesAgo: 12,
  },
  {
    id: "agent-4",
    name: "customer-support",
    host: "prod-us-west-2",
    status: "stuck",
    spend: { today: 22.67, mtd: 156.30, allTime: 467.90 },
    tokens: { today: 570_000, mtd: 3_910_000, allTime: 11_700_000 },
    errorCount: 3,
    lastHeartbeatMinutesAgo: 45,
  },
  {
    id: "agent-5",
    name: "test-runner",
    host: "staging-1",
    status: "paused",
    spend: { today: 1.03, mtd: 8.40, allTime: 28.60 },
    tokens: { today: 28_000, mtd: 210_000, allTime: 715_000 },
    errorCount: 0,
    lastHeartbeatMinutesAgo: 120,
  },
  {
    id: "agent-6",
    name: "doc-generator",
    host: "prod-us-east-1",
    status: "running",
    spend: { today: 8.21, mtd: 62.50, allTime: 224.80 },
    tokens: { today: 220_000, mtd: 1_560_000, allTime: 5_620_000 },
    errorCount: 0,
    lastHeartbeatMinutesAgo: 0.2,
  },
  {
    id: "agent-7",
    name: "security-scanner",
    host: "prod-eu-west-1",
    status: "stopped",
    spend: { today: 0.45, mtd: 4.20, allTime: 18.90 },
    tokens: { today: 12_000, mtd: 105_000, allTime: 472_000 },
    errorCount: 0,
    lastHeartbeatMinutesAgo: 360,
  },
  {
    id: "agent-8",
    name: "slack-responder",
    host: "prod-us-west-2",
    status: "running",
    spend: { today: 16.89, mtd: 114.40, allTime: 361.47 },
    tokens: { today: 445_000, mtd: 2_860_000, allTime: 9_035_000 },
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

// Model distribution (claude-sonnet: 65%, haiku: 25%, gpt-4o: 10%)
export const DEMO_MODELS = {
  byModel: [
    { model: "claude-sonnet-4-20250514", costUsd: +(DEMO_TOTALS.allTime * 0.65).toFixed(2) },
    { model: "claude-haiku-4-20250506", costUsd: +(DEMO_TOTALS.allTime * 0.25).toFixed(2) },
    { model: "gpt-4o", costUsd: +(DEMO_TOTALS.allTime * 0.10).toFixed(2) },
  ],
};
