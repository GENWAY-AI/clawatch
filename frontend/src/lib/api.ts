import { Agent, Alert, AlertDetails, AlertsResponse, AlertSeverity, CostData, Session, SessionDetail, Project, ProjectDetail, Profile, AnalyticsData, SpendData, CostLimits } from "./types";
import { mockAgents, mockAlerts, mockCosts, mockSessions, mockSessionDetails, mockProjects, mockProjectDetails, mockAlertDetails } from "./mock-data";
import { DEMO_AGENTS, DEMO_TOTALS } from "./demo-agents";

// API_BASE: In the npm CLI, both frontend and API run on different ports.
// The frontend server proxies /api/* to the backend, so we use relative URLs.
// If NEXT_PUBLIC_API_URL is set (e.g. for hosted deployment), use that instead.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
// Use real API by default (mock only if NEXT_PUBLIC_USE_MOCK=true)
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

// Track whether we're showing demo/mock data
let _usingMockData = USE_MOCK;
export function isUsingMockData(): boolean { return _usingMockData; }
function markMockFallback() { _usingMockData = true; }

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    ...(API_KEY ? { "X-ClaWatch-Key": API_KEY } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getProfiles(): Promise<Profile[]> {
  if (USE_MOCK) return [];
  try {
    const data = await fetchJson<{ profiles: Profile[] }>("/api/profiles");
    return data.profiles;
  } catch {
    console.warn("API unreachable, skipping profiles");
    return [];
  }
}

export async function getVersion(): Promise<string | null> {
  // Always fetch version from API (even in demo mode)
  try {
    const data = await fetchJson<{ version: string }>("/api/version");
    return data.version;
  } catch {
    console.warn("API unreachable, skipping version");
    return null;
  }
}

export async function getAgents(status?: string, profile?: string): Promise<Agent[]> {
  if (USE_MOCK) return mockAgents;
  try {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (profile) params.set("profile", profile);
    const qs = params.toString();
    const data = await fetchJson<{ agents: Agent[] }>(`/api/agents${qs ? `?${qs}` : ""}`);
    return data.agents;
  } catch {
    console.warn("API unreachable, falling back to mock data"); markMockFallback();
    return mockAgents;
  }
}

export async function getAlerts(params?: {
  limit?: number;
  offset?: number;
  severity?: AlertSeverity;
  acknowledged?: boolean;
  profile?: string;
}): Promise<AlertsResponse> {
  if (USE_MOCK) {
    let filtered = [...mockAlerts];
    if (params?.severity) filtered = filtered.filter((a) => a.severity === params.severity);
    if (params?.acknowledged !== undefined) filtered = filtered.filter((a) => a.acknowledged === params.acknowledged);
    const total = filtered.length;
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? filtered.length;
    return { alerts: filtered.slice(offset, offset + limit), total };
  }
  try {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    if (params?.severity) qs.set("severity", params.severity);
    if (params?.acknowledged !== undefined) qs.set("acknowledged", String(params.acknowledged));
    if (params?.profile) qs.set("profile", params.profile);
    const query = qs.toString();
    return await fetchJson<AlertsResponse>(`/api/alerts${query ? `?${query}` : ""}`);
  } catch {
    console.warn("API unreachable, falling back to mock data"); markMockFallback();
    return { alerts: mockAlerts, total: mockAlerts.length };
  }
}

export async function acknowledgeAllAlerts(severity?: AlertSeverity): Promise<{ ok: boolean; count: number }> {
  if (USE_MOCK) return { ok: true, count: 0 };
  return await fetchJson<{ ok: boolean; count: number }>(
    `/api/alerts/acknowledge-all${severity ? `?severity=${severity}` : ""}`,
    { method: "POST" }
  );
}

export async function getCosts(params?: { profile?: string; from?: string; to?: string }): Promise<CostData> {
  if (USE_MOCK) return mockCosts;
  try {
    const qs = new URLSearchParams();
    if (params?.profile) qs.set("profile", params.profile);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const query = qs.toString();
    return await fetchJson<CostData>(`/api/costs${query ? `?${query}` : ""}`);
  } catch {
    console.warn("API unreachable, falling back to mock data"); markMockFallback();
    return mockCosts;
  }
}


export async function pauseAgent(id: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/agents/${id}/pause`, { method: "POST" });
}

export async function resumeAgent(id: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/agents/${id}/resume`, { method: "POST" });
}

