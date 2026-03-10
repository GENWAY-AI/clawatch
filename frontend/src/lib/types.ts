export type AgentStatus = "running" | "active" | "idle" | "paused" | "stopped" | "error" | "stuck";

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

export interface AlertRelatedError {
  timestamp: string;
  error: string;
  raw?: Record<string, unknown>;
}

export interface AlertDetailsContext {
  // stuck alerts
  lastHeartbeat?: string;
  stuckDurationMinutes?: number;
  agentStatus?: string;
  // cost_spike alerts
  currentCostUsd?: number;
  thresholdUsd?: number;
  overage?: number;
}

export interface AlertDetails {
  alert: Alert;
  agent: { id: string; name: string; status: string };
  relatedErrors: AlertRelatedError[];
  context?: AlertDetailsContext;
  title?: string;
  description?: string;
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
  profile?: string;
  projects?: Array<{ id: string; name: string }>;
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

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
  totalCostUsd: number;
  firstActivityAt?: string;
  lastActivityAt?: string;
  durationMs?: number;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string;
  stats: {
    totalCostUsd: number;
    totalTokens: number;
    totalMessages: number;
    sessionCount: number;
    dateRange: { from: string; to: string };
  };
  agentBreakdown: {
    agentId: string;
    costUsd: number;
    tokenCount: number;
    messageCount: number;
    percentage: number;
  }[];
  sessions: Session[];
  timeline: TimelineMessage[];
}

export interface AlertsResponse {
  alerts: Alert[];
  total: number;
}

export interface Profile {
  id: string;
  name: string;
  dir: string;
}

export interface TimelineMessage {
  sessionId: string;
  agentId: string;
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  timestamp: string;
  content: string;
  toolName?: string;
  model?: string;
  costUsd?: number;
}
