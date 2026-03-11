import { Agent, Alert, AlertDetails, AlertsResponse, AlertSeverity, CostData, Session, SessionDetail, Project, ProjectDetail, Profile, AnalyticsData, SpendData, CostLimits } from "./types";
import { mockAgents, mockAlerts, mockCosts, mockSessions, mockSessionDetails, mockProjects, mockProjectDetails, mockAlertDetails } from "./mock-data";
import { DEMO_AGENTS, DEMO_TOTALS, DEMO_PROJECTS } from "./demo-agents";

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

// Analytics mock — generates hourly/daily/weekly data from DEMO_TOTALS
// Hours: 24h of today's spend, lower at night (01:00-07:00)
// Days: 14 days of MTD-scale spend
// Weeks: 8 weeks of allTime spend
function buildMockAnalytics(groupBy: string): AnalyticsData {
  const agents = DEMO_AGENTS.filter(a => a.spend.allTime > 50);
  const projs = DEMO_PROJECTS.map(p => ({ projectId: p.id, name: p.name, pct: p.pct }));

  const TOTAL_SESSIONS = 42; // must be identical across all groupBy modes

  // Distribute an integer total across N buckets proportionally, ensuring exact sum
  const distribute = (total: number, weights: number[]): number[] => {
    const wSum = weights.reduce((s, v) => s + v, 0);
    const raw = weights.map(w => total * w / wSum);
    const floored = raw.map(v => Math.floor(v));
    let remainder = total - floored.reduce((s, v) => s + v, 0);
    const fracs = raw.map((v, i) => ({ i, frac: v - floored[i] })).sort((a, b) => b.frac - a.frac);
    for (let j = 0; j < remainder; j++) floored[fracs[j].i]++;
    return floored;
  };

  const build = (labels: string[], weights: number[], totalCost: number, totalTokens: number, agentKey: "today" | "mtd" | "allTime", tokenKey: "today" | "mtd" | "allTime") => {
    const wSum = weights.reduce((s, v) => s + v, 0);
    const sessionDist = distribute(TOTAL_SESSIONS, weights);
    return {
      buckets: labels.map((date, i) => ({
        date,
        costUsd: +(totalCost * weights[i] / wSum).toFixed(2),
        tokenCount: Math.floor(totalTokens * weights[i] / wSum),
        sessionCount: sessionDist[i],
      })),
      byAgent: agents.map(a => ({
        agentId: a.name,
        buckets: labels.map((date, i) => ({
          date,
          costUsd: +(a.spend[agentKey] * weights[i] / wSum).toFixed(2),
          tokenCount: Math.floor(a.tokens[tokenKey] * weights[i] / wSum),
          sessionCount: Math.max(0, Math.round((TOTAL_SESSIONS / agents.length) * weights[i] / wSum)),
        })),
      })),
      byProject: projs.map(({ projectId, name, pct }) => ({
        projectId,
        name,
        buckets: labels.map((date, i) => ({
          date,
          costUsd: +(totalCost * pct * weights[i] / wSum).toFixed(2),
          tokenCount: Math.floor(totalTokens * pct * weights[i] / wSum),
          sessionCount: Math.max(0, Math.round(TOTAL_SESSIONS * pct * weights[i] / wSum)),
        })),
      })),
    };
  };

  if (groupBy === "hour") {
    // 72 hours (3 days) with night dips at 01:00-07:00
    const dayPattern = [
      0.020, 0.005, 0.003, 0.003, 0.003, 0.005, 0.008, 0.020,
      0.040, 0.060, 0.070, 0.075, 0.065, 0.070, 0.075, 0.070,
      0.065, 0.060, 0.055, 0.050, 0.040, 0.035, 0.030, 0.025,
    ];
    // 3 days: day before yesterday, yesterday, today — slight upward trend
    const dayScales = [0.85, 0.95, 1.20];
    const w: number[] = [];
    const labels: string[] = [];
    for (let day = 0; day < 3; day++) {
      for (let h = 0; h < 24; h++) {
        w.push(dayPattern[h] * dayScales[day]);
        const d = new Date();
        d.setDate(d.getDate() - (2 - day));
        d.setHours(h, 0, 0, 0);
        labels.push(d.toISOString().slice(0, 13) + ":00");
      }
    }
    // Use MTD spend spread across 3 days (more data than just today)
    const threeDaySpend = DEMO_TOTALS.today * 3;
    const threeDayTokens = DEMO_TOTALS.tokens.today * 3;
    return build(labels, w, threeDaySpend, threeDayTokens, "today", "today");
  }

  if (groupBy === "week") {
    const labels = Array.from({ length: 8 }, (_, i) => {
      const d = new Date("2026-01-13"); d.setDate(d.getDate() + i * 7);
      return d.toISOString().slice(0, 10);
    });
    // Gradual ramp-up over 8 weeks
    const w = [0.08, 0.09, 0.10, 0.11, 0.12, 0.13, 0.17, 0.20];
    return build(labels, w, DEMO_TOTALS.allTime, DEMO_TOTALS.tokens.allTime, "allTime", "allTime");
  }

  // Default: "day" — 56 daily buckets (8 weeks), allTime spend, gradual ramp-up
  const labels = Array.from({ length: 56 }, (_, i) => {
    const d = new Date("2026-01-13"); d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  // Gradual ramp-up over 56 days with weekly rhythm (weekends lower)
  const w = labels.map((_, i) => {
    const weekNum = Math.floor(i / 7);
    const dayOfWeek = i % 7; // 0=Mon ... 6=Sun
    const weekScale = 0.7 + weekNum * 0.08; // ramps up each week
    const dayScale = dayOfWeek >= 5 ? 0.4 : 0.8 + (dayOfWeek % 3) * 0.1; // weekends lower
    return weekScale * dayScale;
  });
  return build(labels, w, DEMO_TOTALS.allTime, DEMO_TOTALS.tokens.allTime, "allTime", "allTime");
}

const mockAnalyticsByGroup: Record<string, AnalyticsData> = {
  hour: buildMockAnalytics("hour"),
  day: buildMockAnalytics("day"),
  week: buildMockAnalytics("week"),
};
export async function getAnalytics(params: {
  profile?: string;
  groupBy?: string;
  from?: string;
  to?: string;
}): Promise<AnalyticsData> {
  if (USE_MOCK) return mockAnalyticsByGroup[params.groupBy || "day"] || mockAnalyticsByGroup.day;
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
    return mockAnalyticsByGroup[params.groupBy || "day"] || mockAnalyticsByGroup.day;
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
