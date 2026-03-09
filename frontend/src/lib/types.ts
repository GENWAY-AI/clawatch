export type AgentStatus = "running" | "paused" | "stopped" | "error" | "stuck";

export type AlertType = "stuck" | "error" | "cost_spike" | "loop_detected";

export type AlertSeverity = "critical" | "warning" | "info";

export interface Agent {
  id: string;
  name: string;
  host: string;
  status: AgentStatus;
  lastHeartbeat: string;
  costUsd: number;
  tokenCount: number;
  errorCount: number;
}

export interface AgentDetail extends Agent {
  recentEvents: AgentEvent[];
}

export interface AgentEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export interface Alert {
  id: string;
  agentId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface CostData {
  totalUsd: number;
  byAgent: { agentId: string; name: string; costUsd: number }[];
  byModel: { model: string; costUsd: number }[];
}

export type SessionStatus = "active" | "idle" | "completed";

export interface Session {
  id: string;
  agentId: string;
  title: string;
  status: SessionStatus;
  costUsd: number;
  tokenCount: number;
  messageCount: number;
  model: string;
  startedAt: string;
  lastActivityAt: string;
  duration: number;
}

export interface SessionDetail extends Session {
  costByModel: { model: string; costUsd: number; tokenCount: number }[];
  tokenBreakdown: { input: number; output: number; cacheRead: number; cacheWrite: number };
  messages: SessionMessage[];
}

export interface SessionMessage {
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