export async function acknowledgeAlert(id: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/alerts/${id}/acknowledge`, { method: "POST" });
}

export async function getAlertDetails(id: string): Promise<AlertDetails> {
  if (USE_MOCK) {
    const detail = mockAlertDetails[id];
    if (detail) return detail;
    throw new Error("Alert not found");
  }
  try {
    return await fetchJson<AlertDetails>(`/api/alerts/${id}/details`);
  } catch {
    console.warn("API unreachable, falling back to mock data"); markMockFallback();
    const detail = mockAlertDetails[id];
    if (detail) return detail;
    throw new Error("Alert not found");
  }
}

export interface SessionsResponse {
  sessions: Session[];
  total: number;
}

export async function getSessions(opts?: {
  agentId?: string;
  status?: string;
  sort?: string;
  profile?: string;
  limit?: number;
  offset?: number;
}): Promise<SessionsResponse> {
  const { agentId, status, sort, profile, limit, offset } = opts || {};
  if (USE_MOCK) {
    let sessions = [...mockSessions];
    if (agentId) sessions = sessions.filter((s) => s.agentId === agentId);
    if (status && status !== "all") sessions = sessions.filter((s) => s.status === status);
    if (sort === "cost") sessions.sort((a, b) => b.costUsd - a.costUsd);
    else if (sort === "tokens") sessions.sort((a, b) => b.tokenCount - a.tokenCount);
    else sessions.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
    const total = sessions.length;
    const start = offset || 0;
    const end = limit ? start + limit : sessions.length;
    return { sessions: sessions.slice(start, end), total };
  }
  try {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));
    if (agentId) params.set("agentId", agentId);
    if (status) params.set("status", status);
    if (sort) params.set("sort", sort);
    if (profile) params.set("profile", profile);
    const qs = params.toString();
    const data = await fetchJson<{ sessions: Session[]; total: number }>(`/api/sessions${qs ? `?${qs}` : ""}`);
    return { sessions: data.sessions, total: data.total };
  } catch {
    console.warn("API unreachable, falling back to mock data"); markMockFallback();
    return { sessions: mockSessions, total: mockSessions.length };
  }
}

export async function getSession(id: string): Promise<SessionDetail> {
  if (USE_MOCK) {
    const detail = mockSessionDetails[id];
    if (detail) return detail;
    throw new Error("Session not found");
  }
  try {
    return await fetchJson<SessionDetail>(`/api/sessions/${id}`);
  } catch {
    console.warn("API unreachable, falling back to mock data"); markMockFallback();
    const detail = mockSessionDetails[id];
    if (detail) return detail;
    throw new Error("Session not found");
  }
}

export async function getProjects(profile?: string): Promise<Project[]> {
  if (USE_MOCK) return mockProjects;
  try {
    const qs = profile ? `?profile=${profile}` : "";
    const data = await fetchJson<{ projects: Project[] }>(`/api/projects${qs}`);
    return data.projects;
  } catch {
    console.warn("API unreachable, falling back to mock data"); markMockFallback();
    return mockProjects;
  }
}

export async function getProject(id: string): Promise<ProjectDetail> {
  if (USE_MOCK) {
    const detail = mockProjectDetails[id];
    if (detail) return detail;
    throw new Error("Project not found");
  }
  try {
    return await fetchJson<ProjectDetail>(`/api/projects/${id}`);
  } catch {
    console.warn("API unreachable, falling back to mock data"); markMockFallback();
    const detail = mockProjectDetails[id];
    if (detail) return detail;
    throw new Error("Project not found");
  }
}

export async function createProject(name: string, description: string): Promise<Project> {
  if (USE_MOCK) {
    return {
      id: `project-${Date.now()}`,
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionCount: 0,
      totalCostUsd: 0,
    };
  }
  return await fetchJson<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export async function addSessionToProject(projectId: string, sessionId: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/projects/${projectId}/sessions`, {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function removeSessionFromProject(projectId: string, sessionId: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/projects/${projectId}/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function setSessionProjects(sessionId: string, projectIds: string[]): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/sessions/${sessionId}/projects`, {
    method: "PUT",
    body: JSON.stringify({ projectIds }),
  });
}

export async function removeSessionProject(sessionId: string, projectId: string): Promise<void> {
  if (USE_MOCK) return;
  await fetchJson(`/api/sessions/${sessionId}/projects/${projectId}`, {
    method: "DELETE",
  });
}

// Analytics mock — all derived from DEMO_TOTALS, no Math.random()
const mockAnalytics: AnalyticsData = (() => {
  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date("2026-02-24");
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  // Fixed daily weights — deterministic, sums to ~1.0
  const w = [0.06, 0.07, 0.065, 0.08, 0.072, 0.068, 0.075, 0.073, 0.071, 0.082, 0.069, 0.076, 0.074, 0.065];
  const wTotal = w.reduce((s, v) => s + v, 0);

  // Total buckets — each day is a fraction of allTime
  const buckets = dates.map((date, i) => {
    const pct = w[i] / wTotal;
    return {
      date,
      costUsd: +(DEMO_TOTALS.allTime * pct).toFixed(2),
      tokenCount: Math.floor(DEMO_TOTALS.tokens.allTime * pct),
      sessionCount: 3 + (i % 5),
    };
  });

  // Per-agent — each agent's allTime distributed across days
  const byAgent = DEMO_AGENTS.filter(a => a.spend.allTime > 50).map((agent) => ({
    agentId: agent.name,
    buckets: dates.map((date, i) => {
      const pct = w[i] / wTotal;
      return {
        date,
        costUsd: +(agent.spend.allTime * pct).toFixed(2),
        tokenCount: Math.floor(agent.tokens.allTime * pct),
        sessionCount: 1 + (i % 3),
      };
    }),
  }));

  // Per-project — 45/32/23% split of allTime across days
  const projSplits = [
    { projectId: "proj-1", name: "ClaWatch", pct: 0.45 },
    { projectId: "proj-2", name: "Auth Service", pct: 0.32 },
    { projectId: "proj-3", name: "Mobile App", pct: 0.23 },
  ];
  const byProject = projSplits.map(({ projectId, name, pct }) => ({
    projectId,
    name,
    buckets: dates.map((date, i) => {
      const dayPct = w[i] / wTotal;
      return {
        date,
        costUsd: +(DEMO_TOTALS.allTime * pct * dayPct).toFixed(2),
        tokenCount: Math.floor(DEMO_TOTALS.tokens.allTime * pct * dayPct),
        sessionCount: 1 + (i % 3),
      };
    }),
  }));

  return { buckets, byAgent, byProject };
})();

export async function getAnalytics(params: {
  profile?: string;
  groupBy?: string;
  from?: string;
  to?: string;
}): Promise<AnalyticsData> {
  if (USE_MOCK) return mockAnalytics;
  try {
    const qs = new URLSearchParams();
    if (params.profile) qs.set("profile", params.profile);
    if (params.groupBy) qs.set("groupBy", params.groupBy);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const query = qs.toString();
    return await fetchJson<AnalyticsData>(`/api/analytics${query ? `?${query}` : ""}`);
  } catch {
    console.warn("API unreachable, falling back to mock analytics data");
    return mockAnalytics;
  }
}

const mockSpendData: SpendData = {
  today: 94.72,
  mtd: 236.83,
  allTime: 1842.57,
  byAgent: {
    anas: { today: 36.21, mtd: 69.12 },
    ofek: { today: 42.83, mtd: 112.18 },
    dor: { today: 15.68, mtd: 55.53 },
  },
  limits: { type: null, amount: null, agentLimits: {} },
  usagePercent: null,
};

export async function getSpend(profile?: string): Promise<SpendData> {
  if (USE_MOCK) return mockSpendData;
  try {
    const qs = profile ? `?profile=${profile}` : "";
    return await fetchJson<SpendData>(`/api/spend${qs}`);
  } catch {
    console.warn("API unreachable, falling back to mock spend data");
    return mockSpendData;
  }
}

export async function setCostLimits(limits: CostLimits): Promise<CostLimits> {
  if (USE_MOCK) return limits;
  return await fetchJson<CostLimits>("/api/settings/cost-limits", {
    method: "PUT",
    body: JSON.stringify(limits),
  });
}
